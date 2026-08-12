// public/js/changelog-modal.js
//
// The "What's new" dialog: fetches the release status, fills the dialog that
// views/partials/changelog-modal.ejs renders, and marks the release as seen
// when it closes. Shell chrome, so it ships on every page like the badges.

(function () {
  'use strict';

  const modal = document.getElementById('changelogModal');
  if (!modal) {
    return;
  }

  // Marking it seen is bound to the dialog's own close event, so Escape,
  // the close button and "Got it" all go through the same path exactly once.
  modal.addEventListener('close', function () {
    fetch('/api/changelog/mark-seen', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(function () {});
  });

  function close() {
    if (modal.open) {
      modal.close();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/changelog/status', { credentials: 'same-origin' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || !data.show) return;

        const versionEl = document.getElementById('changelogModalVersion');
        const listEl = document.getElementById('changelogModalEntries');
        if (!listEl) return;

        if (versionEl && data.version) {
          versionEl.textContent = data.version;
        }

        if (Array.isArray(data.entries)) {
          data.entries.forEach(function (entry) {
            const li = document.createElement('li');
            li.innerHTML =
              '<svg class="zr-icon zr-icon--sm" aria-hidden="true"><use href="/icons.svg#i-check"/></svg>' +
              '<span></span>';
            // Entries are release notes rendered server-side, never user input.
            li.lastElementChild.innerHTML = entry;
            listEl.appendChild(li);
          });
        }

        modal.showModal();
      })
      .catch(function () {});

    document
      .getElementById('changelogModalClose')
      ?.addEventListener('click', close);
    document
      .getElementById('changelogModalDismiss')
      ?.addEventListener('click', close);
  });
})();
