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
  const root = tmpdir('ytm-layout-migration-');
  const configDir = tmpdir('ytm-layout-migration-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfig = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{}}\n', 'utf8');
  try {
    return fn(root);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfig === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfig;
  }
}

function writeFact(root, rel, subject, statement) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const created = path.basename(rel).slice(0, 10);
  fs.writeFileSync(full, [
    '---',
    'type: FACT',
    'subject: ' + subject,
    'statement: ' + statement,
    'confidence: 1',
    'created: ' + created,
    'updated: ' + created,
    'tags: []',
    'immutable: false',
    'scope: public',
    'owner: ',
    'source: test',
    'weight: 1',
    'access_count: 0',
    'last_accessed: ',
    'feedback_net: 0',
    '---',
    '',
    statement,
    '',
  ].join('\n'), 'utf8');
  return full;
}

function runCli(args) {
  return childProcess.spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env),
  });
}

test('new FACT and private writes use year/month/day buckets', () => {
  withStore((root) => {
    const fact = memory.rememberCore('FACT', '日级公共桶', '公共记忆进入日级目录', {
      root,
      _today: '2026-10-11',
    });
    assert.strictEqual(fact.error, false, fact.text);
    assert.match(fact.text, /facts[\\/]2026[\\/]10[\\/]11[\\/]/);

    const pref = memory.rememberCore('PREF', '日级私密桶', '私密记忆进入日级目录', {
      root,
      owner: 'codex',
      agent: 'codex',
      _today: '2026-10-12',
    });
    assert.strictEqual(pref.error, false, pref.text);
    assert.match(pref.text, /private[\\/]codex[\\/]prefs[\\/]2026[\\/]10[\\/]12[\\/]/);
  });
});

test('layout plan targets oversized month buckets and excludes flat roots by default', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '十一是', '十月一');
    writeFact(root, 'facts/2026/10/2026-10-02-0002.md', '十二是', '十月二');
    writeFact(root, 'facts/2026/10/2026-10-03-0003.md', '十三是', '十月三');
    writeFact(root, 'facts/2026/09/2026-09-01-0001.md', '九一是', '九月一');
    writeFact(root, 'facts/2026-10-04-0004.md', '平铺是', '平铺不默认迁');

    const plan = memory.layoutPlanCore({
      root,
      threshold: 2,
      now: '2026-11-11T22:20:00.000Z',
    });

    assert.strictEqual(plan.error, false, plan.text);
    assert.strictEqual(plan.candidates.length, 1);
    assert.strictEqual(plan.candidates[0].path, 'facts/2026/10');
    assert.strictEqual(plan.operations.length, 3);
    assert.ok(plan.operations.every((item) => /^facts\/2026\/10\/\d{2}\//.test(item.to)));
    assert.ok(fs.existsSync(plan.planFile));
    assert.strictEqual(plan.includeFlat, false);
  });
});

test('layout apply moves files, builds index, and rollback restores exact bytes', () => {
  withStore((root) => {
    const files = [
      writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '迁一', '迁一内容'),
      writeFact(root, 'facts/2026/10/2026-10-02-0002.md', '迁二', '迁二内容'),
    ];
    const before = files.map((file) => fs.readFileSync(file));
    const plan = memory.layoutPlanCore({
      root,
      threshold: 0,
      now: '2026-11-11T22:21:00.000Z',
    });
    assert.strictEqual(plan.error, false, plan.text);

    const applied = memory.layoutApplyCore({
      root,
      planFile: plan.planFile,
      yes: true,
    });
    assert.strictEqual(applied.error, false, applied.text);
    assert.strictEqual(files.some((file) => fs.existsSync(file)), false);
    assert.strictEqual(memory.loadIndex(root).length, 2);
    assert.ok(fs.existsSync(applied.journalFile));

    const rolledBack = memory.layoutRollbackCore({
      root,
      batch: plan.batch,
      yes: true,
    });
    assert.strictEqual(rolledBack.error, false, rolledBack.text);
    assert.deepStrictEqual(files.map((file) => fs.readFileSync(file)), before);
    assert.strictEqual(memory.loadIndex(root).length, 2);
  });
});

