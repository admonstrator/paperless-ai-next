/**
 * The configured date formatter, for module land.
 *
 * The implementation lives in the classic script /js/date-format.js — the page
 * scripts that render most of the tables cannot import an ES module, and one
 * formatter beats two. This adapter is what lets a module name the dependency
 * in its import list instead of reaching for a global halfway down a render
 * function; the shell loads the script in <head>, so it is there by the time
 * any module runs.
 */

export function formatDate(value, options) {
  return window.zrDate
    ? window.zrDate.format(value, options)
    : (options && options.fallback) || '';
}

export function formatDateTime(value, options) {
  return window.zrDate
    ? window.zrDate.formatDateTime(value, options)
    : (options && options.fallback) || '';
}
