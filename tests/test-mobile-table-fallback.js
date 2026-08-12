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

const { readFrameworkCss } = require('./framework-css');

const css = readFrameworkCss(path.join(process.cwd(), 'public', 'css'));

test('The mobile rule only hides tables that have a card list beside them', () => {
  // Anything that hides .zr-table-wrap must qualify it with the presence of a
  // card list; a bare `.zr-table-wrap { display: none }` blanks the hand-rolled
  // pages again.
  const hideRules = [
    ...css.matchAll(/([^{}]+)\{([^{}]*display:\s*none[^{}]*)\}/g),
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

test('Every view with a table wrapper reads on a phone', () => {
  const viewsDir = path.join(process.cwd(), 'views');
  const offenders = fs
    .readdirSync(viewsDir)
    .filter((f) => f.endsWith('.ejs'))
    .map((f) => [f, fs.readFileSync(path.join(viewsDir, f), 'utf8')])
    .filter(([, text]) => text.includes('zr-table-wrap'))
    // Either data-table.js builds a card list beside the table, or the table
    // stacks itself. Without one of the two, six columns sit 750px off screen.
    .filter(([, text]) => !text.includes('zr-table--stack'))
    .map(([file]) => file);

  assert.deepStrictEqual(
    offenders,
    [],
    `View(s) with a table that neither stacks nor ships cards: ${offenders.join(', ')}`
  );
});

test('A stacked table labels its cells', () => {
  const scripts = {
    'ocr.ejs': 'ocr.js',
    'failed.ejs': 'failed.js',
    'ignored.ejs': 'ignored.js',
  };
  Object.entries(scripts).forEach(([view, script]) => {
    const markup = fs.readFileSync(
      path.join(process.cwd(), 'views', view),
      'utf8'
    );
    if (!markup.includes('zr-table--stack')) return;

    // The stacked layout draws the column name from data-label, so a row built
    // without it loses the header the table no longer shows.
    const code = fs.readFileSync(
      path.join(process.cwd(), 'public', 'js', script),
      'utf8'
    );
    const columns = (markup.match(/<th[ >]/g) || []).length;
    const labels = (code.match(/<td data-label=/g) || []).length;
    assert.ok(
      labels >= columns,
      `${script} labels ${labels} cells for ${columns} columns in ${view}`
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
