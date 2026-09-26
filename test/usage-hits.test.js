'use strict';
// v0.18.0 A3: usage hit signals (search/get/use) regression tests.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'usage-test-pass-2026-09-26';

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function todayStr() {
  return ymd(new Date());
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

function cleanEnv(root, configDir, agentHome) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  env.YOTTA_MEMORY_HOME = root;
  env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  return env;
}

function withStore(fn) {
  const root = tmpdir('ytm-usage-store-');
  const configDir = tmpdir('ytm-usage-config-');
  const agentHome = tmpdir('ytm-usage-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
    envAgent: process.env.YOTTA_AGENT_ID,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  delete process.env.YOTTA_AGENT_ID;
  try {
    return fn(root, configDir, agentHome);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
    if (saved.envAgent !== undefined) process.env.YOTTA_AGENT_ID = saved.envAgent;
  }
}

function parseMeta(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return meta;
}

function entryFiles(root) {
  return memory.collectEntryFiles(root);
}

function onlyEntry(root) {
  const files = entryFiles(root);
  assert.strictEqual(files.length, 1, 'expected exactly one memory file');
  return files[0];
}

function readMeta(fp) {
  return parseMeta(fs.readFileSync(fp, 'utf8'));
}

function readIndexEntries(root) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
  return Array.isArray(raw.entries) ? raw.entries : [];
}

test('recall records search hits and query fingerprints without storing query text', () => {
  withStore((root) => {
    const w = memory.rememberCore('FACT', '命中统计种子', '用于验证搜索命中打点', { _today: todayStr() });
    assert.strictEqual(w.error, false, w.text);
    const r = memory.recallCore('命中统计种子', { agent: 'codex', limit: 10 });
    assert.strictEqual(r.exitCode, 0, r.text);
    assert.ok(r.entries && r.entries.length === 1, r.text);

    const fp = onlyEntry(root);
    const meta = readMeta(fp);
    assert.match(meta.hit_days, new RegExp('s' + todayStr() + ':1'), 'search hit must be recorded');
    assert.match(meta.hit_queries, /^q[0-9a-f]{8}:1$/, 'query fingerprint must be recorded');
    const usageFields = String(meta.hit_days || '') + ' ' + String(meta.hit_queries || '');
    assert.ok(usageFields.indexOf('命中统计种子') === -1, 'raw query text must never be stored in usage fields');

    memory.recallCore('命中统计种子', { agent: 'codex', limit: 10 });
    const meta2 = readMeta(fp);
    assert.match(meta2.hit_days, new RegExp('s' + todayStr() + ':2'), 'same-day search hits must accumulate');
    assert.match(meta2.hit_queries, /^q[0-9a-f]{8}:2$/, 'same query fingerprint must accumulate');

    const idx = readIndexEntries(root);
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    const entry = idx.find((e) => e.file === rel);
    assert.ok(entry, 'index entry must exist after recall');
    assert.strictEqual(entry.hit_days, meta2.hit_days, 'root index must stay in sync with hit_days');
  });
});

test('--no-usage and usage_enabled=false both disable hit writes', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '关闭打点种子', '关闭开关后不应写命中统计', { _today: todayStr() });
    memory.recallCore('关闭打点种子', { agent: 'codex', noUsage: true });
    const fp = onlyEntry(root);
    assert.strictEqual(readMeta(fp).hit_days, undefined, '--no-usage must not write hit_days');

    memory.saveConfig(Object.assign({}, memory.loadConfig(), { usage_enabled: false }));
    memory.recallCore('关闭打点种子', { agent: 'codex' });
    assert.strictEqual(readMeta(fp).hit_days, undefined, 'usage_enabled=false must not write hit_days');

    memory.saveConfig(Object.assign({}, memory.loadConfig(), { usage_enabled: true }));
    memory.recallCore('关闭打点种子', { agent: 'codex' });
    assert.match(readMeta(fp).hit_days, new RegExp('s' + todayStr() + ':1'), 're-enabling must record hits again');
  });
});

test('explain records a get hit and feedback --useful records a use hit', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '读写信号种子', 'get 与 use 信号分别落盘', { _today: todayStr() });
    const fp = onlyEntry(root);
    const ref = path.basename(fp);

    const ex = memory.explainCore(ref, { agent: 'codex' });
    assert.strictEqual(ex.error, false, ex.text);
    assert.match(readMeta(fp).hit_days, new RegExp('g' + todayStr() + ':1'), 'explain must record get signal');

    const fb = memory.feedbackCore(ref, { selfAgent: 'codex', useful: true });
    assert.strictEqual(fb.error, false, fb.text);
    const meta = readMeta(fp);
    assert.match(meta.hit_days, new RegExp('g' + todayStr() + ':1'), 'get signal must survive feedback write');
    assert.match(meta.hit_days, new RegExp('u' + todayStr() + ':1'), 'feedback --useful must record use signal');
  });
});

