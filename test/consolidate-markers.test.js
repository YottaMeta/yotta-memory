'use strict';
// v0.18.1 A9: consolidation markers on archived copies + byte-exact undo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'consolidate-marker-pass-2026-09-27';
const MARKER = '<!-- yotta-memory: consolidated to ';

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-marker-store-');
  const configDir = tmpdir('ytm-marker-config-');
  const agentHome = tmpdir('ytm-marker-home-');
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
    memory.setRuntimeAgent('', '');
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function cleanEnv(root, configDir, agentHome) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  env.YOTTA_MEMORY_HOME = root;
  env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  return env;
}

function run(args, root, configDir, agentHome) {
  return spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', env: cleanEnv(root, configDir, agentHome) });
}

function snapshotOpts() {
  return { snapshotDir: tmpdir('ytm-marker-snap-'), allowSameVolumeForTest: true };
}

function setDates(root, stamp) {
  for (const fp of memory.collectEntryFiles(root)) {
    const text = fs.readFileSync(fp, 'utf8').replace(/^(created|updated): .*$/gm, (m) => m.split(':')[0] + ': ' + stamp);
    fs.writeFileSync(fp, text, 'utf8');
  }
}

function findBatch(text) {
  const m = text.match(/批次: ([0-9a-zA-Z-]+)/);
  return m ? m[1] : '';
}

test('plaintext archived copies get a consolidation marker and undo restores original bytes', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '方案丙进展', '一期交付完成', {});
    memory.rememberCore('FACT', '方案丙进展', '二期联调完成', {});
    setDates(root, '2026-01-10');
    const originals = {};
    for (const fp of memory.collectEntryFiles(root)) {
      const rel = path.relative(root, fp).replace(/\\/g, '/');
      originals[rel] = fs.readFileSync(fp);
    }
    const applied = memory.consolidateCore(Object.assign({ apply: true, yes: true, selfAgent: 'codex' }, snapshotOpts()));
    assert.strictEqual(applied.error, false, applied.text);
    const batch = findBatch(applied.text);
    assert.ok(batch, applied.text);
    const archiveDir = path.join(root, '.archive', 'facts');
    const archived = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.md'));
    assert.strictEqual(archived.length, 2);
    for (const f of archived) {
      const text = fs.readFileSync(path.join(archiveDir, f), 'utf8');
      assert.ok(text.indexOf(MARKER) !== -1, 'marker missing in ' + f);
      assert.ok(text.indexOf('batch ' + batch) !== -1, 'batch id missing in marker');
    }
    const undone = memory.consolidateCore({ undo: batch, selfAgent: 'codex' });
    assert.strictEqual(undone.error, false, undone.text);
    for (const rel of Object.keys(originals)) {
      const restored = fs.readFileSync(path.join(root, rel));
      assert.ok(restored.equals(originals[rel]), 'undo must restore original bytes for ' + rel);
      assert.ok(restored.toString('utf8').indexOf(MARKER) === -1, 'marker must be stripped on undo');
    }
  });
});

test('marker write failure is reported but does not abort the batch', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '方案丁进展', '一期交付完成', {});
    memory.rememberCore('FACT', '方案丁进展', '二期联调完成', {});
    setDates(root, '2026-01-10');
    const applied = memory.consolidateCore(Object.assign({ apply: true, yes: true, selfAgent: 'codex', markerFailForTest: true }, snapshotOpts()));
    assert.strictEqual(applied.error, false, applied.text);
    assert.strictEqual(applied.report.markers_written, 0);
    assert.strictEqual(applied.report.marker_errors, 2);
    assert.match(applied.text, /巩固标记: 0 条（失败 2）/);
    assert.strictEqual(memory.collectEntryFiles(root).length, 1, 'summary must still exist');
  });
});

test('encrypted archived copies get a marker and undo restores decrypted content', () => {
  withStore((root, configDir, agentHome) => {
    const init = run(['init', '--password', PASS], root, configDir, agentHome);
    assert.strictEqual(init.status, 0, init.stderr || init.stdout);
    const bind = run(['key', 'bind', 'codex', '--password', PASS], root, configDir, agentHome);
    assert.strictEqual(bind.status, 0, bind.stderr || bind.stdout);
    const keyMatch = bind.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/);
    assert.ok(keyMatch, bind.stdout);
    const agentKey = keyMatch[1];
    for (const statement of ['一期交付完成', '二期联调完成']) {
      const w = run(['remember', 'PREF', '方案戊进展', statement, '--agent', 'codex', '--agent-key', agentKey], root, configDir, agentHome);
      assert.strictEqual(w.status, 0, w.stderr || w.stdout);
    }
    memory.setRuntimeAgent('codex', agentKey);
    const originals = {};
    for (const fp of memory.collectEntryFiles(root)) {
      const rel = path.relative(root, fp).replace(/\\/g, '/');
      originals[rel] = memory.readMemoryText(root, fp, 'codex');
    }
    const applied = memory.consolidateCore(Object.assign({
      apply: true, yes: true, selfAgent: 'codex',
      minAge: 0, minIdle: 0, maxUtility: 999, minGroup: 2,
    }, snapshotOpts()));
    assert.strictEqual(applied.error, false, applied.text);
    assert.strictEqual(applied.report.markers_written, 2);
    const batch = findBatch(applied.text);
    const archiveDir = path.join(root, '.archive', 'private', 'codex', 'prefs');
    const archived = fs.readdirSync(archiveDir).filter((f) => f.endsWith('.md.enc'));
    assert.strictEqual(archived.length, 2);
    for (const f of archived) {
      const text = memory.readMemoryText(root, path.join(archiveDir, f), 'codex');
      assert.ok(text.indexOf(MARKER) !== -1, 'encrypted marker missing in ' + f);
    }
    const undone = memory.consolidateCore({ undo: batch, selfAgent: 'codex' });
    assert.strictEqual(undone.error, false, undone.text);
    for (const rel of Object.keys(originals)) {
      const fp = path.join(root, rel);
      assert.strictEqual(memory.readMemoryText(root, fp, 'codex'), originals[rel], 'undo must restore encrypted content for ' + rel);
    }
  });
});
