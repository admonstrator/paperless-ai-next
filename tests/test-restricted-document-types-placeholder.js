/**
 * Assertion test for the %RESTRICTED_DOCUMENT_TYPES% placeholder in
 * RestrictionPromptService. Regression coverage for issue #127.
 *
 * Besides the formatter itself, this also drives the placeholder through
 * ollamaService._buildPrompt(). A provider that forgets to forward its
 * document type list would otherwise resolve the placeholder to an empty
 * string without any test noticing.
 */
const assert = require('assert');

const RestrictionPromptService = require('../services/restrictionPromptService');
const config = require('../config/config');
const ollamaService = require('../services/ollamaService');

const PROMPT =
  'Tags: %RESTRICTED_TAGS%\n' +
  'Correspondents: %RESTRICTED_CORRESPONDENTS%\n' +
  'Document types: %RESTRICTED_DOCUMENT_TYPES%';

const EXISTING_TAGS = [{ name: 'invoice' }, { name: 'receipt' }];
const EXISTING_CORRESPONDENTS = ['ACME Corp', 'Tax Office'];

// Document type names are user data and may contain non-ASCII characters or
// separators; they have to be joined verbatim.
const STRING_TYPES = [
  'Invoice',
  'Utility Bill / Коммунальные услуги',
  'Contract',
];

function testFormatter() {
  // Scenario 1: array of plain names.
  const result1 = RestrictionPromptService.processRestrictionsInPrompt(
    PROMPT,
    EXISTING_TAGS,
    EXISTING_CORRESPONDENTS,
    STRING_TYPES
  );
  assert.ok(
    !result1.includes('%RESTRICTED_DOCUMENT_TYPES%'),
    'Placeholder must be replaced, not left as a literal string'
  );
  assert.ok(
    result1.includes(
      'Document types: Invoice, Utility Bill / Коммунальные услуги, Contract'
    ),
    'Document type names must be joined verbatim'
  );

  // Scenario 2: array of Paperless-style objects, with unusable entries.
  const result2 = RestrictionPromptService.processRestrictionsInPrompt(
    PROMPT,
    EXISTING_TAGS,
    EXISTING_CORRESPONDENTS,
    [{ name: 'Invoice' }, { name: 'Contract' }, null, { name: '' }]
  );
  assert.ok(
    result2.includes('Document types: Invoice, Contract'),
    'Object entries must be mapped to names and empty/null entries dropped'
  );

  // Scenario 3: empty and missing lists collapse to an empty replacement.
  for (const [label, value] of [
    ['empty array', []],
    ['omitted argument', undefined],
  ]) {
    const result = RestrictionPromptService.processRestrictionsInPrompt(
      PROMPT,
      EXISTING_TAGS,
      EXISTING_CORRESPONDENTS,
      value
    );
    assert.ok(
      !result.includes('%RESTRICTED_DOCUMENT_TYPES%'),
      `${label}: placeholder must be replaced`
    );
    assert.ok(
      result.endsWith('Document types: '),
      `${label}: must collapse to an empty replacement`
    );
  }

  // Scenario 4: a prompt without the placeholder is left untouched.
  assert.strictEqual(
    RestrictionPromptService.processRestrictionsInPrompt(
      'Analyze the document.',
      EXISTING_TAGS,
      EXISTING_CORRESPONDENTS,
      STRING_TYPES
    ),
    'Analyze the document.',
    'Prompt without placeholder must be unchanged'
  );
}

function testProviderWiring() {
  const prompt = ollamaService._buildPrompt(
    'document content',
    EXISTING_TAGS,
    EXISTING_CORRESPONDENTS,
    STRING_TYPES
  );

  assert.ok(
    !prompt.includes('%RESTRICTED_DOCUMENT_TYPES%'),
    'ollamaService must resolve the placeholder'
  );
  assert.ok(
    prompt.includes(
      'Document types: Invoice, Utility Bill / Коммунальные услуги, Contract'
    ),
    'ollamaService must forward its document type list to the placeholder'
  );
}

function main() {
  const originalEnv = {
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT,
    CUSTOM_FIELDS: process.env.CUSTOM_FIELDS,
    USE_PROMPT_TAGS: process.env.USE_PROMPT_TAGS,
  };
  const originalUseExistingData = config.useExistingData;

  try {
    process.env.SYSTEM_PROMPT = PROMPT;
    process.env.CUSTOM_FIELDS = JSON.stringify({ custom_fields: [] });
    process.env.USE_PROMPT_TAGS = 'no';
    // Take the branch that does not prepend the "Pre-existing ..." block, so
    // the assertions only see the placeholder replacement.
    config.useExistingData = 'no';

    testFormatter();
    testProviderWiring();
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    config.useExistingData = originalUseExistingData;
  }
}

try {
  main();
  console.log('[PASS] %RESTRICTED_DOCUMENT_TYPES% resolves to document names');
} catch (error) {
  console.error(
    '[FAIL] Restricted document types placeholder test failed:',
    error.message
  );
  process.exitCode = 1;
}
