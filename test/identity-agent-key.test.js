'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-2026-09-16';

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

function runStdio(messages, home, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'serve', '--stdio'], {
      env: cleanEnv(home, extraEnv),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    for (const message of messages) child.stdin.write(JSON.stringify(message) + '\n');
    child.stdin.end();
  });
}

function freePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function httpMcp(port, headers, message) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: '/mcp',
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, json: json });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(message));
  });
}

async function waitForServe(port, headers) {
  for (let i = 0; i < 30; i++) {
    try {
      const result = await httpMcp(port, headers, { jsonrpc: '2.0', id: 99, method: 'server/discover', params: {} });
      if (result.status) return true;
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-agent-key-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function initEncrypted(home) {
  const r = run(['init', '--password', PASS], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
}

function bindCodex(home) {
  const r = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const m = r.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/);
  assert.ok(m, r.stdout);
  return m[1];
}

test('agent_key binding enables encrypted private access', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'cache', 'codex.key')));
  const write = run(['remember', 'PREF', 'agent-key', '加密私密写入', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  const context = run(['context', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(context.status, 0, context.stderr || context.stdout);
  assert.match(context.stdout, /agent_id: codex/);
});

test('encrypted private access fails without agent_key', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  bindCodex(home);
  const r = run(['context', '--agent', 'codex'], home);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /缺少 agent_key|agent binding|agent_key/);
});

test('CLI can read agent_key from an explicit key file', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const keyFile = path.join(home, 'codex.agent-key');
  fs.writeFileSync(keyFile, key + '\n', 'utf8');
  const ok = run(['context', '--agent', 'codex', '--agent-key-file', keyFile], home);
  assert.strictEqual(ok.status, 0, ok.stderr || ok.stdout);
  const missing = run(['context', '--agent', 'codex', '--agent-key-file', path.join(home, 'missing.key')], home);
  assert.notStrictEqual(missing.status, 0);
  assert.match(missing.stdout + missing.stderr, /agent-key 文件/);
});

test('wrong agent_key cannot unwrap owner key', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  bindCodex(home);
  const wrong = Buffer.alloc(32, 7).toString('base64');
  const r = run(['context', '--agent', 'codex', '--agent-key', wrong], home);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /agent_key 无效|binding 损坏|agent_key/);
});

test('knowing another owner id without its key cannot read', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const codexKey = bindCodex(home);
  const r = run(['context', '--agent', 'gon-mimo', '--agent-key', codexKey], home);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /agent binding|agent_key/);
  assert.doesNotMatch(r.stdout, /用户画像（gon-mimo）/);
});

test('legacy plaintext owner-key cache is not loaded', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  bindCodex(home);
  fs.mkdirSync(path.join(home, 'keys', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(home, 'keys', 'cache', 'codex.key'), Buffer.alloc(32, 9));
  const r = run(['context', '--agent', 'codex'], home);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /agent_key/);
});

test('agent id path traversal is rejected', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const bind = run(['key', 'bind', '../evil', '--password', PASS], home);
  assert.notStrictEqual(bind.status, 0);
  assert.match(bind.stderr + bind.stdout, /非法/);
  const write = run(['remember', 'PREF', 'path', '不应写出目录', '--agent', '../evil'], home);
  assert.notStrictEqual(write.status, 0);
  assert.match(write.stdout + write.stderr, /非法/);
  assert.ok(!fs.existsSync(path.join(path.dirname(home), 'evil.key.agent')));
});

test('MCP stdio uses the trusted env agent_key for encrypted private access', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const result = await runStdio([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'remember', arguments: { type: 'PREF', subject: 'mcp-key', statement: '加密私密写入' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'context', arguments: { limit: 5 } } },
  ], home, {
    YOTTA_AGENT_ID: 'codex',
    YOTTA_MEMORY_AGENT_KEY: key,
    YOTTA_MEMORY_TRUST_ENV_AGENT: '1',
  });
  assert.strictEqual(result.code, 0, result.stderr || result.stdout);
  const responses = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  assert.strictEqual(responses[0].result.isError, false, JSON.stringify(responses[0]));
  assert.strictEqual(responses[1].result.isError, false, JSON.stringify(responses[1]));
  assert.match(responses[1].result.content[0].text, /agent_id: codex/);
});

test('key bind recovers a missing owner key from the recovery file', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const write = run(['remember', 'PREF', 'owner-key-recovery', '恢复原钥后仍可读取', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  fs.rmSync(path.join(home, 'keys', 'codex.key.enc'), { force: true });
  const rebind = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.strictEqual(rebind.status, 0, rebind.stderr || rebind.stdout);
  const nextKey = rebind.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/)[1];
  const context = run(['context', '--agent', 'codex', '--agent-key', nextKey], home);
  assert.strictEqual(context.status, 0, context.stderr || context.stdout);
  assert.match(context.stdout, /恢复原钥后仍可读取/);
});

test('key bind refuses to replace owner keys when recovery material is also missing', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const write = run(['remember', 'PREF', 'owner-key-missing', '不能静默换钥', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);
  const ownerKeyPath = path.join(home, 'keys', 'codex.key.enc');
  fs.rmSync(ownerKeyPath, { force: true });
  fs.rmSync(path.join(home, 'keys', 'codex.key.recovery'), { force: true });
  const rebind = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.notStrictEqual(rebind.status, 0);
  assert.match(rebind.stdout + rebind.stderr, /owner key|密钥文件缺失|原 owner/);
  assert.ok(!fs.existsSync(ownerKeyPath));
});

