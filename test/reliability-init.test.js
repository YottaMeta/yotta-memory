'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('initCore refuses to initialize an existing store without attach', () => {
  const root = tmpdir('ytm-init-guard-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'existing.md'), 'existing\n', 'utf8');

  const result = memory.initCore({ dir: root, noEncrypt: true });

  assert.strictEqual(result.error, true);
  assert.match(result.text, /已存在|拒绝/);
  assert.ok(fs.existsSync(path.join(root, 'facts', 'existing.md')));
});

test('initCore --force reports the protected rebuild policy without stale backup text', () => {
  const root = tmpdir('ytm-init-force-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'existing.md'), 'existing\n', 'utf8');

  const result = memory.initCore({ dir: root, force: true, noEncrypt: true });

  assert.strictEqual(result.error, true);
  assert.match(result.text, /完整备份/);
  assert.match(result.text, /显式确认/);
  assert.doesNotMatch(result.text, /尚未实现 backup|未完成备份|备份机制/);
  assert.strictEqual(fs.readFileSync(path.join(root, 'facts', 'existing.md'), 'utf8'), 'existing\n');
});

test('user-facing init guidance describes the current rebuild policy', () => {
  const root = path.join(__dirname, '..');
  for (const relativePath of ['SKILL.md', 'references/faq.md', 'CHANGELOG.md']) {
    const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(text, /尚未实现 backup|未完成备份|完整备份机制/);
  }
});

test('initCore --attach accepts an existing store without recreating it', () => {
  const root = tmpdir('ytm-init-attach-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'existing.md'), 'existing\n', 'utf8');

  const result = memory.initCore({ dir: root, attach: true });

  assert.strictEqual(result.error, false);
  assert.match(result.text, /接入|已存在/);
  assert.strictEqual(fs.readFileSync(path.join(root, 'facts', 'existing.md'), 'utf8'), 'existing\n');
});

test('initCore still initializes a fresh directory', () => {
  const root = tmpdir('ytm-init-fresh-');
  const result = memory.initCore({ dir: root, noEncrypt: true });
  assert.strictEqual(result.error, false);
  assert.ok(fs.existsSync(path.join(root, 'facts')));
});
