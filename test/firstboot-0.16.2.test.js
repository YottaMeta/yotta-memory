'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-firstboot-0.16.2';

function cleanEnv(home, extra) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  delete env.YOTTA_MEMORY_AGENT_KEY;
  env.YOTTA_MEMORY_HOME = home;
  return Object.assign(env, extra || {});
}

function run(args, home, extraEnv, input) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(home, extraEnv),
    input: input,
  });
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-firstboot-0162-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
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

test('missing --agent-key-file is quiet for public reads', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const fact = run(['remember', 'FACT', 'firstboot-public', 'public fact survives', '--agent', 'codex'], home);
  assert.strictEqual(fact.status, 0, fact.stderr || fact.stdout);

  const missing = path.join(home, 'keys', 'missing.key');
  const who = run(['whoami', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(who.status, 0, who.stderr || who.stdout);
  assert.strictEqual(who.stderr, '');
  assert.doesNotMatch(who.stdout, /未找到 agent-key 文件|已降级为未授权模式/);

  const recall = run(['recall', 'firstboot-public', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(recall.status, 0, recall.stderr || recall.stdout);
  assert.strictEqual(recall.stderr, '');
  assert.match(recall.stdout, /public fact survives/);
});

test('non-private commands keep stderr clean when --agent-key-file is missing', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const missing = path.join(home, 'keys', 'missing.key');

  const doctor = run(['doctor', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.strictEqual(doctor.stderr, '');
  assert.doesNotMatch(doctor.stdout + doctor.stderr, /未找到 agent-key 文件|已降级为未授权模式/);

  const config = run(['config', 'get', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(config.status, 0, config.stderr || config.stdout);
  assert.strictEqual(config.stderr, '');
  assert.doesNotMatch(config.stdout + config.stderr, /未找到 agent-key 文件|已降级为未授权模式/);
});

test('migrate keeps stderr clean when --agent-key-file is missing', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const missing = path.join(home, 'keys', 'missing.key');
  const migrate = run(['migrate', '--password', PASS, '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(migrate.status, 0, migrate.stderr || migrate.stdout);
  assert.strictEqual(migrate.stderr, '');
  assert.doesNotMatch(migrate.stdout + migrate.stderr, /未找到 agent-key 文件|已降级为未授权模式/);
});

test('identity JSON diagnostics expose missing agent-key state without stderr noise', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const missing = path.join(home, 'keys', 'missing.key');

  const who = run(['whoami', '--agent', 'codex', '--agent-key-file', missing, '--json'], home);
  assert.strictEqual(who.status, 0, who.stderr || who.stdout);
  assert.strictEqual(who.stderr, '');
  const whoJson = JSON.parse(who.stdout);
  assert.strictEqual(whoJson.identity.mode, 'unauthenticated');
  assert.strictEqual(whoJson.identity.agentKeyStatus, 'missing');
  assert.strictEqual(path.resolve(whoJson.identity.keyFile), path.resolve(missing));

  const doctor = run(['doctor', '--json', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(doctor.status, 0, doctor.stderr || doctor.stdout);
  assert.strictEqual(doctor.stderr, '');
  const doctorJson = JSON.parse(doctor.stdout);
  assert.strictEqual(doctorJson.identity.mode, 'unauthenticated');
  assert.strictEqual(doctorJson.identity.agentKeyStatus, 'missing');

  const config = run(['config', 'get', '--json', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(config.status, 0, config.stderr || config.stdout);
  assert.strictEqual(config.stderr, '');
  const configJson = JSON.parse(config.stdout);
  assert.strictEqual(configJson.identity.mode, 'unauthenticated');
  assert.strictEqual(configJson.identity.agentKeyStatus, 'missing');
});

test('missing --agent-key-file fails closed with an actionable private-access error', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const missing = path.join(home, 'keys', 'missing.key');
  const write = run(['remember', 'PREF', 'firstboot-private', 'must not be written', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.notStrictEqual(write.status, 0);
  assert.strictEqual(write.stderr, '');
  assert.doesNotMatch(write.stdout + write.stderr, /无法读取 agent-key 文件/);
  assert.match(write.stdout + write.stderr, /未找到 agent-key 文件/);
  assert.match(write.stdout + write.stderr, /key status|key claim|key bind|view/);

  const context = run(['context', '--agent', 'codex', '--agent-key-file', missing], home);
  assert.strictEqual(context.status, 3, context.stderr || context.stdout);
  assert.strictEqual(context.stderr, '');
  assert.match(context.stdout, /未找到 agent-key 文件/);
  assert.match(context.stdout, /key status|key claim|key bind|view/);
});

test('non-TTY init --encrypt gives an actionable error instead of silent cancel', (t) => {
  const home = tmpHome(t);
  const r = run(['init', '--encrypt'], home);
  assert.strictEqual(r.status, 2, r.stderr || r.stdout);
  assert.match(r.stdout + r.stderr, /非交互|password-stdin|YOTTA_MEMORY_PASS/);
  assert.doesNotMatch(r.stdout + r.stderr, /已取消。/);
});

test('--password-stdin initializes an encrypted store without a TTY', (t) => {
  const home = tmpHome(t);
  const r = run(['init', '--encrypt', '--password-stdin'], home, null, PASS + '\n');
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.ok(MOD.isEncrypted(home), 'store should be encrypted');
});

test('--recovery-key-out writes the recovery key to a file', (t) => {
  const home = tmpHome(t);
  const out = path.join(home, 'recovery.key');
  const r = run(['init', '--encrypt', '--password-stdin', '--recovery-key-out', out], home, null, PASS + '\n');
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.ok(fs.existsSync(out), 'recovery key file should exist');
  const key = fs.readFileSync(out, 'utf8').trim();
  assert.match(key, /^[A-Za-z0-9+/=]{40,}$/);
  assert.ok(!(r.stdout + r.stderr).includes(key), 'full recovery key must not be printed');
  assert.match(r.stdout + r.stderr, /恢复钥匙.*(写入|文件)/);
});

test('view unlocks a fresh encrypted store with no owner key via the recovery key', async (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  assert.strictEqual(MOD.keyListCore(home).owners.length, 0, 'fresh store has no owner key');

  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  const ok = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.data));
  const bad = await viewApi(port, '/api/unlock', { password: 'wrong-password' });
  assert.strictEqual(bad.status, 401);
});

test('initCore ignores agents.json when deciding whether a store exists', (t) => {
  const root = tmpHome(t);
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  const r = MOD.initCore({ dir: root, noEncrypt: true });
  assert.strictEqual(r.error, false, r.text);
  assert.ok(fs.existsSync(path.join(root, 'facts')));
});

test('keyListCore lists an owner that has a key but no private directory', (t) => {
  const root = tmpHome(t);
  fs.mkdirSync(root, { recursive: true });
  const init = MOD.initEncryptionCore(root, PASS, null);
  const umk = MOD.deriveUmk(PASS, MOD.loadSalt(root));
  MOD.wrapOwnerKey(root, umk, init.rk, 'codex');
  assert.ok(fs.existsSync(path.join(root, 'keys', 'codex.key.enc')));
  assert.ok(!fs.existsSync(path.join(root, 'private', 'codex')));
  const list = MOD.keyListCore(root);
  assert.match(list.text, /owner: codex/);
});

test('plaintext view prints its guidance on stdout', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const r = run(['view'], home);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout, /未启用加密/);
});

test('doctor treats a fresh empty store as info for index and identity', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const report = MOD.doctorCore({ root: home });
  assert.strictEqual(report.error, false);
  assert.doesNotMatch(report.text, /公共索引缺失|agents\.json 缺失/);
});

test('doctor surfaces the agent home discovery env', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const r = run(['doctor'], home);
  assert.match(r.stdout, /YOTTA_MEMORY_AGENT_HOME/);
});

test('init --attach reports the current storage mode', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const attach = run(['init', '--attach'], home);
  assert.strictEqual(attach.status, 0, attach.stderr || attach.stdout);
  assert.match(attach.stdout, /明文/);
});

test('private write guidance on a fresh encrypted store points to a usable next step', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const write = run(['remember', 'PREF', 'firstboot-guidance', 'x', '--agent', 'codex'], home);
  assert.notStrictEqual(write.status, 0);
  assert.match(write.stdout + write.stderr, /key bind|iam/);
});

test('view reports a clear error when the port is already occupied', async (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => blocker.close(() => resolve())));
  const port = blocker.address().port;
  const r = spawnSync(process.execPath, [CLI, 'view', '--port', String(port)], {
    encoding: 'utf8',
    env: cleanEnv(home),
    timeout: 8000,
  });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /端口.*占用|已在运行/);
  assert.doesNotMatch(r.stdout + r.stderr, /Unhandled 'error' event|EADDRINUSE/);
});

