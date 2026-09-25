'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
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
  const root = tmpdir('ytm-bench-store-');
  const configDir = tmpdir('ytm-bench-config-');
  const agentHome = tmpdir('ytm-bench-home-');
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

function seedFacts(root) {
  const facts = [
    ['zebraalpha', '独角关键词只出现在这一条记忆里', '2026-09-01'],
    ['公交换乘备忘', '三号线换乘窗口在早高峰更稳', '2026-08-15'],
    ['发布检查清单', '推送前必须跑完整验证', '2026-07-20'],
    ['写作节奏', '长文先列提纲再展开', '2026-06-10'],
    ['备份策略', '每周演练一次恢复流程', '2026-05-05'],
    ['会议记录格式', '结论在前、证据在后', '2026-04-02'],
  ];
  const files = [];
  for (const [subject, statement, date] of facts) {
    const written = memory.rememberCore('FACT', subject, statement, { _today: date });
    assert.strictEqual(written.error, false, written.text);
  }
  // 记忆 id 用索引里的相对路径（与 --evalset 场景一致）
  return memory.getIndex(root).map((entry) => entry.file);
}

function indexEntriesOf(root) {
  return memory.getIndex(root);
}

function snapshotTree(root) {
  const out = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const fp = path.join(dir, name);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        walk(fp);
        continue;
      }
      out[path.relative(root, fp).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    }
  }
  walk(root);
  return out;
}

function writeEvalset(file, queries) {
  fs.writeFileSync(file, JSON.stringify({ version: 1, queries: queries }, null, 2), 'utf8');
  return file;
}

function benchJson(root, args) {
  const result = runCli(root, ['bench', '--json'].concat(args || []));
  return { result: result, payload: result.stdout ? JSON.parse(result.stdout) : null };
}

test('bench reports hand-checkable metrics for a known evalset', () => {
  withStore((root) => {
    const files = seedFacts(root);
    const evalset = writeEvalset(path.join(tmpdir('ytm-bench-evalset-'), 'evalset.json'), [
      { query: 'zebraalpha', expect: [files[0]] },
      { query: 'zzzz-no-such-token-zzzz', expect: [files[1]] },
    ]);

    const run = benchJson(root, ['--evalset', evalset, '--k', '1', '--bootstrap', '200']);
    assert.strictEqual(run.result.status, 0, run.result.stderr);
    const payload = run.payload;

    assert.strictEqual(payload.schemaVersion, 1);
    assert.strictEqual(payload.command, 'bench');
    assert.strictEqual(payload.version, memory.VERSION);
    assert.deepStrictEqual(payload.params, { k: 1, seed: 20260925, bootstrap: 200 });
    assert.strictEqual(payload.corpus.entries, 6);
    assert.strictEqual(payload.evalset.source, 'file');
    assert.strictEqual(payload.evalset.queries, 2);
    assert.match(payload.evalset.sha256, /^[0-9a-f]{64}$/);
    assert.match(payload.corpus.roots[0].index.sha256, /^[0-9a-f]{64}$/);
    assert.ok(payload.corpus.roots[0].index.bytes > 0);

    assert.strictEqual(payload.metrics.recallAtK, 0.5);
    assert.strictEqual(payload.metrics.mrr, 0.5);
    assert.strictEqual(payload.metrics.ndcgAtK, 0.5);
    assert.strictEqual(payload.metrics.hitRate, 0.5);
    assert.strictEqual(payload.metrics.ci95.mrr.length, 2);
    assert.strictEqual(payload.reproducible, true);
    assert.strictEqual(payload.level, 'ok');
  });
});

test('bench is reproducible and never writes to the memory store', () => {
  withStore((root) => {
    seedFacts(root);
    const before = snapshotTree(root);

    const first = runCli(root, ['bench', '--json']);
    const second = runCli(root, ['bench', '--json']);
    assert.strictEqual(first.status, 0, first.stderr);
    assert.strictEqual(second.status, 0, second.stderr);
    assert.strictEqual(first.stdout, second.stdout, 'same store + same params must produce identical output');
    assert.doesNotMatch(first.stdout, /"timestamp"|"elapsed"|"p50"/);

    const payload = JSON.parse(first.stdout);
    assert.strictEqual(payload.evalset.source, 'auto');
    assert.ok(payload.evalset.queries >= 1);
    assert.deepStrictEqual(payload.params, { k: 5, seed: 20260925, bootstrap: 1000 });

    assert.deepStrictEqual(snapshotTree(root), before, 'bench must be read-only');
  });
});

test('bench index fingerprint tracks the index bytes', () => {
  withStore((root) => {
    seedFacts(root);
    const payload = benchJson(root, []).payload;
    const indexBytes = fs.readFileSync(path.join(root, 'index.json'));
    const digest = crypto.createHash('sha256').update(indexBytes).digest('hex');
    const expected = crypto
      .createHash('sha256')
      .update('ytm-index-fingerprint-v1\nindex.json\n' + digest + '\n', 'utf8')
      .digest('hex');
    assert.strictEqual(payload.corpus.roots[0].index.sha256, expected);
    assert.strictEqual(payload.corpus.roots[0].index.bytes, indexBytes.length);
    assert.strictEqual(payload.corpus.roots[0].index.files, 1);

    const extra = memory.rememberCore('FACT', '追加记忆', '新增条目会改变索引字节', { _today: '2026-09-20' });
    assert.strictEqual(extra.error, false, extra.text);
    const after = benchJson(root, []).payload;
    assert.notStrictEqual(after.corpus.roots[0].index.sha256, payload.corpus.roots[0].index.sha256);
  });
});

