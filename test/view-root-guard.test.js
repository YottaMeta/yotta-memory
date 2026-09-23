'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-view-root-guard';

function makeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-view-root-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function run(args, home) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      YOTTA_MEMORY_HOME: home,
      YOTTA_MEMORY_CONFIG_DIR: home,
      YOTTA_MEMORY_PASS: PASS,
    }),
    timeout: 8000,
  });
}

function runAsync(args, home) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI].concat(args), {
      env: Object.assign({}, process.env, {
        YOTTA_MEMORY_HOME: home,
        YOTTA_MEMORY_CONFIG_DIR: home,
        YOTTA_MEMORY_PASS: PASS,
      }),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ status: null, signal: 'timeout', stdout, stderr });
    }, 8000);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function encryptedHome(t) {
  const home = makeHome(t);
  const init = run(['init', '--encrypt'], home);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  return home;
}

function viewApi(port, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function closeServer(t, server) {
  t.after(() => new Promise((resolve) => {
    server.close(() => resolve());
  }));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    if (server.listening) return resolve(server.address().port);
    server.once('error', reject);
    server.once('listening', () => resolve(server.address().port));
  });
}

test('view status exposes a stable memory-home fingerprint', async (t) => {
  const homeA = encryptedHome(t);
  const homeB = encryptedHome(t);
  const serverA = MOD.viewServerCore(homeA, 0, '127.0.0.1');
  const serverB = MOD.viewServerCore(homeB, 0, '127.0.0.1');
  closeServer(t, serverA);
  closeServer(t, serverB);
  const portA = await listen(serverA);
  const portB = await listen(serverB);

  const statusA = await viewApi(portA, '/api/status', {});
  const statusB = await viewApi(portB, '/api/status', {});

  assert.strictEqual(statusA.status, 200);
  assert.strictEqual(statusB.status, 200);
  assert.match(statusA.body.rootId, /^[a-f0-9]{64}$/);
  assert.match(statusB.body.rootId, /^[a-f0-9]{64}$/);
  assert.notStrictEqual(statusA.body.rootId, statusB.body.rootId);
});

test('view refuses to reuse a different memory-home server', async (t) => {
  const homeA = encryptedHome(t);
  const homeB = encryptedHome(t);
  const serverA = MOD.viewServerCore(homeA, 0, '127.0.0.1');
  closeServer(t, serverA);
  const port = await listen(serverA);

  const different = await runAsync(['view', '--port', String(port)], homeB);
  assert.notStrictEqual(different.status, 0);
  assert.match(different.stdout + different.stderr, /memory_home|rootId|无法复用|另一个/);

  const same = await runAsync(['view', '--port', String(port)], homeA);
  assert.strictEqual(same.status, 0, same.stderr || same.stdout);
  assert.match(same.stdout, /已在运行/);
});

test('view refuses to reuse an older view server without a root fingerprint', async (t) => {
  const home = encryptedHome(t);
  const legacy = http.createServer((req, res) => {
    const body = JSON.stringify({ encrypted: true, unlocked: false, version: '0.16.6' });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    legacy.once('error', reject);
    legacy.listen(0, '127.0.0.1', resolve);
  });
  closeServer(t, legacy);

  const result = await runAsync(['view', '--port', String(legacy.address().port)], home);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /rootId|旧版本|无法复用|memory_home/);
});
