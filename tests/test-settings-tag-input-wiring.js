/**
 * The Tags and Ignore Tags fields on the settings page were completely inert
 * (issue #299).
 *
 * TagsManager located its add button with
 * `this.tagInput?.closest('.space-y-2')?.querySelector('button')`. `.space-y-2`
 * is a Tailwind class, and no view has carried it since the move to the zr
 * system — it appeared nowhere in the repository except that selector. So
 * closest() returned null, addTagButton stayed undefined, and the constructor's
 * guard `if (tagInput && tagsContainer && addTagButton)` skipped initialize()
 * altogether. Three symptoms, one cause:
 *
 *   - the Add button did nothing (no click handler was ever attached),
 *   - Enter fell through to the form and saved the configuration instead of
 *     adding the tag — the "Btw, pressing ENTER above starts saving" half of
 *     the original report,
 *   - server-rendered chips could not be removed.
 *
 * The buttons carry ids now and are looked up by id. This test drives the real
 * TagsManager, read out of public/js/settings.js, against a DOM stub built from
 * the markup views/settings.ejs actually renders, so it fails if either side
 * drifts again.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SETTINGS_JS = path.join(__dirname, '..', 'public', 'js', 'settings.js');
const SETTINGS_EJS = path.join(__dirname, '..', 'views', 'settings.ejs');
const source = fs.readFileSync(SETTINGS_JS, 'utf8');
const view = fs.readFileSync(SETTINGS_EJS, 'utf8');

// ── A DOM small enough to reason about, real enough to run against ───────────

class StubElement {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.children = [];
    this.parent = null;
    this.className = '';
    this.value = '';
    this.type = '';
    this.id = '';
    this._text = '';
    this._listeners = {};
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  // Only ever assigned an <svg> icon by createTagElement; the chip's text lives
  // in its own span, so treating it as opaque markup loses nothing.
  set innerHTML(value) {
    this._html = String(value);
  }

  get innerHTML() {
    return this._html || '';
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  addEventListener(type, handler) {
    (this._listeners[type] = this._listeners[type] || []).push(handler);
  }

  dispatch(type, event = {}) {
    (this._listeners[type] || []).forEach((handler) =>
      handler.call(this, { preventDefault() {}, ...event })
    );
  }

  _descendants() {
    return this.children.flatMap((child) => [child, ...child._descendants()]);
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    return this.tagName === selector.toUpperCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    // Only the two shapes TagsManager uses: '.zr-chip', '.zr-chip span', 'button'.
    const parts = selector.split(/\s+/).filter(Boolean);
    let matches = this._descendants().filter((el) => el.matches(parts[0]));
    parts.slice(1).forEach((part) => {
      matches = matches.flatMap((el) =>
        el._descendants().filter((child) => child.matches(part))
      );
    });
    return matches;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (
        selector
          .split(',')
          .map((part) => part.trim())
          .some((part) => node.matches(part))
      ) {
        return node;
      }
      node = node.parent;
    }
    return null;
  }
}

/* Mirrors the field as views/settings.ejs renders it: an input and an add
   button inside .zr-inputgroup, a chip container, and the hidden input the
   form actually posts. `existing` seeds server-rendered chips. */
function buildField({ inputId, addButtonId, containerId, hiddenId, existing }) {
  const byId = new Map();
  const make = (tag, props = {}) => {
    const el = new StubElement(tag);
    Object.assign(el, props);
    if (el.id) byId.set(el.id, el);
    return el;
  };

  const field = make('div', { className: 'zr-field zr-field--stacked' });
  const group = make('div', { className: 'zr-inputgroup' });
  const input = make('input', { id: inputId, type: 'text' });
  const addButton = make('button', {
    id: addButtonId,
    className: 'zr-btn zr-btn--primary',
  });
  group.appendChild(input);
  group.appendChild(addButton);

  const container = make('div', { id: containerId, className: 'zr-chips' });
  (existing || []).forEach((name) => {
    const chip = make('div', { className: 'zr-chip' });
    const label = make('span');
    label.textContent = name;
    chip.appendChild(label);
    chip.appendChild(make('button', { className: 'zr-link' }));
    container.appendChild(chip);
  });

  const hidden = make('input', {
    id: hiddenId,
    type: 'hidden',
    value: (existing || []).join(','),
  });

  field.appendChild(group);
  field.appendChild(container);
  field.appendChild(hidden);

  return { field, byId, input, addButton, container, hidden };
}

function loadTagsManager(byId) {
  const start = source.indexOf('class TagsManager {');
  assert.ok(
    start !== -1,
    'Could not find TagsManager in public/js/settings.js — did it move or get renamed?'
  );
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, 'Could not delimit TagsManager');

  const documentStub = {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new StubElement(tag),
  };

  return new Function(
    'document',
    'zrDialog',
    `${source.slice(start, end + 2)}\nreturn TagsManager;`
  )(documentStub, async () => ({ isConfirmed: true }));
}

