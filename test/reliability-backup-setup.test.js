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
  const root = tmpdir('ytm-setup-store-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'private', 'codex', 'prefs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'fact.md'), 'fact\n', 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');
  return root;
}

function withConfigDir(fn) {
  const configDir = tmpdir('ytm-setup-config-');
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

test('backup setup refuses to configure a destination without a directory', () => {
  withConfigDir(() => {
    const root = makeStore();
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.backupSetupCore({ root, sameVolumeFn: () => false });
    assert.strictEqual(result.error, true);
    assert.match(result.text, /目录|dir/i);
  });
});

test('backup setup manual mode records the choice without creating a backup', () => {
  withConfigDir(() => {
    const root = makeStore();
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.backupSetupCore({ root, manual: true });
    assert.strictEqual(result.error, false);
    assert.strictEqual(result.manual, true);
    const config = memory.loadConfig();
    assert.strictEqual(config.backup_enabled, false);
    assert.strictEqual(config.backup_setup_choice, 'manual');
    assert.strictEqual(config.backup_dir, undefined);
  });
});

test('backup setup creates the first backup and enables daily backup after confirmation', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-setup-dest-');
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.backupSetupCore({
      root,
      dir: backupDir,
      time: '04:15',
      skipSchedule: true,
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });
    assert.strictEqual(result.error, false);
    assert.ok(result.id);
    const config = memory.loadConfig();
    assert.strictEqual(config.backup_dir, backupDir);
    assert.strictEqual(config.backup_enabled, true);
    assert.strictEqual(config.backup_schedule, 'daily');
    assert.strictEqual(config.backup_time, '04:15');
    assert.strictEqual(config.backup_setup_choice, 'daily');
    const listed = memory.backupListCore({ dir: backupDir });
    assert.strictEqual(listed.backups.length, 1);
  });
});

test('backup setup refuses a destination on the same volume', () => {
  withConfigDir(() => {
    const root = makeStore();
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.backupSetupCore({
      root,
      dir: path.join(root, 'backup'),
      sameVolumeFn: () => true,
      allowSameVolume: false,
    });
    assert.strictEqual(result.error, true);
    assert.match(result.text, /同一卷|同卷/);
  });
});

test('backup status reports a fresh first backup as healthy', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-setup-status-');
    process.env.YOTTA_MEMORY_HOME = root;
    const setup = memory.backupSetupCore({
      root,
      dir: backupDir,
      skipSchedule: true,
      sameVolumeFn: () => false,
      allowSameVolume: true,
    });
    assert.strictEqual(setup.error, false);
    const status = memory.backupStatusCore({ root, sameVolumeFn: () => false });
    assert.strictEqual(status.error, false);
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.healthy, true);
    assert.match(status.text, /健康|正常/);
  });
});
