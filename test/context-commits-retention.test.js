'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function entryText(meta) {
  return [
    '---',
    'type: ' + meta.type,
    'subject: ' + meta.subject,
    'statement: ' + meta.statement,
    'confidence: ' + (meta.confidence === undefined ? 1 : meta.confidence),
    'created: ' + meta.created,
    'updated: ' + (meta.updated || meta.created),
    'tags: ' + JSON.stringify(meta.tags || []),
    'immutable: false',
    'scope: ' + meta.scope,
    'owner: ' + (meta.owner || ''),
    'source: ' + (meta.source || ''),
    'weight: ' + (meta.weight === undefined ? 1 : meta.weight),
    '---',
    '',
    meta.statement,
    '',
  ].join('\n');
}

function indexEntry(meta, rel) {
  return {
    file: rel,
    type: meta.type,
    subject: meta.subject,
    statement: meta.statement,
    confidence: meta.confidence === undefined ? 1 : meta.confidence,
    created: meta.created,
    updated: meta.updated || meta.created,
    tags: meta.tags || [],
    immutable: false,
    scope: meta.scope,
    owner: meta.owner || '',
    source: meta.source || '',
    weight: meta.weight === undefined ? 1 : meta.weight,
    access_count: 0,
    last_accessed: '',
    feedback_net: 0,
  };
}

function withStore(t, options, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-commit-retention-'));
  const configDir = path.join(root, '.config');
  const agentHome = path.join(root, '.agent-home');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(agentHome, { recursive: true });
  const entries = options.entries || [];
  for (const entry of entries) {
    const fp = path.join(root, entry.rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, entryText(entry.meta), 'utf8');
  }
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    updated: daysAgo(0),
    entries: entries.map((entry) => indexEntry(entry.meta, entry.rel)),
  }, null, 2), 'utf8');
  if (options.config) {
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(options.config, null, 2), 'utf8');
  }
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const env = Object.assign({}, process.env, {
    YOTTA_MEMORY_HOME: root,
    YOTTA_MEMORY_CONFIG_DIR: configDir,
    YOTTA_MEMORY_AGENT_HOME: agentHome,
  });
  return run({ root, configDir, agentHome, env });
}

function runCli(env, args) {
  return spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', env });
}

function section6Lines(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (/^## 6\./.test(line)) { inside = true; continue; }
    if (inside && /^## 7\./.test(line)) break;
    if (inside) out.push(line);
  }
  return out;
}

function splitSection6(stdout) {
  const lines = section6Lines(stdout);
  return {
    shown: lines.filter((line) => line.startsWith('- ') && !line.startsWith('- （另有')),
    collapsed: lines.filter((line) => line.startsWith('- （另有')),
  };
}

function commitEntries(count) {
  const entries = [];
  const base = Date.UTC(2026, 8, 1);
  for (let i = 1; i <= count; i++) {
    const d = new Date(base + (i - 1) * 86400000).toISOString().slice(0, 10);
    entries.push({
      rel: 'private/codex/commits/2026/09/' + d + '-0001.md',
      meta: {
        type: 'COMMIT',
        subject: 'commit-c' + String(i).padStart(2, '0'),
        statement: 'body ' + i,
        created: d,
        updated: d,
        scope: 'private',
        owner: 'codex',
      },
    });
  }
  return entries;
}

function protectedEntries() {
  return [
    {
      rel: 'private/codex/commits/2026/08/2026-08-01-0001.md',
      meta: { type: 'COMMIT', subject: 'commit-p1', statement: 'weight protected', created: '2026-08-01', updated: '2026-08-01', scope: 'private', owner: 'codex', weight: 1.5 },
    },
    {
      rel: 'private/codex/commits/2026/08/2026-08-02-0001.md',
      meta: { type: 'COMMIT', subject: 'commit-p2', statement: 'pinned protected', created: '2026-08-02', updated: '2026-08-02', scope: 'private', owner: 'codex', tags: ['pinned'] },
    },
  ];
}

// 同日批次：created / updated 只有日期粒度，写入先后靠文件名序号区分。
function sameDayCommitEntries(count) {
  const entries = [];
  const day = '2026-09-30';
  for (let i = 1; i <= count; i++) {
    entries.push({
      rel: 'private/codex/commits/2026/09/' + day + '-' + String(i).padStart(4, '0') + '.md',
      meta: {
        type: 'COMMIT',
        subject: 'commit-c' + String(i).padStart(2, '0'),
        statement: 'body ' + i,
        created: day,
        updated: day,
        scope: 'private',
        owner: 'codex',
      },
    });
  }
  return entries;
}

test('COMMIT 段默认只展示最近 20 条：weight / pinned 恒显 + 折叠行', (t) => {
  withStore(t, { entries: commitEntries(25).concat(protectedEntries()) }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.strictEqual(s6.shown.length, 22, '20 条最近 + 2 条受保护');
    assert.ok(s6.shown.some((line) => line.includes('commit-p1')), 'weight≥1.5 应恒显');
    assert.ok(s6.shown.some((line) => line.includes('commit-p2')), 'pinned 标签应恒显');
    assert.ok(!s6.shown.some((line) => line.includes('commit-c01')), '超限旧条目不应展示');
    assert.strictEqual(s6.collapsed.length, 1, '应有折叠提示行');
    assert.match(s6.collapsed[0], /另有 5 条/);
    assert.match(s6.collapsed[0], /recall --type COMMIT/);
  });
});

