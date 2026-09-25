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
  const root = tmpdir('ytm-layout-collision-');
  const configDir = tmpdir('ytm-layout-config-');
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

function writeFact(root, rel, subject, statement, owner) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const lines = [
    '---',
    'type: FACT',
    'subject: ' + subject,
    'statement: ' + statement,
    'scope: public',
    'created: 2026-09-25',
    'updated: 2026-09-25',
  ];
  if (owner) lines.push('owner: ' + owner);
  lines.push('---', '', statement, '');
  fs.writeFileSync(fp, lines.join('\n'), 'utf8');
  return fp;
}

test('identical flat and layered entries with the same identity index once without a conflict warning', () => {
  withStore((root) => {
    const flat = writeFact(root, 'facts/2026-09-25-0001.md', '同序号重复', '两份内容完全一致');
    const layered = path.join(root, 'facts', '2026', '09', '2026-09-25-0001.md');
    fs.mkdirSync(path.dirname(layered), { recursive: true });
    fs.copyFileSync(flat, layered);

    const report = memory.doctorCore({ root: root });
    assert.ok(report.checks.layout, 'doctor must expose checks.layout');
    assert.strictEqual(report.checks.layout.duplicates, 1);
    assert.strictEqual(report.checks.layout.conflicts, 0);
    assert.strictEqual(report.checks.layout.unverified, 0);
    assert.ok(!report.warnings.some((w) => w.indexOf('同序号冲突') !== -1), report.warnings.join('\n'));
    assert.strictEqual(memory.buildIndex(root).length, 1);
  });
});

test('conflicting flat and layered entries stay readable and doctor lists both paths', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026-09-25-0001.md', '同序号冲突', '旧平铺版本');
    writeFact(root, path.join('facts', '2026', '09', '2026-09-25-0001.md'), '同序号冲突', '新分层版本');

    const report = memory.doctorCore({ root: root });
    assert.strictEqual(report.checks.layout.duplicates, 0);
    assert.strictEqual(report.checks.layout.conflicts, 1);
    const conflictText = report.warnings.join('\n');
    assert.ok(conflictText.indexOf('同序号冲突') !== -1, conflictText);
    assert.ok(conflictText.indexOf('facts/2026-09-25-0001.md') !== -1, conflictText);
    assert.ok(conflictText.indexOf('facts/2026/09/2026-09-25-0001.md') !== -1, conflictText);
    assert.strictEqual(memory.buildIndex(root).length, 2);

    const written = memory.rememberCore('FACT', '冲突后的新写入', '不能复用已占用的序号', { _today: '2026-09-25' });
    assert.strictEqual(written.error, false, written.text);
    assert.match(written.text, /2026-09-25-0002\.md$/);
  });
});

test('the same sequence number on different dates is not a layout collision', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026-09-24-0001.md', '前一天', '旧日期条目');
    writeFact(root, path.join('facts', '2026', '09', '2026-09-25-0001.md'), '后一天', '新日期条目');

    const report = memory.doctorCore({ root: root });
    assert.strictEqual(report.checks.layout.duplicates, 0);
    assert.strictEqual(report.checks.layout.conflicts, 0);
    assert.strictEqual(report.checks.layout.unverified, 0);
    assert.strictEqual(memory.buildIndex(root).length, 2);
  });
});

test('public entries owned by different agents are not treated as the same identity', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026-09-25-0001.md', 'xiaoan 的公共事实', '不同 owner 的不同内容', 'xiaoan');
    writeFact(root, path.join('facts', '2026', '09', '2026-09-25-0001.md'), 'codex 的公共事实', '不同 owner 的不同内容', 'codex');

    const report = memory.doctorCore({ root: root });
    assert.strictEqual(report.checks.layout.duplicates, 0);
    assert.strictEqual(report.checks.layout.conflicts, 0);
    assert.strictEqual(report.checks.layout.unverified, 0);
    assert.strictEqual(memory.buildIndex(root).length, 2);
  });
});

test('encrypted same-identity entries without a usable key are reported as unverified and kept', () => {
  withStore((root) => {
    fs.mkdirSync(path.join(root, 'keys'), { recursive: true });
    fs.writeFileSync(path.join(root, 'keys', 'salt'), 'test-salt', 'utf8');
    fs.writeFileSync(path.join(root, 'keys', 'recovery.key.enc'), 'test-recovery', 'utf8');
    const flat = path.join(root, 'private', 'codex', 'commits', '2026-09-25-0001.md.enc');
    const layered = path.join(root, 'private', 'codex', 'commits', '2026', '09', '2026-09-25-0001.md.enc');
    fs.mkdirSync(path.dirname(flat), { recursive: true });
    fs.mkdirSync(path.dirname(layered), { recursive: true });
    fs.writeFileSync(flat, 'cipher-a', 'utf8');
    fs.writeFileSync(layered, 'cipher-b', 'utf8');

    const report = memory.doctorCore({ root: root });
    assert.strictEqual(report.checks.layout.duplicates, 0);
    assert.strictEqual(report.checks.layout.conflicts, 0);
    assert.strictEqual(report.checks.layout.unverified, 1);
    assert.ok(report.warnings.some((w) => w.indexOf('同序号待核') !== -1), report.warnings.join('\n'));
  });
});
