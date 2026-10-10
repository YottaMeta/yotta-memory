'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

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

// v0.22.8：无凭证时 core 上报 needPassword（供 CLI 层复用统一凭证入口）；有凭证时行为不变。
test('backup drill core flags needPassword when no credential is supplied', () => {
  const { root } = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-need-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  const drill = memory.backupDrillCore({ id: created.id, dir: backupDir, sourceRoot: root });
  assert.strictEqual(drill.error, true);
  assert.strictEqual(drill.ok, false);
  assert.strictEqual(drill.needPassword, true);
  assert.strictEqual(drill.checks.private.decrypted, false);
});

// v0.22.8：CLI 凭证三入口（--password / --password-stdin / YOTTA_MEMORY_PASS）+ 无凭证非交互提示。
test('backup drill CLI accepts --password / --password-stdin / env credentials', () => {
  const { root } = makeEncryptedStore();
  const backupDir = tmpdir('ytm-drill-cli-');
  const created = memory.backupCreateCore({ root, dir: backupDir, allowSameVolume: true });
  assert.strictEqual(created.error, false, created.text);
  const env = Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root });
  delete env.YOTTA_MEMORY_PASS;
  const args = function () {
    return [CLI, 'backup', 'drill', created.id, '--dir', backupDir].concat(Array.prototype.slice.call(arguments));
  };

  const viaOption = spawnSync(process.execPath, args('--password', 'test-password'), { encoding: 'utf8', env });
  assert.strictEqual(viaOption.status, 0, viaOption.stderr || viaOption.stdout);
  assert.match(viaOption.stdout, /恢复演练通过/);

  const viaStdin = spawnSync(process.execPath, args('--password-stdin'), { encoding: 'utf8', env, input: 'test-password\n' });
  assert.strictEqual(viaStdin.status, 0, viaStdin.stderr || viaStdin.stdout);
  assert.match(viaStdin.stdout, /恢复演练通过/);

  const viaEnv = spawnSync(process.execPath, args(), { encoding: 'utf8', env: Object.assign({}, env, { YOTTA_MEMORY_PASS: 'test-password' }) });
  assert.strictEqual(viaEnv.status, 0, viaEnv.stderr || viaEnv.stdout);
  assert.match(viaEnv.stdout, /恢复演练通过/);

  const noCred = spawnSync(process.execPath, args(), { encoding: 'utf8', env, input: '' });
  assert.notStrictEqual(noCred.status, 0, 'non-interactive run without credential must fail');
  assert.match(noCred.stderr, /password-stdin|YOTTA_MEMORY_PASS/);
});
