/**
 * Test: dashboard warning when Paperless-ngx is not usable
 *
 * Regression guard for the failure mode where the dashboard banner was wired
 * to `scanner.degraded` only. Because `degraded` needs `failureThreshold`
 * consecutive scan runs, an outage stayed invisible for up to three
 * SCAN_INTERVALs — and forever with DISABLE_AUTOMATIC_PROCESSING=yes, where
 * the scanner is never degraded by definition.
 *
 * Covers:
 * 1. The banner logic from views/partials/scripts/dashboard-scripts.ejs,
 *    executed for real against a minimal DOM stub
 * 2. The /api/processing-status payload carrying the fields it needs
 * 3. server.js arming the standalone connectivity probe
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅  ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌  ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Load the real banner code from the EJS partial
// ──────────────────────────────────────────────────────────────────────────────

const partialPath = path.join(
  process.cwd(),
  'views',
  'partials',
  'scripts',
  'dashboard-scripts.ejs'
);
const partialSource = fs.readFileSync(partialPath, 'utf8');

// The status <script> block is plain JavaScript (no EJS tags), so it can run in
// a VM. Testing the shipped source beats re-implementing the logic here.
const blockStart = partialSource.indexOf('function describeElapsed');
const blockEnd = partialSource.indexOf('</script>', blockStart);
assert.ok(
  blockStart > -1 && blockEnd > blockStart,
  'Expected the processing-status script block in dashboard-scripts.ejs'
);
const bannerSource = partialSource.slice(blockStart, blockEnd);
assert.ok(
  !bannerSource.includes('<%'),
  'The block must stay free of EJS tags to remain testable'
);

function createElement() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
        return on;
      },
    },
  };
}

/**
 * Runs the shipped banner code against a fresh DOM stub.
 * @param {object} payload The /api/processing-status response body.
 * @returns {{banner: object, title: object, message: object}}
 */
