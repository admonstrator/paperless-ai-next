// public/js/ignored.js – Ignored documents queue frontend logic

(function () {
  'use strict';

  let currentPage = 0;
  const pageSize = 25;
  let totalRecords = 0;
  let paperlessUrl = '';

  const tableBody = document.getElementById('ignoredTableBody');
  const tableInfo = document.getElementById('ignoredTableInfo');
  const clearAllBtn = document.getElementById('ignoredClearAllBtn');
  const prevBtn = document.getElementById('ignoredPrevPageBtn');
  const nextBtn = document.getElementById('ignoredNextPageBtn');
  const addBtn = document.getElementById('ignoreAddBtn');
  const docIdInput = document.getElementById('ignoreDocIdInput');
  const reasonInput = document.getElementById('ignoreReasonInput');
  let clearAllInProgress = false;

  document.addEventListener('DOMContentLoaded', function () {
    loadQueue();

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

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        clearAllIgnoredDocuments();
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        addIgnoredDocument();
      });
    }

    if (docIdInput) {
      docIdInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addIgnoredDocument();
      });
    }
  });

  async function loadQueue() {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="5" class="zr-empty"><svg class="zr-icon zr-icon--sm zr-icon--spin" aria-hidden="true"><use href="/icons.svg#i-refresh"/></svg> Loading…</td></tr>`;

    try {
      const params = new URLSearchParams({
        start: currentPage * pageSize,
        length: pageSize,
        search: '',
      });

      const resp = await fetch(`/api/ignored/queue?${params}`);
      const data = await resp.json();
      if (!data.success)
        throw new Error(data.error || 'Failed to load ignored documents');

      totalRecords = data.recordsTotal || 0;
      paperlessUrl = data.paperlessUrl || '';
      renderTable(data.data || []);
      updatePagination();
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5" class="zr-empty zr-danger-text"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-alert"/></svg>${escHtml(err.message)}</td></tr>`;
    }
  }

  function renderTable(items) {
    if (!items.length) {
      tableBody.innerHTML = `<tr><td colspan="5" class="zr-empty"><svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-check-circle"/></svg>No ignored documents</td></tr>`;
      return;
    }

    tableBody.innerHTML = items
      .map((item) => {
        const docLink = paperlessUrl
          ? `<a href="${paperlessUrl}/documents/${item.document_id}/details" target="_blank" class="zr-link zr-mono">#${item.document_id}</a>`
          : `<span class="zr-mono">#${item.document_id}</span>`;

        const added = item.created_at
          ? new Date(item.created_at).toLocaleString()
          : '–';

        return `<tr>
                <td>${docLink}</td>
                <td class="zr-truncate" title="${escHtml(item.title || '')}">${escHtml(item.title || '–')}</td>
                <td><span class="zr-badge">${escHtml(item.reason || 'manual')}</span></td>
                <td class="zr-sm zr-faint">${added}</td>
                <td class="zr-table__actions">
                    <div class="zr-row">
                        <button class="zr-btn ignored-unignore-btn" data-id="${item.document_id}" title="Remove from ignore list and allow scanning again">
                            <svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-eye"/></svg> Unignore
                        </button>
                    </div>
                </td>
            </tr>`;
      })
      .join('');

    tableBody.querySelectorAll('.ignored-unignore-btn').forEach((btn) => {
      btn.addEventListener('click', function () {
        unignoreDocument(parseInt(this.dataset.id, 10));
      });
    });
  }

  async function addIgnoredDocument() {
    const docId = parseInt(docIdInput?.value || '', 10);
    if (isNaN(docId) || docId < 1) {
      showToast('Please enter a valid document ID', 'error');
      return;
    }

    const reason = (reasonInput?.value || '').trim() || 'manual';

    try {
      const resp = await fetch('/api/ignored/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, title: '', reason }),
      });
      const data = await resp.json();

      if (data.success) {
        showToast(data.message || 'Document added to ignore list');
        if (docIdInput) docIdInput.value = '';
        if (reasonInput) reasonInput.value = '';
        currentPage = 0;
        await loadQueue();
      } else {
        showToast(data.error || 'Failed to add document', 'error');
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function unignoreDocument(documentId) {
    try {
      const resp = await fetch(`/api/ignored/${documentId}`, {
        method: 'DELETE',
      });
      const data = await resp.json();

      if (data.success) {
        showToast(data.message || 'Document removed from ignore list');
      } else {
        showToast(data.message || data.error || 'Unignore failed', 'error');
      }
      await loadQueue();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function clearAllIgnoredDocuments() {
    if (clearAllInProgress || totalRecords === 0) return;

    const confirmed = window.confirm(
      `Remove all ${totalRecords} ignored document${totalRecords === 1 ? '' : 's'} from the ignore list?`
    );
    if (!confirmed) return;

    try {
      clearAllInProgress = true;
      if (clearAllBtn) clearAllBtn.disabled = true;

      const resp = await fetch('/api/ignored/clear-all', { method: 'POST' });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.error || data.message || 'Clear all failed');
      }

      showToast(data.message || 'All ignored documents removed');
      currentPage = 0;
      await loadQueue();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      clearAllInProgress = false;
      updatePagination();
    }
  }

  function updatePagination() {
    const start = currentPage * pageSize + 1;
    const end = Math.min((currentPage + 1) * pageSize, totalRecords);

    if (tableInfo) {
      tableInfo.textContent = totalRecords
        ? `Showing ${start}–${end} of ${totalRecords}`
        : 'No results';
    }

    if (clearAllBtn)
      clearAllBtn.disabled = clearAllInProgress || totalRecords === 0;
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = totalRecords === 0 || end >= totalRecords;
  }

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

  function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
})();
