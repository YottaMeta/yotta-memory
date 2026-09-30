'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const FIXTURE = path.join(__dirname, '..', 'test-fixtures', 'fake-provider.js');
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
    scope: m.scope || (rel.indexOf('private/') === 0 ? 'private' : 'public'),
    owner: m.owner || '',
    source: m.source || '',
    weight: m.weight === undefined ? 1 : m.weight,
    access_count: m.access_count || 0,
    last_accessed: m.last_accessed || '',
    feedback_net: m.feedback_net || 0,
  };
}

function withStore(t, options, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-paging-'));
  const configDir = path.join(root, '.config');
  const agentHome = path.join(root, '.agent-home');
  const providerHome = path.join(root, '.provider-home');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(agentHome, { recursive: true });
  fs.mkdirSync(providerHome, { recursive: true });

  const entries = options.entries || [];
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    updated: '2026-09-30',
    entries: entries.map((entry) => indexEntry(entry.rel, entry.meta)),
  }, null, 2), 'utf8');

  const providers = options.providers || [];
  if (providers.length) {
    fs.writeFileSync(path.join(providerHome, 'provider.json'), JSON.stringify({
      schema: 1,
      providers,
    }, null, 2), 'utf8');
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
  t.after(() => {
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
  });
  return run({ root, configDir, agentHome, providerHome });
}

function pagingProvider(plan) {
  return {
    id: 'fake-paging',
    capabilities: ['memory.hook', 'context.paging'],
    command: [process.execPath, FIXTURE, 'paging', JSON.stringify(plan || {})],
  };
}

function candidates() {
  return [
    {
      rel: 'facts/2026/09/2026-09-25-0001.md',
      meta: meta({ subject: '分页条目 A', statement: '分页 A 正文', updated: '2026-09-25T10:00:00Z' }),
    },
    {
      rel: 'facts/2026/09/2026-09-24-0001.md',
      meta: meta({ subject: '分页条目 B', statement: '分页 B 正文', updated: '2026-09-24T10:00:00Z' }),
    },
    {
      rel: 'facts/2026/09/2026-09-23-0001.md',
      meta: meta({ subject: '分页条目 C', statement: '分页 C 正文', updated: '2026-09-23T10:00:00Z' }),
    },
    {
      rel: 'facts/2026/09/2026-09-22-0001.md',
      meta: meta({ subject: '分页条目 D', statement: '分页 D 正文', updated: '2026-09-22T10:00:00Z' }),
    },
  ];
}

test('未传 --budget：context.paging 不调用，状态为 not_requested', (t) => {
  const dumped = path.join(os.tmpdir(), 'ytm-paging-no-budget-' + process.pid + '-' + Date.now() + '.json');
  try {
    withStore(t, {
      entries: candidates(),
      providers: [pagingProvider({
        dumpFile: dumped,
        'memory.hook': {},
        'context.paging': { drop: [], order: [], complete: true },
      })],
    }, (ctx) => {
      const r = memory.contextCore({ selfAgent: 'codex', limit: 10, explain: true });
      assert.strictEqual(r.paging.status, 'not_requested');
      assert.strictEqual(r.paging.applied, false);
      assert.ok(!r.text.includes('预算分页'));
      assert.ok(!fs.existsSync(dumped), '未传 budget 时不应调用 paging provider');
      const audit = fs.readFileSync(path.join(ctx.providerHome, 'provider-audit.jsonl'), 'utf8');
      assert.ok(!audit.includes('context.paging'), '审计中不应出现 context.paging');
    });
  } finally {
    fs.rmSync(dumped, { force: true });
  }
});

