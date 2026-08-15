const fs = require('fs');
const path = require('path');

function assertIncludes(content, snippet, message) {
  if (!content.includes(snippet)) {
    throw new Error(message);
  }
}

function assertNotIncludes(content, snippet, message) {
  if (content.includes(snippet)) {
    throw new Error(message);
  }
}

/**
 * The class only has to be on the element, not at the start of the attribute —
 * the buttons carry framework classes alongside it since they moved into the
 * row menu.
 */
function assertHasClass(content, className, message) {
  const pattern = new RegExp(`class="[^"]*\\b${className}\\b`);
  if (!pattern.test(content)) {
    throw new Error(message);
  }
}

function run() {
  console.log('\n=== History XSS Hardening Checks ===');

  const historyPath = path.join(process.cwd(), 'public', 'js', 'history.js');
  const historyContent = fs.readFileSync(historyPath, 'utf8');

  assertNotIncludes(
    historyContent,
    'onclick="window.open(\'${data.link}\')"',
    'History view button must not use inline window.open handler'
  );
  // The chat feature is gone and /chat answers nothing, so the row menu must
  // not offer it again — an entry that opens a 404 is worse than no entry.
  assertNotIncludes(
    historyContent,
    '/chat?open=',
    'History row menu must not link to the removed chat page'
  );

  assertHasClass(
    historyContent,
    'history-view-btn',
    'History view button should use dedicated class for safe event binding'
  );
  assertHasClass(
    historyContent,
    'history-ocr-btn',
    'History OCR button should use dedicated class for safe event binding'
  );

  assertIncludes(
    historyContent,
    'this.attachActionButtonListeners();',
    'History DataTable draw callback must reattach action button listeners'
  );
  assertIncludes(
    historyContent,
    'isSafeHistoryLink(link)',
    'History actions must validate links before opening'
  );
  assertIncludes(
    historyContent,
    'if (!/^\\d+$/.test(docId))',
    'History row actions must validate numeric document ids'
  );

  console.log('✅ History XSS hardening checks passed');
}

if (require.main === module) {
  try {
    run();
    process.exit(0);
  } catch (error) {
    console.error('❌ History XSS hardening checks failed:', error.message);
    process.exit(1);
  }
}

module.exports = { run };
