'use strict';

// v1.0 S2-②：没有 context.paging 提供方时，内置规则层必须按段分配预算，
// 不能让「近期走廊」把预算吃光、导致「高价值补位」整段消失。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);

function meta(overrides) {
  return Object.assign({
    type: 'FACT',
    subject: '测试条目',
    statement: '测试正文',
    confidence: 1,
    created: '2026-09-25T10:00:00Z',
    updated: '2026-09-25T10:00:00Z',
    tags: [],
    scope: 'public',
    owner: '',
    source: '',
    weight: 1,
    access_count: 0,
    last_accessed: '',
    feedback_net: 0,
  }, overrides || {});
}

function indexEntry(rel, value) {
  const m = value || {};
  return {
    file: rel,
    type: m.type || 'FACT',
    subject: m.subject || '',
    statement: m.statement || '',
    confidence: m.confidence === undefined ? 1 : m.confidence,
    created: m.created || '',
    updated: m.updated || m.created || '',
    tags: m.tags || [],
    immutable: !!m.immutable,
    scope: 'public',
    owner: '',
    source: '',
    weight: m.weight === undefined ? 1 : m.weight,
    access_count: 0,
    last_accessed: '',
    feedback_net: 0,
  };
}

function entryFileText(value) {
  const m = value || {};
  return [
    '---',
    'type: ' + (m.type || 'FACT'),
    'subject: ' + (m.subject || ''),
    'statement: ' + (m.statement || ''),
    'confidence: ' + (m.confidence === undefined ? 1 : m.confidence),
    'created: ' + (m.created || ''),
    'updated: ' + (m.updated || m.created || ''),
    'tags: []',
    'immutable: false',
    'scope: public',
    'owner: ',
    'source: ',
    'weight: ' + (m.weight === undefined ? 1 : m.weight),
    '---',
    '',
    'body',
    '',
  ].join('\n');
}

function withStore(t, entries, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-seg-'));
  const configDir = path.join(root, '.config');
  const agentHome = path.join(root, '.agent-home');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(agentHome, { recursive: true });
  for (const entry of entries) {
    const fp = path.join(root, entry.rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, entryFileText(entry.meta), 'utf8');
  }
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    updated: '2026-09-30',
    entries: entries.map((entry) => indexEntry(entry.rel, entry.meta)),
  }, null, 2), 'utf8');

  const saved = {
    YOTTA_MEMORY_HOME: process.env.YOTTA_MEMORY_HOME,
    YOTTA_MEMORY_CONFIG_DIR: process.env.YOTTA_MEMORY_CONFIG_DIR,
    YOTTA_MEMORY_AGENT_HOME: process.env.YOTTA_MEMORY_AGENT_HOME,
    YOTTA_PROVIDER_HOME: process.env.YOTTA_PROVIDER_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  process.env.YOTTA_PROVIDER_HOME = path.join(root, '.provider-home');
  fs.mkdirSync(process.env.YOTTA_PROVIDER_HOME, { recursive: true });
  t.after(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return run({ root, configDir, agentHome });
}

function padding(n) {
  return '正文'.repeat(Math.ceil(n / 2)).slice(0, n);
}

function buildEntries() {
  const entries = [];
  for (let i = 0; i < 12; i++) {
    const day = String(20 - i).padStart(2, '0');
    entries.push({
      rel: 'facts/2026/09/2026-09-' + day + '-0001.md',
      meta: meta({
        subject: '走廊条目' + i,
        statement: '走廊' + i + ' ' + padding(180),
        created: '2026-09-' + day + 'T10:00:00Z',
        updated: '2026-09-' + day + 'T10:00:00Z',
      }),
    });
  }
  for (let i = 0; i < 3; i++) {
    entries.push({
      rel: 'facts/2026/08/2026-08-0' + (i + 1) + '-0001.md',
      meta: meta({
        subject: '高价值补位' + i,
        statement: '高价值' + i + ' ' + padding(180),
        weight: 5,
        created: '2026-08-0' + (i + 1) + 'T10:00:00Z',
        updated: '2026-08-0' + (i + 1) + 'T10:00:00Z',
      }),
    });
  }
  entries.push({
    rel: 'facts/2026/07/2026-07-01-0001.md',
    meta: meta({
      subject: '靶向记忆',
      statement: '靶向 ' + padding(120),
      created: '2026-07-01T10:00:00Z',
      updated: '2026-07-01T10:00:00Z',
    }),
  });
  return entries;
}

test('内置段预算：预算紧张时高价值补位不会被走廊吃光', (t) => {
  withStore(t, buildEntries(), () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 1200, explain: true });
    assert.strictEqual(r.paging.status, 'builtin', '无 provider 时应使用内置段预算');
    assert.ok(r.paging.quotas && r.paging.quotas.high_value > 0, '应给出高价值段配额');
    assert.ok(r.paging.used <= 1200, '总字符数不应超过预算');
    assert.ok(r.paging.section_used && r.paging.section_used.high_value > 0,
      '高价值补位段应分到预算并至少收录一条 quotas=' + JSON.stringify(r.paging.quotas)
      + ' used=' + r.paging.used);
    assert.ok(r.text.includes('走廊条目0'), '最近走廊仍应保留');
  });
});

test('内置段预算：带 --focus 时任务相关段拿到配额且排在最前', (t) => {
  withStore(t, buildEntries(), () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 1200, focus: '靶向', explain: true });
    assert.strictEqual(r.paging.status, 'builtin');
    assert.ok(r.paging.quotas.focus > 0, 'focus 段应有独立配额');
    assert.ok(r.text.includes('靶向记忆'), 'focus 命中的条目必须出现');
    const focusAt = r.text.indexOf('靶向记忆');
    const corridorAt = r.text.indexOf('走廊条目0');
    assert.ok(focusAt !== -1 && (corridorAt === -1 || focusAt < corridorAt), 'focus 段应排在走廊之前');
  });
});

test('内置段预算：不传 --budget 时不启用，行为保持原样', (t) => {
  withStore(t, buildEntries(), () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.notStrictEqual(r.paging.status, 'builtin');
    assert.ok(!r.paging.quotas, '未传预算时不应有段配额');
  });
});
