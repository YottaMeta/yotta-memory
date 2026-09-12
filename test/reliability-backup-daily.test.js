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

function makeStore() {
  const root = tmpdir('ytm-daily-store-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'fact.md'), 'fact\n', 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');
  return root;
}

function withConfigDir(fn) {
  const configDir = tmpdir('ytm-daily-config-');
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(configDir);
  } finally {
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
  }
}

function configure(root, backupDir) {
  process.env.YOTTA_MEMORY_HOME = root;
  memory.saveConfig({
    memory_home: root,
    backup_dir: backupDir,
    backup_enabled: true,
    backup_schedule: 'daily',
    backup_time: '03:30',
    backup_max_age_hours: 36,
  });
}

test('ensure daily creates one backup per local day and skips the second run', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-daily-dest-');
    configure(root, backupDir);
    const lockPath = path.join(tmpdir('ytm-daily-lock-'), 'backup.lock');
    const now = '2026-09-12T10:00:00+08:00';
    const first = memory.backupEnsureDailyCore({
      root,
      now,
      lockPath,
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });
    assert.strictEqual(first.error, false);
    assert.strictEqual(first.created, true);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 1);

    const second = memory.backupEnsureDailyCore({
      root,
      now,
      lockPath,
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });
    assert.strictEqual(second.error, false);
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.skipped, true);
    assert.match(second.reason, /already-backed-up/);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 1);
  });
});

test('ensure daily skips when another run holds a fresh lock', () => {
  withConfigDir((configDir) => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-daily-lock-dest-');
    configure(root, backupDir);
    const lockPath = path.join(configDir, 'backup.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 1234, created: '2026-09-12T02:00:00.000Z' }), 'utf8');
    const result = memory.backupEnsureDailyCore({
      root,
      now: '2026-09-12T10:00:00+08:00',
      lockPath,
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });
    assert.strictEqual(result.error, false);
    assert.strictEqual(result.skipped, true);
    assert.match(result.reason, /already-running/);
    assert.strictEqual(memory.backupListCore({ dir: backupDir }).backups.length, 0);
  });
});

test('ensure daily refuses a same-volume destination', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-daily-same-volume-');
    configure(root, backupDir);
    const result = memory.backupEnsureDailyCore({
      root,
      now: '2026-09-12T10:00:00+08:00',
      sameVolumeFn: () => true,
      lockPath: path.join(tmpdir('ytm-daily-same-lock-'), 'backup.lock'),
    });
    assert.strictEqual(result.error, true);
    assert.match(result.text, /同一卷|同卷/);
  });
});
