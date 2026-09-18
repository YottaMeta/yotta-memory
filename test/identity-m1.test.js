'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'identity-m1-pass';
const LEGACY_IDENTITY_ENV = [
  'YOTTA_AGENT_ID',
  'AGENT_ID',
  'YOTTA_MEMORY_AGENT_KEY',
  'YOTTA_MEMORY_TRUST_ENV_AGENT',
];

function cleanEnv(home, extra) {
  const env = Object.assign({}, process.env);
  for (const name of LEGACY_IDENTITY_ENV) delete env[name];
  env.YOTTA_MEMORY_HOME = home;
  return Object.assign(env, extra || {});
}

function run(args, home, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(home, extraEnv),
    timeout: 10000,
  });
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-identity-m1-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function initEncrypted(home) {
  const result = run(['init', '--password', PASS], home);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function bind(home, owner) {
  const result = run(['key', 'bind', owner, '--password', PASS], home);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const match = result.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/);
  assert.ok(match, result.stdout);
  return match[1];
}

function writeAgentKeyFile(home, owner, key) {
  const file = path.join(home, owner + '.agent-key');
  fs.writeFileSync(file, key + '\n', 'utf8');
  return file;
}

function runStdio(args, messages, home, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI].concat(args), {
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

function parseResponses(stdout) {
  return stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
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
        try { json = JSON.parse(data); } catch (error) {}
        resolve({ status: res.statusCode, json: json, body: data });
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(message));
  });
}

async function waitForServe(port, headers) {
  for (let i = 0; i < 40; i++) {
    try {
      const result = await httpMcp(port, headers, { jsonrpc: '2.0', id: 99, method: 'server/discover', params: {} });
      if (result.status) return result;
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

function writePrivateEntry(home, owner, key, subject, statement) {
  const result = run([
    'remember', 'PREF', subject, statement,
    '--agent', owner,
    '--agent-key', key,
  ], home);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function contextMessage(id, subject) {
  return {
    jsonrpc: '2.0',
    id: id,
    method: 'tools/call',
    params: { name: 'context', arguments: { limit: 10 } },
  };
}

test('legacy identity environment variables are ignored by CLI commands', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const result = run(['whoami'], home, {
    YOTTA_AGENT_ID: 'codex',
    YOTTA_MEMORY_TRUST_ENV_AGENT: '1',
    YOTTA_MEMORY_AGENT_KEY: Buffer.alloc(32, 3).toString('base64'),
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, /当前智能体身份:\s*codex/);
  assert.match(result.stdout, /未声明/);
});

test('serve --stdio rejects legacy identity environment variables with migration guidance', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const result = run(['serve', '--stdio'], home, {
    YOTTA_AGENT_ID: 'codex',
    YOTTA_MEMORY_TRUST_ENV_AGENT: '1',
  });
  assert.strictEqual(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /YTM_IDENTITY_ENV_REMOVED/);
  assert.match(result.stdout + result.stderr, /--agent-id/);
  assert.match(result.stdout + result.stderr, /--agent-key-file/);
});

test('stdio identity comes from --agent-id and --agent-key-file', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bind(home, 'codex');
  const keyFile = writeAgentKeyFile(home, 'codex', key);
  const result = await runStdio([
    'serve', '--stdio',
    '--agent-id', 'codex',
    '--agent-key-file', keyFile,
    '--tools', 'core',
  ], [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'remember', arguments: { type: 'PREF', subject: 'stdio-identity', statement: '显式参数身份写入' } },
    },
    contextMessage(2, 'stdio-identity'),
  ], home);
  assert.strictEqual(result.code, 0, result.stderr || result.stdout);
  const responses = parseResponses(result.stdout);
  assert.strictEqual(responses[0].result.isError, false, JSON.stringify(responses[0]));
  assert.strictEqual(responses[1].result.isError, false, JSON.stringify(responses[1]));
  assert.match(responses[1].result.content[0].text, /agent_id: codex/);
  assert.match(responses[1].result.content[0].text, /显式参数身份写入/);
});

test('stdio rejects raw --agent-key so key material stays out of process arguments', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bind(home, 'codex');
  const result = run([
    'serve', '--stdio',
    '--agent-id', 'codex',
    '--agent-key', key,
  ], home);
  assert.strictEqual(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /--agent-key-file/);
  assert.match(result.stdout + result.stderr, /命令行/);
});

test('stdio fails closed when no identity is provided for a private operation', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  bind(home, 'codex');
  const result = await runStdio(['serve', '--stdio'], [{
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'remember', arguments: { type: 'PREF', subject: 'missing-identity', statement: '不能匿名写入' } },
  }], home);
  assert.strictEqual(result.code, 0, result.stderr || result.stdout);
  const responses = parseResponses(result.stdout);
  assert.strictEqual(responses[0].result.isError, true, JSON.stringify(responses[0]));
  assert.match(responses[0].result.content[0].text, /身份/);
});

