/**
 * Test: icons keep their size inside shrink-to-fit boxes
 *
 * The reset gives every img and svg `max-width: 100%` so a picture cannot burst
 * out of its column. An icon has a fixed size and needs no such cap — and inside
 * a shrink-to-fit table cell the percentage resolves against a width that is not
 * settled yet, so the icon collapses to zero. Since svg clips its overflow, the
 * icon then paints nothing at all while the gap in front of the label stays,
 * which is what emptied the icon out of every row-action button in the queues.
 *
 * Covers:
 * 1. .zr-icon opts out of the reset's percentage cap
 * 2. .zr-icon states its own width and height rather than relying on the file
 */

'use strict';

const assert = require('assert');
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

/**
 * @returns {string} the body of the rule whose selector list matches `head`.
 * Anchored to the start of a line so that ".zr-icon {" cannot be answered by
 * ".zr-navitem .zr-icon {" further up the file.
 */
function ruleBody(head) {
  const start = css.indexOf(`\n${head}`);
  assert.notStrictEqual(start, -1, `The rule "${head}" is gone from zr.css`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

test('The icon opts out of the reset cap that collapses it', () => {
  // Only required while the reset actually caps svg with a percentage; dropping
  // that from the reset would make the opt-out unnecessary rather than wrong.
  const reset = ruleBody('img,\nsvg {');
  if (!/max-width:\s*\d+%/.test(reset)) return;

  assert.match(
    ruleBody('.zr-icon {'),
    /max-width:\s*none/,
    'Without this an icon in a shrink-to-fit cell resolves to 0 and disappears'
  );
});

test('The icon carries its own size', () => {
  const body = ruleBody('.zr-icon {');
  assert.match(
    body,
    /(^|\n)\s*width:\s*\d/,
    '.zr-icon needs an explicit width'
  );
  assert.match(
    body,
    /(^|\n)\s*height:\s*\d/,
    '.zr-icon needs an explicit height'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
