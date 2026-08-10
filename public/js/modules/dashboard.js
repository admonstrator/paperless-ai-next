/**
 * Dashboard module.
 *
 * Replaces the former dashboard.js + dashboard-scripts.ejs pair. All figures come
 * from /api/dashboard/stats (the rendered page ships zeroes only), the runner
 * state is polled from /api/processing-status.
 */

import { renderDonut } from './donut.js';
import { renderSpark } from './spark.js';
import { renderBarList } from './bar-list.js';
import { updateScannerHealthBanner } from './scanner-health.js';

const STATS_URL = '/api/dashboard/stats';
const STATUS_URL = '/api/processing-status';
const STATUS_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 15000;

const COMPACT_UNITS = [
  { threshold: 1e9, suffix: 'b' },
  { threshold: 1e6, suffix: 'm' },
  { threshold: 1e3, suffix: 'k' },
];

function formatNumber(value, { compact = false } = {}) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return '0';
  if (!compact || Math.abs(numeric) < 1000) return numeric.toLocaleString();

  const unit = COMPACT_UNITS.find(
    (entry) => Math.abs(numeric) >= entry.threshold
  );
  const scaled = numeric / unit.threshold;
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(/\.0$/, '');
  return `${text}${unit.suffix}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function describeElapsed(seconds) {
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

// Database timestamps arrive without a timezone marker and are UTC.
function formatTimeAgo(value) {
  const date = new Date(`${value}Z`);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return describeElapsed(Math.floor((Date.now() - date.getTime()) / 1000));
}

function formatDate(value) {
  if (!value) return 'unknown date';
  const normalized = String(value).includes(' ')
    ? String(value).replace(' ', 'T')
    : String(value);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return 'unknown date';
  return parsed.toLocaleDateString();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export default function dashboard(root, { toast }) {
  const paperlessUrl = (root.dataset.paperlessUrl || '').replace(/\/$/, '');
  const version = (root.dataset.version || '').trim();

  const byId = (id) => document.getElementById(id);
  const setText = (id, value) => {
    const el = byId(id);
    if (el) el.textContent = value;
  };

  /* --- statistics ------------------------------------------------------- */

  function documentUrl(documentId) {
    const id = Number(documentId || 0);
    if (!Number.isInteger(id) || id <= 0 || !paperlessUrl) return '';
    return `${paperlessUrl}/documents/${id}/details`;
  }

  function renderRecentActivity(items) {
    const container = byId('recentActivityList');
    if (!container) return;

    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      container.innerHTML =
        '<div class="zr-list__item"><span class="zr-sm zr-faint">No recent processing activity.</span></div>';
      return;
    }

    container.innerHTML = rows
      .map((item) => {
        const url = documentUrl(item.documentId);
        const tag = url ? 'a' : 'div';
        const href = url
          ? ` href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"`
          : '';
        return `
          <${tag} class="zr-list__item"${href}>
            <span class="zr-badge zr-badge--ok">
              <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-check"/></svg>
            </span>
            <span class="zr-list__main">
              <span class="zr-list__title">${escapeHtml(item.title || 'Untitled document')}</span>
              <span class="zr-list__sub">${escapeHtml(item.correspondent || 'Unknown correspondent')} &middot; #${Number(item.documentId || 0)}</span>
            </span>
            <span class="zr-list__time">${escapeHtml(formatDate(item.createdAt))}</span>
          </${tag}>`;
      })
      .join('');
  }

  function renderDocumentTypes(items) {
    const chart = byId('documentTypesDonut');
    const legend = byId('documentTypesLegend');
    const rows = Array.isArray(items) ? items : [];
    const tones = ['brand', 'info', 'ok', 'warn', 'danger'];

    const series = rows.map((entry, index) => ({
      label: entry.type || 'Unknown',
      value: Number(entry.count || 0),
      tone: tones[index % tones.length],
    }));

    if (chart) renderDonut(chart, series, 'classified');
    if (legend) {
      legend.innerHTML = series.length
        ? series
            .map(
              (entry) => `
                <div class="zr-row">
                  <span class="zr-dot" style="background: var(--zr-${entry.tone})"></span>
                  <span class="zr-grow zr-truncate">${escapeHtml(entry.label)}</span>
                  <span class="zr-num zr-strong">${formatNumber(entry.value)}</span>
                </div>`
            )
            .join('')
        : '<p class="zr-sm zr-faint">No document types yet.</p>';
    }
  }

  function renderProcessingSplit(stats) {
    const chart = byId('processingDonut');
    const legend = byId('processingLegend');

    const documentCount = Number(stats.documentCount || 0);
    const processed = Math.max(0, Number(stats.processedDocumentCount || 0));
    const ocrNeeded = Math.max(0, Number(stats.ocrNeededCount || 0));
    const failed = Math.max(0, Number(stats.failedCount || 0));
    const unprocessed = Math.max(
      0,
      documentCount - Math.min(processed, documentCount) - ocrNeeded - failed
    );

    const series = [
      {
        label: 'AI processed',
        value: Math.min(processed, documentCount),
        tone: 'brand',
      },
      { label: 'OCR needed', value: ocrNeeded, tone: 'warn' },
      { label: 'Failed', value: failed, tone: 'danger' },
      { label: 'Unprocessed', value: unprocessed, tone: 'text-faint' },
    ];

    if (chart) renderDonut(chart, series, 'documents');
    if (legend) {
      legend.innerHTML = series
        .map(
          (entry) => `
            <div class="zr-row">
              <span class="zr-dot" style="background: var(--zr-${entry.tone})"></span>
              <span class="zr-grow">${entry.label}</span>
              <span class="zr-num zr-strong">${formatNumber(entry.value)}</span>
            </div>`
        )
        .join('');
    }
  }

  function applyStats(payload) {
    const stats = payload.paperless_data || {};
    const ai = payload.openai_data || {};

    const documentCount = Number(stats.documentCount || 0);
    const processed = Math.max(0, Number(stats.processedDocumentCount || 0));
    const ocrNeeded = Math.max(0, Number(stats.ocrNeededCount || 0));
    const failed = Math.max(0, Number(stats.failedCount || 0));
    // Capped only here: an all-time processed total can exceed the current scan
    // scope, which would otherwise push the unprocessed figure negative.
    const unprocessed = Math.max(
      0,
      documentCount - Math.min(processed, documentCount) - ocrNeeded - failed
    );

    setText('kpiDocuments', formatNumber(documentCount));
    setText('kpiProcessed', formatNumber(processed));
    setText('kpiOcr', formatNumber(ocrNeeded));
    setText('kpiFailed', formatNumber(failed));
    setText('kpiUnprocessed', formatNumber(unprocessed));

    const coverage =
      documentCount > 0
        ? Math.round((Math.min(processed, documentCount) / documentCount) * 100)
        : 0;
    setText('kpiProcessedDelta', `${coverage} % coverage`);

    const failedDelta = byId('kpiFailedDelta');
    if (failedDelta) {
      failedDelta.textContent =
        failed > 0 ? 'needs attention' : 'nothing failed';
      failedDelta.classList.toggle('zr-stat__delta--down', failed > 0);
    }

    setText('totalTags', formatNumber(stats.tagCount));
    setText('totalCorrespondents', formatNumber(stats.correspondentCount));
    setText(
      'efficiencyRate',
      `${Math.max(0, Number(stats.processingEfficiencyRate || 0))} %`
    );
    setText('queueBacklog', formatNumber(stats.queueBacklog));
    setText('failedRate', `${Math.max(0, Number(stats.failedRate || 0))} %`);

    setText(
      'avgPromptTokens',
      formatNumber(ai.averagePromptTokens, { compact: true })
    );
    setText(
      'avgCompletionTokens',
      formatNumber(ai.averageCompletionTokens, { compact: true })
    );
    setText(
      'avgTotalTokens',
      formatNumber(ai.averageTotalTokens, { compact: true })
    );
    setText('tokensOverall', formatNumber(ai.tokensOverall, { compact: true }));

    const trend = Array.isArray(stats.tokenTrend) ? stats.tokenTrend : [];
    const spark = byId('tokenTrendSpark');
    if (spark) {
      renderSpark(
        spark,
        trend.map((point) => Number(point.totalTokens || 0)),
        trend.map((point) => String(point.day || ''))
      );
    }

    const distributionList = byId('tokenDistributionList');
    if (distributionList) {
      renderBarList(
        distributionList,
        (Array.isArray(stats.tokenDistribution)
          ? stats.tokenDistribution
          : []
        ).map((entry) => ({
          label: entry.range,
          value: Number(entry.count || 0),
          display: `${formatNumber(entry.count)} docs`,
        })),
        { emptyText: 'No token data yet.' }
      );
    }

    const languageList = byId('languageDistributionList');
    if (languageList) {
      renderBarList(
        languageList,
        (Array.isArray(stats.languageDistribution)
          ? stats.languageDistribution
          : []
        ).map((entry) => ({
          label: entry.language || 'Unknown',
          value: Number(entry.count || 0),
          display: `${formatNumber(entry.count)} docs`,
        })),
        { emptyText: 'No language data yet.' }
      );
    }

    renderDocumentTypes(stats.documentTypes);
    renderProcessingSplit(stats);
    renderRecentActivity(stats.recentActivity);
  }

  function setModulesState(state) {
    root.querySelectorAll('.zr-module').forEach((module) => {
      module.dataset.state = state;
    });
  }

  let statsInFlight = false;

  async function loadStats({ silent = false } = {}) {
    if (statsInFlight) return;
    statsInFlight = true;
    if (!silent) setModulesState('loading');

    try {
      const payload = await fetchJson(STATS_URL);
      if (!payload?.success)
        throw new Error(payload?.error || 'Invalid dashboard stats response');
      applyStats(payload);
      setModulesState('ready');
    } catch (error) {
      console.error('[dashboard] stats failed', error);
      if (!silent) {
        setModulesState('ready');
        toast('Dashboard statistics could not be loaded', { tone: 'danger' });
      }
    } finally {
      statsInFlight = false;
    }
  }

  /* --- runner status ---------------------------------------------------- */

  let scanActionPending = false;
  let stopActionPending = false;
  let lastSeenProcessedDocId = null;

  function setScanButtons(isScanning, stopRequested) {
    const scanButton = byId('scanButton');
    const stopButton = byId('stopScanButton');
    if (!scanButton || !stopButton) return;

    scanButton.classList.toggle('hidden', isScanning);
    scanButton.disabled = isScanning || scanActionPending;
    scanButton.querySelector('span').textContent = scanActionPending
      ? 'Starting…'
      : 'Scan now';

    stopButton.classList.toggle('hidden', !isScanning);
    stopButton.disabled = !isScanning || stopRequested || stopActionPending;
    stopButton.querySelector('span').textContent =
      stopRequested || stopActionPending ? 'Stopping…' : 'Stop';
  }

  async function pollStatus() {
    try {
      const data = await fetchJson(STATUS_URL);

      const currentDocId = data.lastProcessed
        ? data.lastProcessed.documentId
        : null;
      if (
        lastSeenProcessedDocId !== null &&
        currentDocId !== null &&
        currentDocId !== lastSeenProcessedDocId
      ) {
        loadStats({ silent: true });
      }
      lastSeenProcessedDocId = currentDocId;

      const isScanning = Boolean(data.isScanning || data.currentlyProcessing);
      const dot = byId('runnerDot');
      const docIdBadge = byId('currentDocId');

      if (data.currentlyProcessing) {
        const title = String(data.currentlyProcessing.title || '');
        setText('runnerLabel', 'Processing document');
        setText(
          'runnerDetail',
          title.length > 90 ? `${title.slice(0, 90)}…` : title
        );
        if (docIdBadge) {
          docIdBadge.textContent = `#${data.currentlyProcessing.documentId}`;
          docIdBadge.classList.remove('hidden');
        }
        setText('lastProcessed', 'in progress');
      } else {
        setText('runnerLabel', isScanning ? 'Scanning' : 'System idle');
        setText(
          'runnerDetail',
          isScanning
            ? 'Looking for documents to process'
            : 'Waiting for new documents'
        );
        docIdBadge?.classList.add('hidden');
        setText(
          'lastProcessed',
          data.lastProcessed
            ? formatTimeAgo(data.lastProcessed.processed_at)
            : 'no data'
        );
      }

      if (dot)
        dot.className = `zr-dot ${isScanning ? 'zr-dot--live' : 'zr-dot--ok'}`;

      setScanButtons(isScanning, Boolean(data.stopRequested));
      updateScannerHealthBanner(
        {
          banner: byId('scannerHealthBanner'),
          title: byId('scannerHealthTitle'),
          message: byId('scannerHealthMessage'),
        },
        data
      );
      setText('processedToday', formatNumber(data.processedToday));
      setText(
        'statusLastUpdated',
        `updated ${new Date().toLocaleTimeString()}`
      );
    } catch (error) {
      console.error('[dashboard] processing status failed', error);
    }
  }

  byId('scanButton')?.addEventListener('click', async () => {
    const button = byId('scanButton');
    if (button.disabled) return;

    scanActionPending = true;
    setScanButtons(true, false);
    try {
      const response = await fetch('/api/scan/now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Scan request failed');
      toast('Scan started', { tone: 'ok' });
    } catch (error) {
      console.error('[dashboard] scan failed', error);
      toast('Scan could not be started', { tone: 'danger' });
    } finally {
      scanActionPending = false;
      pollStatus();
    }
  });

  byId('stopScanButton')?.addEventListener('click', async () => {
    const button = byId('stopScanButton');
    if (button.disabled) return;

    stopActionPending = true;
    setScanButtons(true, true);
    try {
      const response = await fetch('/api/scan/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Stop request failed');
      toast('Stop requested — the current document is finished first', {
        tone: 'info',
      });
    } catch (error) {
      console.error('[dashboard] stop failed', error);
      toast('Stop request failed', { tone: 'danger' });
    } finally {
      stopActionPending = false;
      pollStatus();
    }
  });

  /* --- entity details dialog -------------------------------------------- */

  const modal = byId('detailsModal');

  async function showEntities(title, url) {
    if (!modal) return;
    setText('detailsModalTitle', title);
    const body = byId('detailsModalBody');
    body.innerHTML =
      '<div class="zr-row"><span class="zr-spinner"></span><span>Loading…</span></div>';
    modal.showModal();

    try {
      const items = await fetchJson(url);
      const rows = Array.isArray(items) ? items : [];
      body.innerHTML = rows.length
        ? `<div class="zr-list">${rows
            .map(
              (item) => `
                <div class="zr-list__item">
                  <span class="zr-list__main"><span class="zr-list__title">${escapeHtml(item.name)}</span></span>
                  <span class="zr-list__time">${formatNumber(item.document_count || 0)} docs</span>
                </div>`
            )
            .join('')}</div>`
        : '<p class="zr-sm zr-faint">Nothing to show.</p>';
    } catch (error) {
      console.error('[dashboard] entity list failed', error);
      body.innerHTML =
        '<p class="zr-sm" style="color: var(--zr-danger)">Could not load the list.</p>';
    }
  }

  byId('showTagDetails')?.addEventListener('click', () =>
    showEntities('Tags', '/api/tagsCount')
  );
  byId('showCorrespondentDetails')?.addEventListener('click', () =>
    showEntities('Correspondents', '/api/correspondentsCount')
  );
  byId('detailsModalClose')?.addEventListener('click', () => modal?.close());

  /* --- update check ------------------------------------------------------ */

  async function checkForUpdates() {
    if (!version) return;
    try {
      const data = await fetchJson(
        'https://api.github.com/repos/admonstrator/zettelrobbe/releases/latest'
      );
      const latestTag = String(data.tag_name || '');
      if (!latestTag) return;

      const current = version.replace(/^v/, '').split('.').map(Number);
      const latest = latestTag.replace(/^v/, '').split('.').map(Number);

      for (let i = 0; i < 3; i += 1) {
        if ((latest[i] || 0) > (current[i] || 0)) {
          setText('latestVersion', latestTag);
          byId('updateNotification')?.classList.remove('hidden');
          return;
        }
        if ((latest[i] || 0) < (current[i] || 0)) return;
      }
    } catch (error) {
      console.error('[dashboard] update check failed', error);
    }
  }

  /* --- start ------------------------------------------------------------- */

  loadStats();
  pollStatus();
  checkForUpdates();
  const statusTimer = setInterval(pollStatus, STATUS_INTERVAL_MS);

  return {
    destroy() {
      clearInterval(statusTimer);
    },
  };
}
