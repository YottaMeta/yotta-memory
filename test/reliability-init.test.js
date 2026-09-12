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
