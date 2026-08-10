/**
 * Sparkline as plain SVG — the replacement for Chart.js line charts.
 *
 * Declarative use:  <svg class="zr-spark" data-module="spark" data-values="182,240,…">
 * Imperative use:   import { renderSpark } from '/js/modules/spark.js'
 */

/**
 * @param {SVGElement} el
 * @param {number[]} values
 * @param {string[]} [labels] optional per-point labels used for the tooltip
 */
export function renderSpark(el, values, labels = []) {
  const points = (values || []).map(Number).filter(Number.isFinite);

  if (points.length < 2) {
    el.innerHTML = '';
    el.setAttribute('data-empty', 'true');
    return;
  }
  el.removeAttribute('data-empty');

  const width = 100;
  const height = 32;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const toPoint = (value, index) => [
    index * step,
    height - ((value - min) / range) * (height - 4) - 2,
  ];

  const line = points
    .map((value, index) => toPoint(value, index).join(' '))
    .join(' L ');
  const area = `M 0 ${height} L ${line} L ${width} ${height} Z`;

  el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  el.setAttribute('preserveAspectRatio', 'none');
  el.setAttribute('role', 'img');

  const title = labels.length
    ? `<title>${labels
        .map(
          (label, index) => `${label}: ${(points[index] ?? 0).toLocaleString()}`
        )
        .join(', ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</title>`
    : '';

  el.innerHTML = `${title}<path class="zr-spark__area" d="${area}"/><path d="M ${line}"/>`;
}

export default function spark(el) {
  const values = (el.dataset.values || '').split(',').map(Number);
  const labels = el.dataset.labels ? el.dataset.labels.split(',') : [];
  renderSpark(el, values, labels);
}
