/**
 * Test: no checkbox falls back to the browser's own widget
 *
 * The framework draws its own controls: a setting that turns something on or off
 * is a switch (.zr-toggle) and a checkbox that
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
const { readFrameworkCss } = require('./framework-css');

const css = readFrameworkCss(path.join(root, 'public', 'css'));

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
  assert.notStrictEqual(
    start,
    -1,
    `The rule "${head}" is gone from the framework css`
  );
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

      offenders.push(`${path.relative(root, file)}: ${tag.slice(0, 90)}`);
    }
  });

  assert.deepStrictEqual(
    offenders,
    [],
    "These checkboxes render as the operating system's own widget. Add " +
      `.zr-toggle for an on/off setting or .zr-check for row selection:\n    ${offenders.join('\n    ')}`
  );
});

test('There is one switch component, not two', () => {
  // A second switch built from a label, a hidden input and two nested spans drew
  // its knob as an inline span: width and height never applied, so the knob was
  // 0x0 and the control showed as a bare grey pill on every page that used it.
  const stragglers = [
    ...collect(path.join(root, 'views'), '.ejs'),
    ...collect(path.join(root, 'public', 'js'), '.js'),
  ].filter((file) => fs.readFileSync(file, 'utf8').includes('zr-switch__'));

  assert.deepStrictEqual(
    stragglers.map((f) => path.relative(root, f)),
    [],
    'These still build the removed .zr-switch markup; use .zr-toggle'
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
  const rules = ['.zr-check::after {', '.zr-toggle:checked::after {'];
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