function renderBanner(payload) {
  const elements = {
    scannerHealthBanner: createElement(),
    scannerHealthTitle: createElement(),
    scannerHealthMessage: createElement(),
  };
  elements.scannerHealthBanner.classList.add('theme-alert-error');
  elements.scannerHealthBanner.classList.add('hidden');

  const sandbox = {
    console: { log() {}, error() {}, debug() {}, warn() {} },
    document: {
      getElementById: (id) => elements[id] || createElement(),
      addEventListener() {},
    },
    window: {},
    // The block self-starts its poll on load; keep it from firing.
    setInterval: () => 0,
    setTimeout: () => 0,
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(sandbox);
  vm.runInContext(bannerSource, sandbox);

  sandbox.updateScannerHealthBanner(payload);

  return {
    banner: elements.scannerHealthBanner,
    title: elements.scannerHealthTitle,
    message: elements.scannerHealthMessage,
  };
}

const HEALTHY_SCANNER = {
  automaticProcessingEnabled: true,
  armed: true,
  degraded: false,
  consecutiveFailures: 0,
  failureThreshold: 3,
  lastError: null,
  lastSuccessfulRunAt: '2026-08-09T10:00:00.000Z',
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. Banner behaviour
// ──────────────────────────────────────────────────────────────────────────────

test('A healthy system shows no banner', () => {
  const { banner } = renderBanner({
    scanner: HEALTHY_SCANNER,
    paperless: { reachable: true, authorized: true, usable: true },
  });

  assert.strictEqual(banner.classList.contains('hidden'), true);
});

test('An outage warns on the first failed probe, before degraded', () => {
  const { banner, title, message } = renderBanner({
    scanner: HEALTHY_SCANNER,
    paperless: {
      reachable: false,
      authorized: false,
      usable: false,
      status: null,
      lastCheckedAt: '2026-08-09T10:00:00.000Z',
      error: 'connect ECONNREFUSED 172.18.0.2:8000',
    },
  });

  assert.strictEqual(
    banner.classList.contains('hidden'),
    false,
    'Waiting for degraded hides the outage for up to three scan intervals'
  );
  assert.match(message.textContent, /not reachable/i);
  assert.match(message.textContent, /ECONNREFUSED/);
  assert.match(title.textContent, /connection problem/i);
  assert.strictEqual(
    banner.classList.contains('theme-alert-warning'),
    true,
    'A recoverable outage is a warning, not a hard failure'
  );
  assert.strictEqual(banner.classList.contains('theme-alert-error'), false);
});

test('A rejected token is reported as a credentials problem', () => {
  const { banner, message } = renderBanner({
    scanner: HEALTHY_SCANNER,
    paperless: {
      reachable: true,
      authorized: false,
      usable: false,
      status: 401,
      lastCheckedAt: '2026-08-09T10:00:00.000Z',
      error: 'Request failed with status code 401',
    },
  });

  assert.strictEqual(banner.classList.contains('hidden'), false);
  assert.match(message.textContent, /rejected the API credentials/i);
  assert.doesNotMatch(
    message.textContent,
    /not reachable/i,
    'The host answered — calling it unreachable sends users hunting the wrong problem'
  );
});

test('The warning appears with automatic processing disabled', () => {
  const { banner, message } = renderBanner({
    scanner: {
      ...HEALTHY_SCANNER,
      automaticProcessingEnabled: false,
      armed: false,
      degraded: false,
    },
    paperless: {
      reachable: false,
      authorized: false,
      usable: false,
      error: 'connect ECONNREFUSED 172.18.0.2:8000',
    },
  });

  assert.strictEqual(
    banner.classList.contains('hidden'),
    false,
    'DISABLE_AUTOMATIC_PROCESSING=yes makes degraded permanently false'
  );
  assert.match(message.textContent, /not reachable/i);
  assert.doesNotMatch(
    message.textContent,
    /scheduler is not armed/i,
    'An intentionally disabled scheduler must not be reported as broken'
  );
});

test('A degraded scanner escalates to the error style', () => {
  const { banner, title, message } = renderBanner({
    scanner: {
      ...HEALTHY_SCANNER,
      degraded: true,
      consecutiveFailures: 3,
      lastError: 'connect ECONNREFUSED 172.18.0.2:8000',
    },
    paperless: {
      reachable: false,
      authorized: false,
      usable: false,
      error: 'connect ECONNREFUSED 172.18.0.2:8000',
    },
  });

  assert.strictEqual(banner.classList.contains('theme-alert-error'), true);
  assert.strictEqual(banner.classList.contains('theme-alert-warning'), false);
  assert.match(title.textContent, /not working/i);
  assert.match(message.textContent, /3 consecutive failed scans/);
});

test('A degraded scanner with a healthy Paperless reports the scan error', () => {
  const { banner, message } = renderBanner({
    scanner: {
      ...HEALTHY_SCANNER,
      degraded: true,
      consecutiveFailures: 4,
      lastError: 'Unexpected token < in JSON',
    },
    paperless: { reachable: true, authorized: true, usable: true },
  });

  assert.strictEqual(banner.classList.contains('hidden'), false);
  assert.match(message.textContent, /Last scan error: Unexpected token/);
  assert.match(message.textContent, /4 consecutive failed scans/);
});

test('An unarmed scheduler is still reported', () => {
  const { message } = renderBanner({
    scanner: { ...HEALTHY_SCANNER, armed: false, degraded: true },
    paperless: { reachable: true, authorized: true, usable: true },
  });

  assert.match(message.textContent, /scheduler is not armed/i);
});

test('An unprobed connection is not treated as an outage', () => {
  const { banner } = renderBanner({
    scanner: HEALTHY_SCANNER,
    paperless: {
      reachable: null,
      authorized: null,
      usable: null,
      lastCheckedAt: null,
      error: null,
    },
  });

  assert.strictEqual(
    banner.classList.contains('hidden'),
    true,
    'Before the first probe there is nothing to warn about'
  );
});

test('A payload without health fields hides the banner instead of throwing', () => {
  const { banner } = renderBanner({});
  assert.strictEqual(banner.classList.contains('hidden'), true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. API payload
// ──────────────────────────────────────────────────────────────────────────────

const setupRouteSource = fs.readFileSync(
  path.join(process.cwd(), 'routes', 'setup.js'),
  'utf8'
);

test('The health snapshot exposes the fields the banner needs', () => {
  const snapshot = setupRouteSource.slice(
    setupRouteSource.indexOf('function buildScannerHealthSnapshot'),
    setupRouteSource.indexOf('function buildScannerHealthSnapshot') + 1500
  );

  for (const field of ['reachable', 'authorized', 'usable', 'lastCheckedAt']) {
    assert.ok(
      snapshot.includes(`${field}: scanner.paperless.${field}`),
      `Expected the snapshot to expose paperless.${field}`
    );
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Standalone connectivity probe
// ──────────────────────────────────────────────────────────────────────────────

const serverSource = fs.readFileSync(
  path.join(process.cwd(), 'server.js'),
  'utf8'
);

test('The connectivity probe is armed independently of the scan loop', () => {
  assert.ok(
    serverSource.includes('function startConnectivityMonitor()'),
    'Expected a standalone Paperless-ngx probe'
  );

  const monitorCall = serverSource.indexOf('startConnectivityMonitor();');
  const startScanning = serverSource.indexOf('function startScanning()');
  assert.ok(monitorCall > -1, 'Expected the probe to be started');
  assert.ok(
    !serverSource
      .slice(startScanning, serverSource.indexOf('\n}', startScanning))
      .includes('startConnectivityMonitor()'),
    'Arming inside startScanning() would skip the probe when automatic processing is off'
  );
});

test('The probe records connectivity without touching the failure counter', () => {
  const monitorStart = serverSource.indexOf(
    'function startConnectivityMonitor'
  );
  const monitorEnd = serverSource.indexOf('// Start scanning', monitorStart);
  const monitor = serverSource.slice(monitorStart, monitorEnd);

  assert.ok(monitor.includes('recordConnectivity('));
  assert.ok(
    !monitor.includes('recordRunResult('),
    'A passive probe must not push /health into 503 on its own'
  );
  assert.ok(
    monitor.includes('clearConnectivity()'),
    'An unconfigured setup must not look like an outage'
  );
});

test('Abandoning the initial scan is counted as a failed run', () => {
  const loopStart = serverSource.indexOf(
    'async function runInitialScanWhenReachable'
  );
  const loopEnd = serverSource.indexOf('\n}', loopStart);
  const loop = serverSource.slice(loopStart, loopEnd);

  assert.ok(
    loop.includes('recordRunResult('),
    'Giving up on the initial scan left consecutiveFailures at 0, so the app never looked degraded'
  );
  assert.strictEqual(
    (loop.match(/recordRunResult\(/g) || []).length,
    1,
    'Counting every retry would trip the threshold during a normal slow start'
  );
});

// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
