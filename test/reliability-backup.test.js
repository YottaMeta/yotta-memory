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
  const root = tmpdir('ytm-backup-store-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'private', 'codex', 'prefs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'keys', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'keys', 'cache', 'codex.key'), 'owner-key-cache\n', 'utf8');
  fs.writeFileSync(path.join(root, 'facts', 'fact.md'), 'fact\n', 'utf8');
  fs.writeFileSync(path.join(root, 'private', 'codex', 'prefs', 'pref.md'), 'pref\n', 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');
  return root;
}

test('backup create writes a manifest and doctor verifies it', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-backup-dest-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false);
  assert.ok(fs.existsSync(path.join(created.path, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(created.path, 'facts', 'fact.md')));
  assert.strictEqual(fs.existsSync(path.join(created.path, 'keys', 'cache', 'codex.key')), false);

  const listed = memory.backupListCore({ dir: backupDir });
  assert.strictEqual(listed.error, false);
  assert.strictEqual(listed.backups.length, 1);

  const doctor = memory.backupDoctorCore({ dir: backupDir, id: created.id });
  assert.strictEqual(doctor.ok, true);
});

test('backup doctor detects a corrupted backup file', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-backup-corrupt-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  fs.writeFileSync(path.join(created.path, 'facts', 'fact.md'), 'corrupted\n', 'utf8');
  const doctor = memory.backupDoctorCore({ dir: backupDir, id: created.id });
  assert.strictEqual(doctor.ok, false);
});

test('backup restore copies a backup to a new directory', () => {
  const root = makeStore();
  const backupDir = tmpdir('ytm-backup-restore-src-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  const target = path.join(tmpdir('ytm-backup-restore-parent-'), 'restored');
  const restored = memory.backupRestoreCore(created.id, { dir: backupDir, to: target });
  assert.strictEqual(restored.error, false);
  assert.strictEqual(fs.readFileSync(path.join(target, 'facts', 'fact.md'), 'utf8'), 'fact\n');
  assert.ok(!fs.existsSync(path.join(target, 'manifest.json')));
});
