// Automatic OCR queue processing: the drain job must respect the global OCR
// switch, refuse to run while Paperless-ngx is unusable (processQueueItem()
// records every error as a terminal failure, so a single run against a dead
// Paperless-ngx would burn the whole queue), honour the batch limit, and keep
// going when one document fails.

const assert = require('assert');

const configModulePath = require.resolve('../config/config');
const paperlessServiceModulePath =
  require.resolve('../services/paperlessService');
const mistralOcrServiceModulePath =
  require.resolve('../services/mistralOcrService');
const documentModelModulePath = require.resolve('../models/document');
const serviceModulePath = require.resolve('../services/ocrAutoProcessService');

const REACHABLE = {
  reachable: true,
  authorized: true,
  status: 200,
  error: null,
};

function injectMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function loadServiceWithMocks({
  ocrEnabled = 'yes',
  autoProcessEnabled = 'yes',
  autoAnalyze = 'yes',
  autoProcessBatchSize = 10,
  autoProcessInterval = '*/15 * * * *',
  connection = REACHABLE,
  queue = [],
  onProcessQueueItem = async () => {},
} = {}) {
  delete require.cache[configModulePath];
  delete require.cache[paperlessServiceModulePath];
  delete require.cache[mistralOcrServiceModulePath];
  delete require.cache[documentModelModulePath];
  delete require.cache[serviceModulePath];

  const state = {
    connectionChecks: 0,
    queueQueries: [],
    processedCalls: [],
    logs: [],
  };

  injectMock(configModulePath, {
    mistralOcr: {
      enabled: ocrEnabled,
      autoProcessEnabled,
      autoProcessInterval,
      autoProcessBatchSize,
      autoAnalyze,
    },
  });

  injectMock(paperlessServiceModulePath, {
    checkConnection: async () => {
      state.connectionChecks += 1;
      return connection;
    },
  });

  injectMock(mistralOcrServiceModulePath, {
    isEnabled: () => ocrEnabled === 'yes',
    processQueueItem: async (documentId, opts) => {
      state.processedCalls.push({ documentId, opts });
      return onProcessQueueItem(documentId, opts);
    },
  });

  injectMock(documentModelModulePath, {
    getOcrQueue: async (status = null) => {
      state.queueQueries.push(status);
      return queue.map((item) => ({ ...item }));
    },
  });

  const logger = {
    debug: (message) => state.logs.push(String(message)),
    info: (message) => state.logs.push(String(message)),
    warn: (message) => state.logs.push(String(message)),
    error: (message) => state.logs.push(String(message)),
  };

  return { service: require(serviceModulePath), state, logger };
}

function pendingItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    document_id: index + 1,
    title: `Document ${index + 1}`,
    status: 'pending',
  }));
}

function cleanup() {
  delete require.cache[configModulePath];
  delete require.cache[paperlessServiceModulePath];
  delete require.cache[mistralOcrServiceModulePath];
  delete require.cache[documentModelModulePath];
  delete require.cache[serviceModulePath];
}

async function testGlobalOcrSwitchWins() {
  const { service, state, logger } = loadServiceWithMocks({
    ocrEnabled: 'no',
    autoProcessEnabled: 'yes',
    queue: pendingItems(3),
  });

  assert.strictEqual(
    service.isEnabled(),
    false,
    'automatic processing must stay off while MISTRAL_OCR_ENABLED=no'
  );

  const result = await service.drainQueue(logger);

  assert.strictEqual(result.skipped, 'disabled', 'run must be skipped');
  assert.strictEqual(
    state.connectionChecks,
    0,
    'a disabled run must not talk to Paperless-ngx'
  );
  assert.strictEqual(
    state.processedCalls.length,
    0,
    'a disabled run must not process anything'
  );
}

async function testUnreachablePaperlessLeavesQueueUntouched() {
  const { service, state, logger } = loadServiceWithMocks({
    connection: {
      reachable: false,
      authorized: false,
      status: null,
      error: 'connect ECONNREFUSED 127.0.0.1:8000',
    },
    queue: pendingItems(4),
  });

  const result = await service.drainQueue(logger);

  assert.strictEqual(
    result.skipped,
    'paperless_unusable',
    'run must be skipped while Paperless-ngx is unusable'
  );
  assert.strictEqual(
    state.queueQueries.length,
    0,
    'the queue must not even be read when Paperless-ngx is unusable'
  );
  assert.strictEqual(
    state.processedCalls.length,
    0,
    'no document may be processed - processQueueItem() would mark each one as permanently failed'
  );
  assert.ok(
    state.logs.some((line) => line.includes('not usable')),
    'the skip reason must be logged'
  );
}

async function testRejectedTokenIsTreatedAsUnusable() {
  const { service, state, logger } = loadServiceWithMocks({
    connection: {
      reachable: true,
      authorized: false,
      status: 401,
      error: 'Request failed with status code 401',
    },
    queue: pendingItems(2),
  });

  const result = await service.drainQueue(logger);

  assert.strictEqual(
    result.skipped,
    'paperless_unusable',
    'a rejected API token must skip the run just like an outage'
  );
  assert.strictEqual(
    state.processedCalls.length,
    0,
    'no document may be processed with rejected credentials'
  );
}

