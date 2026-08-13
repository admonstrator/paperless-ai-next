/**
 * Test: dashboard statistics cache
 *
 * /api/dashboard/stats rebuilt its whole payload per request — two uncached
 * Paperless-ngx round trips plus a dozen SQLite queries, one of which read
 * every openai_metrics row into memory. The dashboard polls that endpoint, and
 * every open tab polls it separately, so the cost grew with the number of
 * viewers while the numbers only change when a document is processed.
 *
 * Covers:
 * 1. The payload keeps its shape and is built from the aggregate query
 * 2. Concurrent readers share one build
 * 3. A fresh cache is served without rebuilding, an expired one is not
 * 4. invalidate() forces the next reader to rebuild
 * 5. A failed rebuild keeps the last good payload and backs off
 * 6. The endpoint is a thin read of the cache
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅  ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌  ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Load the service with both collaborators replaced — no test may reach the
// network or the database
// ──────────────────────────────────────────────────────────────────────────────

const counts = {
  tagCount: 0,
  correspondentCount: 0,
  effectiveDocumentCount: 0,
  metricsSummary: 0,
};

const fakePaperlessService = {
  getTagCount: async () => {
    counts.tagCount += 1;
    return 12;
  },
  getCorrespondentCount: async () => {
    counts.correspondentCount += 1;
    return 5;
  },
  getEffectiveDocumentCount: async () => {
    counts.effectiveDocumentCount += 1;
    return 100;
  },
};

const fakeDocumentModel = {
  getProcessedDocumentsCount: async () => 80,
  getOcrQueueCount: async () => 4,
  getOcrFailedCount: async () => 1,
  getFailedProcessingCount: async () => 3,
  getMetricsSummary: async () => {
    counts.metricsSummary += 1;
    return {
      averagePromptTokens: 10,
      averageCompletionTokens: 4,
      averageTotalTokens: 14,
      tokensOverall: 1400,
    };
  },
  // Reading every metrics row to average it in JavaScript is the cost this
  // change removes; using it again should fail loudly.
  getMetrics: async () => {
    throw new Error('getMetrics() must not be used to build the dashboard');
  },
  getProcessingTimeStats: async () => [{ hour: '09', count: 2 }],
  getTokenDistribution: async () => [{ range: '0-1k', count: 2 }],
  getDocumentTypeStats: async () => [{ type: 'Invoice', count: 2 }],
  getTokenTrend: async () => [
    { day: '2026-08-13', documents: '2', totalTokens: '30' },
  ],
  getRecentHistoryDocuments: async () => [
    { documentId: '7', title: '', correspondent: '', createdAt: 'now' },
  ],
  getLanguageDistribution: async () => [{ language: '', count: '3' }],
  getCurrentProcessingStatus: async () => ({ processedToday: '6' }),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './paperlessService') return fakePaperlessService;
  if (request === '../models/document') return fakeDocumentModel;
  return originalLoad(request, parent, isMain);
};

const dashboardStatsService = require('../services/dashboardStatsService');
const config = require('../config/config');

Module._load = originalLoad;

const originalStatsCacheTTL = config.statsCacheTTL;

function reset() {
  Object.keys(counts).forEach((key) => {
    counts[key] = 0;
  });
  dashboardStatsService.reset();
  restoreBuild();
  config.statsCacheTTL = originalStatsCacheTTL;
}

// buildStats lives on the prototype, so deleting the own property restores it.
function stubBuild(fn) {
  dashboardStatsService.buildStats = fn;
}

function restoreBuild() {
  delete dashboardStatsService.buildStats;
}

(async () => {
  try {
    // ──────────────────────────────────────────────────────────────────────────
    // 1. Payload
    // ──────────────────────────────────────────────────────────────────────────

    await test('The cached payload keeps the shape the dashboard expects', async () => {
      reset();
      const { payload, cachedAt } = await dashboardStatsService.getStats();

      assert.strictEqual(payload.success, true);
      assert.strictEqual(counts.metricsSummary, 1, 'One aggregate query only');
      assert.deepStrictEqual(payload.openai_data, {
        averagePromptTokens: 10,
        averageCompletionTokens: 4,
        averageTotalTokens: 14,
        tokensOverall: 1400,
      });

      const data = payload.paperless_data;
      assert.strictEqual(data.tagCount, 12);
      assert.strictEqual(data.correspondentCount, 5);
      assert.strictEqual(data.documentCount, 100);
      assert.strictEqual(data.processedDocumentCount, 80);
      assert.strictEqual(data.ocrNeededCount, 4);
      assert.strictEqual(data.failedCount, 4, 'OCR plus processing failures');
      assert.strictEqual(data.queueBacklog, 8);
      assert.strictEqual(data.processingEfficiencyRate, 95);
      assert.strictEqual(data.failedRate, 5);
      assert.strictEqual(data.processedToday, 6);

      assert.deepStrictEqual(data.tokenTrend, [
        { day: '2026-08-13', documents: 2, totalTokens: 30 },
      ]);
      assert.deepStrictEqual(data.recentActivity, [
        {
          documentId: 7,
          title: 'Untitled document',
          correspondent: 'Unknown correspondent',
          createdAt: 'now',
          language: 'Unknown',
        },
      ]);
      assert.deepStrictEqual(data.languageDistribution, [
        { language: 'Unknown', count: 3 },
      ]);

      assert.ok(cachedAt > 0, 'The response has to say how old the data is');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Single flight
    // ──────────────────────────────────────────────────────────────────────────

    await test('Concurrent readers share a single build', async () => {
      reset();
      const results = await Promise.all([
        dashboardStatsService.getStats(),
        dashboardStatsService.getStats(),
        dashboardStatsService.getStats(),
      ]);

      assert.strictEqual(
        counts.tagCount,
        1,
        'Three viewers must not mean three rounds of Paperless calls'
      );
      assert.strictEqual(counts.effectiveDocumentCount, 1);
      results.forEach((result) =>
        assert.strictEqual(result.payload.paperless_data.tagCount, 12)
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. TTL
    // ──────────────────────────────────────────────────────────────────────────

    await test('A fresh cache is served without rebuilding', async () => {
      reset();
      const first = await dashboardStatsService.getStats();
      const second = await dashboardStatsService.getStats();

      assert.strictEqual(counts.tagCount, 1, 'Polling must not rebuild');
      assert.strictEqual(second.payload, first.payload, 'Same object served');
      assert.strictEqual(second.cachedAt, first.cachedAt);
    });

    await test('An expired cache is rebuilt, and the TTL comes from config', async () => {
      reset();
      config.statsCacheTTL = 30;
      assert.strictEqual(
        dashboardStatsService.ttlMs,
        30000,
        'STATS_CACHE_TTL_SECONDS has to be readable at runtime'
      );

      await dashboardStatsService.getStats();
      dashboardStatsService.cachedAt =
        Date.now() - dashboardStatsService.ttlMs - 1;
      await dashboardStatsService.getStats();

      assert.strictEqual(counts.tagCount, 2);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Invalidation
    // ──────────────────────────────────────────────────────────────────────────

    await test('invalidate() makes the next reader rebuild', async () => {
      reset();
      await dashboardStatsService.getStats();
      dashboardStatsService.invalidate();
      await dashboardStatsService.getStats();

      assert.strictEqual(
        counts.tagCount,
        2,
        'A processed document has to reach the dashboard before the TTL is up'
      );
    });

    await test('refresh() rebuilds even while the cache is fresh', async () => {
      reset();
      await dashboardStatsService.getStats();
      await dashboardStatsService.refresh();

      assert.strictEqual(counts.tagCount, 2);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Failure handling
    // ──────────────────────────────────────────────────────────────────────────

    await test('A failed rebuild keeps the last good payload', async () => {
      reset();
      const good = await dashboardStatsService.getStats();

      let builds = 0;
      stubBuild(async () => {
        builds += 1;
        throw new Error('Paperless-ngx unreachable');
      });

      const afterFailure = await dashboardStatsService.refresh();
      assert.strictEqual(builds, 1);
      assert.strictEqual(
        afterFailure.payload,
        good.payload,
        'One hiccup must not blank the dashboard out'
      );
      assert.strictEqual(
        afterFailure.cachedAt,
        good.cachedAt,
        'The timestamp keeps pointing at the data that is actually shown'
      );
    });

    await test('A failed rebuild is not retried on every poll', async () => {
      reset();
      await dashboardStatsService.getStats();

      let builds = 0;
      stubBuild(async () => {
        builds += 1;
        throw new Error('Paperless-ngx unreachable');
      });

      dashboardStatsService.invalidate();
      await dashboardStatsService.getStats();
      await dashboardStatsService.getStats();
      await dashboardStatsService.getStats();
      assert.strictEqual(
        builds,
        1,
        'A down backend must not be hit once per dashboard poll'
      );

      // Once the backoff window is over the next reader tries again.
      dashboardStatsService.lastFailureAt =
        Date.now() - dashboardStatsService.FAILURE_RETRY_MS - 1;
      await dashboardStatsService.getStats();
      assert.strictEqual(builds, 2, 'A recovered backend has to be picked up');
    });

    await test('The very first build failing surfaces to the caller', async () => {
      reset();
      stubBuild(async () => {
        throw new Error('Paperless-ngx unreachable');
      });

      await assert.rejects(
        () => dashboardStatsService.getStats(),
        /unreachable/,
        'With nothing cached the endpoint has to answer 500, not fake zeroes'
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. The endpoint only reads the cache
    // ──────────────────────────────────────────────────────────────────────────

    await test('The endpoint does not assemble statistics itself', () => {
      const routeSource = fs.readFileSync(
        path.join(__dirname, '..', 'routes', 'setup.js'),
        'utf8'
      );
      const start = routeSource.indexOf("router.get('/api/dashboard/stats'");
      assert.ok(start > -1, 'The endpoint is missing');

      const handler = routeSource.slice(
        start,
        routeSource.indexOf('\n});', start)
      );
      assert.match(handler, /dashboardStatsService\.getStats\(\)/);
      assert.match(handler, /cachedAt/, 'The client needs the assembly time');
      assert.ok(
        !/documentModel\.|paperlessService\./.test(handler),
        'Rebuilding the payload per request is what this change removes'
      );
    });
  } finally {
    reset();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
})();
