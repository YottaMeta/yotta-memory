'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function entriesFixture() {
  return [
    {
      file: 'facts/2026/11/2026-11-11-0001.md',
      type: 'FACT',
      subject: 'v5 索引',
      statement: 'gzip 年份分片读写回归',
      confidence: 1,
      created: '2026-11-11',
      updated: '2026-11-11',
      tags: ['index', 'v5'],
      immutable: false,
      scope: 'public',
      owner: '',
      source: 'test',
      weight: 1,
      access_count: 1,
      last_accessed: '2026-11-11',
      feedback_net: 0,
      hit_days: '',
      hit_queries: '',
      tokens: { '索引': 1, 'py:suoyin': 0.4 },
    },
    {
      file: 'facts/2025/12/2025-12-01-0001.md',
      type: 'FACT',
      subject: '旧年份',
      statement: '保留 v4 分片兼容',
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
      tokens: { '旧年份': 1 },
    },
  ];
}

function writeV5(root, entries) {
  memory.saveIndex(root, entries, {
    shardThresholdEntries: 1,
    compressThresholdBytes: 0,
    compress: true,
  });
  return JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
}

function writeEntryFile(root, entry) {
  const full = path.join(root, entry.file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, [
    '---',
    'type: ' + entry.type,
    'subject: ' + entry.subject,
    'statement: ' + entry.statement,
    'confidence: ' + entry.confidence,
    'created: ' + entry.created,
    'updated: ' + entry.updated,
    'tags: ' + JSON.stringify(entry.tags),
    'immutable: ' + entry.immutable,
    'scope: ' + entry.scope,
    'owner: ' + entry.owner,
    'source: ' + entry.source,
    'weight: ' + entry.weight,
    'access_count: ' + entry.access_count,
    'last_accessed: ' + entry.last_accessed,
    'feedback_net: ' + entry.feedback_net,
    'hit_days: ' + entry.hit_days,
    'hit_queries: ' + entry.hit_queries,
    '---',
    '',
    entry.statement,
    '',
  ].join('\n'), 'utf8');
}

function readGzipShard(root, name) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, name))).toString('utf8'));
}

function withEnv(root, fn) {
  const configDir = tmpdir('ytm-index-v5-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfig = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(configDir);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfig === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfig;
  }
}

test('index v5 writes gzip year shards and loadIndex round-trips them', () => {
  const root = tmpdir('ytm-index-v5-write-');
  const entries = entriesFixture();

  const manifest = writeV5(root, entries);

  assert.strictEqual(manifest.version, 5);
  assert.deepStrictEqual(manifest.shards, ['index-2025.json.gz', 'index-2026.json.gz']);
  assert.strictEqual(manifest.count, 2);
  for (const name of manifest.shards) {
    assert.ok(fs.existsSync(path.join(root, name)));
    const shard = readGzipShard(root, name);
    assert.strictEqual(shard.version, 5);
    assert.ok(Array.isArray(shard.entries));
  }
  assert.deepStrictEqual(memory.loadIndex(root), [entries[1], entries[0]]);
});

test('loadIndexFor reads only the requested gzip shard', () => {
  const root = tmpdir('ytm-index-v5-lazy-');
  writeV5(root, entriesFixture());
  const reads = [];
  const original = fs.readFileSync;
  fs.readFileSync = function (target) {
    reads.push(String(target));
    return original.apply(fs, arguments);
  };
  let entries = null;
  try {
    entries = memory.loadIndexFor(root, { years: ['2026'] });
  } finally {
    fs.readFileSync = original;
  }
  assert.deepStrictEqual(entries.map((item) => item.created.slice(0, 4)), ['2026']);
  const names = reads.map((item) => path.basename(item)).filter((name) => name.indexOf('index') === 0).sort();
  assert.deepStrictEqual(names, ['index-2026.json.gz', 'index.json']);
});

test('touchIndex updates and recompresses only the matching gzip shard', () => {
  const root = tmpdir('ytm-index-v5-touch-');
  const manifest = writeV5(root, entriesFixture());
  const untouchedName = manifest.shards.filter((name) => name !== 'index-2026.json.gz')[0];
  const untouchedPath = path.join(root, untouchedName);
  const untouched = fs.readFileSync(untouchedPath);

  memory.touchIndex(root, ['facts/2026/11/2026-11-11-0001.md'], { years: ['2026'] });

  assert.deepStrictEqual(fs.readFileSync(untouchedPath), untouched);
  const updated = readGzipShard(root, 'index-2026.json.gz').entries[0];
  assert.strictEqual(updated.access_count, 2);
  assert.match(updated.last_accessed, /^\d{4}-\d{2}-\d{2}$/);
});