test('--budget：paging 的 drop 与 order 生效，输出不超预算', (t) => {
  const dumped = path.join(os.tmpdir(), 'ytm-paging-budget-' + process.pid + '-' + Date.now() + '.json');
  try {
    withStore(t, {
      entries: candidates(),
      providers: [pagingProvider({
        dumpFile: dumped,
        'memory.hook': {},
        'context.paging': {
          drop: ['facts/2026/09/2026-09-22-0001.md'],
          order: ['facts/2026/09/2026-09-24-0001.md', 'facts/2026/09/2026-09-23-0001.md'],
          complete: true,
        },
      })],
    }, () => {
      const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000, explain: true });
      assert.strictEqual(r.paging.status, 'active');
      assert.strictEqual(r.paging.applied, true);
      assert.deepStrictEqual(r.paging.dropped, ['facts/2026/09/2026-09-22-0001.md']);
      assert.deepStrictEqual(r.paging.ordered, [
        'facts/2026/09/2026-09-24-0001.md',
        'facts/2026/09/2026-09-23-0001.md',
      ]);
      assert.ok(!r.text.includes('分页 D 正文'));
      assert.ok(r.text.indexOf('分页 B 正文') < r.text.indexOf('分页 C 正文'), 'order 应覆盖默认时间顺序');
      assert.ok(r.paging.used <= 6000, '上下文实际字符数不应超过预算');
      assert.ok(r.trace.some((line) => line.includes('[paging]')));

      const payload = JSON.parse(fs.readFileSync(dumped, 'utf8'));
      assert.strictEqual(payload.budget, 6000);
      assert.ok(Array.isArray(payload.protected));
      assert.ok(Array.isArray(payload.sections.corridor));
      assert.ok(payload.candidates.some((item) => item.file === 'facts/2026/09/2026-09-25-0001.md'));
      assert.ok(payload.candidates.every((item) => Number.isFinite(item.chars) && item.chars > 0));
    });
  } finally {
    fs.rmSync(dumped, { force: true });
  }
});

test('complete:false：drop 仍生效，order 不生效', (t) => {
  withStore(t, {
    entries: candidates(),
    providers: [pagingProvider({
      'memory.hook': {},
      'context.paging': {
        drop: ['facts/2026/09/2026-09-22-0001.md'],
        order: ['facts/2026/09/2026-09-24-0001.md', 'facts/2026/09/2026-09-23-0001.md'],
        complete: false,
      },
    })],
  }, () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000, explain: true });
    assert.strictEqual(r.paging.status, 'active');
    assert.strictEqual(r.paging.applied, true);
    assert.deepStrictEqual(r.paging.dropped, ['facts/2026/09/2026-09-22-0001.md']);
    assert.deepStrictEqual(r.paging.ordered, []);
    assert.ok(r.text.indexOf('分页 B 正文') < r.text.indexOf('分页 C 正文'), '未 complete 时应保留基线时间顺序');
    assert.match(r.paging.note, /complete/);
  });
});

test('候选集外文件：记录 note，不进入输出', (t) => {
  withStore(t, {
    entries: candidates(),
    providers: [pagingProvider({
      'memory.hook': {},
      'context.paging': {
        drop: ['facts/2026/09/ghost.md'],
        order: ['facts/2026/09/ghost.md'],
        complete: true,
      },
    })],
  }, () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000, explain: true });
    assert.strictEqual(r.paging.applied, false);
    assert.deepStrictEqual(r.paging.dropped, []);
    assert.deepStrictEqual(r.paging.ordered, []);
    assert.match(r.paging.note, /ghost/);
    assert.ok(!r.text.includes('ghost.md'));
  });
});

test('hook 先过滤，paging 只收到保留候选；自我接入档案受保护', (t) => {
  const dumped = path.join(os.tmpdir(), 'ytm-paging-hook-' + process.pid + '-' + Date.now() + '.json');
  const selfProfile = 'private/codex/prefs/2026-08-25-0001.md';
  const all = candidates().concat([{
    rel: selfProfile,
    meta: meta({
      type: 'PREF',
      subject: '自我接入档案',
      statement: 'agent_id: codex; agent_name: 知微',
      owner: 'codex',
      scope: 'private',
      created: '2026-08-25T10:00:00Z',
      updated: '2026-08-25T10:00:00Z',
    }),
  }]);
  try {
    withStore(t, {
      entries: all,
      providers: [pagingProvider({
        dumpFile: dumped,
        'memory.hook': { evict: [candidates()[0].rel] },
        'context.paging': {
          order: [candidates()[2].rel, candidates()[1].rel],
          complete: true,
        },
      })],
    }, (ctx) => {
      const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000, explain: true });
      assert.strictEqual(r.hook.applied, true);
      assert.strictEqual(r.paging.status, 'active');
      const payload = JSON.parse(fs.readFileSync(dumped, 'utf8'));
      const files = payload.candidates.map((item) => item.file);
      assert.ok(!files.includes(candidates()[0].rel), 'hook 已驱逐条目不应再进入 paging 候选');
      assert.ok(!files.includes(selfProfile), '自我接入档案不应进入 paging 候选');
      assert.deepStrictEqual(payload.protected, [selfProfile]);
      const audit = fs.readFileSync(path.join(ctx.providerHome, 'provider-audit.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).capability);
      assert.deepStrictEqual(audit, ['memory.hook', 'context.paging']);
    });
  } finally {
    fs.rmSync(dumped, { force: true });
  }
});

