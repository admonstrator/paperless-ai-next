/**
 * Test: the page-level action bar behaves on a phone
 *
 * .zr-btnbar starts as a grid below the phone breakpoint, because five labels of
 * five different lengths otherwise wrap into rows that each end somewhere else.
 * The toolbar-menu module then folds the whole bar into one "Actions" trigger;
 * the grid is what shows until it mounts and what stays if it fails.
 *
 * Both handovers rest on source order. The general phone rule hides the empty
 * .zr-grow spacer, and the collapsed state hides it again after the bar rule has
 * brought it back as a row break — every one of those selectors matches at the
 * same specificity, so whichever comes last wins. Moving a block would silently
 * fold the destructive buttons into the row above, or park the trigger at the
 * far edge of the screen.
 *
 * Covers:
 * 1. The bar is a grid on a phone
 * 2. The spacer rule still comes after the rule that hides it
 * 3. The collapsed rules still come after both
 * 4. Every button in the bar is wired to the page script
 * 5. A button with its own menu is folded flat rather than nested
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

const root = process.cwd();
const { readFrameworkCss } = require('./framework-css');

const css = readFrameworkCss(path.join(root, 'public', 'css'));

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
  const hide = css.indexOf('.zr-row--wrap > :is(span, div).zr-grow:empty');
  const keep = css.indexOf('.zr-btnbar > :is(span, div).zr-grow:empty');
  assert.notStrictEqual(hide, -1, 'The general spacer rule is gone');
  assert.notStrictEqual(keep, -1, 'The button bar no longer keeps its spacer');
  assert.ok(
    keep > hide,
    'The .zr-btnbar rule must come after the rule that hides the spacer — ' +
      'same specificity, so source order decides which one applies'
  );
});

test('The collapsed bar overrides both', () => {
  const grid = css.indexOf('\n  .zr-btnbar {');
  const keep = css.indexOf('.zr-btnbar > :is(span, div).zr-grow:empty');
  const flex = css.indexOf('.zr-btnbar--collapsed {');
  const drop = css.indexOf(
    '.zr-btnbar--collapsed > :is(span, div).zr-grow:empty'
  );
  assert.notStrictEqual(flex, -1, 'The collapsed layout rule is gone');
  assert.notStrictEqual(drop, -1, 'The collapsed spacer rule is gone');
  assert.ok(flex > grid, 'The collapsed bar has to beat the grid');
  assert.ok(
    drop > keep,
    'The collapsed bar has to beat the rule that turns the spacer into a break'
  );
});

test('Every action in the bar is wired to the page script', () => {
  const view = fs.readFileSync(path.join(root, 'views', 'history.ejs'), 'utf8');
  const start = view.indexOf('zr-btnbar');
  assert.notStrictEqual(start, -1, 'The history action bar is gone');
  // The bar holds buttons and one span, so the next </div> closes it.
  const bar = view.slice(start, view.indexOf('</div>', start));
  assert.match(bar, /data-module="toolbar-menu"/, 'The bar lost its module');

  const script = fs.readFileSync(
    path.join(root, 'public', 'js', 'history.js'),
    'utf8'
  );
  // A popovertarget button is wired by the platform, not by the page script:
  // it opens the menu whose id it names, and the items inside that menu are
  // what the script binds. Demanding a listener for it would only invite a
  // listener that does nothing.
  const ids = [...bar.matchAll(/<button\b([^>]*)>/g)]
    .filter((match) => !/\bpopovertarget=/.test(match[1]))
    .map((match) => /\bid="([^"]+)"/.exec(match[1])?.[1])
    .filter(Boolean);
  assert.ok(
    ids.length >= 2,
    `Expected buttons in the bar, found ${ids.length}`
  );

  // Two of these were in the template for months without a listener anywhere,
  // so clicking them did nothing at all. Matched on a word boundary, or a
  // renamed handler would still answer for the id it no longer binds.
  const orphans = ids.filter(
    (id) => !new RegExp(`\\b${id.replace(/[^\w-]/g, '.')}\\b`).test(script)
  );
  assert.deepStrictEqual(
    orphans,
    [],
    `No handler references: ${orphans.join(', ')}. A button nobody binds is a ` +
      'button that does nothing when clicked.'
  );
});

test('A button with its own menu is folded flat, not nested', () => {
  const module = fs.readFileSync(
    path.join(root, 'public', 'js', 'modules', 'toolbar-menu.js'),
    'utf8'
  );

  // Two popovers cannot be open at once: opening the inner one closes the
  // outer, the trigger loses its box, and the placement code dismisses the
  // menu. Measured in a browser at 375px before this existed — the bulk menu
  // simply never appeared.
  assert.match(
    module,
    /getAttribute\('popovertarget'\)/,
    'The collapse step no longer looks for a nested menu'
  );
  assert.match(
    module,
    /borrowed\.set\(/,
    'Folded-in items are no longer recorded, so expand() cannot return them'
  );
  assert.match(
    module,
    /borrowed\.forEach\(/,
    'expand() no longer hands the items back to their own menu'
  );
  assert.match(
    module,
    /button\.hidden = false/,
    'A trigger hidden while collapsed is never shown again'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
