'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const FIXTURE = path.join(__dirname, '..', 'test-fixtures', 'fake-provider.js');
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

function entries() {
  return [
    {
      rel: 'facts/2026/09/2026-09-27-0001.md',
      meta: {
        type: 'FACT', subject: '近期记忆A', statement: '页面驱逐测试条目 A',
        created: '2026-09-27T10:00:00Z', updated: '2026-09-27T10:00:00Z',
      },
    },
    {
      rel: 'facts/2026/09/2026-09-26-0001.md',
      meta: {
        type: 'FACT', subject: '近期记忆B', statement: '页面驱逐测试条目 B',
        created: '2026-09-26T10:00:00Z', updated: '2026-09-26T10:00:00Z',
      },
    },
    {
      rel: 'private/codex/bounds/2026-09-20-0001.md',
      meta: {
        type: 'BOUND', subject: '边界条目', statement: '边界条目必须始终保留',
        owner: 'codex', created: '2026-09-20T10:00:00Z', updated: '2026-09-20T10:00:00Z',
      },
    },
    {
      rel: 'private/codex/commits/2026/09/2026-09-25-0001.md',
      meta: {
        type: 'COMMIT', subject: '承诺条目', statement: '承诺条目必须始终保留',
        owner: 'codex', created: '2026-09-25T10:00:00Z', updated: '2026-09-25T10:00:00Z',
      },
    },
  ];
}

function writeProfileSnapshot(root, owner, body) {
  const fp = path.join(root, 'private', owner, 'profile.md');
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, body, 'utf8');
}

function indexEntry(entry) {
  const meta = entry.meta || {};
  return {
    file: entry.rel,
    type: meta.type || 'FACT',
    subject: meta.subject || '',
    statement: meta.statement || '',
    confidence: meta.confidence === undefined ? 1 : meta.confidence,
    created: meta.created || '',
    updated: meta.updated || meta.created || '',
    tags: meta.tags || [],
    immutable: !!meta.immutable,
    scope: meta.scope || (entry.rel.indexOf('private/') === 0 ? 'private' : 'public'),
    owner: meta.owner || '',
    source: meta.source || '',
    weight: meta.weight === undefined ? 1 : meta.weight,
    access_count: meta.access_count || 0,
    last_accessed: meta.last_accessed || '',
    feedback_net: meta.feedback_net || 0,
  };
}

function writeIndex(root, extraEntries) {
  const all = entries().concat(extraEntries || []);
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    updated: '2026-09-30',
    entries: all.map(indexEntry),
  }, null, 2), 'utf8');
}

