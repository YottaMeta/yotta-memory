'use strict';
// v0.18.1 A10: repeat-pitfall rule promotion report (read-only).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-rules-store-');
  const configDir = tmpdir('ytm-rules-config-');
  const agentHome = tmpdir('ytm-rules-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root, configDir);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function memText(fields, body) {
  const lines = ['---'];
  for (const key of Object.keys(fields)) lines.push(key + ': ' + fields[key]);
  lines.push('---', '', body || '');
  return lines.join('\n') + '\n';
}

function seed(root, list) {
  const entries = [];
  list.forEach((item, i) => {
    const rel = (item.scope === 'private' ? 'private/' + item.owner + '/' + item.dir : 'facts/2026/09') +
      '/2026-09-20-' + String(2000 + i) + '.md';
    const fields = {
      type: item.type,
      subject: item.subject,
      statement: item.statement,
      confidence: '0.9',
      created: item.created || '2026-09-20',
      updated: item.updated || '2026-09-20',
      tags: item.tags || '',
      immutable: 'false',
      scope: item.scope || 'public',
      owner: item.owner || '',
      source: item.source || 'test',
      weight: '1.0',
    };
    const fp = path.join(root, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, memText(fields, item.body || '正文'), 'utf8');
    entries.push({
      file: rel,
      type: item.type,
      scope: item.scope || 'public',
      owner: item.owner || '',
      subject: item.subject,
      statement: item.statement,
      tags: String(item.tags || '').split(',').filter(Boolean),
      confidence: 0.9,
      created: item.created || '2026-09-20',
      updated: item.updated || '2026-09-20',
      access_count: 0,
      last_accessed: '',
      immutable: false,
      source: item.source || 'test',
      weight: 1.0,
      feedback_net: 0,
    });
  });
  memory.saveIndex(root, entries);
}

function threeLessons(owner) {
  return [1, 2, 3].map((n) => ({
    type: 'COMMIT',
    scope: owner ? 'private' : 'public',
    owner: owner || '',
    dir: 'commits',
    subject: '发布踩坑 ' + n,
    statement: '第 ' + n + ' 次推送前没跑测试',
    tags: '教训,git,push-gate',
  }));
}

test('maintain reports repeat pitfalls as read-only rule suggestions', () => {
  withStore((root) => {
    seed(root, threeLessons(''));
    const before = memory.collectEntryFiles(root).map((fp) => fs.readFileSync(fp, 'utf8')).join('\n');
    const r = memory.maintainCore({ selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /建议升级为规则/);
    assert.match(r.text, /git\+push-gate（3 条/);
    assert.match(r.text, /人工确认后执行/);
    const after = memory.collectEntryFiles(root).map((fp) => fs.readFileSync(fp, 'utf8')).join('\n');
    assert.strictEqual(after, before, 'rule mining must not modify memories');
    assert.ok(!fs.existsSync(path.join(root, '.archive')), 'rule mining must not write audit or snapshots');
  });
});

test('rule threshold honors config maintain_rule_min_hits', () => {
  withStore((root, configDir) => {
    seed(root, threeLessons('').slice(0, 2));
    const dflt = memory.maintainCore({ selfAgent: 'codex' });
    assert.ok(dflt.text.indexOf('建议升级为规则') === -1, 'two entries must stay below the default threshold of 3');
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ maintain_rule_min_hits: 2 }), 'utf8');
    const lowered = memory.maintainCore({ selfAgent: 'codex' });
    assert.match(lowered.text, /建议升级为规则/);
    assert.match(lowered.text, /git\+push-gate（2 条/);
  });
});

test('rule mining understands pattern-key and yotta-learn sync formats', () => {
  withStore((root) => {
    const list = [];
    for (let n = 1; n <= 3; n++) list.push({
      type: 'PREF', subject: 'yotta-learn: push-gate', statement: '[' + 'correction] 推送前先跑测试 ' + n,
      tags: 'push-gate',
    });
    for (let n = 1; n <= 3; n++) list.push({
      type: 'COMMIT', subject: '发布闸门 ' + n, statement: '未验收不得推送 ' + n,
      tags: 'pattern-key:gate-x,教训',
    });
    seed(root, list);
    const r = memory.maintainCore({ selfAgent: 'codex' });
    assert.match(r.text, /correction@push-gate（3 条/);
    assert.match(r.text, /pattern-key:gate-x（3 条/);
  });
});

test('rule mining skips other owners and --rules is read-only and mutually exclusive with apply', () => {
  withStore((root) => {
    seed(root, threeLessons('dashu'));
    const r = memory.maintainCore({ selfAgent: 'codex' });
    assert.ok(r.text.indexOf('git+push-gate') === -1, 'cross-owner private entries must be skipped');
    const only = memory.maintainCore({ selfAgent: 'codex', rules: true });
    assert.strictEqual(only.error, false, only.text);
    assert.ok(only.text.indexOf('归档候选') === -1, '--rules must only show the rule block');
    const bad = memory.maintainCore({ selfAgent: 'codex', rules: true, apply: true });
    assert.strictEqual(bad.error, true);
    assert.strictEqual(bad.exitCode, 2);
  });
});

test('MCP maintain exposes the read-only rules switch', () => {
  const tools = memory.mcpTools('full');
  const maintain = tools.filter((t) => t.name === 'maintain')[0];
  assert.ok(maintain, 'maintain tool missing');
  assert.ok(maintain.inputSchema.properties.rules, 'maintain.rules missing from MCP schema');
});
