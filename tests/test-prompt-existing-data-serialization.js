/**
 * Regression test for issue #262.
 *
 * paperlessService.getTags() / list*Names() return entity objects, while the
 * scan loop and the OCR fallback already reduce them to plain names. Both
 * shapes therefore reach the AI services, and both have to render correctly:
 *
 *   - objects joined verbatim produced "Pre-existing tags: [object Object], ..."
 *   - the %RESTRICTED_TAGS% formatter matched on `tag.name` only and silently
 *     dropped every entry of a plain-name list.
 */
const assert = require('assert');

const { toNameList } = require('../services/serviceUtils');
const RestrictionPromptService = require('../services/restrictionPromptService');
const config = require('../config/config');
const ollamaService = require('../services/ollamaService');

const TAG_OBJECTS = [
  { id: 1, name: 'invoice' },
  { id: 2, name: 'contract' },
  { id: 3, name: 'insurance' },
];
const TAG_NAMES = TAG_OBJECTS.map((tag) => tag.name);

const CORRESPONDENT_OBJECTS = [
  { id: 7, name: 'Acme Corp' },
  { id: 8, name: 'City Utilities' },
];
const DOCUMENT_TYPE_OBJECTS = [
  { id: 4, name: 'Offer' },
  { id: 5, name: 'Notice' },
];

function assertNoObjectSerialization(prompt, label) {
  assert.ok(
    !prompt.includes('[object Object]'),
    `${label}: prompt must not contain serialized objects`
  );
}

function testToNameList() {
  assert.deepStrictEqual(toNameList(TAG_OBJECTS), TAG_NAMES, 'object list');
  assert.deepStrictEqual(toNameList(TAG_NAMES), TAG_NAMES, 'string list');
  assert.deepStrictEqual(
    toNameList(['invoice', { name: 'contract' }]),
    ['invoice', 'contract'],
    'mixed list'
  );
  assert.deepStrictEqual(toNameList('  single  '), ['single'], 'bare string');
  assert.deepStrictEqual(toNameList(null), [], 'null');
  assert.deepStrictEqual(toNameList(undefined), [], 'undefined');
  assert.deepStrictEqual(
    toNameList([null, undefined, {}, { name: '   ' }, '', { name: 'kept' }]),
    ['kept'],
    'entries without a usable name are dropped'
  );
}

function testPreExistingBlock() {
  const scenarios = [
    {
      label: 'entity objects (rescan queue / webhook path)',
      tags: TAG_OBJECTS,
      correspondents: CORRESPONDENT_OBJECTS,
      documentTypes: DOCUMENT_TYPE_OBJECTS,
    },
    {
      label: 'plain names (scan loop / OCR fallback path)',
      tags: TAG_NAMES,
      correspondents: CORRESPONDENT_OBJECTS.map((entry) => entry.name),
      documentTypes: DOCUMENT_TYPE_OBJECTS.map((entry) => entry.name),
    },
  ];

  for (const scenario of scenarios) {
    const prompt = ollamaService._buildPrompt(
      'document content',
      scenario.tags,
      scenario.correspondents,
      scenario.documentTypes
    );

    assertNoObjectSerialization(prompt, scenario.label);
    assert.ok(
      prompt.includes('Pre-existing tags: invoice, contract, insurance'),
      `${scenario.label}: expected comma-separated tag names`
    );
    assert.ok(
      prompt.includes('Pre-existing correspondents: Acme Corp, City Utilities'),
      `${scenario.label}: expected comma-separated correspondent names`
    );
    assert.ok(
      prompt.includes('Pre-existing document types: Offer, Notice'),
      `${scenario.label}: expected comma-separated document type names`
    );
  }
}

function testRestrictedTagsPlaceholder() {
  const template =
    'Allowed tags: %RESTRICTED_TAGS%\nAllowed correspondents: %RESTRICTED_CORRESPONDENTS%';

  for (const [label, tags, correspondents] of [
    ['entity objects', TAG_OBJECTS, CORRESPONDENT_OBJECTS],
    [
      'plain names',
      TAG_NAMES,
      CORRESPONDENT_OBJECTS.map((entry) => entry.name),
    ],
  ]) {
    const processed = RestrictionPromptService.processRestrictionsInPrompt(
      template,
      tags,
      correspondents
    );

    assertNoObjectSerialization(processed, label);
    assert.ok(
      processed.includes('Allowed tags: invoice, contract, insurance'),
      `${label}: %RESTRICTED_TAGS% must resolve to the tag names`
    );
    assert.ok(
      processed.includes('Allowed correspondents: Acme Corp, City Utilities'),
      `${label}: %RESTRICTED_CORRESPONDENTS% must resolve to the correspondent names`
    );
  }

  assert.strictEqual(
    RestrictionPromptService.processRestrictionsInPrompt(
      'Allowed tags: %RESTRICTED_TAGS%',
      [],
      []
    ),
    'Allowed tags: ',
    'an empty tag list resolves to an empty placeholder'
  );
}

function main() {
  const originalEnv = {
    SYSTEM_PROMPT: process.env.SYSTEM_PROMPT,
    CUSTOM_FIELDS: process.env.CUSTOM_FIELDS,
    USE_PROMPT_TAGS: process.env.USE_PROMPT_TAGS,
  };
  const originalConfig = {
    useExistingData: config.useExistingData,
    restrictToExistingTags: config.restrictToExistingTags,
    restrictToExistingCorrespondents: config.restrictToExistingCorrespondents,
  };

  try {
    process.env.SYSTEM_PROMPT = 'Analyze the document.';
    process.env.CUSTOM_FIELDS = JSON.stringify({ custom_fields: [] });
    process.env.USE_PROMPT_TAGS = 'no';

    // The "Pre-existing ..." block is only built for this combination.
    config.useExistingData = 'yes';
    config.restrictToExistingTags = 'no';
    config.restrictToExistingCorrespondents = 'no';

    testToNameList();
    testPreExistingBlock();
    testRestrictedTagsPlaceholder();
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    Object.assign(config, originalConfig);
  }
}

try {
  main();
  console.log(
    '[PASS] Existing tags, correspondents and document types render as names in AI prompts'
  );
} catch (error) {
  console.error(
    '[FAIL] Prompt existing-data serialization test failed:',
    error.message
  );
  process.exitCode = 1;
}
