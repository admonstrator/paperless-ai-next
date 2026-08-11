/**
 * Test: the page-level button bar lines up on a phone
 *
 * .zr-btnbar turns a wrapping row of buttons into a grid below the phone
 * breakpoint, because five labels of five different lengths otherwise wrap into
 * rows that each end somewhere else. The empty .zr-grow spacer, which pushes the
 * destructive buttons to the far side on a wide screen, becomes the row break
 * that keeps them together.
 *
 * That last part rests on source order: the general rule hides the spacer on a
 * phone at exactly the same specificity, so whichever comes last wins. Moving
 * the block would silently fold the destructive buttons back into the row above.
 *
 * Covers:
 * 1. The bar is a grid on a phone
 * 2. The spacer rule still comes after the rule that hides it
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

const css = fs.readFileSync(
  path.join(process.cwd(), 'public', 'css', 'zr.css'),
  'utf8'
);

test('The button bar becomes a grid', () => {
  const start = css.indexOf('\n  .zr-btnbar {');
  assert.notStrictEqual(start, -1, '.zr-btnbar is gone from the phone block');
  const body = css.slice(start, css.indexOf('}', start));
  assert.match(body, /display:\s*grid/, 'The bar has to lay out as a grid');
  assert.match(
    body,
    /grid-template-columns/,
    'Without explicit tracks the buttons end up in one column each'
  );
});

test('The spacer keeps its meaning inside the bar', () => {
  const hide = css.indexOf('.zr-row--wrap > .zr-grow:empty');
  const keep = css.indexOf('.zr-btnbar > .zr-grow:empty');
  assert.notStrictEqual(hide, -1, 'The general spacer rule is gone');
  assert.notStrictEqual(keep, -1, 'The button bar no longer keeps its spacer');
  assert.ok(
    keep > hide,
    'The .zr-btnbar rule must come after the rule that hides the spacer — ' +
      'same specificity, so source order decides which one applies'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