function withStore(run, providerCommand) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-hook-store-'));
  const configDir = path.join(root, '.config');
  const agentHome = path.join(root, '.agent-home');
  const providerHome = path.join(root, '.provider-home');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(agentHome, { recursive: true });
  fs.mkdirSync(providerHome, { recursive: true });
  for (const entry of entries()) writeEntry(root, entry.rel, entry.meta);
  if (providerCommand) {
    fs.writeFileSync(path.join(providerHome, 'provider.json'), JSON.stringify({
      schema: 1,
      providers: [{ id: 'fake', capabilities: ['memory.hook'], command: providerCommand }],
    }), 'utf8');
  }
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
    provider: process.env.YOTTA_PROVIDER_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  process.env.YOTTA_PROVIDER_HOME = providerHome;
  try {
    return run({ root, configDir, agentHome, providerHome });
  } finally {
    for (const key of Object.keys(saved)) {
      const envKey = {
        home: 'YOTTA_MEMORY_HOME',
        config: 'YOTTA_MEMORY_CONFIG_DIR',
        agentHome: 'YOTTA_MEMORY_AGENT_HOME',
        provider: 'YOTTA_PROVIDER_HOME',
      }[key];
      if (saved[key] === undefined) delete process.env[envKey];
      else process.env[envKey] = saved[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('无 provider：hook=not_installed，输出不出现扩展装载行', () => {
  withStore(() => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.strictEqual(r.hook.status, 'not_installed');
    assert.strictEqual(r.hook.applied, false);
    assert.ok(r.text.includes('近期记忆A'));
    assert.ok(r.text.includes('近期记忆B'));
    assert.ok(!r.text.includes('扩展装载'), '未配置时不应出现扩展装载行');
  });
});

test('provider active：驱逐清单生效，未驱逐条目保留', () => {
  withStore(() => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.strictEqual(r.hook.status, 'active');
    assert.strictEqual(r.hook.applied, true);
    assert.strictEqual(r.hook.evicted.length, 1);
    assert.ok(!r.text.includes('近期记忆A'), '被驱逐条目不应出现在上下文');
    assert.ok(r.text.includes('近期记忆B'), '未驱逐条目应保留');
    assert.ok(r.trace.some((line) => line.includes('[hook]')), 'trace 应记录 hook');
  }, [process.execPath, FIXTURE]);
});

test('hook 驱逐 PREF：被驱逐正文不再从画像快照出现', () => {
  const evicted = 'private/codex/prefs/2026-09-25-0001.md';
  const kept = 'private/codex/prefs/2026-09-24-0001.md';
  withStore((ctx) => {
    const evictedMeta = {
      type: 'PREF', subject: '偏好条目', statement: '被驱逐的偏好正文必须消失',
      owner: 'codex', created: '2026-09-25T10:00:00Z', updated: '2026-09-25T10:00:00Z',
    };
    const keptMeta = {
      type: 'PREF', subject: '偏好条目', statement: '保留的偏好正文必须存在',
      owner: 'codex', created: '2026-09-24T10:00:00Z', updated: '2026-09-24T10:00:00Z',
    };
    writeEntry(ctx.root, evicted, evictedMeta);
    writeEntry(ctx.root, kept, keptMeta);
    writeIndex(ctx.root, [
      { rel: evicted, meta: evictedMeta },
      { rel: kept, meta: keptMeta },
    ]);
    writeProfileSnapshot(ctx.root, 'codex', [
      '# 用户画像（codex）',
      '',
      '## PREF · 偏好条目',
      '',
      '- 被驱逐的偏好正文必须消失（confidence 1 · 未访问）',
      '  - ' + evicted,
      '',
      '- 保留的偏好正文必须存在（confidence 1 · 未访问）',
      '  - ' + kept,
      '',
    ].join('\n'));

    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.strictEqual(r.hook.status, 'active');
    assert.strictEqual(r.hook.applied, true);
    assert.ok(!r.text.includes('被驱逐的偏好正文必须消失'), '被驱逐 PREF 不应从画像快照再次出现');
    assert.ok(r.text.includes('保留的偏好正文必须存在'), '未驱逐 PREF 应保留');
  }, [process.execPath, FIXTURE, 'custom', JSON.stringify({ evict: [evicted] })]);
});

test('自我接入档案不进 hook 候选集，且无法被驱逐', () => {
  const selfProfile = 'private/codex/prefs/2026-08-25-0001.md';
  withStore((ctx) => {
    const selfMeta = {
      type: 'PREF', subject: '自我接入档案',
      statement: 'agent_id: codex; agent_name: 知微; user_name: 老张',
      owner: 'codex', created: '2026-08-25T10:00:00Z', updated: '2026-08-25T10:00:00Z',
    };
    writeEntry(ctx.root, selfProfile, selfMeta);
    writeIndex(ctx.root, [{ rel: selfProfile, meta: selfMeta }]);

    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
    assert.strictEqual(r.hook.status, 'active');
    assert.strictEqual(r.hook.applied, false);
    assert.deepStrictEqual(r.hook.dropped, [selfProfile]);
    assert.ok(r.text.includes('agent_id: codex; agent_name: 知微; user_name: 老张'));
  }, [process.execPath, FIXTURE, 'custom', JSON.stringify({ evict: [selfProfile] })]);
});

test('BOUND / COMMIT 不进入候选集，且不可被驱逐', () => {
  const dump = path.join(os.tmpdir(), 'ytm-hook-dump-' + process.pid + '-' + Date.now() + '.json');
  try {
    withStore((ctx) => {
      const readable = [
        { file: 'facts/2026/09/a.md', type: 'FACT', subject: 'A', statement: 'a', created: '2026-09-27', updated: '2026-09-27' },
        { file: 'private/codex/bounds/b.md', type: 'BOUND', subject: 'B', statement: 'b', created: '2026-09-26', updated: '2026-09-26' },
        { file: 'private/codex/commits/c.md', type: 'COMMIT', subject: 'C', statement: 'c', created: '2026-09-25', updated: '2026-09-25' },
      ];
      const first = memory.applyMemoryHook(readable, { owner: 'codex' });
      assert.strictEqual(first.block.status, 'active');
      assert.strictEqual(first.block.applied, true);
      const payload = JSON.parse(fs.readFileSync(dump, 'utf8'));
      assert.deepStrictEqual(payload.candidates.map((item) => item.file), ['facts/2026/09/a.md']);

      fs.writeFileSync(path.join(ctx.providerHome, 'provider.json'), JSON.stringify({
        schema: 1,
        providers: [{
          id: 'fake',
          capabilities: ['memory.hook'],
          command: [process.execPath, FIXTURE, 'custom', JSON.stringify({
            evict: ['private/codex/bounds/b.md', 'private/codex/commits/c.md'],
          })],
        }],
      }), 'utf8');
      const second = memory.applyMemoryHook(readable, { owner: 'codex' });
      assert.strictEqual(second.block.applied, false);
      assert.strictEqual(second.evict.size, 0);
      assert.deepStrictEqual(second.block.dropped, ['private/codex/bounds/b.md', 'private/codex/commits/c.md']);
    }, [process.execPath, FIXTURE, 'dump', dump]);
  } finally {
    fs.rmSync(dump, { force: true });
  }
});

test('license_required：降级普通记忆，条目照常进入上下文', () => {
  withStore(() => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10 });
    assert.strictEqual(r.hook.status, 'license_required');
    assert.strictEqual(r.hook.applied, false);
    assert.ok(r.text.includes('近期记忆A'));
    assert.ok(r.text.includes('扩展装载'));
  }, [process.execPath, FIXTURE, 'license']);
});

test('驱逐清单含候选集外文件：丢弃且不应用', () => {
  withStore(() => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10 });
    assert.strictEqual(r.hook.status, 'active');
    assert.strictEqual(r.hook.applied, false);
    assert.deepStrictEqual(r.hook.dropped, ['facts/2026/09/ghost.md']);
    assert.ok(r.text.includes('近期记忆A'));
  }, [process.execPath, FIXTURE, 'custom', JSON.stringify({ evict: ['facts/2026/09/ghost.md'] })]);
});

test('context --json：输出 JSON 且含 hook 块与 text', () => {
  withStore((ctx) => {
    const env = Object.assign({}, process.env, {
      YOTTA_MEMORY_HOME: ctx.root,
      YOTTA_MEMORY_CONFIG_DIR: ctx.configDir,
      YOTTA_MEMORY_AGENT_HOME: ctx.agentHome,
      YOTTA_PROVIDER_HOME: ctx.providerHome,
    });
    const r = spawnSync(process.execPath, [CLI, 'context', '--agent', 'codex', '--json'], {
      encoding: 'utf8',
      env,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assert.ok(data.hook, '应有 hook 块');
    assert.strictEqual(data.hook.status, 'not_installed');
    assert.ok(typeof data.text === 'string' && data.text.includes('近期记忆A'));
  });
});
