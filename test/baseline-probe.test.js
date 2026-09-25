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
  const root = tmpdir('ytm-baseline-store-');
  const configDir = tmpdir('ytm-baseline-config-');
  const agentHome = tmpdir('ytm-baseline-home-');
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

function snapshotTree(root) {
  const out = {};
  function walk(dir, base) {
    for (const name of fs.readdirSync(dir).sort()) {
      const fp = path.join(dir, name);
      const rel = base ? base + '/' + name : name;
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        walk(fp, rel);
        continue;
      }
      out[rel] = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    }
  }
  walk(root, '');
  return out;
}

function seedFacts(root, facts) {
  for (const [subject, statement, date] of facts) {
    const written = memory.rememberCore('FACT', subject, statement, { _today: date });
    assert.strictEqual(written.error, false, written.text);
  }
  return memory.getIndex(root);
}

function writeAgents(root, ids) {
  const agents = {};
  for (const id of ids) agents[id] = { host: 'test-host', created: '2026-09-01' };
  fs.writeFileSync(path.join(root, 'agents.json'), JSON.stringify({ version: 1, agents: agents }, null, 2), 'utf8');
}

function probeById(report, id) {
  return (report.probes || []).find(function (p) { return p.id === id; });
}

// ---- A2：恢复 / 迁移基线探针 ----

test('baseline covers the six fixed probe categories on a healthy store', () => {
  withStore((root) => {
    seedFacts(root, [
      ['发布检查清单', '推送前必须跑完整验证', '2026-09-01'],
      ['中文条目', '中文记忆必须可召回', '2026-08-15'],
    ]);
    writeAgents(root, ['codex']);
    const bound = memory.rememberCore('BOUND', '操作规则', '禁止未授权删除记忆', {
      _today: '2026-09-02',
      agent: 'codex',
    });
    assert.strictEqual(bound.error, false, bound.text);

    const report = memory.baselineCore({ root: root, seed: 20260925 });
    assert.deepStrictEqual(
      report.probes.map(function (p) { return p.id; }),
      ['identity', 'recent', 'source-only', 'cjk', 'rules', 'owner']
    );
    assert.strictEqual(report.ok, true, report.text);
    assert.strictEqual(probeById(report, 'identity').status, 'pass');
    assert.strictEqual(probeById(report, 'recent').status, 'pass');
    assert.strictEqual(probeById(report, 'source-only').status, 'skip');
    assert.strictEqual(probeById(report, 'cjk').status, 'pass');
    assert.strictEqual(probeById(report, 'rules').status, 'pass');
    assert.strictEqual(probeById(report, 'owner').status, 'pass');
    assert.match(report.text, /基线探针/);

    const cli = runCli(root, ['doctor', '--baseline']);
    assert.strictEqual(cli.status, 0, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /基线探针/);
    const json = runCli(root, ['doctor', '--baseline', '--json']);
    assert.strictEqual(json.status, 0, json.stderr || json.stdout);
    const parsed = JSON.parse(json.stdout);
    assert.strictEqual(parsed.checks.baseline.ok, true);
    assert.strictEqual(parsed.checks.baseline.probes.length, 6);
  });
});

test('missing identity registration fails the identity probe and doctor exits non-zero', () => {
  withStore((root) => {
    seedFacts(root, [['发布检查清单', '推送前必须跑完整验证', '2026-09-01']]);

    const report = memory.baselineCore({ root: root });
    assert.strictEqual(report.ok, false, report.text);
    assert.strictEqual(probeById(report, 'identity').status, 'fail');
    assert.match(probeById(report, 'identity').detail, /agents\.json/);

    const cli = runCli(root, ['doctor', '--baseline']);
    assert.strictEqual(cli.status, 2, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /基线探针/);

    // 不带 --baseline 时 doctor 的既有语义不变（探针不参与常规可靠性检查）。
    const plain = runCli(root, ['doctor']);
    assert.strictEqual(plain.status, 0, plain.stdout + plain.stderr);
  });
});

test('source-only probe reports entries that never arrived in the target store', () => {
  withStore((root) => {
    seedFacts(root, [
      ['甲条目', '甲的正文', '2026-09-01'],
      ['乙条目', '乙的正文', '2026-08-02'],
      ['丙条目', '丙的正文', '2026-07-03'],
    ]);
    writeAgents(root, ['codex']);

    const source = tmpdir('ytm-baseline-source-');
    fs.cpSync(root, source, { recursive: true });
    const files = memory.getIndex(root).map(function (e) { return e.file; }).sort();
    fs.rmSync(path.join(root, files[0]));
    fs.rmSync(path.join(root, files[1]));
    memory.buildIndex(root);

    const report = memory.baselineCore({ root: root, against: source });
    assert.strictEqual(report.ok, false, report.text);
    const probe = probeById(report, 'source-only');
    assert.strictEqual(probe.status, 'fail');
    assert.strictEqual(report.counts.missing, 2);
    assert.match(probe.detail, /缺失 2 条/);

    const cli = runCli(root, ['doctor', '--baseline', '--against', source]);
    assert.strictEqual(cli.status, 2, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /缺失 2 条/);

    // 目标库补齐后同一对比必须转绿。
    const target = tmpdir('ytm-baseline-target-');
    fs.cpSync(source, target, { recursive: true });
    const green = memory.baselineCore({ root: target, against: source });
    assert.strictEqual(green.ok, true, green.text);
    assert.strictEqual(probeById(green, 'source-only').status, 'pass');
    assert.strictEqual(green.counts.missing, 0);
  });
});