test('context_commits_limit 0 = 全部展示（回旧行为）', (t) => {
  withStore(t, { entries: commitEntries(25).concat(protectedEntries()), config: { context_commits_limit: 0 } }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.strictEqual(s6.shown.length, 27);
    assert.strictEqual(s6.collapsed.length, 0);
  });
});

test('context_commits_limit 自定义值生效；非法值回退默认 20', (t) => {
  withStore(t, { entries: commitEntries(25).concat(protectedEntries()), config: { context_commits_limit: 5 } }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.strictEqual(s6.shown.length, 7, '5 条最近 + 2 条受保护');
    assert.match(s6.collapsed[0], /另有 20 条/);
  });
  withStore(t, { entries: commitEntries(25).concat(protectedEntries()), config: { context_commits_limit: 'abc' } }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.strictEqual(s6.shown.length, 22, '非法值回退默认 20');
    assert.match(s6.collapsed[0], /另有 5 条/);
  });
});

test('COMMIT 段取最近 N 条：同日批次按写入先后（文件名序号）倒序，不退化为索引插入序', (t) => {
  withStore(t, { entries: sameDayCommitEntries(26) }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.strictEqual(s6.shown.length, 20, '默认展示最近 20 条');
    assert.ok(s6.shown.some((line) => line.includes('commit-c26')), '最后写入的条目应在展示窗口');
    assert.ok(s6.shown.some((line) => line.includes('commit-c07')), '窗口边界内的条目应展示');
    assert.ok(!s6.shown.some((line) => line.includes('commit-c06')), '超出窗口的旧条目不应展示');
    assert.ok(!s6.shown.some((line) => line.includes('commit-c01')), '最旧条目不应展示');
    assert.strictEqual(s6.collapsed.length, 1, '应有折叠提示行');
    assert.match(s6.collapsed[0], /另有 6 条更早的 COMMIT/);
  });
});

