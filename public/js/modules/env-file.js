/**
 * Environment file module.
 *
 * Fetches the running configuration as .env text and puts it on screen to copy.
 * Deliberately behind a button rather than rendered with the page: the body
 * carries API tokens in clear text, and nobody scrolling past this section
 * should have them on their screen by accident.
 */

const ENV_URL = '/api/settings/env-file';
const REQUEST_TIMEOUT_MS = 15000;

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

export default function envFile(root, { toast } = {}) {
  const showBtn = root.querySelector('#envFileShowBtn');
  const copyBtn = root.querySelector('#envFileCopyBtn');
  const output = root.querySelector('#envFileOutput');
  const meta = root.querySelector('#envFileMeta');
  if (!showBtn || !copyBtn || !output) return undefined;

  const showLabel = showBtn.querySelector('span');

  function setHidden(el, hidden) {
    el.classList.toggle('hidden', hidden);
  }

  async function load() {
    showBtn.disabled = true;
    if (showLabel) showLabel.textContent = 'Loading…';

    try {
      const result = await fetchJson(ENV_URL);
      const data = result?.data;
      if (!result?.success || typeof data?.env !== 'string') {
        throw new Error(result?.error || 'Malformed response');
      }

      output.value = data.env;
      setHidden(output, false);
      setHidden(copyBtn, false);
      if (meta) {
        meta.textContent = `${data.count} variable${data.count === 1 ? '' : 's'} set`;
      }
      if (showLabel) showLabel.textContent = 'Refresh';
    } catch (error) {
      console.error('[env-file] loading failed', error);
      toast?.('Could not read the configuration.', { tone: 'danger' });
      if (showLabel) showLabel.textContent = 'Show configuration';
    } finally {
      showBtn.disabled = false;
    }
  }

  async function copy() {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      toast?.('Configuration copied to clipboard.', { tone: 'ok' });
    } catch {
      // Clipboard access needs a secure context, which a plain-http instance on
      // the LAN does not have. Selecting the text is then the honest fallback.
      output.focus();
      output.select();
      toast?.('Press Ctrl+C to copy the selected text.', { tone: 'info' });
    }
  }

  showBtn.addEventListener('click', load);
  copyBtn.addEventListener('click', copy);

  return undefined;
}