test('HTTP MCP accepts X-Agent-Key and fails private access without it', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const tokenResult = run(['token', 'new', '--agent', 'codex'], home);
  assert.strictEqual(tokenResult.status, 0, tokenResult.stderr || tokenResult.stdout);
  const token = tokenResult.stdout.trim();
  const port = await freePort();
  const child = spawn(process.execPath, [CLI, 'serve', '--host', '127.0.0.1', '--port', String(port)], {
    env: cleanEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(() => child.kill());
  const authHeaders = {
    Authorization: 'Bearer ' + token,
    'X-Agent-Id': 'codex',
    'X-Agent-Key': key,
  };
  assert.ok(await waitForServe(port, authHeaders), logs);
  const write = await httpMcp(port, authHeaders, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'remember', arguments: { type: 'PREF', subject: 'http-key', statement: '远程加密私密写入' } },
  });
  assert.strictEqual(write.status, 200, logs);
  assert.strictEqual(write.json.result.isError, false, JSON.stringify(write.json));
  const noKey = await httpMcp(port, {
    Authorization: 'Bearer ' + token,
    'X-Agent-Id': 'codex',
  }, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'context', arguments: { limit: 5 } },
  });
  assert.strictEqual(noKey.status, 200, logs);
  assert.strictEqual(noKey.json.result.isError, true, JSON.stringify(noKey.json));
  assert.match(noKey.json.result.content[0].text, /缺少 agent_key/);
});

test('key bind rejects traversal before writing outside the key store', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const outsideBase = path.join(os.tmpdir(), 'ytm-bind-outside-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const owner = path.relative(path.join(home, 'keys'), outsideBase);
  t.after(() => {
    fs.rmSync(outsideBase + '.key.enc', { force: true });
    fs.rmSync(outsideBase + '.key.recovery', { force: true });
  });
  const r = run(['key', 'bind', owner, '--password', PASS], home);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /非法/);
  assert.ok(!fs.existsSync(outsideBase + '.key.enc'));
  assert.ok(!fs.existsSync(outsideBase + '.key.recovery'));
});

test('key revoke rejects traversal before deleting outside the key store', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const bindings = path.join(home, 'keys', 'bindings');
  fs.mkdirSync(bindings, { recursive: true });
  const outsideBase = path.join(os.tmpdir(), 'ytm-revoke-outside-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  const outside = outsideBase + '.key.agent';
  fs.writeFileSync(outside, 'sentinel', 'utf8');
  t.after(() => fs.rmSync(outside, { force: true }));
  const owner = path.relative(bindings, outsideBase);
  const r = run(['key', 'revoke', owner], home);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /非法/);
  assert.ok(fs.existsSync(outside));
});

test('token and MCP entry points reject unsafe agent ids', (t) => {
  const home = tmpHome(t);
  const init = run(['init', '--no-encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const token = run(['token', 'new', '--agent', '../evil'], home);
  assert.notStrictEqual(token.status, 0);
  assert.match(token.stdout + token.stderr, /非法/);
  const tool = require(CLI).callTool('agent_info', {}, { agent: '../evil' });
  assert.strictEqual(tool.error, true);
  assert.match(tool.text, /非法/);
});

test('key status and claim move a pending agent key into the AI host directory', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const pending = path.join(home, 'keys', 'pending', 'codex.key');
  assert.ok(fs.existsSync(pending), 'binding should create a pending handoff file');
  assert.strictEqual(fs.readFileSync(pending, 'utf8').trim(), key);

  const agentHome = path.join(home, 'agent-home');
  fs.mkdirSync(agentHome, { recursive: true });
  const before = run(['key', 'status', 'codex', '--to', agentHome], home);
  assert.strictEqual(before.status, 0, before.stderr || before.stdout);
  assert.match(before.stdout, /pending:\s*yes/);
  assert.match(before.stdout, /host_key:\s*missing/);

  const claim = run(['key', 'claim', 'codex', '--to', agentHome], home);
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  const target = path.join(agentHome, '.yotta-memory-agent-key');
  assert.ok(fs.existsSync(target));
  assert.strictEqual(fs.readFileSync(target, 'utf8').trim(), key);
  assert.ok(!fs.existsSync(pending), 'claim must delete the pending file');

  const context = run(['context', '--agent', 'codex', '--agent-key-file', target], home);
  assert.strictEqual(context.status, 0, context.stderr || context.stdout);
  assert.match(context.stdout, /agent_id: codex/);
});

test('revoke invalidates a warmed agent binding in a long-running process', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindCodex(home);
  const write = run(['remember', 'PREF', 'revoke-warm', '旧 key 必须失效', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);

  MOD.setRuntimeAgent('codex', key);
  assert.ok(MOD.getOwnerKeyFor(home, 'codex'), 'binding should be decryptable before revoke');
  const revoked = MOD.keyRevokeCore(home, 'codex');
  assert.strictEqual(revoked.error, false, revoked.text);
  assert.strictEqual(MOD.getOwnerKeyFor(home, 'codex'), null, 'revoke must invalidate the warmed binding');

  const context = run(['context', '--agent', 'codex', '--agent-key', key], home);
  assert.strictEqual(context.status, 3);
  assert.match(context.stdout, /校验失败/);
  assert.match(context.stdout, /agent binding|agent_key|未找到/);
  assert.doesNotMatch(context.stdout, /旧 key 必须失效/);
});

test('key bind removes the binding if the pending handoff cannot be written', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  fs.mkdirSync(path.join(home, 'keys'), { recursive: true });
  fs.writeFileSync(path.join(home, 'keys', 'pending'), 'not-a-directory', 'utf8');
  const r = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.notStrictEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(home, 'keys', 'bindings', 'codex.key.agent')));
});
