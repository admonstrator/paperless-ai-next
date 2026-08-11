/**
 * Test: list pages stay readable on a phone
 *
 * The mobile breakpoint hides .zr-table-wrap so a card list can take over. Only
 * public/js/modules/data-table.js builds that card list, and the OCR, failed and
 * ignored pages render their rows by hand in their own page scripts. The rule
 * was unconditional, so on every phone those three showed a pager and a "Showing
 * 1-3 of 3" line above an empty page — the rows were hidden with nothing put in
 * their place.
 *
 * Covers:
 * 1. The hide rule is scoped to hosts that actually contain a card list
 * 2. .zr-table-wrap can scroll on its own, which is what the unscoped pages rely on
 * 3. Every view using .zr-table-wrap either ships cards or is covered by 2
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const cssPath = path.join(process.cwd(), 'public', 'css', 'zr.css');
const css = fs.readFileSync(cssPath, 'utf8');

test('The mobile rule only hides tables that have a card list beside them', () => {
  // Anything that hides .zr-table-wrap must qualify it with the presence of a
  // card list; a bare `.zr-table-wrap { display: none }` blanks the hand-rolled
  // pages again.
  const hideRules = [
    ...css.matchAll(/([^{}]+)\{([^}]*display:\s*none[^}]*)\}/g),
  ]
    .map((m) => m[1].trim())
    .filter((sel) => /\.zr-table-wrap\s*$/.test(sel));

  assert.ok(hideRules.length > 0, 'The card swap rule disappeared entirely');
  hideRules.forEach((sel) => {
    assert.match(
      sel,
      /zr-table-cards/,
      `"${sel}" hides the table without requiring a card list`
    );
  });
});

test('The table wrapper can scroll sideways on its own', () => {
  const block = css.slice(css.indexOf('.zr-table-wrap {'));
  const rule = block.slice(0, block.indexOf('}'));
  assert.match(
    rule,
    /overflow-x:\s*auto/,
    'Without this the unscoped pages would clip their columns instead of scrolling'
  );
});

test('Every view with a table wrapper is accounted for', () => {
  const viewsDir = path.join(process.cwd(), 'views');
  const withWrap = fs
    .readdirSync(viewsDir)
    .filter((f) => f.endsWith('.ejs'))
    .filter((f) =>
      fs.readFileSync(path.join(viewsDir, f), 'utf8').includes('zr-table-wrap')
    );

  // These render rows themselves and therefore rely on the scrolling wrapper.
  const handRolled = ['ocr.ejs', 'failed.ejs', 'ignored.ejs'];
  const unexpected = withWrap.filter((f) => !handRolled.includes(f));

  assert.deepStrictEqual(
    unexpected,
    [],
    `New view(s) using .zr-table-wrap: ${unexpected.join(', ')}. Either render a ` +
      '.zr-table-cards list for phones or add the file here after checking it at 390px.'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
