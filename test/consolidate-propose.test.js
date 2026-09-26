'use strict';
// v0.18.0 A5: consolidate --propose report + --apply confirmation gate regression tests.
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
  const root = tmpdir('ytm-consolidate-store-');
  const configDir = tmpdir('ytm-consolidate-config-');
  const agentHome = tmpdir('ytm-consolidate-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
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

function ageAll(root, days) {
  const stamp = daysAgoStr(days);
  for (const fp of memory.collectEntryFiles(root)) {
    const text = fs.readFileSync(fp, 'utf8').replace(/^(created|updated): .*$/gm, (m) => m.split(':')[0] + ': ' + stamp);
    fs.writeFileSync(fp, text, 'utf8');
  }
}

function snapshotOpts() {
  return { snapshotDir: tmpdir('ytm-consolidate-snap-'), allowSameVolumeForTest: true };
}

function seedGroup() {
  memory.rememberCore('FACT', '方案甲项目进展', '方案甲一期已经交付', {});
  memory.rememberCore('FACT', '方案甲项目进展', '方案甲二期进入联调', {});
  memory.rememberCore('FACT', '方案甲项目进展', '方案甲三期评审完成', {});
}

function findBatch(text) {
  const m = text.match(/批次: ([0-9a-zA-Z-]+)/);
  return m ? m[1] : '';
}

function summaryCount(root) {
  let n = 0;
  for (const fp of memory.collectEntryFiles(root)) {
    if (/^subject: 周期摘要/m.test(fs.readFileSync(fp, 'utf8'))) n++;
  }
  return n;
}

test('consolidate defaults to a propose report and changes nothing', () => {
  withStore((root) => {
    seedGroup();
    ageAll(root, 700);
    const before = memory.collectEntryFiles(root).length;

    const r = memory.consolidateCore({});
    assert.strictEqual(r.error, false, r.text);
    assert.ok(/propose|预览/.test(r.text), 'propose mode must be explicit in the report: ' + r.text);
    assert.ok(r.text.indexOf('保留期') !== -1, 'propose report must state the retention period');
    assert.ok(r.report, 'propose must return a structured report');
    assert.strictEqual(r.report.mode, 'propose');
    assert.strictEqual(r.report.groups.length, 1);
    const group = r.report.groups[0];
    assert.strictEqual(group.type, 'FACT');
    assert.strictEqual(group.scope, 'public');
    assert.strictEqual(group.count, 3);
    assert.ok(group.age_min <= group.age_max);
    assert.strictEqual(group.files.length, 3);
    assert.ok(group.theme && group.theme.length > 0);
    assert.ok(r.report.retention.length > 0, 'report must carry the retention statement');
    assert.strictEqual(memory.collectEntryFiles(root).length, before, 'propose must not move anything');
    assert.strictEqual(summaryCount(root), 0, 'propose must not create summaries');
  });
});

test('consolidate --apply without --yes is refused and leaves the store untouched', () => {
  withStore((root) => {
    seedGroup();
    ageAll(root, 700);
    const before = memory.collectEntryFiles(root).length;
    const r = memory.consolidateCore(Object.assign({ apply: true }, snapshotOpts()));
    assert.strictEqual(r.error, true);
    assert.strictEqual(r.exitCode, 2);
    assert.ok(r.text.indexOf('--yes') !== -1, 'refusal must explain the non-interactive confirmation: ' + r.text);
    assert.strictEqual(memory.collectEntryFiles(root).length, before);
    assert.strictEqual(summaryCount(root), 0);
  });
});

test('consolidate --apply --yes executes, prints the first-run notice once, and stays undoable', () => {
  withStore((root) => {
    seedGroup();
    ageAll(root, 700);

    const first = memory.consolidateCore(Object.assign({ apply: true, yes: true, selfAgent: 'codex' }, snapshotOpts()));
    assert.strictEqual(first.error, false, first.text);
    assert.ok(first.text.indexOf('首次启用') !== -1, 'first run must explain the data lifecycle: ' + first.text);
    assert.ok(/检查.*纠正.*导出.*停用.*删除/.test(first.text.replace(/\s+/g, '')), 'first-run notice must list the five actions');
    const batch = findBatch(first.text);
    assert.ok(batch, 'apply must report the batch id: ' + first.text);
    assert.strictEqual(summaryCount(root), 1, 'apply must create one summary');

    const second = memory.consolidateCore({});
    assert.ok(second.text.indexOf('首次启用') === -1, 'first-run notice must not repeat');

    const undo = memory.consolidateCore({ undo: batch, selfAgent: 'codex' });
    assert.strictEqual(undo.error, false, undo.text);
    assert.strictEqual(summaryCount(root), 0, 'undo must remove the summary');
    assert.strictEqual(memory.collectEntryFiles(root).length, 3, 'undo must restore the originals');
  });
});

test('consolidate --apply --yes still goes through the destructive guard', () => {
  withStore((root) => {
    seedGroup();
    ageAll(root, 700);
    const r = memory.consolidateCore({ apply: true, yes: true, selfAgent: 'codex' });
    assert.strictEqual(r.error, true, 'missing snapshot directory must be refused');
    assert.ok(r.text.indexOf('快照') !== -1 || r.text.indexOf('备份') !== -1, r.text);
    assert.strictEqual(summaryCount(root), 0);
  });
});
