/**
 * DashboardStatsService
 *
 * Assembles the dashboard statistics payload once and serves it from memory.
 *
 * Background: /api/dashboard/stats rebuilt everything per request — two
 * uncached Paperless-ngx round trips (tag and correspondent counts) plus a
 * dozen SQLite queries, one of which read every row of openai_metrics into
 * memory just to average it. The dashboard polls that endpoint, and every open
 * browser tab polls it separately, so the cost scaled with the number of
 * viewers while the numbers themselves change only when a document is
 * processed.
 *
 * The payload is now built here at most once per TTL, refreshed in the
 * background, and invalidated by the scan loop when a document actually
 * changes something. Requests never wait on Paperless-ngx unless the cache is
 * empty.
 */

const paperlessService = require('./paperlessService');
const documentModel = require('../models/document');

// A rebuild that failed (Paperless-ngx down, database locked) must not be
// retried on every poll — the dashboard polls continuously, and a hard-down
// backend would turn that into a request storm. Short enough that a recovering
// backend shows up quickly.
const FAILURE_RETRY_MS = 10 * 1000;

const DEFAULT_TTL_SECONDS = 60;

class DashboardStatsService {
  constructor() {
    this.cache = null;
    this.cachedAt = 0;
    this.inFlight = null;
    this.lastFailureAt = 0;
  }

  /** Test seam — drops the cached payload so the next call rebuilds. */
  reset() {
    this.cache = null;
    this.cachedAt = 0;
    this.inFlight = null;
    this.lastFailureAt = 0;
  }

  /**
   * Read from config on every access instead of memoizing: STATS_CACHE_TTL_SECONDS
   * can be changed at runtime through the settings page, and a value frozen at
   * first use would keep the old TTL until the next restart.
   */
  get ttlMs() {
    const runtimeConfig = require('../config/config');
    const seconds = Number(runtimeConfig.statsCacheTTL);
    return (
      (Number.isFinite(seconds) && seconds > 0
        ? seconds
        : DEFAULT_TTL_SECONDS) * 1000
    );
  }

  isFresh() {
    if (!this.cache) return false;
    // Serve the last good payload while the failure backoff runs, so a broken
    // backend costs one attempt per FAILURE_RETRY_MS instead of one per poll.
    if (Date.now() - this.lastFailureAt < FAILURE_RETRY_MS) return true;
    return Date.now() - this.cachedAt < this.ttlMs;
  }

  /**
   * @param {{force?: boolean}} [options]
   * @returns {Promise<{payload: object, cachedAt: number}>} cached or freshly built stats
   */
  async getStats({ force = false } = {}) {
    if (!force && this.isFresh()) {
      return { payload: this.cache, cachedAt: this.cachedAt };
    }

    // Concurrent viewers (and the background refresh) share one build instead
    // of each starting their own round of Paperless calls.
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.buildStats()
      .then((payload) => {
        this.cache = payload;
        this.cachedAt = Date.now();
        this.lastFailureAt = 0;
        return { payload, cachedAt: this.cachedAt };
      })
      .catch((error) => {
        this.lastFailureAt = Date.now();
        // Nothing cached yet: the caller has no numbers to show, so let the
        // route turn this into its 500 instead of inventing zeroes.
        if (!this.cache) {
          throw error;
        }
        console.warn(
          '[DASHBOARD-STATS] Rebuild failed, serving the last good payload:',
          error.message
        );
        return { payload: this.cache, cachedAt: this.cachedAt };
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /** Rebuilds regardless of the TTL. Used by the warmup and the background job. */
  async refresh() {
    return this.getStats({ force: true });
  }

  /**
   * Marks the cache stale without doing any work, so the next reader rebuilds.
   * Cheap enough to call once per processed document.
   */
  invalidate() {
    this.cachedAt = 0;
  }

  /**
   * Gathers everything the dashboard shows. Kept as a method (not a module
   * function) so tests can replace it without stubbing every collaborator.
   *
   * @returns {Promise<object>} the response body the endpoint returns
   */
  async buildStats() {
    const [
      tagCount,
      correspondentCount,
      documentCount,
      rawProcessedDocumentCount,
      ocrNeededCount,
      ocrFailedCount,
      processingFailedCount,
      metricsSummary,
      processingTimeStats,
      tokenDistribution,
      documentTypes,
      tokenTrend,
      recentActivity,
      languageDistribution,
      processingStatus,
    ] = await Promise.all([
      paperlessService.getTagCount(),
      paperlessService.getCorrespondentCount(),
      paperlessService.getEffectiveDocumentCount(),
      documentModel.getProcessedDocumentsCount(),
      documentModel.getOcrQueueCount(),
      documentModel.getOcrFailedCount(),
      documentModel.getFailedProcessingCount(),
      documentModel.getMetricsSummary(),
      documentModel.getProcessingTimeStats(),
      documentModel.getTokenDistribution(),
      documentModel.getDocumentTypeStats(),
      documentModel.getTokenTrend(7),
      documentModel.getRecentHistoryDocuments(3),
      documentModel.getLanguageDistribution(5),
      documentModel.getCurrentProcessingStatus(),
    ]);

    const processedDocumentCount = rawProcessedDocumentCount;
    const failedCount = ocrFailedCount + processingFailedCount;
    const queueBacklog = Math.max(0, ocrNeededCount + failedCount);
    const processingAttemptCount = processedDocumentCount + failedCount;
    const processingEfficiencyRate =
      processingAttemptCount > 0
        ? Math.round((processedDocumentCount / processingAttemptCount) * 100)
        : 0;
    const failedRate =
      processingAttemptCount > 0
        ? Math.round((failedCount / processingAttemptCount) * 100)
        : 0;
    const processedToday = Number(processingStatus?.processedToday || 0);

    const normalizedTokenTrend = Array.isArray(tokenTrend)
      ? tokenTrend.map((entry) => ({
          day: entry.day,
          documents: Number(entry.documents || 0),
          totalTokens: Number(entry.totalTokens || 0),
        }))
      : [];

    const normalizedRecentActivity = Array.isArray(recentActivity)
      ? recentActivity.map((entry) => ({
          documentId: Number(entry.documentId || 0),
          title: entry.title || 'Untitled document',
          correspondent: entry.correspondent || 'Unknown correspondent',
          createdAt: entry.createdAt,
          language: entry.language || 'Unknown',
        }))
      : [];

    const normalizedLanguageDistribution = Array.isArray(languageDistribution)
      ? languageDistribution.map((entry) => ({
          language: entry.language || 'Unknown',
          count: Number(entry.count || 0),
        }))
      : [];

    return {
      success: true,
      paperless_data: {
        tagCount,
        correspondentCount,
        documentCount,
        processedDocumentCount,
        ocrNeededCount,
        failedCount,
        queueBacklog,
        processingEfficiencyRate,
        failedRate,
        processedToday,
        processingTimeStats,
        tokenDistribution,
        documentTypes,
        tokenTrend: normalizedTokenTrend,
        recentActivity: normalizedRecentActivity,
        languageDistribution: normalizedLanguageDistribution,
      },
      openai_data: {
        averagePromptTokens: metricsSummary.averagePromptTokens,
        averageCompletionTokens: metricsSummary.averageCompletionTokens,
        averageTotalTokens: metricsSummary.averageTotalTokens,
        tokensOverall: metricsSummary.tokensOverall,
      },
    };
  }
}

module.exports = new DashboardStatsService();
module.exports.FAILURE_RETRY_MS = FAILURE_RETRY_MS;
