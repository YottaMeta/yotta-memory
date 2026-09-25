'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-lazy-store-');
  const configDir = tmpdir('ytm-lazy-config-');
  const agentHome = tmpdir('ytm-lazy-home-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  const oldAgentHome = process.env.YOTTA_MEMORY_AGENT_HOME;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
    if (oldAgentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME;
    else process.env.YOTTA_MEMORY_AGENT_HOME = oldAgentHome;
  }
}

function runCli(root, args) {
  return childProcess.spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root }),
  });
}

function writeYearlyFacts(root) {
  const years = ['2024', '2025', '2026'];
  for (const year of years) {
    const written = memory.rememberCore('FACT', '年度记忆' + year, '年度分层检索样例 ' + year, {
      _today: year + '-05-06',
    });
    assert.strictEqual(written.error, false, written.text);
  }
}

// 把平铺 index.json 拆成 index-<year>.json 分片，模拟触发分片阈值的真实大库形态。
function shardIndexByYear(root) {
  const entries = memory.getIndex(root);
  const byYear = {};
  for (const entry of entries) {
    const year = String(entry.created || '').slice(0, 4) || '2026';
    (byYear[year] = byYear[year] || []).push(entry);
  }
  const shards = [];
  for (const year of Object.keys(byYear).sort()) {
    const name = 'index-' + year + '.json';
    fs.writeFileSync(path.join(root, name), JSON.stringify({ version: 4, year: parseInt(year, 10), entries: byYear[year] }, null, 2), 'utf8');
    shards.push(name);
  }
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 4, updated: '2026-09-25', shards: shards, count: entries.length }, null, 2), 'utf8');
  return shards;
}

test('loadIndexFor only reads the shards covering the requested years', () => {
  withStore((root) => {
    writeYearlyFacts(root);
    const shards = shardIndexByYear(root);
    assert.deepStrictEqual(shards, ['index-2024.json', 'index-2025.json', 'index-2026.json']);

    const reads = [];
    const original = fs.readFileSync;
    fs.readFileSync = function (target) {
      reads.push(String(target));
      return original.apply(fs, arguments);
    };
    let entries = null;
    try {
      entries = memory.loadIndexFor(root, { years: ['2025'] });
    } finally {
      fs.readFileSync = original;
    }

    assert.ok(Array.isArray(entries), 'loadIndexFor must return entries');
    assert.deepStrictEqual(entries.map((e) => String(e.created).slice(0, 4)), ['2025']);
    const readNames = reads
      .map((p) => path.basename(p))
      .filter((name) => name.indexOf('index') === 0)
      .sort();
    assert.deepStrictEqual(readNames, ['index-2025.json', 'index.json']);
  });
});

test('loadIndexFor keeps full-load behaviour when no year is requested', () => {
  withStore((root) => {
    writeYearlyFacts(root);
    const flat = JSON.stringify(memory.loadIndex(root));
    assert.strictEqual(JSON.stringify(memory.loadIndexFor(root, {})), flat);
    assert.strictEqual(JSON.stringify(memory.loadIndexFor(root, { years: [] })), flat);

    shardIndexByYear(root);
    assert.strictEqual(JSON.stringify(memory.loadIndexFor(root, { years: [] })), flat);
    assert.strictEqual(JSON.stringify(memory.loadIndexFor(root, null)), flat);
  });
});

test('loadIndexFor filters an inline index without rebuilding it', () => {
  withStore((root) => {
    writeYearlyFacts(root);
    const before = fs.readFileSync(path.join(root, 'index.json'), 'utf8');
    const entries = memory.loadIndexFor(root, { years: ['2024', '2026'] });
    assert.deepStrictEqual(
      entries.map((e) => String(e.created).slice(0, 4)).sort(),
      ['2024', '2026']
    );
    assert.strictEqual(fs.readFileSync(path.join(root, 'index.json'), 'utf8'), before);
  });
});

test('recallCore honours the year filter on sharded stores', () => {
  withStore((root) => {
    writeYearlyFacts(root);
    shardIndexByYear(root);
    const otherShards = ['index-2024.json', 'index-2026.json'].map((name) => fs.readFileSync(path.join(root, name), 'utf8'));
    const result = memory.recallCore('年度分层检索样例', { years: ['2025'] });
    assert.strictEqual(result.error, false, result.text);
    const files = (result.entries || []).map((e) => e.file);
    assert.strictEqual(files.length, 1, result.text);
    assert.match(files[0], /2025/);
    // 命中回写访问计数时也只能碰命中的分片，其它年份索引逐字节不变
    assert.deepStrictEqual(
      ['index-2024.json', 'index-2026.json'].map((name) => fs.readFileSync(path.join(root, name), 'utf8')),
      otherShards
    );
  });
});

test('recall and context accept --year on the command line', () => {
  withStore((root) => {
    writeYearlyFacts(root);

    const single = runCli(root, ['recall', '年度分层检索样例', '--year', '2025']);
    assert.strictEqual(single.status, 0, single.stderr);
    assert.match(single.stdout, /年度记忆2025/);
    assert.doesNotMatch(single.stdout, /年度记忆2024/);
    assert.doesNotMatch(single.stdout, /年度记忆2026/);

    const multi = runCli(root, ['recall', '年度分层检索样例', '--year', '2024', '--year', '2026']);
    assert.strictEqual(multi.status, 0, multi.stderr);
    assert.match(multi.stdout, /年度记忆2024/);
    assert.match(multi.stdout, /年度记忆2026/);
    assert.doesNotMatch(multi.stdout, /年度记忆2025/);

    const ctx = runCli(root, ['context', '--agent', 'codex', '--year', '2025']);
    assert.strictEqual(ctx.status, 0, ctx.stderr);
    assert.match(ctx.stdout, /年度记忆2025/);
    assert.doesNotMatch(ctx.stdout, /年度记忆2024/);
    assert.doesNotMatch(ctx.stdout, /年度记忆2026/);

    const bad = runCli(root, ['recall', '年度分层检索样例', '--year', '26']);
    assert.strictEqual(bad.status, 2);
    assert.match(bad.stderr + bad.stdout, /年份/);
  });
});
