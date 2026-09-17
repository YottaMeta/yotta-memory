'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);

const META_ORDER = [
  'type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags',
  'immutable', 'scope', 'owner', 'source', 'weight', 'access_count',
  'last_accessed', 'feedback_net',
];

function writeEntry(root, rel, meta) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const lines = ['---'];
  for (const key of META_ORDER) {
    const value = meta[key];
    if (value === undefined || value === null || value === '') continue;
    lines.push(key + ': ' + (Array.isArray(value) ? JSON.stringify(value) : String(value)));
  }
  lines.push('---', '', String(meta.statement || ''));
  fs.writeFileSync(fp, lines.join('\n') + '\n', 'utf8');
}

function withMemory(t, entries, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-cognition-'));
  const configDir = path.join(root, '.config');
  fs.mkdirSync(configDir, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const previous = {
    home: process.env.YOTTA_MEMORY_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agent: process.env.YOTTA_AGENT_ID,
    trust: process.env.YOTTA_MEMORY_TRUST_ENV_AGENT,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_AGENT_ID = 'codex';
  process.env.YOTTA_MEMORY_TRUST_ENV_AGENT = '1';

  for (const entry of entries) writeEntry(root, entry.rel, entry.meta);

  try {
    return fn(root);
  } finally {
    for (const [key, value] of Object.entries({
      YOTTA_MEMORY_HOME: previous.home,
      YOTTA_MEMORY_CONFIG_DIR: previous.config,
      YOTTA_AGENT_ID: previous.agent,
      YOTTA_MEMORY_TRUST_ENV_AGENT: previous.trust,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function baseMeta(overrides) {
  return Object.assign({
    type: 'FACT',
    confidence: 1,
    tags: [],
    immutable: false,
    scope: 'public',
    owner: '',
    source: '',
    weight: 1,
    access_count: 0,
    feedback_net: 0,
  }, overrides);
}

test('context puts consolidated summaries before a time-ordered recent corridor', (t) => {
  withMemory(t, [
    {
      rel: 'facts/2020-01-01-0001.md',
      meta: baseMeta({
        subject: '周期摘要 长期偏好（90 天窗）',
        statement: '长期摘要：用户偏好先给结论，再解释理由。',
        created: '2020-01-01',
        updated: '2020-01-01',
        source: 'consolidate',
        tags: ['consolidate', 'summary'],
        weight: 0.1,
      }),
    },
    {
      rel: 'facts/2026-08-01-0001.md',
      meta: baseMeta({
        subject: '旧高权重事实',
        statement: '这条事实权重很高，但更新时间较早。',
        created: '2026-08-01',
        updated: '2026-08-01',
        weight: 9,
      }),
    },
    {
      rel: 'facts/2026-09-01-0001.md',
      meta: baseMeta({
        subject: '走廊较早',
        statement: '九月初的近期事件。',
        created: '2026-09-01',
        updated: '2026-09-01',
        weight: 5,
      }),
    },
    {
      rel: 'facts/2026-09-10-0001.md',
      meta: baseMeta({
        subject: '走廊较新',
        statement: '九月十日的近期事件。',
        created: '2026-09-10',
        updated: '2026-09-10',
        weight: 0.1,
      }),
    },
  ], () => {
    const result = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.strictEqual(result.error, false);

    const summaryMatch = result.text.match(/## [0-9.]+ 长期理解摘要/);
    const corridorMatch = result.text.match(/## [0-9.]+ 近期走廊/);
    const highValueMatch = result.text.match(/## [0-9.]+ 近期高价值记忆/);
    assert.ok(summaryMatch, 'long-term summary section is missing');
    assert.ok(corridorMatch, 'recent corridor section is missing');
    assert.ok(highValueMatch, 'high-value backfill section is missing');
    const summaryAt = summaryMatch.index;
    const corridorAt = corridorMatch.index;
    const highValueAt = highValueMatch.index;
    assert.ok(corridorAt > summaryAt, 'summary must come before the recent corridor');
    assert.ok(highValueAt > corridorAt, 'recent corridor must come before high-value backfill');
    assert.ok(
      result.text.indexOf('长期摘要：用户偏好先给结论，再解释理由。') < corridorAt,
      'summary content must be injected before the corridor'
    );

    const corridor = result.text.slice(corridorAt, highValueAt);
    assert.match(corridor, /走廊较新/);
    assert.match(corridor, /走廊较早/);
    assert.ok(corridor.indexOf('走廊较新') < corridor.indexOf('走廊较早'), 'corridor must be ordered by update time');
    assert.doesNotMatch(corridor, /长期摘要：用户偏好先给结论/, 'summary must not be repeated in the corridor');

    assert.match(result.text, /\[included\].*reason: summary_priority/);
    assert.match(result.text, /\[included\].*reason: recent_corridor/);
  });
});

test('context states the session loop and respects the dynamic budget', (t) => {
  const entries = [{
    rel: 'facts/2020-01-01-0001.md',
    meta: baseMeta({
      subject: '周期摘要 预算（90 天窗）',
      statement: '长期摘要：预算测试。',
      created: '2020-01-01',
      updated: '2020-01-01',
      source: 'consolidate',
      tags: ['consolidate', 'summary'],
    }),
  }];
  for (let i = 1; i <= 8; i++) {
    entries.push({
      rel: 'facts/2026-09-' + String(i).padStart(2, '0') + '-0001.md',
      meta: baseMeta({
        subject: '预算条目 ' + i,
        statement: '用于验证动态上下文预算的第 ' + i + ' 条记忆。',
        created: '2026-09-' + String(i).padStart(2, '0'),
        updated: '2026-09-' + String(i).padStart(2, '0'),
      }),
    });
  }

  withMemory(t, entries, () => {
    const result = memory.contextCore({ selfAgent: 'codex', limit: 3, budget: 160, explain: true });
    assert.strictEqual(result.error, false);
    assert.match(result.text, /## 7\. 本会话闭环契约/);
    assert.match(result.text, /进行中：.*立即/);
    assert.match(result.text, /remember .*--verify/);
    assert.match(result.text, /收工前复盘/);
    assert.match(result.text, /reason: budget_exceeded/);
  });
});

test('context never injects another owner private summary', (t) => {
  withMemory(t, [
    {
      rel: 'facts/2020-01-01-0001.md',
      meta: baseMeta({
        subject: '周期摘要 公共（90 天窗）',
        statement: '公共摘要可见。',
        created: '2020-01-01',
        updated: '2020-01-01',
        source: 'consolidate',
        tags: ['consolidate', 'summary'],
      }),
    },
    {
      rel: 'private/codex/prefs/2020-01-01-0001.md',
      meta: baseMeta({
        type: 'PREF',
        scope: 'private',
        owner: 'codex',
        subject: '周期摘要 codex 偏好（90 天窗）',
        statement: 'codex 自己的私有摘要。',
        created: '2020-01-01',
        updated: '2020-01-01',
        source: 'consolidate',
        tags: ['consolidate', 'summary'],
      }),
    },
    {
      rel: 'private/alice/prefs/2020-01-01-0001.md',
      meta: baseMeta({
        type: 'PREF',
        scope: 'private',
        owner: 'alice',
        subject: '周期摘要 alice 偏好（90 天窗）',
        statement: 'alice 的私有摘要绝不能泄露。',
        created: '2020-01-01',
        updated: '2020-01-01',
        source: 'consolidate',
        tags: ['consolidate', 'summary'],
      }),
    },
  ], () => {
    const result = memory.contextCore({ selfAgent: 'codex', limit: 10 });
    assert.strictEqual(result.error, false);
    assert.match(result.text, /公共摘要可见/);
    assert.match(result.text, /codex 自己的私有摘要/);
    assert.doesNotMatch(result.text, /alice 的私有摘要绝不能泄露/);
  });
});