async function testField(name, ids) {
  const dom = buildField({ ...ids, existing: ['alpha'] });
  const TagsManager = loadTagsManager(dom.byId);
  new TagsManager(ids.inputId, ids.containerId, ids.hiddenId, ids.addButtonId);

  // The Add button commits — this is what did nothing before.
  dom.input.value = 'beta';
  dom.addButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(
    dom.container.querySelectorAll('.zr-chip span').map((s) => s.textContent),
    ['alpha', 'beta'],
    `${name}: the Add button must add the typed tag`
  );
  assert.strictEqual(
    dom.hidden.value,
    'alpha,beta',
    `${name}: the hidden input the form posts must carry the new tag`
  );
  assert.strictEqual(dom.input.value, '', `${name}: the input is cleared`);

  // Enter commits too, and must not be left to bubble into a form submit.
  let defaultPrevented = false;
  dom.input.value = 'gamma';
  dom.input.dispatch('keypress', {
    key: 'Enter',
    preventDefault() {
      defaultPrevented = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(
    dom.container.querySelectorAll('.zr-chip span').map((s) => s.textContent),
    ['alpha', 'beta', 'gamma'],
    `${name}: Enter must add the tag`
  );
  assert.ok(
    defaultPrevented,
    `${name}: Enter must be prevented from submitting the settings form`
  );

  // A server-rendered chip must be removable.
  const firstChipButton =
    dom.container.querySelectorAll('.zr-chip')[0].children[1];
  firstChipButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(
    dom.container.querySelectorAll('.zr-chip span').map((s) => s.textContent),
    ['beta', 'gamma'],
    `${name}: a server-rendered chip must be removable`
  );
  assert.strictEqual(
    dom.hidden.value,
    'beta,gamma',
    `${name}: removing a chip must update the posted value`
  );

  // Duplicates of the separator would corrupt the comma-joined hidden input.
  dom.input.value = 'a,b';
  dom.addButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    dom.hidden.value,
    'beta,gamma',
    `${name}: a tag containing a comma must be refused`
  );
}

async function testEnterSurvivesAMissingButton() {
  // The button is the part that may legitimately be absent; losing it must not
  // take Enter and chip removal down with it, which is exactly what the old
  // three-way guard did.
  const dom = buildField({
    inputId: 'tagInput',
    addButtonId: 'tagAddButton',
    containerId: 'tagsContainer',
    hiddenId: 'tags',
    existing: [],
  });
  dom.byId.delete('tagAddButton');

  const TagsManager = loadTagsManager(dom.byId);
  new TagsManager('tagInput', 'tagsContainer', 'tags', 'tagAddButton');

  dom.input.value = 'delta';
  dom.input.dispatch('keypress', { key: 'Enter' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(
    dom.hidden.value,
    'delta',
    'Enter must keep working even when the add button is missing'
  );
}

// ── The wiring the view and the script have to agree on ──────────────────────

function testWiringContract() {
  assert.ok(
    !/closest\(\s*['"]\.space-y-2['"]\s*\)/.test(source),
    'public/js/settings.js must not look up ancestors by .space-y-2 — that Tailwind class is gone from every view, so the lookup silently returns null'
  );

  ['tagAddButton', 'ignoreTagAddButton'].forEach((id) => {
    assert.ok(
      new RegExp(`id="${id}"`).test(view),
      `views/settings.ejs must give the add button id="${id}" so it is addressed directly instead of by walking the DOM`
    );
    assert.ok(
      new RegExp(`'${id}'`).test(source),
      `public/js/settings.js must pass '${id}' to TagsManager`
    );
  });

  // The runtime-override / locked-env pills bailed out on the same dead class,
  // so none of them ever rendered.
  assert.ok(
    /closest\(\s*['"]\.zr-field, \.zr-switchrow['"]\s*\)/.test(source),
    'the override pills must find their row as a .zr-field or a .zr-switchrow — the two shapes the settings form renders'
  );
}

async function run() {
  testWiringContract();
  await testField('Tags', {
    inputId: 'tagInput',
    addButtonId: 'tagAddButton',
    containerId: 'tagsContainer',
    hiddenId: 'tags',
  });
  await testField('Ignore Tags', {
    inputId: 'ignoreTagInput',
    addButtonId: 'ignoreTagAddButton',
    containerId: 'ignoreTagsContainer',
    hiddenId: 'ignoreTags',
  });
  await testEnterSurvivesAMissingButton();
  console.log('PASS test-settings-tag-input-wiring');
}

run().catch((error) => {
  console.error('FAIL test-settings-tag-input-wiring');
  console.error(error);
  process.exit(1);
});
