/**
 * Covers the configurable date format end to end — the half that decides which
 * format is active (config/config.js) and the half that renders with it
 * (public/js/date-format.js).
 *
 * The browser script is executed rather than grepped, because the whole point
 * of the setting is what comes out the other side: a padded month. A test that
 * only checked for the string 'padStart' would still pass with the padding
 * applied to the wrong field.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${label}: ${error.message}`);
  }
};

/* --- which format is active ------------------------------------------- */

const configModulePath = require.resolve('../config/config');
const originalDateFormat = process.env.DATE_FORMAT;

function loadConfigWithDateFormat(value) {
  delete require.cache[configModulePath];

  if (typeof value === 'undefined') {
    delete process.env.DATE_FORMAT;
  } else {
    process.env.DATE_FORMAT = value;
  }

  return require('../config/config');
}

function restoreEnvironment() {
  if (typeof originalDateFormat === 'undefined') {
    delete process.env.DATE_FORMAT;
  } else {
    process.env.DATE_FORMAT = originalDateFormat;
  }

  delete require.cache[configModulePath];
}

check('keeps both offered formats', () => {
  assert.strictEqual(
    loadConfigWithDateFormat('YYYY-MM-DD').dateFormat,
    'YYYY-MM-DD'
  );
  assert.strictEqual(
    loadConfigWithDateFormat('DD.MM.YYYY').dateFormat,
    'DD.MM.YYYY'
  );
});

check('reads a hand-edited .env in any case', () => {
  assert.strictEqual(
    loadConfigWithDateFormat('yyyy-mm-dd').dateFormat,
    'YYYY-MM-DD'
  );
  assert.strictEqual(
    loadConfigWithDateFormat('  dd.mm.yyyy  ').dateFormat,
    'DD.MM.YYYY'
  );
});

check('falls back to DD.MM.YYYY when the value is unusable', () => {
  assert.strictEqual(
    loadConfigWithDateFormat('MM/DD/YYYY').dateFormat,
    'DD.MM.YYYY'
  );
  assert.strictEqual(loadConfigWithDateFormat('').dateFormat, 'DD.MM.YYYY');
  assert.strictEqual(
    loadConfigWithDateFormat(undefined).dateFormat,
    'DD.MM.YYYY'
  );
});

check('writes the normalized value back onto the environment', () => {
  // The settings view and the .env export both read process.env directly, so
  // they would otherwise show the typo instead of what the app renders with.
  loadConfigWithDateFormat('mm/dd/yyyy');
  assert.strictEqual(process.env.DATE_FORMAT, 'DD.MM.YYYY');
});

const offeredFormats = loadConfigWithDateFormat(undefined).validDateFormats;
restoreEnvironment();

/* --- what the browser renders ----------------------------------------- */

const formatterSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'date-format.js'),
  'utf8'
);

/**
 * @param {string|null} metaContent what the shell wrote into the meta tag,
 *   null for a page that carries none.
 */
function loadSandbox(metaContent) {
  const sandbox = {
    document: {
      querySelector(selector) {
        if (selector !== 'meta[name="date-format"]' || metaContent === null) {
          return null;
        }
        return { getAttribute: () => metaContent };
      },
    },
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(formatterSource, sandbox);

  return sandbox;
}

function loadFormatter(metaContent) {
  return loadSandbox(metaContent).window.zrDate;
}

// No timezone suffix anywhere below: the values are parsed as local time, so
// the day stays the day whatever TZ the runner has.
const SEPTEMBER_THIRD = '2026-09-03 07:05:09';
const AUGUST_FIFTEENTH = '2026-08-15 14:32:05';

check('pads the month and the day in the German format', () => {
  const zrDate = loadFormatter('DD.MM.YYYY');
  assert.strictEqual(zrDate.format(SEPTEMBER_THIRD), '03.09.2026');
  assert.strictEqual(zrDate.format(AUGUST_FIFTEENTH), '15.08.2026');
});

check('pads the month and the day in the ISO format', () => {
  const zrDate = loadFormatter('YYYY-MM-DD');
  assert.strictEqual(zrDate.format(SEPTEMBER_THIRD), '2026-09-03');
  assert.strictEqual(zrDate.format(AUGUST_FIFTEENTH), '2026-08-15');
});

check('appends a 24-hour clock under both formats', () => {
  assert.strictEqual(
    loadFormatter('DD.MM.YYYY').formatDateTime(AUGUST_FIFTEENTH),
    '15.08.2026 14:32:05'
  );
  assert.strictEqual(
    loadFormatter('YYYY-MM-DD').formatDateTime(SEPTEMBER_THIRD),
    '2026-09-03 07:05:09'
  );
});

check('renders every format the server is willing to hand it', () => {
  // Guards the seam: a third format added to config/config.js without teaching
  // the browser script would silently render as DD.MM.YYYY everywhere.
  const rendered = offeredFormats.map((format) =>
    loadFormatter(format).activeFormat()
  );
  assert.deepStrictEqual(rendered, offeredFormats);
});

check('accepts the shapes the endpoints actually return', () => {
  const sandbox = loadSandbox('DD.MM.YYYY');
  const { zrDate } = sandbox.window;

  // SQLite hands out a space where ISO wants a T, and Safari refuses that.
  assert.strictEqual(zrDate.format('2026-09-03 07:05:09'), '03.09.2026');
  assert.strictEqual(zrDate.format('2026-09-03T07:05:09'), '03.09.2026');
  assert.strictEqual(zrDate.format('2026-09-03'), '03.09.2026');

  // Built inside the sandbox on purpose: a Date from this file belongs to
  // another realm, where `instanceof Date` is false for reasons that have
  // nothing to do with the browser the code actually runs in.
  assert.strictEqual(
    vm.runInContext('window.zrDate.format(new Date(2026, 8, 3))', sandbox),
    '03.09.2026'
  );
});

check('leaves the empty cell to its caller', () => {
  const zrDate = loadFormatter('DD.MM.YYYY');
  assert.strictEqual(zrDate.format(null), '');
  assert.strictEqual(zrDate.format(''), '');
  assert.strictEqual(zrDate.format(undefined, { fallback: '–' }), '–');
  assert.strictEqual(zrDate.format('not a date', { fallback: '–' }), '–');
  assert.strictEqual(
    zrDate.formatDateTime(null, { fallback: 'Unknown' }),
    'Unknown'
  );
});

check('falls back when the page says something unexpected', () => {
  assert.strictEqual(
    loadFormatter('MM/DD/YYYY').format(SEPTEMBER_THIRD),
    '03.09.2026'
  );
  assert.strictEqual(loadFormatter(null).format(SEPTEMBER_THIRD), '03.09.2026');
  assert.strictEqual(
    loadFormatter('yyyy-mm-dd').format(SEPTEMBER_THIRD),
    '2026-09-03'
  );
});

if (failed > 0) {
  console.error(`\n${failed} date format case(s) failed`);
  process.exit(1);
}

console.log('\nAll date format cases passed');
