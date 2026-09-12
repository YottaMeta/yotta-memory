'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(root, fn) {
  const configDir = tmpdir('ytm-guard-config-');
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_HOME = root;
  try {
    return fn(configDir);
  } finally {
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
  }
}

function writeFact(root, name, subject, statement) {
  const dir = path.join(root, 'facts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), [
    '---',
    'type: FACT',
    'subject: ' + subject,
    'statement: ' + statement,
    'confidence: 1',
    'created: 2020-01-01',
    'updated: 2020-01-01',
    'scope: public',
    'weight: 0.4',
    '---',
    '',
    statement,
    '',
  ].join('\n'), 'utf8');
}

function makeStore() {
  const root = tmpdir('ytm-guard-store-');
  writeFact(root, '2020-01-01-0001.md', '旧事实', '很久以前的记录');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    entries: [],
  }), 'utf8');
  return root;
}

function auditText(root) {
  const file = path.join(root, '.archive', 'audit-' + new Date().toISOString().slice(0, 10) + '.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

test('destructiveGuardCore refuses to run without a snapshot directory', () => {
  const root = makeStore();
  withStore(root, () => {
    const result = memory.destructiveGuardCore({ root: root, action: 'test' });
    assert.strictEqual(result.error, true);
    assert.match(result.text, /备份目录|快照/);
  });
});

test('destructiveGuardCore creates a fresh snapshot and writes an audit record', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-guard-snapshot-');
  withStore(root, () => {
    const result = memory.destructiveGuardCore({
      root: root,
      action: 'test',
      snapshotDir: backupDir,
      allowSameVolumeForTest: true,
      now: '2026-09-12T12:00:00+08:00',
    });
    assert.strictEqual(result.error, false);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 1);
    assert.match(auditText(root), /transaction_start/);
    assert.match(auditText(root), /test/);
  });
});

test('maintainCore refuses to archive without a snapshot directory', () => {
  const root = makeStore();
  withStore(root, () => {
    const result = memory.maintainCore({ apply: true, age: 1, threshold: 1 });
    assert.strictEqual(result.error, true);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0001.md')));
  });
});

test('maintainCore snapshots before archiving', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-guard-maintain-');
  withStore(root, () => {
    const result = memory.maintainCore({
      apply: true,
      age: 1,
      threshold: 1,
      snapshotDir: backupDir,
      allowSameVolumeForTest: true,
      now: '2026-09-12T12:00:00+08:00',
    });
    assert.strictEqual(result.error, false);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 1);
    assert.ok(fs.existsSync(path.join(root, '.archive', 'facts', '2020-01-01-0001.md')));
    assert.match(auditText(root), /transaction_start/);
  });
});

test('consolidateCore refuses to apply without a snapshot directory', () => {
  const root = makeStore();
  writeFact(root, '2020-01-01-0002.md', '旧事实', '很久以前的另一条记录');
  withStore(root, () => {
    const result = memory.consolidateCore({
      apply: true,
      minAge: 1,
      minIdle: 1,
      maxUtility: 1,
      minGroup: 2,
    });
    assert.strictEqual(result.error, true);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0001.md')));
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0002.md')));
  });
});

test('consolidateCore snapshots before writing summaries', () => {
  const root = makeStore();
  writeFact(root, '2020-01-01-0002.md', '旧事实', '很久以前的另一条记录');
  const backupDir = tmpdir('ytm-guard-consolidate-');
  withStore(root, () => {
    const result = memory.consolidateCore({
      apply: true,
      minAge: 1,
      minIdle: 1,
      maxUtility: 1,
      minGroup: 2,
      snapshotDir: backupDir,
      allowSameVolumeForTest: true,
      now: '2026-09-12T12:00:00+08:00',
    });
    assert.strictEqual(result.error, false);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 1);
    assert.match(auditText(root), /transaction_start/);
    assert.match(result.text, /周期摘要/);
  });
});

test('archiveCore refuses to archive without a snapshot directory', () => {
  const root = makeStore();
  withStore(root, () => {
    const result = memory.archiveCore({ days: 1, threshold: 1 });
    assert.strictEqual(result.error, true);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0001.md')));
  });
});

test('mergeCore refuses to merge without a snapshot directory', () => {
  const root = makeStore();
  writeFact(root, '2020-01-01-0002.md', '旧事实', '很久以前的另一条记录');
  withStore(root, () => {
    const result = memory.mergeCore('facts/2020-01-01-0001.md', 'facts/2020-01-01-0002.md', { selfAgent: 'codex' });
    assert.strictEqual(result.error, true);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0001.md')));
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0002.md')));
  });
});

test('CLI --allow-same-volume cannot bypass the destructive snapshot gate', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-guard-cli-same-volume-');
  withStore(root, () => {
    memory.saveConfig({
      memory_home: root,
      backup_dir: backupDir,
      backup_enabled: true,
      backup_schedule: 'daily',
      backup_setup_choice: 'daily',
    });
    let failed = false;
    try {
      childProcess.execFileSync(process.execPath, [
        path.join(__dirname, '..', 'bin', 'yotta-memory.js'),
        'maintain',
        '--apply',
        '--threshold', '1',
        '--allow-same-volume',
      ], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root }),
      });
    } catch (error) {
      failed = error.status === 2;
    }
    assert.strictEqual(failed, true);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2020-01-01-0001.md')));
  });
});
