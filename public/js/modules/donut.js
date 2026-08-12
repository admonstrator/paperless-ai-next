/**
 * Donut chart as plain SVG — the replacement for Chart.js doughnuts.
 *
 * Declarative use:  <svg data-module="donut" data-series="Invoice:486:brand,…" data-caption="classified">
 * Imperative use:   import { renderDonut } from '/js/modules/donut.js'
 */

import { escapeHtml } from './text-utils.js';

const TONES = ['brand', 'info', 'ok', 'warn', 'danger', 'text-faint'];

/**
 * @param {SVGElement} el
 * @param {Array<{label: string, value: number, tone?: string}>} series
 * @param {string} caption text under the total
 */
export function renderDonut(el, series, caption = '') {
  const slices = (series || [])
    .map((entry, index) => ({
      label: entry.label,
      value: Math.max(0, Number(entry.value) || 0),
      tone: entry.tone || TONES[index % TONES.length],
    }))
    .filter((entry) => entry.value > 0);

  const total = slices.reduce((sum, entry) => sum + entry.value, 0);
  el.setAttribute('viewBox', '0 0 100 100');
  el.setAttribute('role', 'img');

  if (!total) {
    el.innerHTML =
      '<circle cx="50" cy="50" r="42" stroke="var(--zr-surface-sunken)"/>' +
      '<text x="50" y="52" text-anchor="middle" class="zr-donut__caption">no data</text>';
    return;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = slices
    .map((slice) => {
      const length = (slice.value / total) * circumference;
      const arc =
        `<circle cx="50" cy="50" r="${radius}" stroke="var(--zr-${slice.tone})" ` +
        `stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" ` +
        `transform="rotate(-90 50 50)"><title>${escapeHtml(slice.label)}: ${slice.value.toLocaleString()}</title></circle>`;
      offset += length;
      return arc;
    })
    .join('');

  el.innerHTML =
    `<circle cx="50" cy="50" r="${radius}" stroke="var(--zr-surface-sunken)"/>${arcs}` +
    `<text x="50" y="49" text-anchor="middle" dominant-baseline="central" class="zr-donut__total">${total.toLocaleString()}</text>` +
    (caption
      ? `<text x="50" y="62" text-anchor="middle" class="zr-donut__caption">${escapeHtml(caption)}</text>`
      : '');
}

export default function donut(el) {
  const series = (el.dataset.series || '')
    .split(',')
    .map((part) => part.split(':'))
    .filter((part) => part.length >= 2)
    .map(([label, value, tone]) => ({ label, value: Number(value), tone }));

  renderDonut(el, series, el.dataset.caption || '');
}