async function testOnlyPendingItemsAreRequested() {
  const { service, state, logger } = loadServiceWithMocks({
    queue: pendingItems(2),
  });

  await service.drainQueue(logger);

  assert.deepStrictEqual(
    state.queueQueries,
    ['pending'],
    'the drain must ask for pending items only, so failed and done items are never retried'
  );
}

async function testBatchSizeLimitsOneRun() {
  const { service, state, logger } = loadServiceWithMocks({
    autoProcessBatchSize: 3,
    queue: pendingItems(5),
  });

  const result = await service.drainQueue(logger);

  assert.strictEqual(
    result.processed,
    3,
    'only the batch size must be processed'
  );
  assert.strictEqual(
    result.remaining,
    2,
    'the rest must be reported as remaining'
  );
  assert.deepStrictEqual(
    state.processedCalls.map((call) => call.documentId),
    [1, 2, 3],
    'the first three queued documents must be processed'
  );
}

async function testBatchSizeIsClamped() {
  const tooLarge = loadServiceWithMocks({ autoProcessBatchSize: 5000 });
  assert.strictEqual(
    tooLarge.service.batchSize,
    100,
    'batch size must cap at 100'
  );

  const tooSmall = loadServiceWithMocks({ autoProcessBatchSize: 0 });
  assert.strictEqual(
    tooSmall.service.batchSize,
    1,
    'batch size must be at least 1'
  );

  const garbage = loadServiceWithMocks({ autoProcessBatchSize: 'nonsense' });
  assert.strictEqual(
    garbage.service.batchSize,
    10,
    'an unparseable batch size must fall back to the default'
  );
}

async function testInvalidCronFallsBackToDefault() {
  const invalid = loadServiceWithMocks({ autoProcessInterval: 'not-a-cron' });
  assert.strictEqual(
    invalid.service.interval,
    '*/15 * * * *',
    'an invalid cron expression must fall back to the default instead of crashing cron.schedule()'
  );

  const valid = loadServiceWithMocks({ autoProcessInterval: '0 */2 * * *' });
  assert.strictEqual(
    valid.service.interval,
    '0 */2 * * *',
    'a valid cron expression must be used as configured'
  );
}

async function testFailingDocumentDoesNotStopTheBatch() {
  const { service, state, logger } = loadServiceWithMocks({
    queue: pendingItems(3),
    onProcessQueueItem: async (documentId) => {
      if (documentId === 2) {
        throw new Error('Local OCR failed: model not loaded');
      }
    },
  });

  const result = await service.drainQueue(logger);

  assert.strictEqual(
    result.processed,
    2,
    'the healthy documents must still be processed'
  );
  assert.strictEqual(result.failed, 1, 'the failing document must be counted');
  assert.deepStrictEqual(
    state.processedCalls.map((call) => call.documentId),
    [1, 2, 3],
    'a failure must not abort the remaining documents'
  );
}

async function testAutoAnalyzeIsForwarded() {
  const enabled = loadServiceWithMocks({
    autoAnalyze: 'yes',
    queue: pendingItems(1),
  });
  await enabled.service.drainQueue(enabled.logger);
  assert.deepStrictEqual(
    enabled.state.processedCalls[0].opts,
    { autoAnalyze: true },
    'AI analysis must be requested when OCR_AUTO_ANALYZE=yes'
  );

  const disabled = loadServiceWithMocks({
    autoAnalyze: 'no',
    queue: pendingItems(1),
  });
  await disabled.service.drainQueue(disabled.logger);
  assert.deepStrictEqual(
    disabled.state.processedCalls[0].opts,
    { autoAnalyze: false },
    'AI analysis must be skipped when OCR_AUTO_ANALYZE=no'
  );
}

async function testConcurrentRunIsSkipped() {
  let releaseFirstItem;
  const firstItemGate = new Promise((resolve) => {
    releaseFirstItem = resolve;
  });

  const { service, state, logger } = loadServiceWithMocks({
    queue: pendingItems(1),
    onProcessQueueItem: async () => firstItemGate,
  });

  const firstRun = service.drainQueue(logger);
  // Let the first run reach processQueueItem() before triggering the second.
  await new Promise((resolve) => setImmediate(resolve));

  const secondResult = await service.drainQueue(logger);
  assert.strictEqual(
    secondResult.skipped,
    'already_running',
    'a second run must not start while the first is still working'
  );

  releaseFirstItem();
  const firstResult = await firstRun;

  assert.strictEqual(
    firstResult.processed,
    1,
    'the first run must finish normally'
  );
  assert.strictEqual(
    state.processedCalls.length,
    1,
    'the document must not be handed to processQueueItem() twice'
  );
}

async function run() {
  try {
    await testGlobalOcrSwitchWins();
    await testUnreachablePaperlessLeavesQueueUntouched();
    await testRejectedTokenIsTreatedAsUnusable();
    await testOnlyPendingItemsAreRequested();
    await testBatchSizeLimitsOneRun();
    await testBatchSizeIsClamped();
    await testInvalidCronFallsBackToDefault();
    await testFailingDocumentDoesNotStopTheBatch();
    await testAutoAnalyzeIsForwarded();
    await testConcurrentRunIsSkipped();

    console.log('PASS test-ocr-auto-process');
  } finally {
    cleanup();
  }
}

run().catch((error) => {
  console.error('FAIL test-ocr-auto-process');
  console.error(error);
  process.exit(1);
});
