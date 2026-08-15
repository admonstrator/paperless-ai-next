/**
 * Attaches the CSRF token to every state-changing fetch, and replaces it when
 * the server says it has gone stale.
 *
 * Loaded synchronously in <head> so window.fetch is already patched by the time
 * any module or page script runs.
 *
 * Why the replacing half exists: the server mints a new token on every page
 * render and the cookie it pairs with is per-browser, not per-tab. So the
 * moment a second tab loads a page — or the same tab navigates, or the app
 * restarts and a settings page reloads — every older tab is holding a token
 * that no longer matches the cookie. Nothing announced that; the tab simply
 * failed on its next action with "Invalid CSRF token", which reads like a
 * security problem rather than an expired ticket.
 */
(function () {
  'use strict';

  const originalFetch = window.fetch;
  const IGNORED_METHODS = ['GET', 'HEAD', 'OPTIONS'];
  const TOKEN_URL = '/api/csrf-token';

  const tokenMeta = () => document.querySelector('meta[name="csrf-token"]');

  function currentToken() {
    return tokenMeta()?.getAttribute('content') || '';
  }

  /**
   * Asks for a token paired with the cookie the browser holds right now, and
   * writes it into the meta tag so the rest of the page picks it up too.
   *
   * @returns {Promise<string|null>}
   */
  async function refreshToken() {
    try {
      const response = await originalFetch(TOKEN_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return null;

      const data = await response.json();
      const token = typeof data?.csrfToken === 'string' ? data.csrfToken : '';
      if (!token) return null;

      tokenMeta()?.setAttribute('content', token);
      return token;
    } catch {
      // Offline, or the server is still coming back up. The caller reports the
      // original failure rather than this one.
      return null;
    }
  }

  /** A 403 from somewhere else — an expired login, say — must not be retried. */
  async function isStaleTokenResponse(response) {
    if (response.status !== 403) return false;
    try {
      const body = await response.clone().text();
      return body.toLowerCase().includes('csrf');
    } catch {
      return false;
    }
  }

  function withToken(config, token) {
    const next = { ...config };

    if (config.headers instanceof Headers) {
      const headers = new Headers(config.headers);
      headers.set('X-CSRF-Token', token);
      next.headers = headers;
    } else {
      next.headers = { ...(config.headers || {}), 'X-CSRF-Token': token };
    }

    return next;
  }

  window.fetch = async (...args) => {
    const [resource, config = {}] = args;
    const method = (config.method || 'GET').toUpperCase();

    if (IGNORED_METHODS.includes(method)) {
      return originalFetch(resource, config);
    }

    const token = currentToken();
    if (!token) {
      return originalFetch(resource, config);
    }

    const response = await originalFetch(resource, withToken(config, token));

    if (!(await isStaleTokenResponse(response))) {
      return response;
    }

    // A body that was already consumed cannot be sent a second time, so those
    // callers keep the original answer instead of a confusing second failure.
    if (config.body instanceof ReadableStream) {
      return response;
    }

    const fresh = await refreshToken();
    if (!fresh || fresh === token) {
      return response;
    }

    return originalFetch(resource, withToken(config, fresh));
  };
})();
