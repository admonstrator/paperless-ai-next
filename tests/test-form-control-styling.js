/**
 * Test: no checkbox falls back to the browser's own widget
 *
 * The framework draws its own controls: a setting that turns something on or off
 * is a switch (.zr-toggle, or .zr-switch around the input), and a checkbox that
 * picks table rows is .zr-check. A checkbox carrying neither renders as whatever
 * the operating system paints, which is how the History selection column stayed a
 * grey OS tick while every other control had moved to the framework.
 *
 * Covers:
 * 1. Every checkbox in a view or page script opts into one of the three shapes
 * 2. .zr-check is drawn here rather than by the browser
 * 3. The on-state glyphs use --zr-on-brand, not a hard-coded white
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
const css = fs.readFileSync(path.join(root, 'public', 'css', 'zr.css'), 'utf8');

/** @returns {string[]} every file below `dir` whose name ends in `ext` */
function collect(dir, ext, found = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, ext, found);
    else if (entry.name.endsWith(ext)) found.push(full);
  });
  return found;
}

/**
 * @returns {string} the rule body of the first selector matching `head`.
 * Anchored to the start of a line so a longer selector ending in the same text
 * further up the file cannot answer for it.
 */
function ruleBody(head) {
  const start = css.indexOf(`\n${head}`);
  assert.notStrictEqual(start, -1, `The rule "${head}" is gone from zr.css`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

test('Every checkbox is a switch or a framework tick', () => {
  const sources = [
    ...collect(path.join(root, 'views'), '.ejs'),
    ...collect(path.join(root, 'public', 'js'), '.js'),
  ];

  const offenders = [];
  sources.forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const tags = text.matchAll(/<input\b[^>]*type=["']checkbox["'][^>]*>/gi);
    for (const match of tags) {
      const tag = match[0];
      const classes = /class=["']([^"']*)["']/.exec(tag)?.[1] || '';
      if (/\bzr-toggle\b|\bzr-check\b/.test(classes)) continue;

      // The other accepted shape puts the input inside a <label class="zr-switch">,
      // which hides it and draws a track and thumb in its place.
      const before = text.slice(0, match.index);
      const label = before.slice(before.lastIndexOf('<label'));
      if (/class=["'][^"']*\bzr-switch\b/.test(label)) continue;

      offenders.push(`${path.relative(root, file)}: ${tag.slice(0, 90)}`);
    }
  });

  assert.deepStrictEqual(
    offenders,
    [],
    "These checkboxes render as the operating system's own widget. Add " +
      '.zr-toggle for an on/off setting, .zr-check for row selection, or wrap ' +
      `the input in <label class="zr-switch">:\n    ${offenders.join('\n    ')}`
  );
});

test('The selection tick is drawn by the framework', () => {
  const body = ruleBody('.zr-check {');
  assert.match(
    body,
    /appearance:\s*none/,
    'Without this the browser paints the checkbox and ignores the brand'
  );
  // An empty box is nothing but its outline, so the border alone has to clear
  // the 3:1 of WCAG 1.4.11 — the input border token only reaches 1.5:1.
  assert.match(
    body,
    /border:\s*1px solid var\(--zr-text-faint\)/,
    'The resting border needs a tone that stands out from the surface'
  );
});

test('On-state glyphs use --zr-on-brand', () => {
  // The dark theme's brand is a bright teal; a white tick or thumb on it reaches
  // only 2.3:1, so the glyph colour has to follow the theme.
  const rules = [
    '.zr-check::after {',
    '.zr-toggle:checked::after {',
    '.zr-switch input:checked + .zr-switch__track .zr-switch__thumb {',
  ];
  rules.forEach((head) => {
    assert.match(
      ruleBody(head),
      /var\(--zr-on-brand\)/,
      `"${head}" paints on the brand colour and must use --zr-on-brand`
    );
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
}
