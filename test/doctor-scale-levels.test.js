'use strict';
// v0.18.0 A6: scale / health threshold levels (ok | info | warning) regression tests.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-scale-level-store-');
  const configDir = tmpdir('ytm-scale-level-config-');
  const agentHome = tmpdir('ytm-scale-level-home-');
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

function writeConfig(configDir, extra) {
  const fp = path.join(configDir, 'config.json');
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(Object.assign({ backup_setup_choice: 'manual' }, extra || {}), null, 2), 'utf8');
}

function seedFacts(count) {
  fs.writeFileSync(path.join(process.env.YOTTA_MEMORY_HOME, 'agents.json'), JSON.stringify({ agents: {} }, null, 2), 'utf8');
  for (let i = 0; i < count; i++) {
    memory.rememberCore('FACT', '规模分级种子' + (i + 1), '用于规模分级回归测试', {});
  }
}

const CALM_OTHER_METRICS = {
  scale_info_files_per_dir: 1000,
  scale_warn_files_per_dir: 2000,
  scale_info_index_bytes: 1000000000,
  scale_warn_index_bytes: 2000000000,
  scale_info_cold_start_ms: 1000000,
  scale_warn_cold_start_ms: 2000000,
};

test('scale levels: info level is reported per metric without flipping doctor.ok', () => {
  withStore((root, configDir) => {
    writeConfig(configDir, Object.assign({
      scale_info_entries: 4,
      scale_warn_entries: 8,
    }, CALM_OTHER_METRICS));
    seedFacts(5);

    const report = memory.doctorCore({ root });
    assert.ok(report.checks.scale, 'checks.scale must exist');
    assert.strictEqual(report.checks.scale.level, 'info');
    const entryMetric = (report.checks.scale.metrics || []).filter((m) => m.key === 'entries')[0];
    assert.ok(entryMetric, 'metrics must contain entries');
    assert.strictEqual(entryMetric.level, 'info');
    assert.strictEqual(entryMetric.value, 5);
    assert.strictEqual(entryMetric.info, 4);
    assert.strictEqual(entryMetric.warn, 8);
    assert.strictEqual(report.ok, true, 'doctor.ok must only follow critical issues');
    assert.strictEqual(report.level, 'ok', 'info level must not surface as a doctor warning');
    assert.ok(report.text.indexOf('提示') !== -1, 'doctor text must label the info level');

    const cap = memory.capacityCore({ selfAgent: 'codex' });
    assert.strictEqual(cap.report.water.thresholds.scale_info_entries, 4, 'capacity report must reuse the same thresholds');
    assert.strictEqual(cap.report.water.level, 'info', 'capacity water level must reuse the same scale level');
  });
});

test('scale levels: warning level is reported and doctor.ok stays true', () => {
  withStore((root, configDir) => {
    writeConfig(configDir, Object.assign({
      scale_info_entries: 2,
      scale_warn_entries: 4,
    }, CALM_OTHER_METRICS));
    seedFacts(5);

    const report = memory.doctorCore({ root });
    assert.strictEqual(report.checks.scale.level, 'warning');
    assert.strictEqual(report.ok, true, 'scale warnings are not critical');
    assert.strictEqual(report.level, 'warning');
    assert.ok(report.checks.scale.warnings.some((item) => /规模/.test(item)));
    const entryMetric = report.checks.scale.metrics.filter((m) => m.key === 'entries')[0];
    assert.strictEqual(entryMetric.level, 'warning');
    assert.ok(report.text.indexOf('告警') !== -1, 'doctor text must label the warning level');
  });
});

test('doctor --json exposes scale metrics for automation', () => {
  withStore((root, configDir, agentHome) => {
    writeConfig(configDir, Object.assign({
      scale_info_entries: 3,
      scale_warn_entries: 6,
    }, CALM_OTHER_METRICS));
    seedFacts(4);

    const env = Object.assign({}, process.env, {
      YOTTA_MEMORY_HOME: root,
      YOTTA_MEMORY_CONFIG_DIR: configDir,
      YOTTA_MEMORY_AGENT_HOME: agentHome,
    });
    const cli = spawnSync(process.execPath, [CLI, 'doctor', '--json'], { encoding: 'utf8', env });
    assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
    const parsed = JSON.parse(cli.stdout);
    assert.ok(Array.isArray(parsed.checks.scale.metrics), 'doctor --json must expose metrics[]');
    const keys = parsed.checks.scale.metrics.map((m) => m.key).sort();
    assert.deepStrictEqual(keys, ['cold_start_ms', 'entries', 'files_per_dir', 'index_bytes']);
    assert.strictEqual(parsed.checks.scale.metrics.filter((m) => m.key === 'entries')[0].level, 'info');
  });
});
