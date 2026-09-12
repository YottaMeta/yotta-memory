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
  memory.writeOwnerKeyCache(root, 'codex', ownerKey);
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
  return root;
}

test('backup drill restores, verifies the manifest and decrypts one private entry', () => {
  const root = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-backups-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false);
  const drill = memory.backupDrillCore({
    id: created.id,
    dir: backupDir,
    sourceRoot: root,
  });
  assert.strictEqual(drill.error, false);
  assert.strictEqual(drill.ok, true);
  assert.strictEqual(drill.checks.manifest, true);
  assert.strictEqual(drill.checks.index, true);
  assert.strictEqual(drill.checks.private.decrypted, true);
  assert.strictEqual(drill.checks.private.source, 'owner-cache');
});

test('backup drill fails when a backed-up file no longer matches the manifest', () => {
  const root = makeEncryptedStore();
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