test('bench gates fail the run without breaking the report', () => {
  withStore((root) => {
    const files = seedFacts(root);
    const evalset = writeEvalset(path.join(tmpdir('ytm-bench-gate-'), 'evalset.json'), [
      { query: 'zebraalpha', expect: [files[0]] },
      { query: 'zzzz-no-such-token-zzzz', expect: [files[1]] },
    ]);

    const failing = benchJson(root, ['--evalset', evalset, '--k', '1', '--gate', 'mrr=0.9']);
    assert.strictEqual(failing.result.status, 1, failing.result.stderr);
    assert.strictEqual(failing.payload.level, 'fail');
    assert.deepStrictEqual(failing.payload.gates, [{ metric: 'mrr', value: 0.9, actual: 0.5, pass: false }]);

    const passing = benchJson(root, ['--evalset', evalset, '--k', '1', '--gate', 'mrr=0.1', '--gate', 'recall=0.5']);
    assert.strictEqual(passing.result.status, 0, passing.result.stderr);
    assert.deepStrictEqual(passing.payload.gates.map((g) => g.pass), [true, true]);
    assert.strictEqual(passing.payload.level, 'ok');

    const unknownMetric = runCli(root, ['bench', '--gate', 'wobble=1']);
    assert.strictEqual(unknownMetric.status, 2);
    assert.match(unknownMetric.stderr + unknownMetric.stdout, /门禁/);

    const malformed = runCli(root, ['bench', '--gate', 'mrr']);
    assert.strictEqual(malformed.status, 2);
  });
});

test('bench ablation reports every retrieval and ranking variant deterministically', () => {
  withStore((root) => {
    seedFacts(root);
    const first = benchJson(root, ['--ablate']);
    const second = benchJson(root, ['--ablate']);
    assert.strictEqual(first.result.status, 0, first.result.stderr);
    assert.strictEqual(first.result.stdout, second.result.stdout);

    const variants = first.payload.ablation.map((row) => row.variant).sort();
    assert.deepStrictEqual(variants, ['lexical-fused', 'lexical-score', 'semantic-fused', 'semantic-score']);
    for (const row of first.payload.ablation) {
      assert.strictEqual(typeof row.metrics.mrr, 'number');
      assert.strictEqual(typeof row.metrics.hitRate, 'number');
    }
    const baseline = first.payload.ablation.filter((row) => row.variant === 'semantic-fused')[0];
    assert.deepStrictEqual(baseline.metrics, {
      recallAtK: first.payload.metrics.recallAtK,
      mrr: first.payload.metrics.mrr,
      ndcgAtK: first.payload.metrics.ndcgAtK,
      hitRate: first.payload.metrics.hitRate,
    });
    assert.strictEqual(first.payload.embedding.status, 'not-run');
  });
});

test('bench validates its evalset and requires a readable index', () => {
  withStore((root) => {
    seedFacts(root);

    const badVersion = path.join(tmpdir('ytm-bench-bad-'), 'evalset.json');
    fs.writeFileSync(badVersion, JSON.stringify({ version: 2, queries: [] }), 'utf8');
    const bad = runCli(root, ['bench', '--evalset', badVersion]);
    assert.strictEqual(bad.status, 2);
    assert.match(bad.stderr + bad.stdout, /评测集/);

    const missing = runCli(root, ['bench', '--evalset', path.join(root, 'nope.json')]);
    assert.strictEqual(missing.status, 2);
    assert.match(missing.stderr + missing.stdout, /评测集/);

    const emptyRoot = tmpdir('ytm-bench-empty-');
    fs.mkdirSync(path.join(emptyRoot, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(emptyRoot, 'facts', '2026-09-25-0001.md'), [
      '---', 'type: FACT', 'subject: 未建索引', 'statement: 没有索引时 bench 应给出重建设置', 'scope: public',
      'created: 2026-09-25', 'updated: 2026-09-25', '---', '', '没有索引时 bench 应给出重建提示', '',
    ].join('\n'), 'utf8');
    const noIndex = runCli(emptyRoot, ['bench']);
    assert.strictEqual(noIndex.status, 2);
    assert.match(noIndex.stderr + noIndex.stdout, /reindex/);
  });
});

test('bench can write its report to --out while staying deterministic', () => {
  withStore((root) => {
    seedFacts(root);
    const outFile = path.join(tmpdir('ytm-bench-out-'), 'bench.json');
    const result = runCli(root, ['bench', '--json', '--out', outFile]);
    assert.strictEqual(result.status, 0, result.stderr);
    const written = fs.readFileSync(outFile, 'utf8');
    assert.strictEqual(written.trim(), result.stdout.trim());
    assert.strictEqual(JSON.parse(written).command, 'bench');
  });
});

test('bench text output stays free of wall-clock data unless timing is requested', () => {
  withStore((root) => {
    seedFacts(root);
    const quiet = runCli(root, ['bench']);
    assert.strictEqual(quiet.status, 0, quiet.stderr);
    assert.match(quiet.stdout, /Recall@5/);
    assert.match(quiet.stdout, /复算/);

    const timed = runCli(root, ['bench', '--timing', '--json']);
    assert.strictEqual(timed.status, 0, timed.stderr);
    const payload = JSON.parse(timed.stdout);
    assert.strictEqual(payload.reproducible, false);
    assert.ok(payload.timing.p50Ms >= 0);
    assert.ok(payload.timing.p95Ms >= payload.timing.p50Ms);
  });
});
