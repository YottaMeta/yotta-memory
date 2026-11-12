'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-type-pressure-');
  const configDir = tmpdir('ytm-type-pressure-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfig = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(root);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfig === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfig;
  }
}

function entry(index, created, extra) {
  return Object.assign({
    file: 'facts/2026/11/2026-11-11-' + String(index + 1).padStart(4, '0') + '.md',
    type: 'FACT',
    subject: '压力样本 ' + index,
    statement: '类型压力观测样本',
    confidence: 1,
    created: created,
    updated: created,
    tags: [],
    immutable: false,
    scope: 'public',
    owner: '',
    source: '',
    weight: 1,
    access_count: 0,
    last_accessed: '',
    feedback_net: 0,
    hit_days: '',
    hit_queries: '',
    tokens: {},
  }, extra || {});
}

function writeIndex(root, entries) {
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 5, entries: entries }), 'utf8');
}

test('type pressure reports total, stale, archive candidates and 30-day growth', () => {
  withStore((root) => {
    const entries = [
      entry(0, '2025-01-01'),
      entry(1, '2025-02-01'),
      entry(2, '2026-11-01'),
    ];
    writeIndex(root, entries);
    memory.saveConfig({ memory_home: root, backup_setup_choice: 'manual' });

    const scale = memory.scaleReport(root, memory.loadConfig());
    assert.ok(scale.type_pressure.FACT);
    assert.strictEqual(scale.type_pressure.FACT.total, 3);
    assert.strictEqual(scale.type_pressure.FACT.stale_180d, 2);
    assert.strictEqual(scale.type_pressure.FACT.growth_30d, 1);
    assert.strictEqual(scale.type_pressure.FACT.archive_candidates, 2);
    assert.strictEqual(scale.type_pressure.FACT.pressure_level, 'info');
    assert.strictEqual(scale.type_pressure.FACT.final_thresholds_deferred, true);
  });
});

test('large stale type pressure with archive candidates becomes actionable warning', () => {
  withStore((root) => {
    const entries = [];
    for (let i = 0; i < 600; i++) entries.push(entry(i, i < 400 ? '2025-01-01' : '2026-11-01'));
    writeIndex(root, entries);
    memory.saveConfig({ memory_home: root, backup_setup_choice: 'manual' });

    const scale = memory.scaleReport(root, memory.loadConfig());
    assert.strictEqual(scale.type_pressure.FACT.total, 600);
    assert.strictEqual(scale.type_pressure.FACT.stale_180d, 400);
    assert.strictEqual(scale.type_pressure.FACT.archive_candidates, 400);
    assert.strictEqual(scale.type_pressure.FACT.pressure_level, 'warning');
    assert.ok(scale.type_pressure.FACT.warnings.some((line) => /归档候选/.test(line)));
  });
});
