/**
 * Scanner / Paperless health banner.
 *
 * Kept as its own module with pure functions so the wording and the
 * warning-vs-error decision can be tested directly against the shipped code
 * (see tests/test-paperless-unreachable-banner.js).
 */

export function describeElapsed(seconds) {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/** Health timestamps are full ISO strings that already carry a timezone. */
export function formatIsoTimeAgo(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return describeElapsed(Math.floor((now - date.getTime()) / 1000));
}

/**
 * A probe that reached the host but was rejected is a credentials problem, not
 * an outage — calling it "not reachable" sends users hunting the wrong thing.
 */
export function describePaperlessProblem(paperless) {
  const detail = paperless.error ? ` (${paperless.error})` : '';
  const checked = paperless.lastCheckedAt
    ? ` Last checked ${formatIsoTimeAgo(paperless.lastCheckedAt)}.`
    : '';

  if (paperless.reachable && paperless.authorized === false) {
    return `Paperless-ngx rejected the API credentials${detail}. Check PAPERLESS_API_TOKEN in the settings.${checked}`;
  }

  return `Paperless-ngx is not reachable${detail}.${checked}`;
}

export function buildScannerHealthMessage(scanner, paperless, paperlessDown) {
  const parts = [];

  if (paperlessDown) {
    parts.push(describePaperlessProblem(paperless));
  }

  // Everything below describes the scan loop, which is only worth reporting
  // once it has actually degraded.
  if (!scanner || !scanner.degraded) {
    return parts.join(' ');
  }

  if (!scanner.armed) {
    parts.push(
      'The scan scheduler is not armed. Check the server logs and restart the application.'
    );
    return parts.join(' ');
  }

  if (!paperlessDown && scanner.lastError) {
    parts.push(`Last scan error: ${scanner.lastError}.`);
  }

  const failures = Number(scanner.consecutiveFailures) || 0;
  parts.push(
    `${failures} consecutive failed scan${failures === 1 ? '' : 's'}.`
  );
  parts.push(
    scanner.lastSuccessfulRunAt
      ? `Last successful scan: ${formatIsoTimeAgo(scanner.lastSuccessfulRunAt)}.`
      : 'No successful scan yet.'
  );

  return parts.join(' ');
}

/**
 * Applies the health state to the banner elements.
 *
 * @param {{banner: Element, title: Element, message: Element}} elements
 * @param {object} data /api/processing-status response body
 */
export function updateScannerHealthBanner(elements, data) {
  const { banner, title, message } = elements;
  if (!banner) return;

  const scanner = data.scanner;
  const paperless = data.paperless;
  // Warn on the very first failed probe: waiting for `degraded` means waiting
  // for `failureThreshold` scan runs — hours with the default interval, and
  // forever when automatic processing is off.
  const paperlessDown = Boolean(paperless) && paperless.usable === false;
  const degraded = Boolean(scanner && scanner.degraded);

  if (!paperlessDown && !degraded) {
    banner.classList.add('hidden');
    return;
  }

  // Paperless being down without a degraded scanner is still recoverable on its
  // own, so it reads as a warning rather than a hard failure.
  banner.classList.toggle('zr-alert--danger', degraded);
  banner.classList.toggle('zr-alert--warn', !degraded);

  if (title) {
    title.textContent = degraded
      ? 'Document scanning is not working'
      : 'Paperless-ngx connection problem';
  }

  // textContent only — the message carries server-side error strings.
  if (message) {
    message.textContent = buildScannerHealthMessage(
      scanner,
      paperless,
      paperlessDown
    );
  }

  banner.classList.remove('hidden');
}
