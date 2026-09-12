'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INSTALL_BIN = 'yotta-memory-install';
const INSTALL_COMMAND = 'npx -y --package @yottameta/yotta-memory yotta-memory-install';
const AMBIGUOUS_INSTALL_COMMAND = 'npx -y @yottameta/yotta-memory --agent';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('package exposes separate engine and skill-installer bins', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.strictEqual(pkg.bin['yotta-memory'], 'bin/yotta-memory.js');
  assert.strictEqual(pkg.bin[INSTALL_BIN], 'bin/install.js');
});

test('user and AI docs use the explicit installer bin for install and update', () => {
  const docs = [
    'README.md',
    'README.zh-CN.md',
    'SKILL.md',
    'USER_GUIDE.md',
    'references/faq.md',
  ];

  for (const relativePath of docs) {
    const text = read(relativePath);
    assert.ok(
      text.includes(INSTALL_COMMAND),
      relativePath + ' must include the explicit installer command: ' + INSTALL_COMMAND
    );
    assert.ok(
      !text.includes(AMBIGUOUS_INSTALL_COMMAND),
      relativePath + ' must not recommend the ambiguous engine-bin form: ' + AMBIGUOUS_INSTALL_COMMAND
    );
  }
});

test('installer source comments do not recommend the ambiguous engine-bin form', () => {
  for (const relativePath of ['bin/install.js', 'install.sh']) {
    const text = read(relativePath);
    assert.ok(
      !text.includes(AMBIGUOUS_INSTALL_COMMAND),
      relativePath + ' must not recommend ' + AMBIGUOUS_INSTALL_COMMAND
    );
  }
});
