/**
 * The "Quickstart auto-detect" block on the settings page looked broken.
 *
 * Its two inputs carry no name attribute, so they are never part of the
 * settings POST and nothing about them is stored — by design, they drive one
 * detection run and what gets saved is whatever the user applies to the AI and
 * OCR fields below. The page never said so, so after a restart the block
 * simply looked like it had forgotten everything (issue #306). Worse, the
 * detect route took the key field at face value, so leaving it empty — the
 * normal case, since a saved secret is never rendered back into a password
 * input — ran the detection with no key at all.
 *
 * A saved key still must not reach the HTML. So the URL is prefilled from the
 * configured AI server, the key field says it is configured, and the route
 * resolves the stored one. That is the same contract the AI and OCR key fields
 * on this page already follow.
 *
 * The resolver is read out of the route file rather than copied, so this test
 * cannot keep passing after the real one changes.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROUTE_FILE = path.join(__dirname, '..', 'routes', 'setup.js');
const routeSource = fs.readFileSync(ROUTE_FILE, 'utf8');

const VIEW_FILE = path.join(__dirname, '..', 'views', 'settings.ejs');
const viewSource = fs.readFileSync(VIEW_FILE, 'utf8');

// ── The stored key stands in for an empty field ──────────────────────────────

const start = routeSource.indexOf('function resolveSettingsQuickstartApiKey');
assert.ok(
  start !== -1,
  'Could not find resolveSettingsQuickstartApiKey in routes/setup.js — did it move or get renamed?'
);
const end = routeSource.indexOf('\n}', start);
const resolveSettingsQuickstartApiKey = new Function(
  `${routeSource.slice(start, end + 2)}\nreturn resolveSettingsQuickstartApiKey;`
)();

const originalCustom = process.env.CUSTOM_API_KEY;
const originalOllama = process.env.OLLAMA_API_KEY;

try {
  process.env.CUSTOM_API_KEY = 'stored-custom-key';
  delete process.env.OLLAMA_API_KEY;

  assert.strictEqual(
    resolveSettingsQuickstartApiKey('typed-key'),
    'typed-key',
    'A key typed into the field must win over the stored one'
  );
  assert.strictEqual(
    resolveSettingsQuickstartApiKey('  typed-key  '),
    'typed-key',
    'Surrounding whitespace must be trimmed'
  );
  assert.strictEqual(
    resolveSettingsQuickstartApiKey(''),
    'stored-custom-key',
    'An empty field must fall back to the stored custom key'
  );
  assert.strictEqual(
    resolveSettingsQuickstartApiKey(undefined),
    'stored-custom-key',
    'A missing field must fall back to the stored custom key'
  );
  assert.strictEqual(
    resolveSettingsQuickstartApiKey('   '),
    'stored-custom-key',
    'A whitespace-only field counts as empty'
  );

  delete process.env.CUSTOM_API_KEY;
  process.env.OLLAMA_API_KEY = 'stored-ollama-key';
  assert.strictEqual(
    resolveSettingsQuickstartApiKey(''),
    'stored-ollama-key',
    'An Ollama setup must fall back to its own stored key'
  );

  delete process.env.OLLAMA_API_KEY;
  assert.strictEqual(
    resolveSettingsQuickstartApiKey(''),
    '',
    'With nothing stored the detection runs without a key, as before'
  );
} finally {
  if (originalCustom === undefined) delete process.env.CUSTOM_API_KEY;
  else process.env.CUSTOM_API_KEY = originalCustom;
  if (originalOllama === undefined) delete process.env.OLLAMA_API_KEY;
  else process.env.OLLAMA_API_KEY = originalOllama;
}

// ── The settings route uses it; setup must not ───────────────────────────────

const settingsRouteStart = routeSource.indexOf(
  "'/api/settings/quickstart/detect'"
);
assert.ok(settingsRouteStart !== -1, 'Settings quickstart route not found');
const settingsRouteBody = routeSource.slice(
  settingsRouteStart,
  routeSource.indexOf('\n);', settingsRouteStart)
);
assert.ok(
  settingsRouteBody.includes('resolveSettingsQuickstartApiKey'),
  'POST /api/settings/quickstart/detect must resolve the stored key for an empty field'
);

const setupRouteStart = routeSource.indexOf("'/api/setup/quickstart/detect'");
assert.ok(setupRouteStart !== -1, 'Setup quickstart route not found');
const setupRouteBody = routeSource.slice(
  setupRouteStart,
  routeSource.indexOf('\n);', setupRouteStart)
);
assert.ok(
  !setupRouteBody.includes('resolveSettingsQuickstartApiKey'),
  'The setup wizard has no stored configuration to fall back on and must keep taking the field at face value'
);

// ── The block explains itself and prefills what it safely can ────────────────

const sectionStart = viewSource.indexOf('id="sec-quickstart-auto-detect"');
assert.ok(
  sectionStart !== -1,
  'Could not find the Quickstart auto-detect section in views/settings.ejs'
);
const section = viewSource.slice(
  sectionStart,
  viewSource.indexOf('id="settingsQuickstartResults"', sectionStart)
);

assert.ok(
  /id="settingsQuickstartUrl"[^>]*value="<%=\s*config\.CUSTOM_BASE_URL\s*\|\|\s*config\.OLLAMA_API_URL/.test(
    section
  ),
  'The AI server URL must be prefilled from the configured AI server so the block is not blank after a restart'
);

const keyField = section.slice(
  section.indexOf('id="settingsQuickstartApiKey"')
);
assert.ok(
  /placeholder="<%=\s*\(configuredSecrets\.CUSTOM_API_KEY \|\| configuredSecrets\.OLLAMA_API_KEY\)/.test(
    keyField
  ),
  'The API key field must say when a key is already configured'
);
assert.ok(
  !/id="settingsQuickstartApiKey"[^>]*value="<%/.test(section),
  'The API key must never be rendered into the page — the settings page deliberately blanks every secret before render'
);
assert.ok(
  /drive the detection run only/.test(section),
  'The block must state that these fields are not saved'
);

console.log('PASS test-settings-quickstart-persistence');
