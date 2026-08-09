// What's New changelog entries for the update modal.
// Add a new release block at the END of RELEASES whenever you release and keep
// its `version` in sync with PAPERLESS_AI_VERSION in config.js. Only the
// latest release is shown in the modal; older blocks stay here as history.
// Each entry is displayed as one bullet point in the modal.

const RELEASES = [
  {
    version: 'v2026.05.01',
    entries: [
      "New: What's New modal shows release highlights after each update",
      'Removed RAG features to focus on core document management capabilities <a href="https://github.com/admonstrator/zettelrobbe/discussions/144">(see here)</a>',
    ],
  },
  {
    version: 'v2026.05.02',
    entries: ['Fix: Fixed hardcoded temperature settings for Ollama API'],
  },
  {
    version: 'v2026.06.01',
    entries: [
      'New: Local OCR providers available for selection in OCR settings',
      'New: Added support for Ollama API token usage metrics in document history',
      'Improvement: Updated base URL validation',
    ],
  },
  {
    version: 'v2026.07.01',
    entries: [
      'Fix: OCR timeout',
      'Fix: Document handling for re-tagged documents',
    ],
  },
  {
    version: 'v2026.07.02',
    entries: [
      'New: Quickstart AI setup routine for AI / OCR',
      'New: Optional bearer token support for Ollama endpoints (OLLAMA_API_KEY)',
      'New: Ignored documents queue to permanently exclude documents from AI processing',
      'Fix: OCR processing timeout is configurable via SETUP_OCR_VALIDATION_TIMEOUT_MS',
      'Fix: Docker image build on npm 12 (better-sqlite3 native bindings)',
    ],
  },
  {
    version: 'v2026.07.03',
    entries: [
      'New: Multi-page PDF OCR for local vision models - PDF pages are rendered via poppler (pdftoppm) and sent page by page',
      'Improvement: Saving settings no longer runs live AI/OCR connection tests - use the explicit test buttons to verify connectivity on demand',
      'Improvement: Settings page cleaned up - unified ON/OFF switches and clearer section grouping',
      'Fix: Reconciliation settings are now actually persisted when saved from the settings page',
      'Removed: Legacy data/.env migration notice on the settings page',
    ],
  },
  {
    version: 'v2026.07.04',
    entries: [
      "Fix: Quickstart OCR detection now suggests and lists dedicated OCR models (e.g. Mistral's mistral-ocr-latest) instead of requiring vision-capable naming, in both the Setup Wizard and Settings page",
      'Fix: Setup wizard no longer leaves a stale AI provider selected when switching from Quickstart to manual AI configuration',
      'Fix: AI response/prompt log files resolve relative to the working directory on native (non-Docker) installs',
      'Improvement: Quickstart\'s "use this service for OCR" option is now a proper ON/OFF switch, matching the rest of the settings UI',
    ],
  },
  {
    version: 'v2026.08.01',
    entries: [
      'New: %RESTRICTED_DOCUMENT_TYPES% placeholder for custom system prompts - lists the existing document types, just like %RESTRICTED_TAGS% and %RESTRICTED_CORRESPONDENTS% already did',
      'Fix: Document scanning no longer stops permanently when Paperless-ngx is unreachable at startup - the schedule is armed regardless, retries during startup, and recovers on its own without a restart',
      'Fix: RECONCILIATION_ENABLED=no now actually disables automatic reconciliation',
      'Fix: Existing tags reach the AI as readable names again instead of "[object Object]" when a document is reprocessed via Rescan or the webhook - the model can match against them and stops creating near-duplicate tags',
      'Fix: The %RESTRICTED_TAGS% placeholder in custom system prompts no longer resolves to an empty list during regular scans, OCR fallback and the playground',
      'Improvement: The /health endpoint reports scanner state and answers 503 while document scanning is degraded, so monitoring can detect a stalled scan loop <a href="https://zettelrob.be/getting-started/monitoring/" target="_blank" rel="noopener">(see here)</a>',
      'Improvement: The dashboard shows a warning banner while document scanning is not working',
    ],
  },
  {
    version: 'v2026.08.02',
    entries: [
      'Fix: The dashboard now warns as soon as Paperless-ngx cannot be reached, instead of staying silent until three scan runs in a row have failed',
      'Fix: A rejected API token is reported as a credentials problem instead of "Paperless-ngx is not reachable"',
      'Fix: Giving up on the initial scan after a startup outage is counted as a failed run, so the dashboard and /health reflect it',
      'New: Paperless-ngx connectivity is probed every 60s independently of the scan loop, so outages surface between scans and with DISABLE_AUTOMATIC_PROCESSING=yes (configurable via PAPERLESS_PROBE_INTERVAL_SECONDS, 0 disables it)',
      'New: The OCR queue can be processed automatically on a schedule, running OCR and AI analysis without pressing "Process All Pending" - configurable under Settings &rarr; OCR',
      "New: Settings has a Changelog tab showing the full release history, so past release notes are readable after the What's New modal has been dismissed",
    ],
  },
];

const latestRelease = RELEASES[RELEASES.length - 1];

// Entries are written as "New: ...", "Fix: ...", "Improvement: ..." and are
// split into a category and the text itself so the settings page can render
// them as labelled items. Anything without a known prefix becomes a 'note'.
const KNOWN_CATEGORIES = ['new', 'fix', 'improvement', 'removed', 'security'];

function categorizeEntry(entry) {
  const text = String(entry);
  const match = /^([a-z]+)\s*:\s*/i.exec(text);
  const category = match ? match[1].toLowerCase() : null;

  if (!category || !KNOWN_CATEGORIES.includes(category)) {
    return { category: 'note', text };
  }

  return { category, text: text.slice(match[0].length) };
}

// Newest release first — that is the order the settings page displays.
const releases = RELEASES.map((release) => ({
  version: release.version,
  entries: release.entries.map(categorizeEntry),
})).reverse();

module.exports = {
  version: latestRelease.version,
  entries: latestRelease.entries,
  releases,
  categorizeEntry,
};
