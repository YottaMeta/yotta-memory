'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);
const PASS = 'test-pass-view-m1';

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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-view-m1-'));
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

async function unlockAndAuthorize(port) {
  const unlock = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(unlock.status, 200, JSON.stringify(unlock.data));
  const auth = await viewApi(port, '/api/authorize', { owner: 'codex' });
  assert.strictEqual(auth.status, 200, JSON.stringify(auth.data));
  return auth.data;
}

function walkFiles(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walkFiles(fp, out);
    else out.push(fp);
  }
  return out;
}

test('view M1 endpoints require unlock', async (t) => {
  const ctx = await setup(t);
  const create = await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'a', statement: 'b' });
  assert.strictEqual(create.status, 401);
  const overview = await viewApi(ctx.port, '/api/overview', {});
  assert.strictEqual(overview.status, 401);
});

test('view M1 creates FACT + private PREF, lists them, encrypts private file', async (t) => {
  const ctx = await setup(t);
  await unlockAndAuthorize(ctx.port);

  const fact = await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'view-fact', statement: 'created via view' });
  assert.strictEqual(fact.status, 200, JSON.stringify(fact.data));
  const pref = await viewApi(ctx.port, '/api/memory/create', { type: 'PREF', owner: 'codex', subject: 'view-pref', statement: 'private via view' });
  assert.strictEqual(pref.status, 200, JSON.stringify(pref.data));
  const missingOwner = await viewApi(ctx.port, '/api/memory/create', { type: 'PREF', subject: 'x', statement: 'y' });
  assert.strictEqual(missingOwner.status, 400);

  const list = await viewApi(ctx.port, '/api/entries', { query: 'view-', limit: 50 });
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.data.count, 2);
  const listPref = await viewApi(ctx.port, '/api/entries', { query: 'view-', limit: 50, type: 'PREF' });
  assert.strictEqual(listPref.data.count, 1);

  const privateFiles = walkFiles(path.join(ctx.home, 'private'));
  assert.ok(privateFiles.some((fp) => fp.endsWith('.enc')), 'private entry should be encrypted on disk');

  const overview = await viewApi(ctx.port, '/api/overview', {});
  assert.strictEqual(overview.status, 200);
  assert.strictEqual(overview.data.total, 2);
  assert.strictEqual(overview.data.byType.FACT, 1);
  assert.strictEqual(overview.data.byType.PREF, 1);
});

test('view M1 updates FACT and private entries with undo history', async (t) => {
  const ctx = await setup(t);
  await unlockAndAuthorize(ctx.port);

  await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'upd-fact', statement: 'before' });
  const list1 = await viewApi(ctx.port, '/api/entries', { query: 'upd-fact' });
  const factFile = list1.data.entries[0].file;
  const upd = await viewApi(ctx.port, '/api/memory/update', { file: factFile, statement: 'after', tags: ['view', 'm1'] });
  assert.strictEqual(upd.status, 200, JSON.stringify(upd.data));
  assert.ok(upd.data.undo && upd.data.undo.indexOf('.trash/view-history/') === 0);
  const list2 = await viewApi(ctx.port, '/api/entries', { query: 'after' });
  assert.strictEqual(list2.data.count, 1);
  const factText = fs.readFileSync(path.join(ctx.home, factFile), 'utf8');
  assert.match(factText, /after/);

  await viewApi(ctx.port, '/api/memory/create', { type: 'PREF', owner: 'codex', subject: 'upd-pref', statement: 'secret-before' });
  const list3 = await viewApi(ctx.port, '/api/entries', { query: 'upd-pref' });
  const prefFile = list3.data.entries[0].file;
  const upd2 = await viewApi(ctx.port, '/api/memory/update', { file: prefFile, statement: 'secret-after' });
  assert.strictEqual(upd2.status, 200, JSON.stringify(upd2.data));
  const list4 = await viewApi(ctx.port, '/api/entries', { query: 'secret-after' });
  assert.strictEqual(list4.data.count, 1);

  const trash = await viewApi(ctx.port, '/api/trash', {});
  assert.ok(trash.data.entries.some((e) => e.kind === 'history'));
});

