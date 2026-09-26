'use strict';
// v0.18.0 修正回归：archive --dry-run 只读预演 / 无候选时不建整库快照 / archive --json 报告。
// 背景：WorkBuddy 验收 0.18.0 候选报「--dry-run 照常落盘」；根因 archiveCore 未接 opts.dryRun。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

function withStore(fn) {
  const root = tmpdir('ytm-archive-store-');
  const configDir = tmpdir('ytm-archive-config-');
  const agentHome = tmpdir('ytm-archive-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root, configDir, agentHome);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function cliEnv(root, configDir, agentHome) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  env.YOTTA_MEMORY_HOME = root;
  env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  return env;
}

function rel(root, fp) {
  return path.relative(root, fp).replace(/\\/g, '/');
}

function findBySubject(root, subject) {
  const fp = memory.collectEntryFiles(root).filter((f) => fs.readFileSync(f, 'utf8').includes(subject))[0];
  assert.ok(fp, 'entry not found: ' + subject);
  return fp;
}

function patchMeta(fp, patch) {
  let text = fs.readFileSync(fp, 'utf8');
  for (const key of Object.keys(patch)) {
    const re = new RegExp('^' + key + ':.*$', 'm');
    if (re.test(text)) text = text.replace(re, key + ': ' + patch[key]);
    else text = text.replace('\n---\n', '\n' + key + ': ' + patch[key] + '\n---\n');
  }
  fs.writeFileSync(fp, text, 'utf8');
}

// 全库快照（含 .archive / index / 配置落盘文件）：任何写入都会改指纹。
function storeSnapshot(root) {
  const out = {};
  const walk = function (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fp);
      else out[rel(root, fp)] = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function dirEntries(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

function snapshotOpts() {
  return { snapshotDir: tmpdir('ytm-archive-snap-'), allowSameVolumeForTest: true };
}

function seedArchiveStore(root) {
  memory.rememberCore('FACT', '普通旧条目', '普通旧条目，应该在预演里被列为将归档', { _today: daysAgoStr(40) });
  memory.rememberCore('FACT', 'pinned 条目', '带 pinned 标签的旧条目，默认豁免', { _today: daysAgoStr(40) });
  memory.rememberCore('FACT', '新条目', '十天龄的新条目处于冷却期', { _today: daysAgoStr(10) });
  memory.rememberCore('FACT', 'immutable 条目', 'immutable 旧条目始终豁免', { _today: daysAgoStr(40) });
  memory.rememberCore('BOUND', '边界条目', 'BOUND 常驻，始终豁免', { owner: 'codex', selfAgent: 'codex', _today: daysAgoStr(40) });
  patchMeta(findBySubject(root, 'pinned 条目'), { tags: '[pinned]' });
  patchMeta(findBySubject(root, 'immutable 条目'), { immutable: 'true' });
}

test('archive --dry-run 只预览：不动文件、不建快照、不写审计', () => {
  withStore((root) => {
    seedArchiveStore(root);
    const opts = Object.assign({ dryRun: true, days: 7, threshold: 999, selfAgent: 'codex' }, snapshotOpts());
    const before = storeSnapshot(root);
    const snapsBefore = dirEntries(opts.snapshotDir);

    const r = memory.archiveCore(opts);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /^预览（未改动）/);
    assert.match(r.text, /将归档 1 条/);
    assert.match(r.text, /普通旧条目/);
    assert.strictEqual(r.report.mode, 'dry-run');
    assert.strictEqual(r.report.candidates.length, 1);
    assert.deepStrictEqual(r.report.archived, []);
    assert.deepStrictEqual(storeSnapshot(root), before, 'dry-run 不得改动记忆库任何文件');
    assert.deepStrictEqual(dirEntries(opts.snapshotDir), snapsBefore, 'dry-run 不得创建事务快照');
  });
});

test('archive --dry-run --force 把冷却期与常青算进候选，但仍零写入', () => {
  withStore((root) => {
    seedArchiveStore(root);
    const opts = Object.assign({ dryRun: true, force: true, days: 7, threshold: 999, selfAgent: 'codex' }, snapshotOpts());
    const before = storeSnapshot(root);

    const r = memory.archiveCore(opts);

    assert.strictEqual(r.error, false, r.text);
    assert.strictEqual(r.report.force, true);
    assert.strictEqual(r.report.candidates.length, 3, 'force 预演应列出 pinned / 冷却期 / 普通旧条目：' + JSON.stringify(r.report.candidates));
    assert.deepStrictEqual(storeSnapshot(root), before, 'force 预演同样不得写盘');
  });
});

test('archive 无候选时不创建整库事务快照', () => {
  withStore((root) => {
    seedArchiveStore(root);
    const opts = Object.assign({ days: 9999, threshold: 0, selfAgent: 'codex' }, snapshotOpts());
    const before = storeSnapshot(root);

    const r = memory.archiveCore(opts);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /已归档 0 条/);
    assert.match(r.text, /未创建事务快照/);
    assert.deepStrictEqual(r.report.archived, []);
    assert.deepStrictEqual(dirEntries(opts.snapshotDir), [], '无候选时不应创建快照目录');
    assert.deepStrictEqual(storeSnapshot(root), before, '无候选时不应改动记忆库');
  });
});

test('archive 有候选时执行路径不变：闸门 + 快照 + 审计 + 归档 + 索引更新', () => {
  withStore((root) => {
    seedArchiveStore(root);
    const target = findBySubject(root, '普通旧条目');
    const basename = path.basename(target);
    const opts = Object.assign({ days: 7, threshold: 999, selfAgent: 'codex' }, snapshotOpts());

    const r = memory.archiveCore(opts);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /^已归档 1 条旧记忆到/);
    assert.match(r.text, /事务快照: GoN-/);
    assert.strictEqual(r.report.archived.length, 1);
    assert.strictEqual(dirEntries(opts.snapshotDir).length, 1, '执行路径必须创建事务快照');
    assert.ok(!fs.existsSync(target), '被归档条目应离开主库');
    const archived = [];
    const walk = function (dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fp);
        else archived.push(rel(root, fp));
      }
    };
    walk(path.join(root, '.archive'));
    assert.ok(archived.some((f) => f.endsWith(basename)), '归档区应出现该条目：' + archived.join('、'));
    assert.ok(fs.existsSync(path.join(root, '.archive', 'audit-' + ymd(new Date()) + '.jsonl')), '执行路径必须写审计');
    assert.ok(findBySubject(root, 'pinned 条目'), 'pinned 条目默认豁免');
    assert.ok(findBySubject(root, 'immutable 条目'), 'immutable 条目始终豁免');
    assert.ok(findBySubject(root, '边界条目'), 'BOUND 条目始终豁免');
  });
});

