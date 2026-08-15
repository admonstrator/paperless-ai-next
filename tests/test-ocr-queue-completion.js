/**
 * Test: what a finished OCR run leaves behind in the queue
 *
 * The queue is meant to hold outstanding work, so a run that leaves none
 * removes its row. Two conditions decide that, and both are load-bearing:
 *
 * - The write-back has to have gone through. If Paperless-ngx refused the
 *   content, this row holds the only copy of the OCR text and deleting it
 *   would throw the text away.
 * - The AI analysis has to have run. It is what writes processed_documents,
 *   and that record is what stops the scan loop from queueing the document for
 *   OCR again. Without it the row is the only memory that this document was
 *   ever OCR'd, and a recurring AI error would buy OCR on every scan.
 *
 * Covers: both conditions, each failure mode, and that the write-back outcome
 * is persisted rather than inferred.
 */

const assert = require('assert');

const paperlessServiceModulePath =
  require.resolve('../services/paperlessService');
const documentModelModulePath = require.resolve('../models/document');
const aiServiceFactoryModulePath =
  require.resolve('../services/aiServiceFactory');
const mistralOcrServiceModulePath =
  require.resolve('../services/mistralOcrService');

function stub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

/**
 * @param {object} opts
 * @param {boolean} opts.wroteBack   - does Paperless-ngx accept the content
 * @param {boolean} opts.autoAnalyze - run AI after OCR
 * @param {boolean} opts.aiSucceeds  - does that analysis come back clean
 */
async function runPipeline({ wroteBack, autoAnalyze, aiSucceeds = true }) {
  delete require.cache[paperlessServiceModulePath];
  delete require.cache[documentModelModulePath];
  delete require.cache[aiServiceFactoryModulePath];
  delete require.cache[mistralOcrServiceModulePath];

  const calls = { statusWrites: [], removed: [], failedRecords: [] };

  stub(paperlessServiceModulePath, {});
  stub(aiServiceFactoryModulePath, { getService: () => ({}) });
  stub(documentModelModulePath, {
    getOcrQueueItem: async () => ({ document_id: 7, title: 'Invoice' }),
    updateOcrQueueStatus: async (documentId, status, ocrText, flag) => {
      calls.statusWrites.push({ documentId, status, wroteBack: flag });
      return true;
    },
    removeFromOcrQueue: async (documentId) => {
      calls.removed.push(documentId);
      return true;
    },
    resetFailedDocument: async () => true,
    addFailedDocument: async (documentId, title, reason) => {
      calls.failedRecords.push(reason);
      return true;
    },
  });

  const mistralOcrService = require('../services/mistralOcrService');

  mistralOcrService.downloadDocumentAsBase64 = async () => ({
    base64: 'ZmFrZQ==',
    mimeType: 'application/pdf',
  });
  mistralOcrService.performOcr = async () => 'Recovered text';
  mistralOcrService.writeBackContent = async () => wroteBack;
  mistralOcrService._runAiAnalysis = async () => {
    if (!aiSucceeds) throw new Error('AI said no');
    return { title: 'Analyzed' };
  };

  let threw = null;
  try {
    await mistralOcrService.processQueueItem(7, { autoAnalyze });
  } catch (error) {
    threw = error;
  }

  return { calls, threw };
}

async function main() {
  // 1. Everything went through: nothing outstanding, so nothing stays.
  {
    const { calls, threw } = await runPipeline({
      wroteBack: true,
      autoAnalyze: true,
    });
    assert.strictEqual(threw, null, 'A clean run must not throw');
    assert.deepStrictEqual(
      calls.removed,
      [7],
      'A fully finished item has to leave the queue'
    );
    const done = calls.statusWrites.find((write) => write.status === 'done');
    assert.strictEqual(
      done.wroteBack,
      true,
      'The write-back outcome has to be persisted, not inferred later'
    );
  }

  // 2. Paperless-ngx refused the content: this row is the only copy left.
  {
    const { calls } = await runPipeline({
      wroteBack: false,
      autoAnalyze: true,
    });
    assert.deepStrictEqual(
      calls.removed,
      [],
      'An item whose text never reached Paperless-ngx must stay in the queue'
    );
    const done = calls.statusWrites.find((write) => write.status === 'done');
    assert.strictEqual(
      done.wroteBack,
      false,
      'A refused write-back has to be recorded as such'
    );
  }

  // 3. OCR only: the document has its text but still awaits analysis, and this
  //    row is the only thing that remembers it was already OCR'd.
  {
    const { calls } = await runPipeline({
      wroteBack: true,
      autoAnalyze: false,
    });
    assert.deepStrictEqual(
      calls.removed,
      [],
      'An OCR-only run leaves analysis outstanding, so its row has to stay'
    );
  }

  // 4. AI failed after OCR: the text is worth keeping for the retry.
  {
    const { calls, threw } = await runPipeline({
      wroteBack: true,
      autoAnalyze: true,
      aiSucceeds: false,
    });
    assert.ok(threw, 'A failed analysis has to surface as an error');
    assert.deepStrictEqual(
      calls.removed,
      [],
      'A row that failed at the AI step is the retry material and must stay'
    );
    assert.ok(
      calls.statusWrites.some((write) => write.status === 'failed'),
      'The row has to end up marked failed'
    );
    assert.ok(
      calls.failedRecords.includes('ai_failed_after_ocr'),
      'The failure reason has to name the step that failed'
    );
  }
}

main()
  .then(() => {
    console.log('[PASS] OCR queue keeps exactly the items with work left');
  })
  .catch((error) => {
    console.error('[FAIL] OCR queue completion test failed:', error.message);
    process.exitCode = 1;
  });