test('template v1 adds explicit owner, count and recall expectations', () => {
  withStore((root) => {
    seedFacts(root, [['甲条目', '甲的正文', '2026-09-01']]);
    writeAgents(root, ['codex']);
    const templateFile = path.join(tmpdir('ytm-baseline-template-'), 'baseline.json');
    fs.writeFileSync(templateFile, JSON.stringify({
      version: 1,
      expect_owners: ['codex', 'hero'],
      expect_min_entries: 5,
      queries: [{ id: 'q-missing', query: 'zzqqxx-unrelated-latin-token', expect: ['facts/2026/09/2026-09-01-0001.md'] }],
    }, null, 2), 'utf8');

    const report = memory.baselineCore({ root: root, template: templateFile });
    assert.strictEqual(report.ok, false, report.text);
    assert.strictEqual(probeById(report, 'identity').status, 'fail');
    assert.match(probeById(report, 'identity').detail, /hero/);
    assert.strictEqual(probeById(report, 'owner').status, 'fail');
    assert.match(probeById(report, 'owner').detail, /缺少 4 条/);
    assert.strictEqual(probeById(report, 'template-queries').status, 'fail');
    assert.match(probeById(report, 'template-queries').detail, /q-missing/);
  });
});

test('template validation rejects bad files with Chinese guidance', () => {
  withStore((root) => {
    seedFacts(root, [['甲条目', '甲的正文', '2026-09-01']]);
    const dir = tmpdir('ytm-baseline-template-');
    const badVersion = path.join(dir, 'bad-version.json');
    fs.writeFileSync(badVersion, JSON.stringify({ version: 2 }), 'utf8');
    const badJson = path.join(dir, 'bad-json.json');
    fs.writeFileSync(badJson, '{ not json', 'utf8');

    const missing = runCli(root, ['doctor', '--baseline', '--template', path.join(dir, 'nope.json')]);
    assert.strictEqual(missing.status, 2, missing.stdout + missing.stderr);
    assert.match(missing.stdout + missing.stderr, /找不到基线模板/);

    const version = runCli(root, ['doctor', '--baseline', '--template', badVersion]);
    assert.strictEqual(version.status, 2, version.stdout + version.stderr);
    assert.match(version.stdout + version.stderr, /模板版本不支持/);

    const json = runCli(root, ['doctor', '--baseline', '--template', badJson]);
    assert.strictEqual(json.status, 2, json.stdout + json.stderr);
    assert.match(json.stdout + json.stderr, /不是合法 JSON/);
  });
});

test('baseline probes stay read-only on the inspected store', () => {
  withStore((root) => {
    seedFacts(root, [
      ['甲条目', '甲的正文', '2026-09-01'],
      ['乙条目', '乙的正文', '2026-08-02'],
    ]);
    writeAgents(root, ['codex']);
    const before = snapshotTree(root);
    memory.baselineCore({ root: root });
    const cli = runCli(root, ['doctor', '--baseline', '--json']);
    assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
    assert.deepStrictEqual(snapshotTree(root), before);
  });
});

test('backup drill --probe runs the probes on the restored copy', () => {
  withStore((root) => {
    seedFacts(root, [
      ['甲条目', '甲的正文', '2026-09-01'],
      ['乙条目', '乙的正文', '2026-08-02'],
    ]);
    writeAgents(root, ['codex']);
    const backupDir = tmpdir('ytm-baseline-backup-');
    const created = memory.backupCreateCore({
      root: root,
      dir: backupDir,
      now: new Date('2026-09-25T10:00:00Z'),
      allowSameVolume: true,
    });
    assert.strictEqual(created.error, false, created.text);

    const ok = memory.backupDrillCore({
      root: root,
      dir: backupDir,
      probe: true,
      now: new Date('2026-09-25T10:05:00Z'),
    });
    assert.strictEqual(ok.ok, true, ok.text);
    assert.strictEqual(ok.probes.length, 6);
    assert.match(ok.text, /基线探针/);

    // 备份之后库又长了新条目 → 恢复副本相对源库缺条目，探针必须变红。
    seedFacts(root, [['丙条目', '备份之后新增的记忆', '2026-09-25']]);
    const stale = memory.backupDrillCore({
      root: root,
      dir: backupDir,
      probe: true,
      against: root,
      now: new Date('2026-09-25T10:10:00Z'),
    });
    assert.strictEqual(stale.ok, false, stale.text);
    assert.match(stale.text, /基线探针/);
    const cli = runCli(root, ['backup', 'drill', '--dir', backupDir, '--probe', '--against', root]);
    assert.strictEqual(cli.status, 2, cli.stdout + cli.stderr);
  });
});