test('view M1 deletes to trash and restores', async (t) => {
  const ctx = await setup(t);
  await unlockAndAuthorize(ctx.port);

  await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'del-fact', statement: 'to be deleted' });
  const list = await viewApi(ctx.port, '/api/entries', { query: 'del-fact' });
  const file = list.data.entries[0].file;
  const del = await viewApi(ctx.port, '/api/memory/delete', { file: file });
  assert.strictEqual(del.status, 200, JSON.stringify(del.data));
  assert.ok(del.data.trash && del.data.trash.indexOf('.trash/') === 0);
  const after = await viewApi(ctx.port, '/api/entries', { query: 'del-fact' });
  assert.strictEqual(after.data.count, 0);

  const restore = await viewApi(ctx.port, '/api/memory/restore', { ref: del.data.trash });
  assert.strictEqual(restore.status, 200, JSON.stringify(restore.data));
  const back = await viewApi(ctx.port, '/api/entries', { query: 'del-fact' });
  assert.strictEqual(back.data.count, 1);
});

test('view M1 archives (hidden) and unarchives', async (t) => {
  const ctx = await setup(t);
  await unlockAndAuthorize(ctx.port);

  await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'hide-fact', statement: 'to be hidden' });
  const list = await viewApi(ctx.port, '/api/entries', { query: 'hide-fact' });
  const file = list.data.entries[0].file;
  const arch = await viewApi(ctx.port, '/api/memory/archive', { file: file });
  assert.strictEqual(arch.status, 200, JSON.stringify(arch.data));
  assert.ok(arch.data.archive && arch.data.archive.indexOf('.archive/') === 0);
  const after = await viewApi(ctx.port, '/api/entries', { query: 'hide-fact' });
  assert.strictEqual(after.data.count, 0);

  const archived = await viewApi(ctx.port, '/api/archived', {});
  assert.ok(archived.data.entries.some((e) => e.ref === arch.data.archive));
  const un = await viewApi(ctx.port, '/api/memory/unarchive', { archive: arch.data.archive });
  assert.strictEqual(un.status, 200, JSON.stringify(un.data));
  const back = await viewApi(ctx.port, '/api/entries', { query: 'hide-fact' });
  assert.strictEqual(back.data.count, 1);
});

test('view M1 blocks cross-origin requests', async (t) => {
  const ctx = await setup(t);
  const r = await viewApi(ctx.port, '/api/status', {}, { Origin: 'http://evil.example' });
  assert.strictEqual(r.status, 403);
});

test('view M1 preserves tags on rewrite and repairs legacy escaping', async (t) => {
  const ctx = await setup(t);
  const auth = await unlockAndAuthorize(ctx.port);

  const create = await viewApi(ctx.port, '/api/memory/create', { type: 'FACT', subject: 'tag-stable', statement: 'v1', tags: ['验收', 'M1'] });
  assert.strictEqual(create.status, 200, JSON.stringify(create.data));
  const list = await viewApi(ctx.port, '/api/entries', { query: 'tag-stable' });
  const file = list.data.entries[0].file;
  const abs = path.join(ctx.home, file);
  const readTags = () => (fs.readFileSync(abs, 'utf8').match(/^tags: (.*)$/m) || [])[1];
  assert.strictEqual(readTags(), '["验收","M1"]');

  const upd = await viewApi(ctx.port, '/api/memory/update', { file: file, statement: 'v2' });
  assert.strictEqual(upd.status, 200, JSON.stringify(upd.data));
  assert.strictEqual(readTags(), '["验收","M1"]', 'update without tags must keep the tags line unchanged');
  const list2 = await viewApi(ctx.port, '/api/entries', { query: 'tag-stable' });
  assert.deepStrictEqual(list2.data.entries[0].tags, ['验收', 'M1']);

  const recall = run(['recall', 'tag-stable', '--agent', 'codex', '--agent-key', auth.agentKey], ctx.home);
  assert.strictEqual(recall.status, 0, recall.stderr || recall.stdout);
  assert.strictEqual(readTags(), '["验收","M1"]', 'read-tracking rewrite must not touch tags');

  let text = fs.readFileSync(abs, 'utf8');
  text = text.replace(/^tags: .*$/m, 'tags: [\\"验收\\",\\"M1\\"]');
  fs.writeFileSync(abs, text, 'utf8');
  const upd2 = await viewApi(ctx.port, '/api/memory/update', { file: file, statement: 'v3' });
  assert.strictEqual(upd2.status, 200, JSON.stringify(upd2.data));
  assert.strictEqual(readTags(), '["验收","M1"]', 'legacy escaped tags must be repaired on next rewrite');
});
