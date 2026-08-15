/**
 * Renders dates the way the instance is configured to render them.
 *
 * A classic script loaded synchronously in <head>, because the page scripts
 * that build most of the tables — history, ocr, failed, ignored — cannot import
 * an ES module. Module land reaches this same implementation through
 * modules/date-format.js rather than a second copy.
 *
 * The configured format arrives in the <meta name="date-format"> tag the shell
 * writes. Anything unknown there falls back to DD.MM.YYYY, which is what
 * config/config.js has already normalized the value to on the server; the
 * fallback exists for pages rendered outside the shell, not as a second opinion.
 */
(function () {
  'use strict';

  const FALLBACK_FORMAT = 'DD.MM.YYYY';
  const FORMATS = {
    'DD.MM.YYYY': (parts) => `${parts.day}.${parts.month}.${parts.year}`,
    'YYYY-MM-DD': (parts) => `${parts.year}-${parts.month}-${parts.day}`,
  };

  function activeFormat() {
    const requested = String(
      document
        .querySelector('meta[name="date-format"]')
        ?.getAttribute('content') || ''
    )
      .trim()
      .toUpperCase();

    return FORMATS[requested] ? requested : FALLBACK_FORMAT;
  }

  /**
   * Accepts what the endpoints actually hand out: ISO strings, SQLite's
   * "YYYY-MM-DD HH:MM:SS" (which Safari refuses over the space), Date objects
   * and epoch milliseconds. Returns null for everything that is not a real
   * date, so each caller decides for itself what an empty cell should read.
   */
  function parseValue(value) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed =
      typeof value === 'number'
        ? new Date(value)
        : new Date(String(value).replace(' ', 'T'));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function partsOf(date) {
    return {
      year: String(date.getFullYear()),
      month: pad(date.getMonth() + 1),
      day: pad(date.getDate()),
    };
  }

  function format(value, options) {
    const parsed = parseValue(value);
    if (!parsed) return (options && options.fallback) || '';
    return FORMATS[activeFormat()](partsOf(parsed));
  }

  function formatDateTime(value, options) {
    const parsed = parseValue(value);
    if (!parsed) return (options && options.fallback) || '';

    // A 24-hour clock under both formats: the setting is about the order of the
    // date parts, and an am/pm time belongs to neither of the two on offer.
    const time = [
      pad(parsed.getHours()),
      pad(parsed.getMinutes()),
      pad(parsed.getSeconds()),
    ].join(':');

    return `${FORMATS[activeFormat()](partsOf(parsed))} ${time}`;
  }

  window.zrDate = { format, formatDateTime, activeFormat };
})();
