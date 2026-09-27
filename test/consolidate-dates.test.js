'use strict';
// v0.18.1 A9: relative-date absolutization in consolidate summaries.
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
  const root = tmpdir('ytm-dates-store-');
  const configDir = tmpdir('ytm-dates-config-');
  const agentHome = tmpdir('ytm-dates-home-');
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

function snapshotOpts() {
  return { snapshotDir: tmpdir('ytm-dates-snap-'), allowSameVolumeForTest: true };
}

function setDates(root, stamp) {
  for (const fp of memory.collectEntryFiles(root)) {
    const text = fs.readFileSync(fp, 'utf8').replace(/^(created|updated): .*$/gm, (m) => m.split(':')[0] + ': ' + stamp);
    fs.writeFileSync(fp, text, 'utf8');
  }
}

function seedRelativeGroup() {
  memory.rememberCore('FACT', '方案乙进展', '昨天完成一期联调', {});
  memory.rememberCore('FACT', '方案乙进展', '上周评审通过', {});
  memory.rememberCore('FACT', '方案乙进展', '最近调整了方案', {});
}

function findSummary(root) {
  for (const fp of memory.collectEntryFiles(root)) {
    const text = fs.readFileSync(fp, 'utf8');
    if (/^subject: 周期摘要/m.test(text)) return text;
  }
  return '';
}

function findBatch(text) {
  const m = text.match(/批次: ([0-9a-zA-Z-]+)/);
  return m ? m[1] : '';
}

test('consolidate propose previews how many relative dates will be normalized', () => {
  withStore((root) => {
    seedRelativeGroup();
    setDates(root, '2026-01-10');
    const r = memory.consolidateCore({ selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    assert.strictEqual(r.report.groups.length, 1);
    assert.strictEqual(r.report.groups[0].date_normalized_preview, 2, 'fuzzy word 最近 must not be counted');
    assert.match(r.text, /日期归一预览 2 处/);
  });
});

test('consolidate apply writes absolute dates into the summary but keeps originals verbatim', () => {
  withStore((root) => {
    seedRelativeGroup();
    setDates(root, '2026-01-10');
    const r = memory.consolidateCore(Object.assign({ apply: true, yes: true, selfAgent: 'codex' }, snapshotOpts()));
    assert.strictEqual(r.error, false, r.text);
    assert.strictEqual(r.report.date_normalized, 2);
    assert.strictEqual(r.report.markers_written, 3);
    assert.strictEqual(r.report.marker_errors, 0);
    const summary = findSummary(root);
    assert.ok(summary.indexOf('昨天（2026-01-09）') !== -1, summary);
    assert.ok(summary.indexOf('上周（2025-12-29 ~ 2026-01-04）') !== -1, summary);
    assert.ok(summary.indexOf('最近调整了方案') !== -1, summary);
    assert.ok(summary.indexOf('最近（') === -1, 'fuzzy word must stay unnormalized');
    const archived = fs.readdirSync(path.join(root, '.archive', 'facts')).filter((f) => f.endsWith('.md'));
    const archivedText = archived.map((f) => fs.readFileSync(path.join(root, '.archive', 'facts', f), 'utf8')).join('\n');
    assert.ok(archivedText.indexOf('昨天完成一期联调') !== -1, 'originals must stay verbatim in .archive');
    assert.strictEqual(findBatch(r.text) !== '', true, 'batch id must be reported');
  });
});
