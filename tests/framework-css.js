// Loads the split framework stylesheets as one string shaped like the former
// single-file zr.css: @layer wrappers stripped, their two-space indent removed,
// files joined in the exact link order from views/partials/shell/head-start.ejs.
// The order matters — some assertions check that one rule appears after another.
'use strict';

const fs = require('fs');
const path = require('path');

const ZR_FILES = [
  'tokens',
  'base',
  'shell',
  'buttons',
  'forms',
  'badges',
  'feedback',
  'dialogs',
  'modules',
  'tables',
  'utilities',
].map((name) => `${name}.css`);

function readFrameworkCss(dir) {
  return ZR_FILES.map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n')
    .replace(/^\s*@layer[^;{]*[;{]\s*$/gm, '')
    .replace(/^ {2}/gm, '');
}

module.exports = { ZR_FILES, readFrameworkCss };
