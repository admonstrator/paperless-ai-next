// public/js/styleguide.js – interactions for the development-only styleguide.
//
// Classic script, like js/dialogs.js and js/failed.js: it reads the two globals
// the framework publishes for non-module callers (window.__zrToast from the
// kernel, window.zrDialog from js/dialogs.js) rather than importing them.
// Both lookups are deferred to call time and feature-detected — the kernel is a
// module and therefore always runs after this file.

(function () {
  'use strict';

  /* --- checkbox: the indeterminate state has no HTML attribute ----------- */
  var indeterminate = document.getElementById('sgIndeterminate');
  if (indeterminate) {
    indeterminate.indeterminate = true;
  }

  /* --- segmented control ------------------------------------------------- */
  var segment = document.getElementById('sgSegment');
  if (segment) {
    segment.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) {
        return;
      }
      Array.prototype.forEach.call(segment.children, function (child) {
        child.setAttribute('aria-selected', String(child === button));
      });
    });
  }

  /* --- toasts ------------------------------------------------------------ */
  var TOAST_TEXT = {
    ok: 'Settings saved.',
    info: 'Scan queued for 23 documents.',
    warn: 'A scan is already in progress.',
    danger: 'Could not reach Paperless-ngx.',
  };

  document.querySelectorAll('[data-sg-toast]').forEach(function (button) {
    button.addEventListener('click', function () {
      var tone = button.dataset.sgToast;
      if (typeof window.__zrToast !== 'function') {
        console.warn('[styleguide] window.__zrToast is not available');
        return;
      }
      window.__zrToast(TOAST_TEXT[tone] || tone, { tone: tone });
    });
  });

  /* --- the dialog written into the view ---------------------------------- */
  var staticDialog = document.getElementById('sgStaticDialog');
  var openStatic = document.getElementById('sgOpenStaticDialog');

  if (staticDialog && openStatic) {
    openStatic.addEventListener('click', function () {
      staticDialog.showModal();
    });
    staticDialog
      .querySelectorAll('[data-sg-close-dialog]')
      .forEach(function (button) {
        button.addEventListener('click', function () {
          staticDialog.close();
        });
      });
  }

  /* --- the dialog built by js/dialogs.js --------------------------------- */
  var DIALOG_OPTIONS = {
    question: {
      title: 'Reset this document?',
      text: 'The local record is cleared and the document is scanned again.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Reset',
    },
    warning: {
      title: 'Reset all documents?',
      text: 'Every processed document goes back to its original values. This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Reset all',
    },
    input: {
      title: 'Ignore a document',
      text: 'Give a reason so the queue stays readable later.',
      icon: 'info',
      input: 'text',
      inputPlaceholder: 'Encrypted PDF',
      showCancelButton: true,
      confirmButtonText: 'Ignore',
    },
  };

  var dialogResult = document.getElementById('sgDialogResult');

  function reportDialogResult(text) {
    if (dialogResult) {
      dialogResult.textContent = text;
    }
  }

  document.querySelectorAll('[data-sg-dialog]').forEach(function (button) {
    button.addEventListener('click', function () {
      var options = DIALOG_OPTIONS[button.dataset.sgDialog];
      if (!options) {
        return;
      }
      if (typeof window.zrDialog !== 'function') {
        reportDialogResult('window.zrDialog is not loaded on this page.');
        return;
      }
      window.zrDialog(options).then(function (result) {
        reportDialogResult(
          'isConfirmed: ' +
            result.isConfirmed +
            (result.value === undefined ? '' : ' · value: ' + result.value)
        );
      });
    });
  });

  /* --- step panes -------------------------------------------------------- */
  var loginForm = document.getElementById('sgLoginForm');
  if (loginForm) {
    // The card is a sample, not a login: submitting it would reload the page.
    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
    });
  }

  var togglePane = document.getElementById('sgTogglePane');
  if (togglePane && loginForm) {
    togglePane.addEventListener('click', function () {
      loginForm.querySelectorAll('.zr-steppane').forEach(function (pane) {
        pane.classList.toggle('is-active');
      });
    });
  }
})();
