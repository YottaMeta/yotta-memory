'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-view-cli';

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-view-cli-'));
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

async function viewApi(port, pathname, body, headers) {
  const res = await fetch('http://127.0.0.1:' + port + pathname, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  return { status: res.status, data: data };
}

async function setup(t) {
  const home = tmpHome(t);
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const server = MOD.viewServerCore(home, 0, '127.0.0.1');
  t.after(() => closeServer(server));
  const port = await listenLocal(server);
  return { home, port };
}

async function unlock(port) {
  const r = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
}

const QUICK_GROUPS = ['核心记忆', '身份与画像', '加密与安全', '平台与服务'];

function findHelpEntry(groups, ref) {
  const seg = String(ref).split(' ');
  for (const g of groups) {
    for (const c of g.commands) {
      if (c.name !== seg[0]) continue;
      if (seg.length === 1) return c;
      for (const s of (c.subcommands || [])) if (s.name === seg[1]) return s;
    }
  }
  return null;
}

test('view CLI help endpoint requires unlock', async (t) => {
  const ctx = await setup(t);
  const r = await viewApi(ctx.port, '/api/help', {});
  assert.strictEqual(r.status, 401);
});

test('view CLI help serves HELP_MODEL and a drift-free quick reference', async (t) => {
  const ctx = await setup(t);
  await unlock(ctx.port);
  const r = await viewApi(ctx.port, '/api/help', {});
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.version, MOD.VERSION);
  assert.ok(Array.isArray(MOD.VIEW_HELP_QUICK), 'VIEW_HELP_QUICK must be exported as an array');
  assert.deepStrictEqual(r.data.groups, JSON.parse(JSON.stringify(MOD.HELP_MODEL)));
  assert.deepStrictEqual(r.data.quick, JSON.parse(JSON.stringify(MOD.VIEW_HELP_QUICK)));

  const groups = r.data.quick;
  assert.deepStrictEqual(groups.map((g) => g.group), QUICK_GROUPS);
  const seen = new Set();
  for (const g of groups) {
    assert.ok(g.items.length >= 2, g.group + ' needs at least 2 quick items');
    for (const item of g.items) {
      const target = findHelpEntry(r.data.groups, item.cmd);
      assert.ok(target, 'quick item must reference a real command/subcommand: ' + item.cmd);
      assert.match(item.example, /^yotta-memory /, 'example must be a runnable CLI line: ' + item.example);
      assert.ok(!seen.has(item.example), 'duplicate example: ' + item.example);
      seen.add(item.example);
      if (item.danger) assert.ok(item.note && item.note.length > 0, 'danger item needs a note: ' + item.cmd);
    }
  }
  const covered = new Set();
  for (const g of groups) for (const item of g.items) covered.add(item.cmd);
  for (const g of r.data.groups) {
    for (const c of g.commands) {
      assert.ok(covered.has(c.name), 'quick list must cover command: ' + c.name);
      for (const s of (c.subcommands || [])) {
        assert.ok(covered.has(c.name + ' ' + s.name), 'quick list must cover subcommand: ' + c.name + ' ' + s.name);
      }
    }
  }
});

test('view CLI page ships nav, quick list, lazy full help and copy affordances', () => {
  const html = MOD.viewHtml();
  assert.match(html, /data-view="cli"/);
  assert.match(html, /高级 \/ CLI/);
  assert.match(html, /id="view-cli"/);
  assert.match(html, /id="cliQuick"/);
  assert.match(html, /id="btnFullHelp"/);
  assert.match(html, /id="cliFull"/);
  assert.match(html, /copy-btn/);
  assert.match(html, /data-copy/);
  assert.match(html, /findHelpEntry/);
});

test('view CLI surface stays read-only (no execute endpoint)', async (t) => {
  const ctx = await setup(t);
  await unlock(ctx.port);
  const exec1 = await viewApi(ctx.port, '/api/help/execute', { cmd: 'doctor' });
  assert.strictEqual(exec1.status, 404);
  const exec2 = await viewApi(ctx.port, '/api/execute', { cmd: 'doctor' });
  assert.strictEqual(exec2.status, 404);
});
