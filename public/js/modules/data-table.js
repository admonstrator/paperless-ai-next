/**
 * Server-paginated table — the replacement for jQuery + DataTables (175 KB).
 *
 * Speaks the same request/response shape the API already serves
 * (`draw`, `start`, `length`, `search[value]`, `order[0][*]` ->
 * `{ data, recordsTotal, recordsFiltered }`), so no endpoint had to change.
 *
 * Columns are declared in JS by the page that owns the table:
 *
 *   createTable(el, {
 *     url: '/api/history',
 *     columns: [{ key, label, render?, sortable?, width?, cellClass?, mobileLabel? }],
 *     order: { column: 1, dir: 'desc' },
 *     extraParams: () => ({ tag: '…' }),
 *     toolbar: element,   // optional page-owned filters, slotted after the search
 *   })
 *
 * Below 860 px every row is rendered as a card instead of a wide table, so the
 * page never scrolls sideways on a phone.
 */

import { escapeHtml } from './text-utils.js';

const PAGE_SIZES = [10, 25, 50, 100];

export function createTable(root, options) {
  const {
    url,
    columns,
    order = { column: 0, dir: 'desc' },
    pageLength = 10,
    extraParams = () => ({}),
    emptyText = 'Nothing to show.',
    rowId = (row) => row.id ?? row.document_id,
    toolbar = null,
  } = options;

  const state = {
    draw: 0,
    start: 0,
    length: pageLength,
    search: '',
    order: { ...order },
    total: 0,
    filtered: 0,
    rows: [],
    loading: false,
  };

  root.classList.add('zr-table-host');
  root.innerHTML = `
    <div class="zr-table-toolbar">
      <div class="zr-table-search">
        <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-search"/></svg>
        <input class="zr-input" type="search" placeholder="Search…" data-el="search" aria-label="Search">
      </div>
      <div class="zr-grow"></div>
      <label class="zr-row zr-sm zr-faint">
        Rows
        <select class="zr-select" data-el="length" aria-label="Rows per page">
          ${PAGE_SIZES.map((size) => `<option value="${size}"${size === pageLength ? ' selected' : ''}>${size}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="zr-table-wrap">
      <table class="zr-table" data-el="table">
        <thead><tr>${columns
          .map(
            (col, index) =>
              `<th${col.width ? ` style="width:${col.width}"` : ''}${
                col.sortable === false
                  ? col.cellClass
                    ? ` class="${col.cellClass}"`
                    : ''
                  : ` class="zr-th-sortable${col.cellClass ? ` ${col.cellClass}` : ''}" data-sort="${index}" tabindex="0" role="button"`
              }>${escapeHtml(col.label)}<span class="zr-th-arrow" aria-hidden="true"></span></th>`
          )
          .join('')}</tr></thead>
        <tbody data-el="body"></tbody>
      </table>
    </div>
    <div class="zr-table-cards" data-el="cards"></div>
    <div class="zr-table-foot">
      <span class="zr-sm zr-faint" data-el="info"></span>
      <div class="zr-row">
        <button class="zr-btn zr-btn--icon" type="button" data-el="prev" aria-label="Previous page">
          <svg class="zr-icon" aria-hidden="true"><use href="/icons.svg#i-chevron-left"/></svg>
        </button>
        <span class="zr-sm zr-num" data-el="page"></span>
        <button class="zr-btn zr-btn--icon" type="button" data-el="next" aria-label="Next page">
          <svg class="zr-icon" aria-hidden="true"><use href="/icons.svg#i-chevron-right"/></svg>
        </button>
      </div>
    </div>`;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const body = el('body');
  const cards = el('cards');

  // Page-owned filter controls live next to the search so every way to narrow
  // the table sits in one row. The element is moved, not copied: its ids and
  // listeners stay valid.
  if (toolbar) {
    root.querySelector('.zr-table-search').after(toolbar);
    toolbar.hidden = false;
  }

  function renderHeaderState() {
    root.querySelectorAll('[data-sort]').forEach((th) => {
      const active = Number(th.dataset.sort) === state.order.column;
      th.dataset.dir = active ? state.order.dir : '';
    });
  }

  // Every row is rendered twice — once into the table, once into the card list
  // that replaces it below the mobile breakpoint — so a renderer that mints an
  // element id would mint it twice. `surface` lets it tell the two apart:
  // duplicate ids are not merely untidy here, they break `popovertarget` and
  // getElementById, which resolve to the first match in tree order and would
  // always find the copy inside the hidden table.
  function cellHtml(col, row, surface) {
    if (typeof col.render === 'function') {
      return col.render(row[col.key], row, surface);
    }
    return escapeHtml(row[col.key]);
  }

  function render() {
    if (!state.rows.length) {
      const message = `<div class="zr-empty"><div class="zr-empty__title">${escapeHtml(emptyText)}</div></div>`;
      body.innerHTML = `<tr><td colspan="${columns.length}">${message}</td></tr>`;
      cards.innerHTML = message;
    } else {
      body.innerHTML = state.rows
        .map(
          (row) =>
            `<tr data-row-id="${escapeHtml(rowId(row))}">${columns
              .map(
                (col) =>
                  `<td${col.cellClass ? ` class="${col.cellClass}"` : ''}>${cellHtml(col, row, 'table')}</td>`
              )
              .join('')}</tr>`
        )
        .join('');

      // Same data, card layout — used below the mobile breakpoint.
      cards.innerHTML = state.rows
        .map(
          (row) =>
            `<article class="zr-table-card" data-row-id="${escapeHtml(rowId(row))}">${columns
              .map((col) => {
                if (col.mobile === false) return '';
                const label = col.mobileLabel ?? col.label;
                return `<div class="zr-table-card__row"><span class="zr-table-card__label">${escapeHtml(label)}</span><span class="zr-table-card__value">${cellHtml(col, row, 'card')}</span></div>`;
              })
              .join('')}</article>`
        )
        .join('');
    }

    const from = state.filtered === 0 ? 0 : state.start + 1;
    const to = Math.min(state.start + state.length, state.filtered);
    el('info').textContent =
      `${from}–${to} of ${state.filtered.toLocaleString()}${
        state.filtered !== state.total
          ? ` (filtered from ${state.total.toLocaleString()})`
          : ''
      }`;
    const page = Math.floor(state.start / state.length) + 1;
    const pages = Math.max(1, Math.ceil(state.filtered / state.length));
    el('page').textContent = `${page} / ${pages}`;
    el('prev').disabled = state.start === 0;
    el('next').disabled = state.start + state.length >= state.filtered;
    renderHeaderState();
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    state.draw += 1;
    root.dataset.state = 'loading';

    const params = new URLSearchParams({
      draw: String(state.draw),
      start: String(state.start),
      length: String(state.length),
      'search[value]': state.search,
      'order[0][column]': String(state.order.column),
      'order[0][dir]': state.order.dir,
    });
    columns.forEach((col, index) => {
      params.set(`columns[${index}][data]`, col.key || '');
      params.set(`columns[${index}][name]`, col.key || '');
    });
    Object.entries(extraParams() || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '')
        params.set(key, value);
    });

    try {
      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) throw new Error(`${url} responded ${response.status}`);
      const payload = await response.json();
      state.rows = Array.isArray(payload.data) ? payload.data : [];
      state.total = Number(payload.recordsTotal || 0);
      state.filtered = Number(payload.recordsFiltered || state.total);
      root.dataset.state = 'ready';
    } catch (error) {
      console.error('[data-table] load failed', error);
      state.rows = [];
      root.dataset.state = 'error';
    } finally {
      state.loading = false;
      render();
      root.dispatchEvent(
        new CustomEvent('zr:table-rendered', { bubbles: true })
      );
    }
  }

  let searchTimer = null;
  el('search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = event.target.value.trim();
      state.start = 0;
      load();
    }, 250);
  });

  el('length').addEventListener('change', (event) => {
    state.length = Number(event.target.value) || pageLength;
    state.start = 0;
    load();
  });

  el('prev').addEventListener('click', () => {
    state.start = Math.max(0, state.start - state.length);
    load();
  });
  el('next').addEventListener('click', () => {
    state.start += state.length;
    load();
  });

  root.querySelectorAll('[data-sort]').forEach((th) => {
    const sort = () => {
      const index = Number(th.dataset.sort);
      if (state.order.column === index) {
        state.order.dir = state.order.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.order = { column: index, dir: 'asc' };
      }
      state.start = 0;
      load();
    };
    th.addEventListener('click', sort);
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        sort();
      }
    });
  });

  load();

  return {
    reload: () => load(),
    reset: () => {
      state.start = 0;
      return load();
    },
    get rows() {
      return state.rows;
    },
  };
}

export default function dataTable(el) {
  // Declarative use is intentionally not supported: every table needs its own
  // column renderers, so pages call createTable() directly.
  console.warn('[data-table] use createTable() from a page module', el);
}