test('migrate enables encryption on an empty plaintext store and points to key bind', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const migrate = run(['migrate', '--password-stdin'], home, null, PASS + '\n');
  assert.strictEqual(migrate.status, 0, migrate.stderr || migrate.stdout);
  assert.ok(MOD.isEncrypted(home), 'empty plaintext store should become encrypted');
  assert.match(migrate.stdout + migrate.stderr, /key bind/);
});

test('iam registers an identity on a fresh encrypted store without an owner key', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const iam = run(['iam', 'yottacode-desktop', '--name', 'YottaCode Desktop'], home);
  assert.strictEqual(iam.status, 0, iam.stderr || iam.stdout);
  assert.match(iam.stdout + iam.stderr, /已登记智能体身份/);
  const agents = JSON.parse(fs.readFileSync(path.join(home, 'agents.json'), 'utf8'));
  assert.ok(agents.agents['yottacode-desktop']);
  assert.match(iam.stdout + iam.stderr, /授权|key bind|自我档案/);
});

test('iam writes the self profile after the owner key exists', (t) => {
  const home = tmpHome(t);
  assert.strictEqual(run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS }).status, 0);
  assert.strictEqual(run(['iam', 'yottacode-desktop'], home).status, 0);
  const bind = run(['key', 'bind', 'yottacode-desktop', '--password', PASS], home);
  assert.strictEqual(bind.status, 0, bind.stderr || bind.stdout);
  const aiHome = path.join(home, 'aihome');
  const claim = run(['key', 'claim', 'yottacode-desktop', '--to', aiHome], home);
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  const keyFile = path.join(aiHome, '.yotta-memory-agent-key');
  const again = run(['iam', 'yottacode-desktop', '--force', '--agent-key-file', keyFile], home);
  assert.strictEqual(again.status, 0, again.stderr || again.stdout);
  assert.match(again.stdout, /已写入自我档案/);
});

test('doctor does not warn about the public index for a private-only store', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const dir = path.join(home, 'private', 'codex', 'prefs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2026-09-21-0001.md'), '# PREF\n', 'utf8');
  const report = MOD.doctorCore({ root: home });
  assert.doesNotMatch(report.text, /公共索引缺失/);
});