test('HTTP MCP requires X-Agent-Id and X-Agent-Key on every authenticated request', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bind(home, 'codex');
  const tokenResult = run(['token', 'new', '--agent', 'codex'], home);
  assert.strictEqual(tokenResult.status, 0, tokenResult.stderr || tokenResult.stdout);
  const token = tokenResult.stdout.trim();
  const port = await freePort();
  const child = spawn(process.execPath, [
    CLI, 'serve', '--host', '127.0.0.1', '--port', String(port),
  ], {
    env: cleanEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(() => child.kill());
  const ready = await waitForServe(port, {
    Authorization: 'Bearer ' + token,
    'X-Agent-Id': 'codex',
    'X-Agent-Key': key,
  });
  assert.ok(ready, logs);

  const missingKey = await httpMcp(port, {
    Authorization: 'Bearer ' + token,
    'X-Agent-Id': 'codex',
  }, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'context', arguments: { limit: 5 } },
  });
  assert.strictEqual(missingKey.status, 401, JSON.stringify(missingKey));

  const missingId = await httpMcp(port, {
    Authorization: 'Bearer ' + token,
    'X-Agent-Key': key,
  }, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'context', arguments: { limit: 5 } },
  });
  assert.strictEqual(missingId.status, 401, JSON.stringify(missingId));
});

test('three concurrent stdio agents keep private context isolated', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const owners = ['codex', 'alice', 'bob'];
  const keys = {};
  const keyFiles = {};
  for (const owner of owners) {
    keys[owner] = bind(home, owner);
    keyFiles[owner] = writeAgentKeyFile(home, owner, keys[owner]);
    writePrivateEntry(home, owner, keys[owner], 'owner:' + owner, owner + ' 的私有上下文');
  }
  const results = await Promise.all(owners.map((owner, index) => runStdio([
    'serve', '--stdio',
    '--agent-id', owner,
    '--agent-key-file', keyFiles[owner],
  ], [contextMessage(index + 1, owner)], home)));
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];
    assert.strictEqual(results[i].code, 0, results[i].stderr || results[i].stdout);
    const response = parseResponses(results[i].stdout)[0];
    assert.strictEqual(response.result.isError, false, JSON.stringify(response));
    const text = response.result.content[0].text;
    assert.match(text, new RegExp('agent_id: ' + owner));
    assert.match(text, new RegExp('owner:' + owner));
    for (const other of owners) {
      if (other === owner) continue;
      assert.doesNotMatch(text, new RegExp('owner:' + other));
      assert.doesNotMatch(text, new RegExp(other + ' 的私有上下文'));
    }
  }
});

test('three concurrent HTTP agents keep private context isolated', async (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const owners = ['codex', 'alice', 'bob'];
  const keys = {};
  const tokens = {};
  for (const owner of owners) {
    keys[owner] = bind(home, owner);
    writePrivateEntry(home, owner, keys[owner], 'owner:' + owner, owner + ' 的私有上下文');
    const tokenResult = run(['token', 'new', '--agent', owner], home);
    assert.strictEqual(tokenResult.status, 0, tokenResult.stderr || tokenResult.stdout);
    tokens[owner] = tokenResult.stdout.trim();
  }
  const port = await freePort();
  const child = spawn(process.execPath, [
    CLI, 'serve', '--host', '127.0.0.1', '--port', String(port),
  ], {
    env: cleanEnv(home),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(() => child.kill());
  const headersFor = (owner) => ({
    Authorization: 'Bearer ' + tokens[owner],
    'X-Agent-Id': owner,
    'X-Agent-Key': keys[owner],
  });
  const ready = await waitForServe(port, headersFor(owners[0]));
  assert.ok(ready, logs);

  const responses = await Promise.all(owners.map((owner, index) => httpMcp(
    port,
    headersFor(owner),
    contextMessage(index + 1, owner),
  )));
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];
    assert.strictEqual(responses[i].status, 200, responses[i].body);
    assert.strictEqual(responses[i].json.result.isError, false, JSON.stringify(responses[i].json));
    const text = responses[i].json.result.content[0].text;
    assert.match(text, new RegExp('agent_id: ' + owner));
    assert.match(text, new RegExp('owner:' + owner));
    for (const other of owners) {
      if (other === owner) continue;
      assert.doesNotMatch(text, new RegExp('owner:' + other));
      assert.doesNotMatch(text, new RegExp(other + ' 的私有上下文'));
    }
  }
});

test('conflicting explicit identity aliases are rejected', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const result = run(['whoami', '--agent', 'codex', '--agent-id', 'alice'], home);
  assert.strictEqual(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout + result.stderr, /冲突/);
});
