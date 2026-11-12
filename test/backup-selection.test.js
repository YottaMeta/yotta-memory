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
  const root = tmpdir('ytm-backup-selection-store-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'fact.md'), 'fact\n', 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');
  return root;
}

function withConfigDir(fn) {
  const configDir = tmpdir('ytm-backup-selection-config-');
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

function writeBackup(backupDir, id, created, options) {
  const opts = options || {};
  const dir = path.join(backupDir, id);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.manifestMissing) return dir;
  const manifest = {
    id: id,
    version: memory.VERSION,
    created: created,
    source: opts.source || 'source-store',
    files: opts.files === undefined ? [] : opts.files,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return dir;
}

function configure(root, backupDir, extra) {
  process.env.YOTTA_MEMORY_HOME = root;
  memory.saveConfig(Object.assign({
    memory_home: root,
    backup_dir: backupDir,
    backup_enabled: true,
    backup_schedule: 'daily',
    backup_time: '03:30',
    backup_max_age_hours: 36,
  }, extra || {}));
}

test('backup status chooses the latest valid manifest time and ignores a future-dated backup', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-backup-selection-status-');
    const old = 'GoN-2026-11-10T10-00-00-000Z-aaaaaa';
    const today = 'GoN-2026-11-11T12-39-08-452Z-28bbac';
    const future = 'GoN-2027-11-10T06-01-31-417Z-f9f144';
    writeBackup(backupDir, old, '2026-11-10T10:00:00.000Z');
    writeBackup(backupDir, today, '2026-11-11T12:39:08.452Z');
    writeBackup(backupDir, future, '2027-11-10T06:01:31.417Z');
    configure(root, backupDir, {
      backup_last_success: '2026-11-10T10:00:00.000Z',
      backup_last_backup_id: old,
    });

    const status = memory.backupStatusCore({
      root,
      now: '2026-11-11T13:00:00.000Z',
      sameVolumeFn: () => false,
    });

    assert.strictEqual(status.error, false);
    assert.strictEqual(status.healthy, true);
    assert.strictEqual(status.latest.id, today);
    assert.strictEqual(status.latest_valid.id, today);
    assert.strictEqual(status.latest_valid.created, '2026-11-11T12:39:08.452Z');
    assert.strictEqual(status.source, 'latest_valid');
    assert.strictEqual(status.effective_last_success, '2026-11-11T12:39:08.452Z');
    assert.strictEqual(status.config_last_success, '2026-11-10T10:00:00.000Z');
    assert.ok(status.anomalies.some((item) => item.id === future && item.type === 'future_timestamp'));
  });
});

test('backup status fails closed when only future-dated backups exist', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-backup-selection-future-');
    const future = 'GoN-2027-11-10T06-01-31-417Z-f9f144';
    writeBackup(backupDir, future, '2027-11-10T06:01:31.417Z');
    configure(root, backupDir);

    const status = memory.backupStatusCore({
      root,
      now: '2026-11-11T13:00:00.000Z',
      sameVolumeFn: () => false,
    });

    assert.strictEqual(status.error, false);
    assert.strictEqual(status.healthy, false);
    assert.strictEqual(status.latest, null);
    assert.strictEqual(status.latest_valid, null);
    assert.strictEqual(status.ageHours, null);
    assert.strictEqual(status.source, 'none');
    assert.ok(status.anomalies.some((item) => item.id === future && item.type === 'future_timestamp'));
    assert.match(status.text, /未来时间/);
  });
});

test('backup selection skips a broken manifest and accepts the next valid backup', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-backup-selection-broken-');
    const valid = 'GoN-2026-11-11T12-39-08-452Z-28bbac';
    const broken = 'GoN-2026-11-11T13-00-00-000Z-broken';
    writeBackup(backupDir, valid, '2026-11-11T12:39:08.452Z');
    writeBackup(backupDir, broken, '', { manifestMissing: true });
    configure(root, backupDir);

    const status = memory.backupStatusCore({
      root,
      now: '2026-11-11T13:10:00.000Z',
      sameVolumeFn: () => false,
    });

    assert.strictEqual(status.healthy, true);
    assert.strictEqual(status.latest_valid.id, valid);
    assert.ok(status.anomalies.some((item) => item.id === broken && item.type === 'manifest_missing'));
  });
});

test('backup list sorts by parsed manifest creation time instead of directory name', () => {
  withConfigDir(() => {
    const backupDir = tmpdir('ytm-backup-selection-list-');
    writeBackup(backupDir, 'z-old-id', '2026-11-10T10:00:00.000Z');
    writeBackup(backupDir, 'a-new-id', '2026-11-11T12:39:08.452Z');
    writeBackup(backupDir, 'm-missing-created', '');

    const listed = memory.backupListCore({ dir: backupDir });
    assert.strictEqual(listed.error, false);
    assert.deepStrictEqual(listed.backups.map((item) => item.id), [
      'a-new-id',
      'z-old-id',
      'm-missing-created',
    ]);
  });
});

test('backup ensure-daily does not treat a future backup as today success', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-backup-selection-daily-');
    const future = 'GoN-2027-11-10T06-01-31-417Z-f9f144';
    writeBackup(backupDir, future, '2027-11-10T06:01:31.417Z');
    configure(root, backupDir);

    const result = memory.backupEnsureDailyCore({
      root,
      now: new Date('2026-11-11T13:00:00.000Z'),
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });

    assert.strictEqual(result.error, false, result.text);
    assert.strictEqual(result.created, true, result.text);
    assert.match(result.text, /每日备份完成/);
    assert.notStrictEqual(result.id, future);
  });
});
