'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-migration-view-2026-09-16';
const MARKER = '[YTM_MIGRATION_REQUIRED]';

function cleanEnv(home, extra) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  delete env.YOTTA_MEMORY_AGENT_KEY;
  env.YOTTA_MEMORY_HOME = home;
  return Object.assign(env, extra || {});
}

function run(args, home, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(home, extraEnv),
  });
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-migration-view-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function seedLegacyPlaintext(home) {
  const r = run(['init', '--no-encrypt'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const write = run(['remember', 'PREF', '迁移回归', '旧库私密明文', '--agent', 'codex'], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  assert.strictEqual(run(['key', 'list'], home).status, 0);
}

function seedUnboundEncryptedOwner(home) {
  seedLegacyPlaintext(home);
  const migrate = run(['migrate', '--password', PASS, '--agent', 'codex'], home);
  assert.strictEqual(migrate.status, 0, migrate.stderr || migrate.stdout);
  assert.ok(MOD.isEncrypted(home), 'store should be encrypted after migrate');
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'bindings', 'codex.key.agent')));
}

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function viewApi(port, pathname, body) {
  const res = await fetch('http://127.0.0.1:' + port + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, data: await res.json() };
}

function viewRaw(port, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'POST',
      headers: headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body || {}));
  });
}

test('migrate survives a plaintext store and reports the rebind step', (t) => {
  const home = tmpHome(t);
  seedLegacyPlaintext(home);
  const r = run(['migrate', '--password', PASS, '--agent', 'codex'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /已迁移 \d+ 个私密文件/);
  assert.match(r.stdout, /yotta-memory view/);
  assert.match(r.stdout, /yotta-memory key bind <id>/);
  assert.match(r.stdout, /你的身份：codex/);
  assert.ok(MOD.isEncrypted(home), 'store should be encrypted after migrate');
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'cache', 'codex.key')));
});

