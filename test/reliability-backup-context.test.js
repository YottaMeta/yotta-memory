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

function makeStore() {
  const root = tmpdir('ytm-context-backup-');
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'facts', '2026-09-12-0001.md'), [
    '---',
    'type: FACT',
    'subject: 测试记忆',
    'statement: 元忆备份提醒测试',
    'scope: public',
    'created: 2026-09-12',
    'updated: 2026-09-12',
    '---',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    entries: [{ file: 'facts/2026-09-12-0001.md', type: 'FACT', subject: '测试记忆', statement: '元忆备份提醒测试' }],
  }), 'utf8');
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  return root;
}

function withConfigDir(fn) {
  const configDir = tmpdir('ytm-context-config-');
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(configDir);
  } finally {
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
  }
}

test('context asks the AI to enumerate real backup volumes before user confirmation', () => {
  withConfigDir(() => {
    const root = makeStore();
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.contextCore({ selfAgent: 'codex' });
    assert.strictEqual(result.error, false);
    assert.match(result.text, /可靠性提醒/);
    assert.match(result.text, /backup volumes/);
    assert.match(result.text, /用户确认/);
  });
});

test('context does not nag after the user explicitly chooses manual backup', () => {
  withConfigDir(() => {
    const root = makeStore();
    process.env.YOTTA_MEMORY_HOME = root;
    memory.saveConfig({ memory_home: root, backup_setup_choice: 'manual', backup_enabled: false });
    const result = memory.contextCore({ selfAgent: 'codex' });
    assert.strictEqual(result.error, false);
    assert.doesNotMatch(result.text, /可靠性提醒/);
  });
});

test('context warns when the latest backup is older than the configured limit', () => {
  withConfigDir(() => {
    const root = makeStore();
    const backupDir = tmpdir('ytm-context-overdue-');
    const backupId = 'old-backup';
    const backupPath = path.join(backupDir, backupId);
    fs.mkdirSync(backupPath, { recursive: true });
    fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify({
      id: backupId,
      version: memory.VERSION,
      created: '2026-09-01T00:00:00.000Z',
      source: root,
      files: [],
    }), 'utf8');
    process.env.YOTTA_MEMORY_HOME = root;
    memory.saveConfig({
      memory_home: root,
      backup_dir: backupDir,
      backup_enabled: true,
      backup_schedule: 'daily',
      backup_time: '03:30',
      backup_max_age_hours: 36,
    });
    const result = memory.contextCore({ selfAgent: 'codex' });
    assert.strictEqual(result.error, false);
    assert.match(result.text, /可靠性提醒/);
    assert.match(result.text, /过期|超过|36/);
  });
});

test('context surfaces a critical doctor block', () => {
  withConfigDir(() => {
    const root = makeStore();
    fs.mkdirSync(path.join(root, 'keys'), { recursive: true });
    fs.writeFileSync(path.join(root, 'keys', 'salt'), 'salt\n', 'utf8');
    process.env.YOTTA_MEMORY_HOME = root;
    const result = memory.contextCore({ selfAgent: 'codex' });
    assert.strictEqual(result.error, false);
    assert.match(result.text, /可靠性提醒/);
    assert.match(result.text, /破坏性写入已锁定/);
  });
});
