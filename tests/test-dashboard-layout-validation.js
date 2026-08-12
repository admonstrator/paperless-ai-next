/**
 * Guards the dashboard layout validator in routes/setup.js.
 *
 * PUT /api/dashboard/layout takes a grid arrangement straight from the browser
 * and stores it as JSON on the user row, so normalizeDashboardLayout() is the
 * only thing standing between a hostile payload and the database. It has to
 * reject anything it cannot vouch for rather than store it half-checked.
 *
 * The validator is read out of the route file instead of being copied here:
 * a copy would keep passing after the real one changed.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROUTE_FILE = path.join(__dirname, '..', 'routes', 'setup.js');
const source = fs.readFileSync(ROUTE_FILE, 'utf8');

const start = source.indexOf('const DASHBOARD_WIDGET_ID');
const end = source.indexOf(
  '\n}',
  source.indexOf('function normalizeDashboardLayout')
);
assert.ok(
  start !== -1 && end !== -1 && end > start,
  'Could not find normalizeDashboardLayout in routes/setup.js — did it move or get renamed?'
);

const normalizeDashboardLayout = new Function(
  `${source.slice(start, end + 2)}\nreturn normalizeDashboardLayout;`
)();

const valid = { id: 'task-runner', span: 6, height: 240 };
const widget = (overrides) => ({ ...valid, ...overrides });

const accepted = [
  {
    label: 'a plain layout',
    input: { widgets: [widget({}), widget({ id: 'entities', span: 3 })] },
    expect: (result) => {
      assert.strictEqual(result.widgets.length, 2);
      assert.deepStrictEqual(result.widgets[0], {
        id: 'task-runner',
        span: 6,
        height: 240,
      });
    },
  },
  {
    label: 'height 0 meaning "as tall as the content"',
    input: { widgets: [widget({ height: 0 })] },
    expect: (result) => assert.strictEqual(result.widgets[0].height, 0),
  },
  {
    label: 'a missing height defaulting to 0',
    input: { widgets: [{ id: 'entities', span: 4 }] },
    expect: (result) => assert.strictEqual(result.widgets[0].height, 0),
  },
  {
    label: 'numeric strings from a form',
    input: { widgets: [widget({ span: '6', height: '240' })] },
    expect: (result) => {
      assert.strictEqual(result.widgets[0].span, 6);
      assert.strictEqual(result.widgets[0].height, 240);
    },
  },
  {
    label: 'the full grid width',
    input: { widgets: [widget({ span: 12, height: 2000 })] },
    expect: (result) => assert.strictEqual(result.widgets[0].span, 12),
  },
  {
    label: 'unknown properties being dropped rather than stored',
    input: {
      widgets: [{ ...valid, evil: '<script>', nested: { a: 1 } }],
    },
    expect: (result) =>
      assert.deepStrictEqual(Object.keys(result.widgets[0]), [
        'id',
        'span',
        'height',
      ]),
  },
];

const rejected = [
  { label: 'no body at all', input: null },
  { label: 'a body without widgets', input: {} },
  { label: 'widgets that is not an array', input: { widgets: 'all of them' } },
  {
    label: 'a duplicate widget id',
    input: { widgets: [widget({}), widget({})] },
  },
  { label: 'an empty id', input: { widgets: [widget({ id: '' })] } },
  {
    label: 'an id with markup in it',
    input: { widgets: [widget({ id: '<script>' })] },
  },
  {
    label: 'an id with an underscore',
    input: { widgets: [widget({ id: 'task_runner' })] },
  },
  {
    label: 'an id starting with a dash',
    input: { widgets: [widget({ id: '-runner' })] },
  },
  {
    label: 'an id longer than 40 characters',
    input: { widgets: [widget({ id: 'a'.repeat(41) })] },
  },
  {
    label: 'a span below the minimum',
    input: { widgets: [widget({ span: 2 })] },
  },
  {
    label: 'a span wider than the grid',
    input: { widgets: [widget({ span: 13 })] },
  },
  { label: 'a missing span', input: { widgets: [{ id: 'entities' }] } },
  {
    label: 'a non-numeric span',
    input: { widgets: [widget({ span: 'wide' })] },
  },
  {
    label: 'a height beyond the ceiling',
    input: { widgets: [widget({ height: 2001 })] },
  },
  {
    label: 'a negative height',
    input: { widgets: [widget({ height: -50 })] },
  },
  {
    label: 'more widgets than the dashboard could ever hold',
    input: {
      widgets: Array.from({ length: 51 }, (unused, index) =>
        widget({ id: `w-${index}` })
      ),
    },
  },
];

let failed = 0;

for (const { label, input, expect } of accepted) {
  try {
    const result = normalizeDashboardLayout(input);
    assert.ok(result, `${label} should be accepted`);
    expect(result);
    console.log(`  ✓ accepts ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ accepts ${label}: ${error.message}`);
  }
}

for (const { label, input } of rejected) {
  try {
    assert.strictEqual(
      normalizeDashboardLayout(input),
      null,
      `${label} should be rejected`
    );
    console.log(`  ✓ rejects ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ rejects ${label}: ${error.message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} dashboard layout validation case(s) failed`);
  process.exit(1);
}

console.log('\nAll dashboard layout validation cases passed');