test('migrate works without an explicit agent identity', (t) => {
  const home = tmpHome(t);
  seedLegacyPlaintext(home);
  const r = run(['migrate', '--password', PASS], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.ok(MOD.isEncrypted(home), 'store should be encrypted after migrate');
});

test('key list flags unbound owners and legacy cache for migration', (t) => {
  const home = tmpHome(t);
  seedLegacyPlaintext(home);
  fs.mkdirSync(path.join(home, 'keys', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(home, 'keys', 'cache', 'codex.key'), Buffer.alloc(32, 1));
  const r = run(['key', 'list'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /\[YTM_MIGRATION_REQUIRED\]/);
  assert.match(r.stdout, /agent=codex/);
  assert.match(r.stdout, /reason=legacy_cache,no_agent_binding|reason=no_agent_binding,legacy_cache/);
  assert.match(r.stdout, /key bind/);
  assert.match(r.stdout, /yotta-memory view/);
});

test('doctor warns when an encrypted store has an unbound owner', (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const doctor = MOD.doctorCore({ root: home, backupSetupChoice: 'manual' });
  assert.ok(doctor.warnings.some((w) => w.indexOf(MARKER) !== -1 && w.indexOf('codex') !== -1), JSON.stringify(doctor.warnings));
});

test('context failure prints the structured migration marker', (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const r = run(['context', '--agent', 'codex'], home);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /缺少 agent_key/);
  assert.match(r.stdout, /\[YTM_MIGRATION_REQUIRED\]/);
  assert.match(r.stdout, /agent=codex/);
  assert.match(r.stdout, /key bind/);
  assert.match(r.stdout, /yotta-memory view/);
  assert.match(r.stdout, /重启会话|升级后首次/);
  assert.match(r.stdout, /用户侧操作|用户自己/);
  assert.doesNotMatch(r.stdout, /AI 自动/);
});

test('migration marker lists every owner that still needs binding', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  assert.strictEqual(run(['remember', 'PREF', '第一个 owner', '迁移前明文', '--agent', 'codex'], home).status, 0);
  assert.strictEqual(run(['remember', 'PREF', '第二个 owner', '迁移前明文', '--agent', 'win-opencode-a1'], home).status, 0);
  const migrate = run(['migrate', '--password', PASS], home);
  assert.strictEqual(migrate.status, 0, migrate.stderr || migrate.stdout);
  const info = MOD.migrationRequiredInfo(home);
  assert.ok(info);
  assert.match(info.marker, /agent=codex,win-opencode-a1/);
  assert.ok(info.owners.indexOf('win-opencode-a1') !== -1);
});

test('legacy cache without private data does not enter the migration list', (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  fs.mkdirSync(path.join(home, 'keys', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(home, 'keys', 'cache', 'qclaw.key'), Buffer.alloc(32, 3));
  const info = MOD.migrationRequiredInfo(home);
  assert.ok(info);
  assert.match(info.marker, /agent=codex/);
  assert.doesNotMatch(info.marker, /qclaw/);
  assert.ok(info.legacyOnly.indexOf('qclaw') !== -1);
});

test('view authorize returns the agent_key and marks the owner authorized', async (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  const unlock = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(unlock.status, 200);
  const before = await viewApi(port, '/api/owners');
  assert.strictEqual(before.status, 200);
  const codexBefore = before.data.owners.find((o) => o.owner === 'codex');
  assert.ok(codexBefore);
  assert.strictEqual(codexBefore.authorized, false);
  const authorized = await viewApi(port, '/api/authorize', { owner: 'codex' });
  assert.strictEqual(authorized.status, 200);
  assert.match(authorized.data.agentKey || '', /^[A-Za-z0-9+/=]{40,}$/);
  assert.ok(fs.existsSync(path.join(home, 'keys', 'pending', 'codex.key')));
  const after = await viewApi(port, '/api/owners');
  const codexAfter = after.data.owners.find((o) => o.owner === 'codex');
  assert.strictEqual(codexAfter.authorized, true);
  assert.ok(fs.existsSync(path.join(home, 'keys', 'bindings', 'codex.key.agent')));
});

test('view authorize and revoke reject unsafe owner ids', async (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  const unlock = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(unlock.status, 200);
  const badAuthorize = await viewApi(port, '/api/authorize', { owner: '../evil' });
  assert.strictEqual(badAuthorize.status, 400);
  const badRevoke = await viewApi(port, '/api/revoke', { owner: '../evil' });
  assert.strictEqual(badRevoke.status, 400);
  assert.ok(!fs.existsSync(path.join(path.dirname(home), 'evil.key.agent')));
});

test('view rejects untrusted Host headers and cross-origin requests', async (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  assert.strictEqual((await viewApi(port, '/api/unlock', { password: PASS })).status, 200);
  const badHost = await viewRaw(port, '/api/status', {
    Host: 'evil.example:' + port,
    Origin: 'http://evil.example:' + port,
    'Content-Type': 'text/plain',
  });
  assert.strictEqual(badHost.status, 403);
  const badOrigin = await viewRaw(port, '/api/status', {
    Origin: 'http://evil.example',
    'Content-Type': 'text/plain',
  });
  assert.strictEqual(badOrigin.status, 403);
});

test('view refuses to create a new owner key while encrypted private data remains', async (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--password', PASS], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const codex = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.strictEqual(codex.status, 0, codex.stderr || codex.stdout);
  const codexKey = codex.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/)[1];
  const gon = run(['key', 'bind', 'gon-mimo', '--password', PASS], home);
  assert.strictEqual(gon.status, 0, gon.stderr || gon.stdout);
  const gonKey = gon.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/)[1];
  const write = run(['remember', 'PREF', 'owner-key-missing', 'view 不能静默换钥', '--agent', 'gon-mimo', '--agent-key', gonKey], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  fs.rmSync(path.join(home, 'keys', 'gon-mimo.key.enc'), { force: true });
  fs.rmSync(path.join(home, 'keys', 'gon-mimo.key.recovery'), { force: true });
  fs.rmSync(path.join(home, 'keys', 'bindings', 'gon-mimo.key.agent'), { force: true });
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  assert.strictEqual((await viewApi(port, '/api/unlock', { password: PASS })).status, 200);
  const result = await viewApi(port, '/api/authorize', { owner: 'gon-mimo' });
  assert.strictEqual(result.status, 400);
  assert.match(result.data.error, /owner key|密钥文件缺失|原 owner/);
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'gon-mimo.key.enc')));
});

