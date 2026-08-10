/**
 * Attaches the CSRF token to every state-changing fetch.
 *
 * Loaded synchronously in <head> so window.fetch is already patched by the time
 * any module or page script runs.
 */
(function () {
  'use strict';

  const originalFetch = window.fetch;
  const IGNORED_METHODS = ['GET', 'HEAD', 'OPTIONS'];

  window.fetch = async (...args) => {
    const [resource, config = {}] = args;
    const method = (config.method || 'GET').toUpperCase();

    if (IGNORED_METHODS.includes(method)) {
      return originalFetch(resource, config);
    }

    const token = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute('content');
    if (!token) {
      return originalFetch(resource, config);
    }

    if (!config.headers) {
      config.headers = {};
    }

    if (config.headers instanceof Headers) {
      if (!config.headers.has('X-CSRF-Token')) {
        config.headers.append('X-CSRF-Token', token);
      }
    } else if (
      !config.headers['X-CSRF-Token'] &&
      !config.headers['x-csrf-token']
    ) {
      config.headers['X-CSRF-Token'] = token;
    }

    return originalFetch(resource, config);
  };
})();
