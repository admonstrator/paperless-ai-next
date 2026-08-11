/**
 * UpdateCheckService
 *
 * Asks GitHub once a day whether a newer release exists.
 *
 * Background: the dashboard used to call api.github.com straight from the
 * browser on every page load. That put the user's IP and referrer in front of a
 * third party for a self-hosted application, and it burned the unauthenticated
 * rate limit (60 requests per hour per IP) on people who simply keep the
 * dashboard open — everyone behind the same NAT shares that budget.
 *
 * The check now happens here: one request per instance per day, the result is
 * cached in memory, and every browser reads it from the local API. A failure is
 * never fatal — it only means the app does not claim to know about updates.
 */

const axios = require('axios');
const config = require('../config/config');

const RELEASES_URL =
  'https://api.github.com/repos/admonstrator/zettelrobbe/releases/latest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Long enough for a slow network, short enough that nothing waits on GitHub.
const REQUEST_TIMEOUT_MS = 8000;
// A failed check should not retry on every page view either.
const FAILURE_RETRY_MS = 60 * 60 * 1000;

/**
 * Splits a release tag into comparable numbers.
 * Tags look like `v2026.08.02`; anything non-numeric is dropped.
 *
 * @param {string} value
 * @returns {number[]}
 */
function parseVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

/**
 * @returns {boolean} true when `latest` is newer than `current`
 */
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

class UpdateCheckService {
  constructor() {
    this.cache = null;
    this.cachedAt = 0;
    this.inFlight = null;
  }

  /** Test seam — drops the cached result so the next call refetches. */
  reset() {
    this.cache = null;
    this.cachedAt = 0;
    this.inFlight = null;
  }

  isEnabled() {
    return config.updateCheckEnabled === 'yes';
  }

  currentVersion() {
    return config.PAPERLESS_AI_VERSION || '';
  }

  buildResult(latestVersion, { error = null } = {}) {
    const currentVersion = this.currentVersion();
    return {
      enabled: true,
      currentVersion,
      latestVersion: latestVersion || null,
      updateAvailable: Boolean(
        latestVersion && isNewer(latestVersion, currentVersion)
      ),
      checkedAt: new Date().toISOString(),
      error,
    };
  }

  isFresh() {
    if (!this.cache) return false;
    const ttl = this.cache.error ? FAILURE_RETRY_MS : CACHE_TTL_MS;
    return Date.now() - this.cachedAt < ttl;
  }

  async fetchLatest() {
    const response = await axios.get(RELEASES_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `zettelrobbe/${this.currentVersion() || 'unknown'}`,
      },
      // A rate-limited or missing repository is a normal outcome here, not an
      // exception worth a stack trace in the log.
      validateStatus: (status) => status === 200,
    });
    return String(response.data?.tag_name || '').trim();
  }

  /**
   * @param {{force?: boolean}} [options]
   * @returns {Promise<object>} the cached or freshly fetched result
   */
  async getStatus({ force = false } = {}) {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        currentVersion: this.currentVersion(),
        latestVersion: null,
        updateAvailable: false,
        checkedAt: null,
        error: null,
      };
    }

    if (!force && this.isFresh()) {
      return this.cache;
    }

    // Concurrent page loads share one request instead of racing GitHub.
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.fetchLatest()
      .then((tag) => {
        this.cache = this.buildResult(tag);
        this.cachedAt = Date.now();
        return this.cache;
      })
      .catch((error) => {
        console.warn('[UPDATE-CHECK] Release lookup failed:', error.message);
        // Keep the last good answer if there is one; only the timestamp ages.
        this.cache = this.cache?.latestVersion
          ? { ...this.cache, error: error.message }
          : this.buildResult(null, { error: error.message });
        this.cachedAt = Date.now();
        return this.cache;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}

module.exports = new UpdateCheckService();
module.exports.parseVersion = parseVersion;
module.exports.isNewer = isNewer;
