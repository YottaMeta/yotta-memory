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
  const root = tmpdir('ytm-index-stats-store-');
  const configDir = tmpdir('ytm-index-stats-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  try {
    return fn(root, configDir);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
  }
}

function entriesFixture() {
  return [
    {
      file: 'facts/2026/11/2026-11-11-0001.md',
      type: 'FACT',
      subject: '元忆索引统计',
      statement: '这是一条用于统计 tokens 和 statement 字段体积的记忆。',
      confidence: 1,
      created: '2026-11-11',
      updated: '2026-11-11',
      tags: ['index', 'stats'],
      immutable: false,
      scope: 'public',
      owner: '',
      source: 'test',
      weight: 1,
      access_count: 2,
      last_accessed: '2026-11-11T10:00:00.000Z',
      feedback_net: 1,
      hit_days: 's2026-11-11:2',
      hit_queries: 'q1234abcd:2',
      tokens: { '元忆': 2, '索引': 1, 'py:yuanyi': 0.4, 'pyi:yy': 0.4 },
    },
    {
      file: 'facts/2025/12/2025-12-01-0001.md',
      type: 'FACT',
      subject: '旧条目',
      statement: '跨年份分片统计样例。',
      confidence: 1,
      created: '2025-12-01',
      updated: '2025-12-01',
      tags: ['index'],
      immutable: false,
      scope: 'public',
      owner: '',
      source: 'test',
      weight: 1,
      access_count: 0,
      last_accessed: '',
      feedback_net: 0,
      hit_days: '',
      hit_queries: '',
      tokens: { '旧条目': 1, '统计': 1 },
    },
  ];
}

function writeInlineIndex(root, entries) {
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    updated: '2026-11-11',
    entries: entries,
  }, null, 2), 'utf8');
}

function runCli(root, configDir, args) {
  return childProcess.spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      YOTTA_MEMORY_HOME: root,
      YOTTA_MEMORY_CONFIG_DIR: configDir,
    }),
  });
}

test('index stats reports inline field bytes, token counts and gzip projection without writing', () => {
  withStore((root, configDir) => {
    const entries = entriesFixture();
    writeInlineIndex(root, entries);
    const indexPath = path.join(root, 'index.json');
    const beforeBytes = fs.readFileSync(indexPath);
    const beforeMtime = fs.statSync(indexPath).mtimeMs;
    const beforeFiles = fs.readdirSync(root).sort();

    const stats = memory.indexStatsCore({ root });

    assert.strictEqual(stats.error, false, stats.text);
    assert.strictEqual(stats.format, 'inline');
    assert.strictEqual(stats.version, 4);
    assert.strictEqual(stats.entryCount, 2);
    assert.strictEqual(stats.shardCount, 0);
    assert.strictEqual(stats.storageBytes, beforeBytes.length);
    assert.strictEqual(stats.logicalBytes, Buffer.byteLength(JSON.stringify(entries)));
    assert.ok(stats.fieldBytes.tokens > 0);
    assert.ok(stats.fieldBytes.statement > 0);
    assert.ok(stats.fieldBytes.usage > 0);
    assert.strictEqual(stats.tokens.unique, 6);
    assert.strictEqual(stats.tokens.weighted, 5.8);
    assert.strictEqual(stats.tokens.pinyin, 2);
    assert.strictEqual(stats.tokens.averageUniquePerEntry, 3);
    assert.ok(stats.gzipProjection.storageBytes > 0);
    assert.ok(stats.gzipProjection.storageBytes < stats.storageBytes);
    assert.deepStrictEqual(stats.gzipProjection.shards.map((item) => item.year), ['2025', '2026']);

    assert.deepStrictEqual(fs.readFileSync(indexPath), beforeBytes);
    assert.strictEqual(fs.statSync(indexPath).mtimeMs, beforeMtime);
    assert.deepStrictEqual(fs.readdirSync(root).sort(), beforeFiles);

    const cli = runCli(root, configDir, ['index', '--stats', '--json']);
    assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
    const parsed = JSON.parse(cli.stdout);
    assert.strictEqual(parsed.entryCount, 2);
    assert.strictEqual(parsed.format, 'inline');
    assert.deepStrictEqual(fs.readFileSync(indexPath), beforeBytes);
  });
});

test('index stats reads sharded manifests and projects gzip per year without rebuilding', () => {
  withStore((root) => {
    const entries = entriesFixture();
    fs.writeFileSync(path.join(root, 'index-2025.json'), JSON.stringify({
      version: 4,
      year: 2025,
      entries: [entries[1]],
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, 'index-2026.json'), JSON.stringify({
      version: 4,
      year: 2026,
      entries: [entries[0]],
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
      version: 4,
      updated: '2026-11-11',
      count: 2,
      shards: ['index-2025.json', 'index-2026.json'],
    }, null, 2), 'utf8');
    const beforeFiles = fs.readdirSync(root).sort();
    const before = beforeFiles.map((name) => fs.readFileSync(path.join(root, name)));

    const stats = memory.indexStatsCore({ root });

    assert.strictEqual(stats.error, false, stats.text);
    assert.strictEqual(stats.format, 'sharded');
    assert.strictEqual(stats.entryCount, 2);
    assert.strictEqual(stats.shardCount, 2);
    assert.deepStrictEqual(stats.gzipProjection.shards.map((item) => item.year), ['2025', '2026']);
    assert.deepStrictEqual(fs.readdirSync(root).sort(), beforeFiles);
    for (let i = 0; i < beforeFiles.length; i++) {
      assert.deepStrictEqual(fs.readFileSync(path.join(root, beforeFiles[i])), before[i]);
    }
  });
});

test('index command requires --stats and never treats it as reindex', () => {
  withStore((root, configDir) => {
    writeInlineIndex(root, entriesFixture());
    const result = runCli(root, configDir, ['index']);
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr + result.stdout, /--stats/);
  });
});
