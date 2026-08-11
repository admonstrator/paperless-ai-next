// public/js/ocr.js – OCR Queue frontend logic

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────
  let currentPage = 0;
  const pageSize = 25;
  let totalRecords = 0;
  let paperlessUrl = '';
  let currentSearch = '';
  let currentStatus = '';
  let loadTimeout = null;
  let manualDocumentOmnibox = null;
  let queuedDocIds = new Set();

  // ── DOM refs ───────────────────────────────────────────────────────────
  const tableBody = document.getElementById('ocrTableBody');
  const tableInfo = document.getElementById('tableInfo');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const statusFilter = document.getElementById('statusFilter');
  const manualDocId = document.getElementById('manualDocId');
  const manualDocSearchInput = document.getElementById('manualDocSearchInput');
  // #manualDocSearchResults and #manualDocSearchStatus are resolved by the
  // omnibox itself via the IDs passed to createDocumentOmnibox().
  const processAllBtn = document.getElementById('processAllBtn');
  const autoAnalyze = document.getElementById('autoAnalyzeToggle');

  // Progress overlay
  const overlay = document.getElementById('progressOverlay');
  const progressLog = document.getElementById('progressLog');
  const progressBar = document.getElementById('progressBar');
  const progressTitle = document.getElementById('progressTitle');
  const closeBtn = document.getElementById('progressCloseBtn');
  const doneBtn = document.getElementById('progressDoneBtn');

  // ── Init ───────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const initialStatus = (urlParams.get('status') || '').trim();
    if (
      initialStatus &&
      ['pending', 'processing', 'done', 'failed'].includes(initialStatus)
    ) {
      currentStatus = initialStatus;
      if (statusFilter) statusFilter.value = initialStatus;
    }

    // The result filter reads queuedDocIds lazily, so the search must not wait
    // for that request - a stalled fetch would leave the search box dead.
    initializeManualDocumentSearch();
    initializeSearchModeToggles();
    refreshQueuedIds();
    loadQueue();
    loadStats();

    if (statusFilter)
      statusFilter.addEventListener('change', function () {
        currentStatus = this.value;
        currentPage = 0;
        loadQueue();
      });

    if (processAllBtn) processAllBtn.addEventListener('click', processAll);
    if (prevBtn)
      prevBtn.addEventListener('click', function () {
        if (currentPage > 0) {
          currentPage--;
          loadQueue();
        }
      });
    if (nextBtn)
      nextBtn.addEventListener('click', function () {
        const maxPage = Math.ceil(totalRecords / pageSize) - 1;
        if (currentPage < maxPage) {
          currentPage++;
          loadQueue();
        }
      });

    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    if (doneBtn) doneBtn.addEventListener('click', closeOverlay);
  });

  // ── Load queue ─────────────────────────────────────────────────────────
  function loadQueue() {
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(_doLoad, 100);
  }

  async function _doLoad() {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="6" class="zr-empty"><svg class="zr-icon zr-icon--sm zr-icon--spin" aria-hidden="true"><use href="/icons.svg#i-refresh"/></svg> Loading…</td></tr>`;

    try {
      const params = new URLSearchParams({
        start: currentPage * pageSize,
        length: pageSize,
        search: currentSearch,
        status: currentStatus,
      });
      const resp = await fetch(`/api/ocr/queue?${params}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error);

      paperlessUrl = data.paperlessUrl || '';
      totalRecords = data.recordsTotal || 0;
      renderTable(data.data || []);
      updatePagination();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="zr-empty zr-danger-text"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-alert"/></svg>${escHtml(err.message)}</td></tr>`;
    }
  }

  // ── Render table ───────────────────────────────────────────────────────
  function formatReasonLabel(reason) {
    if (!reason) {
      return '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-help"/></svg>Unknown';
    }

    const reasonMap = {
      short_content:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-eye-off"/></svg>Content too short',
      short_content_lt_10:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-eye-off"/></svg>Content too short (&lt; 10 chars)',
      ai_failed:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-cpu"/></svg>AI analysis failed',
      ai_insufficient_content:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-cpu"/></svg>AI: insufficient content',
      ai_invalid_json:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-code"/></svg>AI: invalid JSON response',
      ai_invalid_response_structure:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-layers"/></svg>AI: no tags/correspondent found',
      ai_invalid_api_response_structure:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-server"/></svg>AI: invalid API response structure',
      ai_failed_unknown:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-alert"/></svg>AI failed (unknown)',
      manual:
        '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-user"/></svg>Manual',
    };

    if (reasonMap[reason]) {
      return reasonMap[reason];
    }

    if (reason.startsWith('short_content_lt_')) {
      const threshold = reason.replace('short_content_lt_', '');
      if (/^\d+$/.test(threshold)) {
        return `<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-eye-off"/></svg>Content too short (&lt; ${threshold} chars)`;
      }
    }

    return escHtml(reason);
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = `<tr><td colspan="6" class="zr-empty"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-inbox"/></svg>Queue is empty</td></tr>`;
      return;
    }

    tableBody.innerHTML = items
      .map((item) => {
        const docLink = paperlessUrl
          ? `<a href="${paperlessUrl}/documents/${item.document_id}/details" target="_blank" class="zr-link zr-mono">#${item.document_id}</a>`
          : `<span class="zr-mono">#${item.document_id}</span>`;

        const reasonLabel = formatReasonLabel(item.reason);

        const statusHtml = `<span class="zr-badge ${statusTone(item.status)}">${statusIcon(item.status)} ${escHtml(item.status)}</span>`;

        const addedDate = item.added_at
          ? new Date(item.added_at).toLocaleString()
          : '–';

        // One labelled action per row, everything else behind the "…" — which
        // state a row is in decides what that primary action is, so the column
        // keeps the same two slots throughout.
        const hasOcrText = !!(item.ocr_text && String(item.ocr_text).trim());
        const canProcess =
          item.status === 'pending' || item.status === 'failed';
        const canAnalyze = item.status === 'done' && hasOcrText;

        let primaryBtn = '';
        if (canProcess) {
          primaryBtn = `<button class="zr-btn zr-btn--primary process-btn" data-id="${item.document_id}" title="Send to OCR provider"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-play"/></svg> Process</button>`;
        } else if (canAnalyze) {
          primaryBtn = `<button class="zr-btn analyze-btn" data-id="${item.document_id}" title="Start AI analysis using existing OCR text"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-cpu"/></svg> Analyze</button>`;
        }

        // Process and Analyze never apply to the same row, so whichever is
        // available is already the primary button and never repeats here.
        const menuId = `ocrRowMenu${item.document_id}`;
        const menuItems = [
          hasOcrText
            ? `<button type="button" class="zr-menu__item info-btn" data-id="${item.document_id}"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-info"/></svg>Show OCR output</button>`
            : '',
          item.status !== 'processing'
            ? `<button type="button" class="zr-menu__item zr-menu__item--danger remove-btn" data-id="${item.document_id}"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-trash"/></svg>Remove from queue</button>`
            : '',
        ]
          .filter(Boolean)
          .join('');

        const menu = menuItems
          ? `<button type="button" class="zr-btn zr-btn--ghost zr-btn--icon" popovertarget="${menuId}" title="More actions" aria-label="More actions"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-dots"/></svg></button>
             <div id="${menuId}" popover class="zr-menu">${menuItems}</div>`
          : '';

        return `<tr>
                <td>${docLink}</td>
                <td class="zr-truncate" title="${escHtml(item.title || '')}">${escHtml(item.title || '–')}</td>
                <td><span class="zr-badge">${reasonLabel}</span></td>
                <td>${statusHtml}</td>
                <td class="zr-sm zr-faint">${addedDate}</td>
                <td class="zr-table__actions">
                    <div class="zr-row">
                        ${primaryBtn}
                        ${menu}
                    </div>
                </td>
            </tr>`;
      })
      .join('');

    // Attach button handlers
    tableBody.querySelectorAll('.process-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        processSingle(parseInt(this.dataset.id, 10));
      });
    });
    tableBody.querySelectorAll('.analyze-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        analyzeSingle(parseInt(this.dataset.id, 10));
      });
    });
    tableBody.querySelectorAll('.info-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        showOcrInfo(parseInt(this.dataset.id, 10));
      });
    });
    tableBody.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        removeItem(parseInt(this.dataset.id, 10));
      });
    });
  }

  // Queue states map onto the framework badge tones rather than a second set of
  // status colours that would not follow the theme.
  function statusTone(status) {
    return (
      {
        pending: 'zr-badge--warn',
        processing: 'zr-badge--info',
        done: 'zr-badge--ok',
        failed: 'zr-badge--danger',
      }[status] || ''
    );
  }

  function statusIcon(status) {
    return (
      {
        pending:
          '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-clock"/></svg>',
        processing:
          '<svg class="zr-icon zr-icon--sm zr-icon--spin" aria-hidden="true"><use href="/icons.svg#i-refresh"/></svg>',
        done: '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-check"/></svg>',
        failed:
          '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-x"/></svg>',
      }[status] || ''
    );
  }

  // ── Pagination ─────────────────────────────────────────────────────────
  function updatePagination() {
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, totalRecords);
    if (tableInfo)
      tableInfo.textContent = totalRecords
        ? `Showing ${start}–${end} of ${totalRecords}`
        : 'No results';
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = totalRecords === 0 || end >= totalRecords;
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  async function loadStats() {
    try {
      const resp = await fetch('/api/ocr/stats');
      const data = await resp.json();
      if (!data.success) return;
      const s = data.stats;
      setStatCount('statPendingCount', s.pending);
      setStatCount('statDoneCount', s.done);
      setStatCount('statFailedCount', s.failed);
    } catch (error) {
      // Stats are decorative; keep the queue view usable if they fail to load.
      console.warn('Could not load OCR stats:', error);
    }
  }

  function setStatCount(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '0';
  }

  async function refreshQueuedIds() {
    try {
      const resp = await fetch('/api/ocr/queue/ids');
      const payload = await resp.json();
      const ids = payload && payload.data ? payload.data.ids : null;
      if (payload && payload.success && Array.isArray(ids)) {
        queuedDocIds = new Set(ids.map(Number));
      }
    } catch (error) {
      // Non-fatal: without the list, already queued documents simply stay
      // visible in the search results.
      console.warn('Could not load queued document IDs:', error);
    }
  }

  async function addToQueueDirect(docId) {
    if (!docId || queuedDocIds.has(Number(docId))) return;
    try {
      const resp = await fetch('/api/ocr/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: Number(docId) }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast(data.message || 'Added to queue');
        queuedDocIds.add(Number(docId));
        loadQueue();
        loadStats();
      } else {
        showToast(data.message || data.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function initializeManualDocumentSearch() {
    if (!manualDocSearchInput || !manualDocId) return;

    manualDocumentOmnibox = window.createDocumentOmnibox({
      preset: 'ocr',
      inputId: 'manualDocSearchInput',
      resultsId: 'manualDocSearchResults',
      statusId: 'manualDocSearchStatus',
      hiddenInputId: 'manualDocId',
      limit: 100,
      debounceMs: 250,
      multiSelect: true,
      resultItemClass: 'manual-search-item',
      resultTitleClass: 'manual-search-title',
      resultMetaClass: 'manual-search-meta',
      resultPillClass: 'manual-search-pill',
      filterResults: (documents) =>
        documents.filter((doc) => !queuedDocIds.has(doc.id)),
      onSelect: (doc) => {
        addToQueueDirect(doc.id);
      },
      onEnterAfterSelect: () => {},
    });
  }

  const SEARCH_MODE_HINTS = {
    all: {
      placeholder: 'Search documents...',
      status: 'Type to search documents...',
    },
    id: {
      placeholder: 'Enter exact document ID…',
      status: 'ID mode: type a positive integer Paperless document ID.',
    },
    title: {
      placeholder: 'Search by title...',
      status: 'Type to search by title...',
    },
    tags: {
      placeholder: 'Search by tag name...',
      status: 'Type to search by tag...',
    },
    correspondent: {
      placeholder: 'Search by correspondent...',
      status: 'Type to search by correspondent...',
    },
  };

  function applySearchModeHint(mode) {
    const hint = SEARCH_MODE_HINTS[mode] || SEARCH_MODE_HINTS.all;
    if (manualDocSearchInput) {
      manualDocSearchInput.placeholder = hint.placeholder;
    }
    if (
      manualDocumentOmnibox &&
      typeof manualDocumentOmnibox.setStatus === 'function'
    ) {
      const hasQuery =
        manualDocSearchInput && manualDocSearchInput.value.trim();
      // Only replace the idle status; keep live search results status intact.
      if (!hasQuery) {
        manualDocumentOmnibox.setStatus(hint.status, false);
      }
    }
  }

  // The search scope used to be a row of pills below the field; it is a select
  // in front of it now, so the toolbar stays one line high.
  function initializeSearchModeToggles() {
    const select = document.getElementById('searchModeSelect');
    if (!select || !manualDocumentOmnibox) return;

    applySearchModeHint('all');

    select.addEventListener('change', function () {
      const mode = this.value || 'all';
      manualDocumentOmnibox.setSearchMode(mode);
      applySearchModeHint(mode);
      const currentValue = manualDocSearchInput
        ? manualDocSearchInput.value.trim()
        : '';
      if (currentValue) {
        manualDocumentOmnibox.load(currentValue, { showResults: true });
      }
    });
  }

  // ── Remove item ────────────────────────────────────────────────────────
  async function removeItem(documentId) {
    try {
      const resp = await fetch(`/api/ocr/queue/${documentId}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      showToast(
        data.success ? 'Removed from queue' : data.message || 'Failed',
        data.success ? 'success' : 'error'
      );
      if (data.success) queuedDocIds.delete(documentId);
      loadQueue();
      loadStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Process single ─────────────────────────────────────────────────────
  function processSingle(documentId) {
    const autoAnalyzeVal = autoAnalyze ? autoAnalyze.checked : false;
    openOverlay(`Processing Document #${documentId}…`);

    const es = new EventSource(`/api/ocr/process/${documentId}`);
    // SSE doesn't support POST natively; use fetch + ReadableStream instead
    es.close();

    fetchSSE(
      `/api/ocr/process/${documentId}`,
      { autoAnalyze: autoAnalyzeVal },
      function (done) {
        if (done) {
          loadQueue();
          loadStats();
        }
      }
    );
  }

  // ── Process all ────────────────────────────────────────────────────────
  function processAll() {
    const autoAnalyzeVal = autoAnalyze ? autoAnalyze.checked : false;
    openOverlay('Processing All Pending Items…');

    fetchSSE(
      '/api/ocr/process-all',
      { autoAnalyze: autoAnalyzeVal },
      function (done) {
        if (done) {
          loadQueue();
          loadStats();
        }
      }
    );
  }

  // ── AI only (existing OCR text) ───────────────────────────────────────
  function analyzeSingle(documentId) {
    openOverlay(`AI Analysis for Document #${documentId}…`);
    fetchSSE(`/api/ocr/analyze/${documentId}`, {}, function (done) {
      if (done) {
        loadQueue();
        loadStats();
      }
    });
  }

  // ── OCR output info ───────────────────────────────────────────────────
  async function showOcrInfo(documentId) {
    openOverlay(`OCR Output for Document #${documentId}`);
    setProgress(100);
    try {
      const resp = await fetch(`/api/ocr/queue/${documentId}/text`);
      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || 'Could not load OCR output');
      }

      if (!data.hasOcrText) {
        appendLog('error', 'No OCR text available for this document.');
        finalizeOverlay(true);
        return;
      }

      const infoHeader = `Status: ${data.status || 'unknown'} | Reason: ${data.reason || 'unknown'}`;
      appendLog('done', infoHeader);
      appendLog('progress', '────────────────────────────────────────');

      const text = String(data.ocrText || '');
      const preview =
        text.length > 12000
          ? `${text.slice(0, 12000)}\n\n[... truncated ...]`
          : text;
      appendLog('progress', preview);
      finalizeOverlay();
    } catch (error) {
      appendLog('error', error.message);
      finalizeOverlay(true);
    }
  }

  // ── SSE via fetch (POST) ───────────────────────────────────────────────
  function fetchSSE(url, body, onDone) {
    const totalSteps = 4;
    let stepsDone = 0;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function read() {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                finalizeOverlay();
                if (onDone) onDone(true);
                return;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop(); // keep incomplete line
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                try {
                  const event = JSON.parse(line.slice(5).trim());
                  handleEvent(event);
                } catch {
                  // Ignore partial or malformed SSE frames.
                }
              }
              read();
            })
            .catch((err) => {
              appendLog('error', `Connection error: ${err.message}`);
              finalizeOverlay();
              if (onDone) onDone(false);
            });
        }
        read();

        function handleEvent(ev) {
          const step = ev.step || 'info';
          const msg = ev.message || '';

          appendLog(step, msg);

          if (
            ['download', 'ocr', 'writeback', 'ai'].includes(step) &&
            msg &&
            !msg.startsWith('[OCR]')
          ) {
            // count step completions roughly
            if (
              !msg.includes('…') &&
              !msg.includes('Sending') &&
              !msg.includes('Writing') &&
              !msg.includes('Starting')
            ) {
              stepsDone = Math.min(stepsDone + 1, totalSteps);
              setProgress(Math.round((stepsDone / totalSteps) * 90));
            }
          }
          if (step === 'done') {
            setProgress(100);
            finalizeOverlay();
            if (onDone) onDone(true);
          }
          if (step === 'error') {
            finalizeOverlay(true);
            if (onDone) onDone(false);
          }
        }
      })
      .catch((err) => {
        appendLog('error', err.message);
        finalizeOverlay(true);
        if (onDone) onDone(false);
      });
  }

  // ── Overlay helpers ────────────────────────────────────────────────────
  function openOverlay(title) {
    if (progressTitle) progressTitle.textContent = title;
    if (progressLog) progressLog.innerHTML = '';
    if (progressBar) {
      progressBar.style.width = '5%';
      progressBar.classList.remove(
        'zr-meter__fill--ok',
        'zr-meter__fill--danger'
      );
    }
    if (closeBtn) closeBtn.style.display = 'none';
    if (doneBtn) doneBtn.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
  }

  function closeOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  function finalizeOverlay(isError) {
    if (progressBar) {
      progressBar.style.width = '100%';
      // Assigning the whole className used to drop zr-meter__fill along with
      // the Tailwind classes it replaced, so the bar vanished at 100%.
      progressBar.classList.toggle('zr-meter__fill--danger', isError);
      progressBar.classList.toggle('zr-meter__fill--ok', !isError);
    }
    if (closeBtn) closeBtn.style.display = 'block';
    if (doneBtn) doneBtn.style.display = 'block';
  }

  function setProgress(pct) {
    if (progressBar) progressBar.style.width = `${pct}%`;
  }

  function appendLog(step, message) {
    if (!progressLog) return;
    const line = document.createElement('div');
    line.className = `log-line log-${step}`;
    const icons = {
      download: '⬇ ',
      ocr: '🔍 ',
      writeback: '📤 ',
      ai: '🤖 ',
      done: '✅ ',
      error: '❌ ',
      start: '▶ ',
      progress: '· ',
      item_download: '  ⬇ ',
      item_ocr: '  🔍 ',
      item_writeback: '  📤 ',
      item_ai: '  🤖 ',
      item_done: '  ✅ ',
      item_error: '  ❌ ',
    };
    line.textContent = (icons[step] || '  ') + message;
    progressLog.appendChild(line);
    progressLog.scrollTop = progressLog.scrollHeight;
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    const inner = document.getElementById('toastInner');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    if (!toast) return;

    inner.className = `zr-toast zr-toast--${type === 'error' ? 'danger' : 'ok'}`;
    icon.className = `fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}`;
    msg.textContent = message;

    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