test('layout plan rejects an occupied target path', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '源', '源内容');
    writeFact(root, 'facts/2026/10/01/2026-10-01-0001.md', '占用', '目标已存在');

    const plan = memory.layoutPlanCore({
      root,
      threshold: 0,
      now: '2026-11-11T22:22:00.000Z',
    });

    assert.strictEqual(plan.error, true);
    assert.strictEqual(plan.conflicts.length, 1);
    assert.match(plan.text, /冲突|占用/);
  });
});

test('layout apply rolls back completed moves when a later source is missing', () => {
  withStore((root) => {
    const first = writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '一', '一内容');
    const second = writeFact(root, 'facts/2026/10/2026-10-02-0002.md', '二', '二内容');
    const firstBefore = fs.readFileSync(first);
    const plan = memory.layoutPlanCore({
      root,
      threshold: 1,
      now: '2026-11-11T22:23:00.000Z',
    });
    assert.strictEqual(plan.error, false, plan.text);
    fs.unlinkSync(second);

    const applied = memory.layoutApplyCore({
      root,
      planFile: plan.planFile,
      yes: true,
    });

    assert.strictEqual(applied.error, true);
    assert.strictEqual(applied.rolledBack, true);
    assert.deepStrictEqual(fs.readFileSync(first), firstBefore);
    assert.strictEqual(fs.existsSync(second), false);
    assert.strictEqual(plan.operations.some((item) => fs.existsSync(path.join(root, item.to))), false);
  });
});

test('layout apply requires explicit --yes', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '一', '一内容');
    const plan = memory.layoutPlanCore({
      root,
      threshold: 1,
      now: '2026-11-11T22:24:00.000Z',
    });
    const applied = memory.layoutApplyCore({ root, planFile: plan.planFile });
    assert.strictEqual(applied.error, true);
    assert.match(applied.text, /--yes/);
  });
});

test('layout apply rejects plan paths outside the memory root', () => {
  withStore((root) => {
    const source = writeFact(root, 'facts/2026/10/2026-10-01-0001.md', '路径', '路径安全');
    const before = fs.readFileSync(source);
    const plan = memory.layoutPlanCore({
      root,
      threshold: 0,
      now: '2026-11-11T22:25:00.000Z',
    });
    const tampered = JSON.parse(fs.readFileSync(plan.planFile, 'utf8'));
    tampered.operations[0].to = '../../escape.md';
    fs.writeFileSync(plan.planFile, JSON.stringify(tampered, null, 2), 'utf8');

    const applied = memory.layoutApplyCore({ root, planFile: plan.planFile, yes: true });

    assert.strictEqual(applied.error, true);
    assert.match(applied.text, /不安全路径/);
    assert.deepStrictEqual(fs.readFileSync(source), before);
    assert.strictEqual(fs.existsSync(path.join(root, '..', '..', 'escape.md')), false);
  });
});

test('layout plan, apply and rollback are callable through the CLI', () => {
  withStore((root) => {
    writeFact(root, 'facts/2026/10/2026-10-01-0001.md', 'CLI 一', 'CLI 一内容');
    writeFact(root, 'facts/2026/10/2026-10-02-0002.md', 'CLI 二', 'CLI 二内容');

    const planned = runCli(['layout', 'plan', '--threshold', '1', '--json']);
    assert.strictEqual(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    assert.strictEqual(plan.operations.length, 2);

    const applied = runCli(['layout', 'apply', '--from-plan', plan.planFile, '--yes', '--json']);
    assert.strictEqual(applied.status, 0, applied.stderr || applied.stdout);
    assert.strictEqual(JSON.parse(applied.stdout).error, false);

    const rolledBack = runCli(['layout', 'rollback', '--batch', plan.batch, '--yes', '--json']);
    assert.strictEqual(rolledBack.status, 0, rolledBack.stderr || rolledBack.stdout);
    assert.strictEqual(JSON.parse(rolledBack.stdout).error, false);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2026', '10', '2026-10-01-0001.md')));
  });
});
