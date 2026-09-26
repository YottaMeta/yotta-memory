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
  const root = tmpdir('ytm-rename-');
  const configDir = tmpdir('ytm-rename-config-');
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

function writePrivate(root, owner, type, name, subject, statement) {
  const dir = path.join(root, 'private', owner, type.toLowerCase() + 's');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, [
    '---', 'type: ' + type, 'subject: ' + subject, 'statement: ' + statement,
    'scope: private', 'created: 2026-09-25', 'updated: 2026-09-25', '---', '', statement, '',
  ].join('\n'), 'utf8');
  return fp;
}

test('rename 消除平铺 / 分层同序号冲突，两份都保留可读', () => {
  withStore((root) => {
    const flat = writeFact(root, 'facts/2026-09-25-0327.md', 'S5 记忆', '平铺内容');
    const layered = path.join(root, 'facts', '2026', '09', '2026-09-25-0327.md');
    fs.mkdirSync(path.dirname(layered), { recursive: true });
    fs.copyFileSync(flat, layered);
    fs.writeFileSync(layered, fs.readFileSync(layered, 'utf8').replace('平铺内容', '分层内容'), 'utf8');

    const before = memory.doctorCore({ root: root });
    assert.strictEqual(before.checks.layout.conflicts, 1);

    const backupDir = tmpdir('ytm-rename-snap-');
    const result = memory.renameCore('facts/2026-09-25-0327.md', '2026-09-25-0354.md', {
      snapshotDir: backupDir, allowSameVolumeForTest: true, reason: '同序号冲突处置',
    });
    assert.ok(!result.error, result.text);
    assert.ok(fs.existsSync(path.join(root, 'facts/2026-09-25-0354.md')));
    assert.ok(!fs.existsSync(flat));
    assert.ok(fs.existsSync(layered));

    const after = memory.doctorCore({ root: root });
    assert.strictEqual(after.checks.layout.conflicts, 0, JSON.stringify(after.warnings));

    const auditDir = path.join(root, '.archive');
    const auditFiles = fs.readdirSync(auditDir).filter((n) => n.startsWith('audit-'));
    const audit = auditFiles.map((n) => fs.readFileSync(path.join(auditDir, n), 'utf8')).join('');
    assert.match(audit, /"action":"rename"/);
    assert.match(audit, /2026-09-25-0354\.md/);
  });
});

test('rename 拒绝同 owner 同类型已占用的目标名（跨布局检查）', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026-09-25-0327.md', 'A', '内容 A');
    writeFact(root, 'facts/2026/09/2026-09-25-0354.md', 'B', '内容 B');
    const result = memory.renameCore('facts/2026-09-25-0327.md', '2026-09-25-0354.md', {
      snapshotDir: tmpdir('ytm-rename-snap-'), allowSameVolumeForTest: true,
    });
    assert.ok(result.error);
    assert.match(result.text, /占用/);
    assert.ok(fs.existsSync(path.join(root, 'facts/2026-09-25-0327.md')));
  });
});

test('rename 拒绝非法文件名与已存在文件', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026-09-25-0327.md', 'A', '内容 A');
    writeFact(root, 'facts/2026-09-25-0400.md', 'C', '内容 C');
    const bad = memory.renameCore('facts/2026-09-25-0327.md', 'new-name.md', {
      snapshotDir: tmpdir('ytm-rename-snap-'), allowSameVolumeForTest: true,
    });
    assert.ok(bad.error);
    assert.match(bad.text, /YYYY-MM-DD-NNNN/);
    const exists = memory.renameCore('facts/2026-09-25-0327.md', '2026-09-25-0400.md', {
      snapshotDir: tmpdir('ytm-rename-snap-'), allowSameVolumeForTest: true,
    });
    assert.ok(exists.error);
    assert.match(exists.text, /占用|已存在/);
  });
});

test('rename 遵守 owner 门：不能改他方私密记忆', () => {
  withStore((root) => {
    writePrivate(root, 'other', 'COMMIT', '2026-09-25-0001.md', '他方', '他方内容');
    const result = memory.renameCore('private/other/commits/2026-09-25-0001.md', '2026-09-25-0002.md', {
      selfAgent: 'codex', snapshotDir: tmpdir('ytm-rename-snap-'), allowSameVolumeForTest: true,
    });
    assert.ok(result.error);
    assert.match(result.text, /拒绝/);
    assert.ok(fs.existsSync(path.join(root, 'private/other/commits/2026-09-25-0001.md')));
  });
});

test('rename --dry-run 不改动任何文件', () => {
  withStore((root) => {
    const fp = writeFact(root, 'facts/2026-09-25-0327.md', 'A', '内容 A');
    const result = memory.renameCore('facts/2026-09-25-0327.md', '2026-09-25-0354.md', { dryRun: true });
    assert.ok(!result.error, result.text);
    assert.match(result.text, /预览/);
    assert.ok(fs.existsSync(fp));
    assert.ok(!fs.existsSync(path.join(root, 'facts/2026-09-25-0354.md')));
  });
});