test('context records use signals for included entries and honors --no-usage', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '上下文命中甲', '进入开工上下文包的条目', { _today: todayStr() });
    memory.rememberCore('FACT', '上下文命中乙', '同样进入开工上下文包的条目', { _today: todayStr() });
    const r = memory.contextCore({ selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    for (const fp of entryFiles(root)) {
      assert.match(readMeta(fp).hit_days, new RegExp('u' + todayStr() + ':1'), 'context inclusion must record use signal');
    }

    memory.rememberCore('FACT', '上下文关闭种子', '关闭打点时不记录 use', { _today: todayStr() });
    memory.contextCore({ selfAgent: 'codex', noUsage: true });
    const fp3 = entryFiles(root).filter((fp) => fs.readFileSync(fp, 'utf8').includes('上下文关闭种子'))[0];
    assert.strictEqual(readMeta(fp3).hit_days, undefined, 'context --no-usage must not write hit_days');
  });
});

test('cross-owner private hits are skipped (fail-closed)', () => {
  withStore((root) => {
    memory.rememberCore('PREF', '他者私密命中', 'alice 的私密命中种子不应被写入', {
      owner: 'alice', selfAgent: 'codex', unsafe: true, _today: todayStr(),
    });
    const r = memory.recallCore('私密命中种子', { agent: 'codex', unsafe: true, limit: 10 });
    assert.strictEqual(r.exitCode, 0, r.text);
    assert.ok(r.entries && r.entries.length === 1, r.text);
    const fp = onlyEntry(root);
    assert.strictEqual(readMeta(fp).hit_days, undefined, 'cross-owner private entry must not be written');
  });
});

test('bench stays read-only and never records usage hits', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '基准只读种子', 'bench 不得改写记忆文件', { _today: todayStr() });
    memory.benchCore({ seed: 20260926, bootstrap: 50 });
    const fp = onlyEntry(root);
    assert.strictEqual(readMeta(fp).hit_days, undefined, 'bench must not write hit_days');
  });
});

test('hit_days prunes slots older than the retention window', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '窗口裁剪种子', '旧于 90 天的命中槽应被裁掉', { _today: todayStr() });
    const fp = onlyEntry(root);
    const old = daysAgoStr(120);
    const patched = fs.readFileSync(fp, 'utf8').replace('\n---\n', '\nhit_days: s' + old + ':3|u' + todayStr() + ':1\n---\n');
    fs.writeFileSync(fp, patched, 'utf8');
    memory.recallCore('窗口裁剪种子', { agent: 'codex' });
    const meta = readMeta(fp);
    assert.ok(meta.hit_days.indexOf(old) === -1, 'expired hit day slots must be pruned');
    assert.match(meta.hit_days, new RegExp('u' + todayStr() + ':1'));
    assert.match(meta.hit_days, new RegExp('s' + todayStr() + ':1'));
  });
});

test('hit_queries honors usage_query_slots', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '槽位种子', '查询指纹槽位上限可配置', { _today: todayStr() });
    memory.saveConfig(Object.assign({}, memory.loadConfig(), { usage_query_slots: 2 }));
    memory.recallCore('槽位种子', { agent: 'codex' });
    memory.recallCore('槽位', { agent: 'codex' });
    memory.recallCore('种子', { agent: 'codex' });
    const fp = onlyEntry(root);
    const meta = readMeta(fp);
    const slots = String(meta.hit_queries || '').split('|').filter(Boolean);
    assert.strictEqual(slots.length, 2, 'query fingerprint slots must be capped at 2');
  });
});

test('encrypted private hits update the owner index in the same call', () => {
  const root = tmpdir('ytm-usage-enc-store-');
  const configDir = tmpdir('ytm-usage-enc-config-');
  const agentHome = tmpdir('ytm-usage-enc-home-');
  const env = cleanEnv(root, configDir, agentHome);
  const run = (args) => spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', env });

  const init = run(['init', '--password', PASS]);
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const bind = run(['key', 'bind', 'codex', '--password', PASS]);
  assert.strictEqual(bind.status, 0, bind.stderr || bind.stdout);
  const keyMatch = bind.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/);
  assert.ok(keyMatch, bind.stdout);
  const agentKey = keyMatch[1];

  const w = run(['remember', 'PREF', '加密命中种子', '私密打点应同步 owner index', '--agent', 'codex', '--agent-key', agentKey]);
  assert.strictEqual(w.status, 0, w.stderr || w.stdout);
  const r = run(['recall', '加密命中种子', '--agent', 'codex', '--agent-key', agentKey]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);

  const ownerKey = memory.getOwnerKeyFor(root, 'codex', { id: 'codex', agentKey: agentKey });
  assert.ok(ownerKey, 'owner key must unwrap for the bound agent');
  const idx = memory.loadOwnerIndex(root, 'codex', ownerKey);
  const entry = idx.find((e) => e.type === 'PREF');
  assert.ok(entry, 'owner index must contain the private entry');
  assert.match(entry.hit_days, new RegExp('s' + todayStr() + ':1'), 'owner index must be updated during recall');
});
