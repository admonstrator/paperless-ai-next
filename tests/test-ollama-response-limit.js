/**
 * Guards the response token limit on the Ollama path (issue #263).
 *
 * Two things used to be wrong at once and only one of them was visible.
 * num_predict was hardcoded to 256 while the setting sized the context window,
 * so a document whose answer needed more was cut off mid-JSON — and the parser
 * handed that back as { tags: [], correspondent: null }, which is what a model
 * that found nothing returns. The scan loop saw a success, wrote the document
 * back untouched and marked it processed for good.
 *
 * Ollama is stubbed rather than run: what has to be pinned down is the reaction
 * to done_reason, and a stub can produce the cases a live model reaches only by
 * accident — including an Ollama old enough not to send done_reason at all.
 */

const assert = require('assert');
const http = require('http');

let failed = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${label}: ${error.message}`);
  }
};

/* --- a stub that answers /api/generate exactly as told ------------------ */

let nextReply = null;
let lastRequestBody = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    lastRequestBody = JSON.parse(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(nextReply));
  });
});

const COMPLETE_ANSWER = JSON.stringify({
  title: 'Telekom invoice July',
  correspondent: 'Telekom Deutschland GmbH',
  tags: ['invoice', 'telecom'],
  document_type: 'Rechnung',
  document_date: '2026-09-03',
  language: 'de',
});
// The same answer with its closing braces missing, which is what a generation
// stopped at the limit actually returns.
const CUT_OFF_ANSWER = COMPLETE_ANSWER.slice(0, -18);

function reply(overrides) {
  nextReply = {
    response: COMPLETE_ANSWER,
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 900,
    eval_count: 120,
    ...overrides,
  };
}

async function analyze() {
  // id null on purpose: it skips thumbnail caching, so the stub is the only
  // collaborator the call has.
  return ollamaService.analyzeDocument(
    'Rechnung 2026-08-1147',
    [],
    [],
    [],
    null
  );
}

/* --- boot the service against the stub ---------------------------------- */

let ollamaService;
let config;
let shouldQueueForOcrOnAiError;

(async () => {
  console.log('\n=== Ollama response limit ===');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  process.env.OLLAMA_API_URL = `http://127.0.0.1:${port}`;
  process.env.OLLAMA_MODEL = 'stub-model';
  process.env.AI_PROVIDER = 'ollama';
  process.env.RESPONSE_TOKENS = '1000';

  config = require('../config/config');
  ollamaService = require('../services/ollamaService');
  ({ shouldQueueForOcrOnAiError } = require('../services/serviceUtils'));

  await check('RESPONSE_TOKENS arrives as a number, not a string', () => {
    assert.strictEqual(config.responseTokens, 1000);
  });

  await check(
    'the configured limit is what gets sent as num_predict',
    async () => {
      reply({});
      await analyze();
      assert.strictEqual(lastRequestBody.options.num_predict, 1000);
      assert.notStrictEqual(
        lastRequestBody.options.num_predict,
        256,
        'the hardcoded 256 is back'
      );
    }
  );

  await check('a complete answer still comes back usable', async () => {
    reply({});
    const analysis = await analyze();
    assert.strictEqual(analysis.error, undefined);
    assert.strictEqual(
      analysis.document.correspondent,
      'Telekom Deutschland GmbH'
    );
    assert.deepStrictEqual(analysis.document.tags, ['invoice', 'telecom']);
  });

  await check(
    'an answer cut off at the limit is reported, not swallowed',
    async () => {
      reply({
        response: CUT_OFF_ANSWER,
        done_reason: 'length',
        eval_count: 1000,
      });
      const analysis = await analyze();
      assert.strictEqual(analysis.errorCode, 'ai_response_truncated');
      assert.match(analysis.error, /RESPONSE_TOKENS/);
      assert.match(analysis.error, /1000/);
    }
  );

  await check(
    'stopping short of the limit blames the context window',
    async () => {
      reply({
        response: CUT_OFF_ANSWER,
        done_reason: 'length',
        eval_count: 640,
        prompt_eval_count: 7550,
      });
      const analysis = await analyze();
      assert.strictEqual(analysis.errorCode, 'ai_response_truncated');
      assert.match(analysis.error, /TOKEN_LIMIT/);
      assert.doesNotMatch(
        analysis.error,
        /RESPONSE_TOKENS/,
        'naming both settings tells the operator nothing'
      );
    }
  );

  await check(
    'an Ollama too old to send done_reason is still caught',
    async () => {
      reply({
        response: CUT_OFF_ANSWER,
        done_reason: undefined,
        eval_count: 1000,
      });
      const analysis = await analyze();
      assert.strictEqual(analysis.errorCode, 'ai_response_truncated');
    }
  );

  await check('truncation does not go to the OCR queue', async () => {
    reply({
      response: CUT_OFF_ANSWER,
      done_reason: 'length',
      eval_count: 1000,
    });
    const analysis = await analyze();
    // Asserted first so the case cannot pass by there being no error at all,
    // which is exactly the state this whole file exists to rule out.
    assert.ok(analysis.error, 'expected an error');
    // OCR re-reads the PDF and re-runs the same capped analysis, so it cannot
    // help here — it would only cost a round trip and hide the real cause.
    assert.strictEqual(
      shouldQueueForOcrOnAiError(analysis.error),
      false,
      'a truncated answer must not be treated as an OCR case'
    );
  });

  await check('unreadable JSON still takes the OCR fallback', async () => {
    reply({ response: '{"title": "broken", "tags": [' });
    const analysis = await analyze();
    assert.ok(analysis.error, 'expected an error');
    assert.notStrictEqual(analysis.errorCode, 'ai_response_truncated');
    // Same treatment OpenAI has always given it: the text itself may be the
    // problem, and OCR is the second opinion.
    assert.strictEqual(shouldQueueForOcrOnAiError(analysis.error), true);
  });

  await check(
    'an answer without any JSON is an error, not an empty result',
    async () => {
      reply({ response: 'I am sorry, I cannot help with that.' });
      const analysis = await analyze();
      assert.ok(analysis.error, 'expected an error');
      assert.deepStrictEqual(analysis.document.tags, []);
    }
  );

  server.close();

  if (failed > 0) {
    console.error(`\n${failed} Ollama response limit case(s) failed`);
    process.exit(1);
  }
  console.log('\nAll Ollama response limit cases passed');
})();