test('候选超过 500：只应用 drop，不应用 order', (t) => {
  const entries = [];
  for (let i = 0; i < 501; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    entries.push({
      rel: 'facts/2026/09/2026-09-' + day + '-' + String(i).padStart(4, '0') + '.md',
      meta: meta({
        subject: '截断条目 ' + i,
        statement: '截断正文 ' + i,
        created: '2026-09-' + day + 'T10:00:00Z',
        updated: '2026-09-' + day + 'T10:00:00Z',
      }),
    });
  }
  withStore(t, {
    entries,
    providers: [pagingProvider({
      'memory.hook': {},
      'context.paging': {
        drop: [entries[0].rel],
        order: [entries[500].rel, entries[1].rel],
        complete: true,
      },
    })],
  }, () => {
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 200000, explain: true });
    assert.strictEqual(r.paging.truncated, true);
    assert.deepStrictEqual(r.paging.dropped, [entries[0].rel]);
    assert.deepStrictEqual(r.paging.ordered, []);
    assert.match(r.paging.note, /500/);
  });
});

test('未配置 provider：加 budget 与不加 budget 的输出逐字节一致', (t) => {
  withStore(t, { entries: candidates() }, () => {
    const plain = memory.contextCore({ selfAgent: 'codex', limit: 10 });
    const budgeted = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000 });
    assert.strictEqual(budgeted.text, plain.text);
    assert.strictEqual(budgeted.paging.status, 'not_installed');
  });
});

test('license_required：回落普通上下文并保留状态行', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-paging-license-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const providerHome = path.join(root, '.provider-home');
  fs.mkdirSync(providerHome, { recursive: true });
  fs.writeFileSync(path.join(providerHome, 'provider.json'), JSON.stringify({
    schema: 1,
    providers: [{
      id: 'license-paging',
      capabilities: ['context.paging'],
      command: [process.execPath, FIXTURE, 'license'],
    }],
  }), 'utf8');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    provider: process.env.YOTTA_PROVIDER_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_PROVIDER_HOME = providerHome;
  process.env.YOTTA_MEMORY_CONFIG_DIR = path.join(root, '.config');
  process.env.YOTTA_MEMORY_AGENT_HOME = path.join(root, '.agent-home');
  try {
    fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
      version: 4,
      updated: '2026-09-30',
      entries: candidates().map((entry) => indexEntry(entry.rel, entry.meta)),
    }, null, 2), 'utf8');
    const r = memory.contextCore({ selfAgent: 'codex', limit: 10, budget: 6000, explain: true });
    assert.strictEqual(r.paging.status, 'license_required');
    assert.strictEqual(r.paging.applied, false);
    assert.ok(r.text.includes('分页 A 正文'));
    assert.ok(r.text.includes('预算分页'));
    assert.ok(r.trace.some((line) => line.includes('[paging]')));
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.provider === undefined) delete process.env.YOTTA_PROVIDER_HOME; else process.env.YOTTA_PROVIDER_HOME = saved.provider;
    if (saved.config === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.config;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
});

test('context --json：包含 paging 块', (t) => {
  withStore(t, {
    entries: candidates(),
    providers: [pagingProvider({
      'memory.hook': {},
      'context.paging': { drop: [], order: [], complete: true },
    })],
  }, (ctx) => {
    const env = Object.assign({}, process.env, {
      YOTTA_MEMORY_HOME: ctx.root,
      YOTTA_MEMORY_CONFIG_DIR: ctx.configDir,
      YOTTA_MEMORY_AGENT_HOME: ctx.agentHome,
      YOTTA_PROVIDER_HOME: ctx.providerHome,
    });
    const r = spawnSync(process.execPath, [CLI, 'context', '--agent', 'codex', '--budget', '6000', '--json'], {
      encoding: 'utf8',
      env,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.ok(payload.paging);
    assert.strictEqual(payload.paging.status, 'active');
    assert.ok(typeof payload.text === 'string');
  });
});
