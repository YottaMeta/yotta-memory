'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withConfigDir(fn) {
  const configDir = tmpdir('ytm-doctor-config-');
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(configDir);
  } finally {
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
  }
}

test('doctorCore reports a healthy plaintext store with a backup warning', () => {
  withConfigDir(() => {
    const root = tmpdir('ytm-doctor-ok-');
    fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');

    const report = memory.doctorCore({ root });

    assert.strictEqual(report.error, false);
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.level, 'warning');
    assert.strictEqual(report.schemaVersion, 1);
    assert.strictEqual(report.encryption, false);
    assert.deepStrictEqual(report.migration_required, []);
    assert.match(report.text, /备份/);
  });
});

test('doctorCore exposes stable encrypted and migration contract fields', () => {
  withConfigDir(() => {
    const root = tmpdir('ytm-doctor-contract-');
    fs.mkdirSync(path.join(root, 'private', 'codex'), { recursive: true });
    memory.initEncryptionCore(root, 'doctor-contract-pass', null);

    const report = memory.doctorCore({ root, backupSetupChoice: 'manual' });

    assert.strictEqual(report.schemaVersion, 1);
    assert.strictEqual(report.encryption, true);
    assert.deepStrictEqual(report.migration_required, [
      { agent: 'codex', reason: 'no_agent_binding' },
    ]);
    assert.ok(report.warnings.some((item) => item.includes('[YTM_MIGRATION_REQUIRED]')));
  });
});

test('doctorCore blocks a damaged encrypted key store', () => {
  withConfigDir(() => {
    const root = tmpdir('ytm-doctor-key-');
    fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'keys'), { recursive: true });
    fs.writeFileSync(path.join(root, 'keys', 'salt'), 'salt\n', 'utf8');

    const report = memory.doctorCore({ root });

    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.level, 'critical');
    assert.ok(report.critical.some((item) => /recovery\.key\.enc|恢复钥匙/.test(item)));
  });
});

test('doctorCore detects a same-volume backup destination', () => {
  withConfigDir(() => {
    const root = tmpdir('ytm-doctor-same-volume-');
    fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');

    const report = memory.doctorCore({
      root,
      backupDir: tmpdir('ytm-doctor-backup-'),
      sameVolumeFn: () => true,
    });

    assert.strictEqual(report.ok, false);
    assert.ok(report.critical.some((item) => /同一卷|独立卷|同卷/.test(item)));
  });
});

test('doctor is available through the CLI and MCP surface', () => {
  withConfigDir(() => {
    const root = tmpdir('ytm-doctor-surface-');
    fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');

    const cli = childProcess.execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'yotta-memory.js'), 'doctor', '--json'], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root }),
    });
    const parsed = JSON.parse(cli);
    assert.strictEqual(parsed.ok, true);
    assert.match(parsed.text, /yotta-memory doctor/);

    assert.ok(memory.mcpTools().some((tool) => tool.name === 'doctor'));
    const call = memory.callTool('doctor', {}, { agent: 'codex' });
    assert.strictEqual(call.error, false);
    assert.match(call.text, /yotta-memory doctor/);
  });
});