test('indexFingerprint includes gzip shard bytes', () => {
  const root = tmpdir('ytm-index-v5-fingerprint-');
  writeV5(root, entriesFixture());
  const before = memory.indexFingerprint(root);
  assert.strictEqual(before.files, 3);
  const shard = path.join(root, 'index-2026.json.gz');
  const data = zlib.gunzipSync(fs.readFileSync(shard));
  const parsed = JSON.parse(data.toString('utf8'));
  parsed.entries[0].access_count = 99;
  fs.writeFileSync(shard, zlib.gzipSync(Buffer.from(JSON.stringify(parsed), 'utf8')));
  const after = memory.indexFingerprint(root);
  assert.notStrictEqual(after.sha256, before.sha256);
  assert.strictEqual(after.files, 3);
});

test('v4 shard manifests remain readable after the v5 upgrade', () => {
  const root = tmpdir('ytm-index-v5-v4-compat-');
  const entries = entriesFixture();
  fs.writeFileSync(path.join(root, 'index-2025.json'), JSON.stringify({ version: 4, year: 2025, entries: [entries[1]] }), 'utf8');
  fs.writeFileSync(path.join(root, 'index-2026.json'), JSON.stringify({ version: 4, year: 2026, entries: [entries[0]] }), 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    shards: ['index-2025.json', 'index-2026.json'],
    count: 2,
  }), 'utf8');

  assert.deepStrictEqual(memory.loadIndex(root), [entries[1], entries[0]]);
  assert.deepStrictEqual(memory.loadIndexFor(root, { years: ['2025'] }), [entries[1]]);
});

test('saveIndex v5 removes superseded v4 shard files', () => {
  const root = tmpdir('ytm-index-v5-cleanup-');
  const oldShard = path.join(root, 'index-2025.json');
  fs.writeFileSync(oldShard, JSON.stringify({ version: 4, year: 2025, entries: [] }), 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    shards: ['index-2025.json'],
    count: 0,
  }), 'utf8');

  writeV5(root, entriesFixture());

  assert.strictEqual(fs.existsSync(oldShard), false);
  assert.ok(fs.existsSync(path.join(root, 'index-2025.json.gz')));
});

test('a corrupted gzip shard fails closed instead of returning partial entries', () => {
  const root = tmpdir('ytm-index-v5-corrupt-');
  writeV5(root, entriesFixture());
  fs.writeFileSync(path.join(root, 'index-2026.json.gz'), 'not-gzip', 'utf8');

  assert.strictEqual(memory.loadIndex(root), null);
  assert.strictEqual(memory.loadIndexFor(root, { years: ['2026'] }), null);
});

test('doctor exposes v5 storage bytes, logical bytes, shard count and format', () => {
  const root = tmpdir('ytm-index-v5-doctor-');
  const entries = entriesFixture();
  for (const entry of entries) writeEntryFile(root, entry);
  writeV5(root, entries);
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  withEnv(root, () => {
    memory.saveConfig({
      memory_home: root,
      backup_setup_choice: 'manual',
      backup_enabled: false,
    });
    const report = memory.doctorCore({ root });
    assert.ok(report.checks.scale);
    assert.strictEqual(report.checks.scale.index_format, 'gzip-year');
    assert.strictEqual(report.checks.scale.index_shards, 2);
    assert.ok(report.checks.scale.index_bytes > 0);
    assert.ok(report.checks.scale.index_logical_bytes > 0);
  });
});

test('backup includes v5 gzip index shards', () => {
  const root = tmpdir('ytm-index-v5-backup-');
  const backupDir = tmpdir('ytm-index-v5-backup-dest-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', 'fact.md'), 'fact\n', 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  writeV5(root, entriesFixture());

  const created = memory.backupCreateCore({
    root,
    dir: backupDir,
    allowSameVolume: true,
    now: '2026-11-11T14:00:00.000Z',
  });

  assert.strictEqual(created.error, false, created.text);
  assert.ok(fs.existsSync(path.join(created.path, 'index-2025.json.gz')));
  assert.ok(fs.existsSync(path.join(created.path, 'index-2026.json.gz')));
});
