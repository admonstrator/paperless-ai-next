// services/ocrAutoProcessService.js
//
// Drains the pending OCR queue on its own schedule. The scan loop only ever
// fills `ocr_queue` (server.js: short content, or an OCR-relevant AI error);
// emptying it used to require pressing "Process All Pending" on the /ocr page.
// This service runs the exact same pipeline — mistralOcrService.processQueueItem()
// does download -> OCR -> write-back -> optional AI analysis — from a cron job.

const cron = require('node-cron');
const config = require('../config/config');
const paperlessService = require('./paperlessService');
const mistralOcrService = require('./mistralOcrService');
const documentModel = require('../models/document');
const dashboardStatsService = require('./dashboardStatsService');

const DEFAULT_INTERVAL = '*/15 * * * *';
const DEFAULT_BATCH_SIZE = 10;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;

class OcrAutoProcessService {
  constructor() {
    /** Whether a drain run is currently in progress. */
    this.running = false;
    /** Keeps the invalid-interval warning to one line per process. */
    this.invalidIntervalLogged = false;
  }

  /**
   * Automatic processing requires the global OCR fallback to be on — the
   * global switch always wins over the automation switch.
   */
  isEnabled() {
    return (
      mistralOcrService.isEnabled() &&
      config.mistralOcr?.autoProcessEnabled === 'yes'
    );
  }

  /**
   * Cron expression for the drain job. An invalid pattern would make
   * cron.schedule() throw during startup, so it falls back to the default.
   */
  get interval() {
    const configured = String(
      config.mistralOcr?.autoProcessInterval || ''
    ).trim();

    if (!configured) {
      return DEFAULT_INTERVAL;
    }

    if (cron.validate(configured)) {
      return configured;
    }

    if (!this.invalidIntervalLogged) {
      console.warn(
        `[OCR] Invalid OCR_AUTO_PROCESS_INTERVAL "${configured}". ` +
          `Falling back to "${DEFAULT_INTERVAL}".`
      );
      this.invalidIntervalLogged = true;
    }

    return DEFAULT_INTERVAL;
  }

  /** Maximum queue items handled per run; local vision models are slow. */
  get batchSize() {
    const parsed = Number.parseInt(
      String(config.mistralOcr?.autoProcessBatchSize ?? ''),
      10
    );

    if (!Number.isFinite(parsed)) {
      return DEFAULT_BATCH_SIZE;
    }

    return Math.min(Math.max(parsed, MIN_BATCH_SIZE), MAX_BATCH_SIZE);
  }

  /** Whether AI analysis runs straight after OCR. */
  get autoAnalyze() {
    return config.mistralOcr?.autoAnalyze !== 'no';
  }

  _skip(reason) {
    return {
      skipped: reason,
      processed: 0,
      failed: 0,
      remaining: 0,
      durationMs: 0,
    };
  }

  /**
   * Processes up to `batchSize` pending queue items.
   *
   * @param {object} [logger=console]
   * @returns {Promise<{skipped: string|null, processed: number, failed: number,
   *   remaining: number, durationMs: number}>}
   */
  async drainQueue(logger = console) {
    if (this.running) {
      logger.debug(
        '[OCR] Auto-processing is already running. Skipping duplicate trigger.'
      );
      return this._skip('already_running');
    }

    if (!this.isEnabled()) {
      logger.debug('[OCR] Auto-processing is disabled. Skipping run.');
      return this._skip('disabled');
    }

    this.running = true;
    const startedAtMs = Date.now();

    try {
      // Probe before touching a single item: processQueueItem() records every
      // error as a terminal failure, so an unreachable Paperless-ngx would
      // burn the whole queue in one run and lock those documents behind
      // isDocumentFailed() until someone resets them by hand.
      const connection = await paperlessService.checkConnection();
      if (!connection.reachable || !connection.authorized) {
        logger.warn(
          `[OCR] Auto-processing skipped: Paperless-ngx is not usable (${connection.error}). ` +
            'Queued documents stay pending and are retried at the next interval.'
        );
        return this._skip('paperless_unusable');
      }

      const pendingItems = await documentModel.getOcrQueue('pending');
      if (pendingItems.length === 0) {
        logger.debug('[OCR] Auto-processing found no pending queue items.');
        return {
          skipped: null,
          processed: 0,
          failed: 0,
          remaining: 0,
          durationMs: Date.now() - startedAtMs,
        };
      }

      const batch = pendingItems.slice(0, this.batchSize);
      const autoAnalyze = this.autoAnalyze;

      logger.info(
        `[OCR] Auto-processing started (pending=${pendingItems.length}, ` +
          `batch=${batch.length}, autoAnalyze=${autoAnalyze ? 'yes' : 'no'})`
      );

      let processed = 0;
      let failed = 0;

      for (const item of batch) {
        try {
          await mistralOcrService.processQueueItem(item.document_id, {
            autoAnalyze,
          });
          processed += 1;
          // This queue drains on its own cron, so nothing else tells the
          // dashboard that the document counters just moved.
          dashboardStatsService.invalidate();
        } catch (error) {
          // processQueueItem() already moved the item out of 'pending' and
          // recorded the failure, so the next run will not pick it up again.
          // Counting and continuing keeps one bad document from blocking the
          // rest of the batch.
          failed += 1;
          logger.error(
            `[OCR] Auto-processing failed for document ${item.document_id}: ${error.message}`
          );
        }
      }

      const remaining = Math.max(pendingItems.length - batch.length, 0);
      const durationMs = Date.now() - startedAtMs;

      logger.info(
        `[OCR] Auto-processing completed (processed=${processed}, failed=${failed}, ` +
          `remaining=${remaining}, durationMs=${durationMs})`
      );

      return { skipped: null, processed, failed, remaining, durationMs };
    } catch (error) {
      logger.error(`[OCR] Auto-processing run failed: ${error.message}`);
      logger.debug(error);
      return this._skip('error');
    } finally {
      this.running = false;
    }
  }
}

module.exports = new OcrAutoProcessService();
