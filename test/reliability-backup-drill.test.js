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

function makeEncryptedStore() {
  const root = tmpdir('ytm-drill-store-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'private', 'codex', 'prefs'), { recursive: true });
  const init = memory.initEncryptionCore(root, 'test-password', null);
  const ownerKey = memory.wrapOwnerKey(root, init.umk, init.rk, 'codex');
  const encrypted = memory.encryptMemoryText([
    '---',
    'type: PREF',
    'subject: 恢复演练',
    'statement: 私密记忆可以在恢复副本中解密',
    'scope: private',
    'owner: codex',
    'created: 2026-09-12',
    'updated: 2026-09-12',
    '---',
    '',
  ].join('\n'), ownerKey);
  fs.writeFileSync(path.join(root, 'private', 'codex', 'prefs', '2026-09-12-0001.md.enc'), encrypted);
  memory.saveIndex(root, []);
  return { root, ownerKey };
}

test('backup drill restores, verifies the manifest and decrypts one private entry', () => {
  const { root } = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-backups-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false);
  const drill = memory.backupDrillCore({
    id: created.id,
    dir: backupDir,
    sourceRoot: root,
    password: 'test-password',
  });
  assert.strictEqual(drill.error, false);
  assert.strictEqual(drill.ok, true);
  assert.strictEqual(drill.checks.manifest, true);
  assert.strictEqual(drill.checks.index, true);
  assert.strictEqual(drill.checks.private.decrypted, true);
  assert.strictEqual(drill.checks.private.source, 'password');
});

test('backup drill fails when a backed-up file no longer matches the manifest', () => {
  const { root } = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-corrupt-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  fs.writeFileSync(path.join(created.path, 'private', 'codex', 'prefs', '2026-09-12-0001.md.enc'), 'corrupted', 'utf8');
  const drill = memory.backupDrillCore({
    id: created.id,
    dir: backupDir,
    sourceRoot: root,
  });
  assert.strictEqual(drill.error, true);
  assert.strictEqual(drill.ok, false);
  assert.match(drill.text, /哈希|损坏|失败/);
});

test('backup drill does not use a legacy plaintext owner-key cache', () => {
  const { root, ownerKey } = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-cache-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false);
  fs.mkdirSync(path.join(root, 'keys', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'keys', 'cache', 'codex.key'), ownerKey);
  const drill = memory.backupDrillCore({
    id: created.id,
    dir: backupDir,
    sourceRoot: root,
  });
  assert.strictEqual(drill.error, true);
  assert.strictEqual(drill.ok, false);
  assert.strictEqual(drill.checks.private.decrypted, false);
  assert.match(drill.text, /recovery-key|password/);
});

test('backup excludes pending agent-key handoff files', () => {
  const { root } = makeEncryptedStore();
  const pendingDir = path.join(root, 'keys', 'pending');
  fs.mkdirSync(pendingDir, { recursive: true });
  fs.writeFileSync(path.join(pendingDir, 'codex.key'), Buffer.alloc(32, 5).toString('base64') + '\n', 'utf8');
  const backupDir = tmpdir('ytm-drill-pending-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false, created.text);
  assert.ok(!fs.existsSync(path.join(created.path, 'keys', 'pending', 'codex.key')));
});
