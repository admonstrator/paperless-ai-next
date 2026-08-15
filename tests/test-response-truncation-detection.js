/**
 * Truncation detection on the OpenAI-compatible providers (issue #263).
 *
 * Ollama reports a generation it had to cut short as done_reason "length";
 * OpenAI, Azure and the custom endpoint call the same event finish_reason
 * "length". Neither was read anywhere in the codebase, so a cut-off answer
 * surfaced as "Invalid JSON response from API" a few lines later — and sent
 * the document to the OCR queue, which re-reads the PDF and re-runs the same
 * request against the same limit.
 *
 * The playground path is the seam used here: it takes the same client and the
 * same guard as the analysis path, but caches no thumbnail, so the stub is the
 * only collaborator involved.
 */

const assert = require('assert');

process.env.AI_PROVIDER = 'openai';
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_MODEL = 'gpt-4';
process.env.AZURE_API_KEY = 'test-key';
process.env.AZURE_ENDPOINT = 'https://example.invalid';
process.env.AZURE_DEPLOYMENT_NAME = 'test-deployment';
process.env.CUSTOM_BASE_URL = 'https://example.invalid/v1';
process.env.CUSTOM_API_KEY = 'test-key';
process.env.CUSTOM_MODEL = 'test-model';
process.env.SYSTEM_PROMPT = 'Analyse the document.';

const { assertCompletionNotTruncated } = require('../services/serviceUtils');
const openaiService = require('../services/openaiService');
const azureService = require('../services/azureService');
const customService = require('../services/customService');

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

const COMPLETE_ANSWER = JSON.stringify({
  title: 'Telekom invoice July',
  correspondent: 'Telekom Deutschland GmbH',
  tags: ['invoice'],
  document_type: 'Rechnung',
  document_date: '2026-09-03',
  language: 'de',
});

function completion(finishReason, content = COMPLETE_ANSWER) {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 900, completion_tokens: 1000, total_tokens: 1900 },
  };
}

/** Replaces the SDK client with one that answers whatever the case needs. */
function stubClient(service, response) {
  service.client = {
    chat: { completions: { create: async () => response } },
    models: { list: async () => ({ data: [] }) },
  };
}

(async () => {
  console.log('\n=== Response truncation detection ===');

  /* --- the shared guard ------------------------------------------------- */

  await check('finish_reason "length" is rejected with a code', () => {
    assert.throws(
      () =>
        assertCompletionNotTruncated(completion('length'), 'OpenAI', 'Do X.'),
      (error) => {
        assert.strictEqual(error.code, 'ai_response_truncated');
        assert.match(error.message, /OpenAI/);
        assert.match(error.message, /1000 tokens/);
        assert.match(error.message, /Do X\./);
        return true;
      }
    );
  });

  await check('a natural stop passes through untouched', () => {
    assert.doesNotThrow(() =>
      assertCompletionNotTruncated(completion('stop'), 'OpenAI', 'Do X.')
    );
    // Providers that report nothing at all must not be treated as truncated.
    assert.doesNotThrow(() =>
      assertCompletionNotTruncated({ choices: [{}] }, 'OpenAI', 'Do X.')
    );
    assert.doesNotThrow(() =>
      assertCompletionNotTruncated(undefined, 'OpenAI', 'Do X.')
    );
  });

  await check('the message survives a provider that omits usage', () => {
    assert.throws(
      () =>
        assertCompletionNotTruncated(
          { choices: [{ finish_reason: 'length' }] },
          'Custom OpenAI',
          'Do X.'
        ),
      /Custom OpenAI stopped generating because/
    );
  });

  /* --- each provider actually consults it -------------------------------- */

  const services = [
    ['OpenAI', openaiService],
    ['Azure', azureService],
    ['Custom', customService],
  ];

  await check('every analysis catch block carries the code onward', () => {
    // The scan loop reads analysis.errorCode; a service that throws the right
    // error but drops the code on the way out records a generic failure.
    const fs = require('fs');
    for (const name of [
      'openaiService',
      'azureService',
      'customService',
      'ollamaService',
    ]) {
      const source = fs.readFileSync(`services/${name}.js`, 'utf8');
      const guards = (source.match(/errorCode: error\.code/g) || []).length;
      const catches = (
        source.match(
          /document: \{ tags: \[\], correspondent: null \},\n\s*metrics: null,/g
        ) || []
      ).length;
      assert.strictEqual(
        guards,
        catches,
        `${name}: ${catches} analysis catch block(s) but ${guards} carry errorCode`
      );
    }
  });

  for (const [label, service] of services) {
    await check(
      `${label}: a cut-off answer is reported, not parsed`,
      async () => {
        // Truncated JSON would otherwise fail to parse and be blamed on the model.
        stubClient(
          service,
          completion('length', COMPLETE_ANSWER.slice(0, -12))
        );
        const analysis = await service.analyzePlayground('Rechnung', 'Analyse');
        assert.strictEqual(analysis.errorCode, 'ai_response_truncated');
        assert.match(analysis.error, /stopped generating/);
      }
    );

    await check(`${label}: a complete answer is unaffected`, async () => {
      stubClient(service, completion('stop'));
      const analysis = await service.analyzePlayground('Rechnung', 'Analyse');
      assert.strictEqual(analysis.error, undefined);
      assert.strictEqual(
        analysis.document.correspondent,
        'Telekom Deutschland GmbH'
      );
    });
  }

  if (failed > 0) {
    console.error(`\n${failed} truncation detection case(s) failed`);
    process.exit(1);
  }
  console.log('\nAll truncation detection cases passed');
})();