test('context_commits_limit=3：后追加写入的最新条目必须进展示窗口（WorkBuddy D1 复现回归）', (t) => {
  const entries = sameDayCommitEntries(25);
  entries.push({
    rel: 'private/codex/commits/2026/09/2026-09-30-0026.md',
    meta: { type: 'COMMIT', subject: 'commit-focus', statement: 'weight 恒显', created: '2026-09-30', updated: '2026-09-30', scope: 'private', owner: 'codex', weight: 1.5 },
  });
  ['a', 'b', 'c'].forEach((tag, i) => {
    entries.push({
      rel: 'private/codex/commits/2026/09/2026-09-30-00' + (27 + i) + '.md',
      meta: { type: 'COMMIT', subject: 'commit-new-' + tag, statement: '最新追加 ' + tag, created: '2026-09-30', updated: '2026-09-30', scope: 'private', owner: 'codex' },
    });
  });
  withStore(t, { entries, config: { context_commits_limit: 3 } }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    const s6 = splitSection6(r.stdout);
    assert.ok(s6.shown.some((line) => line.includes('commit-new-c')), '最新写入的条目应展示');
    assert.ok(s6.shown.some((line) => line.includes('commit-new-a')), '最近 3 条都应展示');
    assert.ok(s6.shown.some((line) => line.includes('commit-focus')), 'weight≥1.5 条目恒显');
    assert.ok(!s6.shown.some((line) => line.includes('commit-c01')), '最旧条目不应展示');
    assert.strictEqual(s6.collapsed.length, 1);
    assert.match(s6.collapsed[0], /另有 25 条更早的 COMMIT/);
  });
});

test('归档提醒与 archive 门槛：默认 0.55，可达线条目可执行提示', (t) => {
  const old = daysAgo(200);
  withStore(t, {
    entries: [{
      rel: 'private/codex/commits/2026/03/' + old + '-0001.md',
      meta: { type: 'COMMIT', subject: 'old-commit', statement: 'old anchor', created: old, updated: old, scope: 'private', owner: 'codex' },
    }],
  }, (ctx) => {
    const r = runCli(ctx.env, ['context', '--agent', 'codex', '--no-usage']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /归档提醒: 1 条超 180 天，其中 1 条已达归档门槛/);
    assert.match(r.stdout, /maintain/);
    const dry = runCli(ctx.env, ['archive', '--dry-run', '--agent', 'codex']);
    assert.strictEqual(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /效用 < 0\.55/);
    assert.match(dry.stdout, /将归档 1 条/);
  });
});

test('remember 写超长 COMMIT 时提示；--no-hint 可关闭', (t) => {
  withStore(t, {}, (ctx) => {
    const long = 'x'.repeat(1300);
    const r1 = runCli(ctx.env, ['remember', 'COMMIT', 'long-hint', long, '--agent', 'codex']);
    assert.strictEqual(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /这条 COMMIT 较长/);
    const r2 = runCli(ctx.env, ['remember', 'COMMIT', 'long-nohint', long, '--agent', 'codex', '--no-hint']);
    assert.strictEqual(r2.status, 0, r2.stderr);
    assert.doesNotMatch(r2.stdout, /这条 COMMIT 较长/);
  });
});

test('规模体检：单类型堆积与超长 statement 可配置告警', (t) => {
  const long = 'y'.repeat(2500);
  const entries = commitEntries(4);
  entries[0].meta.statement = long;
  withStore(t, {
    entries,
    config: {
      scale_warn_type_count: 3,
      scale_info_type_count: 2,
      scale_warn_long_statements: 0,
      scale_info_long_statements: 0,
    },
  }, (ctx) => {
    const r = runCli(ctx.env, ['doctor', '--json']);
    assert.strictEqual(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.checks.scale.level, 'warning');
    assert.ok(parsed.checks.scale.metrics.some((m) => m.key === 'type_max' && m.value === 4 && m.level === 'warning'));
    assert.ok(parsed.checks.scale.metrics.some((m) => m.key === 'long_statements' && m.value === 1 && m.level === 'warning'));
    assert.ok(parsed.checks.scale.warnings.some((line) => /单类型堆积（COMMIT 4 条）/.test(line)));
    assert.ok(parsed.checks.scale.warnings.some((line) => /超长 statement/.test(line)));
  });
});
