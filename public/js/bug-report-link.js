// public/js/bug-report-link.js
//
// The single implementation of the GitHub bug report prefill: secret
// redaction, the diagnostics payload and the issues/new URL. The sidebar link
// (shell chrome, every page) and the About page's "Open Issue Form" button both
// go through here, so a redaction rule fixed here is fixed in both places.
//
// Secrets are never included; keys are reported as set / not_set only.

(function () {
  'use strict';

  const ISSUE_URL = 'https://github.com/admonstrator/zettelrobbe/issues/new';

  function redactSecrets(value) {
    if (value == null) {
      return 'unknown';
    }

    let text = String(value);
    text = text.replace(
      /((?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_-]*\s*[:=]\s*)([^\n\r]+)/gi,
      '$1[REDACTED]'
    );

    // Mask credentials in URLs like https://user:pass@example.com
    text = text.replace(/(https?:\/\/)([^@\s]+)@/gi, '$1[REDACTED]@');

    return text;
  }

  function keyState(isSet) {
    return isSet ? '[REDACTED:SET]' : 'not_set';
  }

  function detectHostOs() {
    const ua =
      `${navigator.userAgent || ''} ${navigator.platform || ''}`.toLowerCase();
    if (ua.includes('win')) return 'Windows';
    if (ua.includes('mac')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    return 'Other';
  }

  // `info` is the supportInfo shape the About route builds; the sidebar payload
  // uses the same key names so both callers share one contract.
  function buildIssueUrl(info) {
    const supportInfo = info || {};
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // The parameter order is part of the produced URL; keep it stable.
    const issueParams = new URLSearchParams({
      template: 'bug_report.yml',
      title: '[Bug]: ',
      summary: 'Describe the issue in one sentence',
      steps: '1.\n2.\n3.\n4.',
      expected: 'Describe expected behavior',
      actual: 'Describe actual behavior',
      logs: 'Paste relevant Zettelrobbe logs here.\n\nExample:\n`docker logs zettelrobbe --tail=200`',
      traceback:
        'Paste browser console errors or stack trace here (if applicable).',
      app_version: supportInfo.appVersion || 'unknown',
      app_commit: supportInfo.commitSha || 'unknown',
      paperless_ngx_version: supportInfo.paperlessNgxVersion || 'unknown',
      deployment: 'Docker Compose',
      os: detectHostOs(),
      os_version: `${navigator.platform || 'unknown'}`,
      browser: `${navigator.userAgent || 'unknown'}`,
      config_notes: redactSecrets(
        [
          `AI_PROVIDER=${supportInfo.aiProvider || 'unknown'}`,
          `MISTRAL_OCR_ENABLED=${supportInfo.ocrEnabled ? 'yes' : 'no'}`,
          `PAPERLESS_API_URL=${supportInfo.paperlessApiUrl || 'unknown'}`,
          `OLLAMA_API_URL=${supportInfo.ollamaApiUrl || 'unknown'}`,
          `OLLAMA_MODEL=${supportInfo.ollamaModel || 'unknown'}`,
          `CUSTOM_BASE_URL=${supportInfo.customBaseUrl || 'unknown'}`,
          `CUSTOM_MODEL=${supportInfo.customModel || 'unknown'}`,
          `AZURE_ENDPOINT=${supportInfo.azureEndpoint || 'unknown'}`,
          `AZURE_DEPLOYMENT_NAME=${supportInfo.azureDeploymentName || 'unknown'}`,
          `AZURE_API_VERSION=${supportInfo.azureApiVersion || 'unknown'}`,
          `MISTRAL_OCR_MODEL=${supportInfo.mistralOcrModel || 'unknown'}`,
          `TRUST_PROXY=${supportInfo.trustProxy || 'unknown'}`,
          `USE_EXISTING_DATA=${supportInfo.useExistingData || 'no'}`,
          `RESTRICT_TO_EXISTING_TAGS=${supportInfo.restrictToExistingTags || 'no'}`,
          `RESTRICT_TO_EXISTING_CORRESPONDENTS=${supportInfo.restrictToExistingCorrespondents || 'no'}`,
          `RESTRICT_TO_EXISTING_DOCUMENT_TYPES=${supportInfo.restrictToExistingDocumentTypes || 'no'}`,
          `PAPERLESS_API_TOKEN=${keyState(supportInfo.paperlessTokenSet)}`,
          `OPENAI_API_KEY=${keyState(supportInfo.openAiKeySet)}`,
          `CUSTOM_API_KEY=${keyState(supportInfo.customKeySet)}`,
          `AZURE_API_KEY=${keyState(supportInfo.azureKeySet)}`,
          `MISTRAL_API_KEY=${keyState(supportInfo.mistralKeySet)}`,
          `API_KEY=${keyState(supportInfo.apiKeySet)}`,
        ].join('\n')
      ),
      extra: redactSecrets(
        [
          `Node=${supportInfo.nodeVersion || 'unknown'}`,
          `NodeEnv=${supportInfo.nodeEnv || 'unknown'}`,
          `Platform=${supportInfo.platform || 'unknown'}`,
          `Timezone=${timezone}`,
          `ServerTimeUTC=${supportInfo.serverTimeUtc || 'unknown'}`,
          `ServerTimezone=${supportInfo.timezone || 'unknown'}`,
          `ScanInterval=${supportInfo.scanInterval || 'unknown'}`,
          `TokenLimit=${supportInfo.tokenLimit || 'unknown'}`,
          `ResponseTokens=${supportInfo.responseTokens || 'unknown'}`,
        ].join('\n')
      ),
    });

    return `${ISSUE_URL}?${issueParams.toString()}`;
  }

  // Points an anchor at the prefilled issue form. Returns the URL, or an empty
  // string when there is no element to wire.
  function apply(target, info) {
    if (!target) {
      return '';
    }

    const url = buildIssueUrl(info);
    target.href = url;
    return url;
  }

  function parsePayload(element) {
    try {
      return JSON.parse(element.textContent || '{}');
    } catch (error) {
      console.error('Failed to parse bug report payload:', error);
      return {};
    }
  }

  // Declarative wiring: a JSON payload element names its link via
  // data-bug-report-target, so a page only has to ship data, not logic.
  function wireDeclaredLinks() {
    const payloads = document.querySelectorAll(
      'script[type="application/json"][data-bug-report-payload]'
    );

    payloads.forEach(function (payload) {
      const selector = payload.getAttribute('data-bug-report-target');
      if (!selector) {
        return;
      }

      apply(document.querySelector(selector), parsePayload(payload));
    });
  }

  window.zrBugReport = {
    redactSecrets: redactSecrets,
    keyState: keyState,
    detectHostOs: detectHostOs,
    buildIssueUrl: buildIssueUrl,
    apply: apply,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireDeclaredLinks);
  } else {
    wireDeclaredLinks();
  }
})();