test('CLI archive --dry-run --json 输出结构化报告；无候选时 --json 同样可用', () => {
  withStore((root, configDir, agentHome) => {
    seedArchiveStore(root);
    const env = cliEnv(root, configDir, agentHome);

    const dry = spawnSync(process.execPath, [CLI, 'archive', '--days', '7', '--threshold', '999', '--dry-run', '--json', '--agent', 'codex'], { encoding: 'utf8', env });
    assert.strictEqual(dry.status, 0, dry.stderr || dry.stdout);
    const parsed = JSON.parse(dry.stdout);
    assert.strictEqual(parsed.mode, 'dry-run');
    assert.strictEqual(parsed.candidates.length, 1);

    const none = spawnSync(process.execPath, [CLI, 'archive', '--days', '9999', '--threshold', '0', '--json', '--agent', 'codex'], { encoding: 'utf8', env });
    assert.strictEqual(none.status, 0, none.stderr || none.stdout);
    const parsedNone = JSON.parse(none.stdout);
    assert.strictEqual(parsedNone.mode, 'apply');
    assert.deepStrictEqual(parsedNone.archived, []);
  });
});

test('archive 被破坏性闸门拒绝时 exit 2', () => {
  withStore((root, configDir, agentHome) => {
    seedArchiveStore(root);
    const env = cliEnv(root, configDir, agentHome);
    // 同卷备份目录（都在系统临时目录）：闸门必须拒绝，且退出码为 2。
    const sameVolume = tmpdir('ytm-archive-samevol-');
    const cfg = spawnSync(process.execPath, [CLI, 'config', 'set', 'backup_dir', sameVolume], { encoding: 'utf8', env });
    assert.strictEqual(cfg.status, 0, cfg.stderr || cfg.stdout);

    const r = spawnSync(process.execPath, [CLI, 'archive', '--days', '7', '--threshold', '999', '--agent', 'codex'], { encoding: 'utf8', env });

    assert.strictEqual(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /拒绝|同一卷/);
  });
});
