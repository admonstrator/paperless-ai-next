/**
 * Horizontal bar list — the replacement for Chart.js bar charts.
 *
 * Bars are plain elements, so they inherit the theme, stay readable at any width
 * and need no canvas. Used for token distribution and the language mix.
 */

import { escapeHtml } from './text-utils.js';

/**
 * @param {Element} el
 * @param {Array<{label: string, value: number, display?: string, tone?: string}>} items
 * @param {{emptyText?: string}} [options]
 */
export function renderBarList(el, items, options = {}) {
  const rows = Array.isArray(items) ? items : [];

  if (!rows.length) {
    el.innerHTML = `<p class="zr-sm zr-faint">${escapeHtml(options.emptyText || 'No data available.')}</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);

  el.innerHTML = rows
    .map((row) => {
      const value = Number(row.value) || 0;
      const width = Math.max(2, Math.round((value / max) * 100));
      const display =
        row.display != null ? row.display : value.toLocaleString();
      const tone = row.tone ? ` zr-meter__fill--${row.tone}` : '';
      return `
        <div class="zr-barrow">
          <span class="zr-barrow__label">${escapeHtml(row.label)}</span>
          <span class="zr-barrow__value">${escapeHtml(display)}</span>
          <div class="zr-meter zr-barrow__track">
            <div class="zr-meter__fill${tone}" style="width:${width}%"></div>
          </div>
        </div>`;
    })
    .join('');
}

export default function barList(el) {
  const items = (el.dataset.items || '')
    .split(',')
    .map((part) => part.split(':'))
    .filter((part) => part.length >= 2)
    .map(([label, value]) => ({ label, value: Number(value) }));

  renderBarList(el, items);
}