test('view re-authorize recovers a missing owner key from the recovery file', async (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--password', PASS], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const codex = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.strictEqual(codex.status, 0, codex.stderr || codex.stdout);
  const gon = run(['key', 'bind', 'gon-mimo', '--password', PASS], home);
  assert.strictEqual(gon.status, 0, gon.stderr || gon.stdout);
  const gonKey = gon.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/)[1];
  const write = run(['remember', 'PREF', 'owner-key-view-recovery', 'view 恢复原钥', '--agent', 'gon-mimo', '--agent-key', gonKey], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  fs.rmSync(path.join(home, 'keys', 'gon-mimo.key.enc'), { force: true });
  fs.rmSync(path.join(home, 'keys', 'bindings', 'gon-mimo.key.agent'), { force: true });
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  assert.strictEqual((await viewApi(port, '/api/unlock', { password: PASS })).status, 200);
  const result = await viewApi(port, '/api/authorize', { owner: 'gon-mimo' });
  assert.strictEqual(result.status, 200, JSON.stringify(result.data));
  assert.match(result.data.agentKey || '', /^[A-Za-z0-9+/=]{40,}$/);
  const context = run(['context', '--agent', 'gon-mimo', '--agent-key', result.data.agentKey], home);
  assert.strictEqual(context.status, 0, context.stderr || context.stdout);
  assert.match(context.stdout, /view 恢复原钥/);
});

test('view revoke then re-authorize rotates the binding and clears the migration marker', async (t) => {
  const home = tmpHome(t);
  seedUnboundEncryptedOwner(home);
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  assert.strictEqual((await viewApi(port, '/api/unlock', { password: PASS })).status, 200);
  const first = await viewApi(port, '/api/authorize', { owner: 'codex' });
  assert.strictEqual(first.status, 200);
  const repeat = await viewApi(port, '/api/authorize', { owner: 'codex' });
  assert.strictEqual(repeat.status, 409);
  const revoke = await viewApi(port, '/api/revoke', { owner: 'codex' });
  assert.strictEqual(revoke.status, 200);
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'bindings', 'codex.key.agent')));
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'pending', 'codex.key')));
  const second = await viewApi(port, '/api/authorize', { owner: 'codex' });
  assert.strictEqual(second.status, 200);
  assert.notStrictEqual(second.data.agentKey, first.data.agentKey);
  assert.ok(fs.existsSync(path.join(home, 'keys', 'pending', 'codex.key')));
  const oldContext = run(['context', '--agent', 'codex', '--agent-key', first.data.agentKey], home);
  assert.strictEqual(oldContext.status, 3);
  assert.match(oldContext.stdout, /agent_key|binding/);
  const newContext = run(['context', '--agent', 'codex', '--agent-key', second.data.agentKey], home);
  assert.strictEqual(newContext.status, 0, newContext.stderr || newContext.stdout);
  const owners = await viewApi(port, '/api/owners');
  assert.strictEqual(owners.data.owners.find((o) => o.owner === 'codex').authorized, true);
  assert.strictEqual(MOD.migrationReminderText(home), '');
});

test('view page binds the authorize callback to the returned agent_key', () => {
  const html = MOD.viewHtml();
  assert.match(html, /d\.agentKey/);
  assert.match(html, /由你（用户）操作/);
  assert.match(html, /AI 不应代为执行该授权操作/);
  assert.match(html, /key claim/);
  assert.match(html, /pending/);
  assert.match(html, /旧 key 会立即校验失败/);
});

test('view template is embedded in the CLI for asset-less distributions', () => {
  const source = fs.readFileSync(CLI, 'utf8');
  assert.match(source, /@generated view-html:start/);
  assert.ok(source.indexOf('<!doctype html>') !== -1, 'view.html must be embedded in bin/yotta-memory.js');
  assert.strictEqual(MOD.viewHtml(), fs.readFileSync(path.join(__dirname, '..', 'assets', 'view.html'), 'utf8'));
});

test('skill docs state that migration and binding are user-side view operations', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'SKILL.md'), 'utf8');
  assert.match(skill, /由用户自己执行 `yotta-memory view`/);
  assert.match(skill, /不得代替用户执行 `migrate` \/ `key bind`/);
  assert.match(skill, /升级后首次调用元忆/);
  assert.match(skill, /key claim <agent_id>/);
  assert.match(skill, /YOTTA_MEMORY_AGENT_HOME/);
  assert.match(skill, /\.yotta-memory-agent-key/);
  assert.match(skill, /旧 key 立即校验失败/);
});
