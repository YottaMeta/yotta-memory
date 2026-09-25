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

function withStore(fn) {
  const root = tmpdir('ytm-owner-gate-');
  const configDir = tmpdir('ytm-owner-gate-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(root);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
  }
}

const SECRET_OTHER = '他方私密内容-ZZZ999-不可泄露';
const SECRET_SELF = '自己的私密内容-OWN111';

function writePrivate(root, owner, type, name, subject, statement) {
  const dir = path.join(root, 'private', owner, type.toLowerCase() + 's');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, [
    '---',
    'type: ' + type,
    'subject: ' + subject,
    'statement: ' + statement,
    'confidence: 1',
    'created: 2020-01-01',
    'updated: 2020-01-01',
    'scope: private',
    'weight: 0.4',
    '---',
    '',
    statement,
    '',
  ].join('\n'), 'utf8');
  return fp;
}

function makeStore(root) {
  fs.writeFileSync(path.join(root, 'agents.json'),
    '{"agents":{"codex":{},"other":{}}}\n', 'utf8');
  const other = writePrivate(root, 'other', 'COMMIT',
    '2020-01-01-0001.md', '他方主题', SECRET_OTHER);
  const self = writePrivate(root, 'codex', 'COMMIT',
    '2020-01-01-0002.md', '自己主题', SECRET_SELF);
  return { other: other, self: self };
}

test('explain 对他方私密 fail-closed（不输出正文）', () => {
  withStore((root) => {
    makeStore(root);
    const r = memory.explainCore('private/other/commits/2020-01-01-0001.md',
      { selfAgent: 'codex' });
    assert.ok(r.error, '跨 owner explain 必须返回错误');
    assert.ok(r.text.indexOf(SECRET_OTHER) === -1,
      '拒绝文本不得包含他方私密正文: ' + r.text);
    assert.ok(r.text.indexOf('拒绝') !== -1, r.text);
  });
});

test('explain 对自己的私密仍可读', () => {
  withStore((root) => {
    makeStore(root);
    const r = memory.explainCore('private/codex/commits/2020-01-01-0002.md',
      { selfAgent: 'codex' });
    assert.ok(!r.error, r.text);
    assert.ok(r.text.indexOf(SECRET_SELF) !== -1, r.text);
  });
});

test('archive 不归档他方私密条目', () => {
  withStore((root) => {
    const files = makeStore(root);
    const backupDir = tmpdir('ytm-owner-gate-snap-');
    const r = memory.archiveCore({
      days: 30, threshold: 999, selfAgent: 'codex',
      snapshotDir: backupDir, allowSameVolumeForTest: true,
    });
    assert.ok(!r.error, r.text);
    assert.ok(fs.existsSync(files.other), '他方私密条目不得被归档');
    assert.ok(!fs.existsSync(files.self), '自己的条目应被归档');
    assert.ok(r.text.indexOf('跨 owner 私密条目已跳过') !== -1, r.text);
  });
});

test('maintain 预览不列出他方私密条目', () => {
  withStore((root) => {
    makeStore(root);
    const r = memory.maintainCore({
      selfAgent: 'codex', apply: false, threshold: 999, age: 1,
    });
    assert.ok(!r.error, r.text);
    assert.ok(r.text.indexOf(SECRET_OTHER) === -1, '不得泄露他方私密正文');
    assert.ok(r.text.indexOf('private/other/') === -1, '不得列出他方私密路径');
    assert.ok(r.text.indexOf('private/codex/') !== -1, '自己的条目应进入候选');
    assert.ok(r.text.indexOf('跨 owner 私密条目已跳过') !== -1, r.text);
  });
});

test('未声明身份时私密条目一律跳过（fail-closed）', () => {
  withStore((root) => {
    const files = makeStore(root);
    const r = memory.maintainCore({ apply: false, threshold: 999, age: 1 });
    assert.ok(r.text.indexOf('private/codex/') === -1, r.text);
    assert.ok(r.text.indexOf('private/other/') === -1, r.text);
    assert.ok(fs.existsSync(files.self));
  });
});
