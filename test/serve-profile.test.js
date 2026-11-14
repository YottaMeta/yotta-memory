'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);

function tmpDir(t, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-profile-' + tag + '-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeProfile(dir, overrides) {
  const home = path.join(dir, 'memory');
  const runtime = path.join(dir, 'runtime');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(runtime, { recursive: true });
  const profilePath = path.join(dir, 'serve-profile.json');
  const profile = Object.assign({
    schemaVersion: 1,
    generatedAt: '2026-11-14T10:00:00+08:00',
    userId: 'TESTPC\\tester',
    memoryHome: home,
    runtimeHome: runtime,
    configDir: dir,
    host: '127.0.0.1',
    port: 8877,
  }, overrides || {});
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
  return { profilePath, profile, home, runtime };
}

test('serve profile applies the persisted per-user roots', (t) => {
  const dir = tmpDir(t, 'apply');
  const fixture = writeProfile(dir);
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    runtime: process.env.YOTTA_MEMORY_RUNTIME_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
  };
  try {
    const result = memory.applyServeProfile(fixture.profilePath, { currentUser: 'TESTPC\\tester' });
    assert.strictEqual(result.error, false, result.text);
    assert.strictEqual(process.env.YOTTA_MEMORY_HOME, fixture.home);
    assert.strictEqual(process.env.YOTTA_MEMORY_RUNTIME_HOME, fixture.runtime);
    assert.strictEqual(process.env.YOTTA_MEMORY_CONFIG_DIR, dir);
    assert.strictEqual(result.profile.port, 8877);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.runtime === undefined) delete process.env.YOTTA_MEMORY_RUNTIME_HOME;
    else process.env.YOTTA_MEMORY_RUNTIME_HOME = saved.runtime;
    if (saved.config === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.config;
  }
});

test('serve profile fails closed for a missing memory library', (t) => {
  const dir = tmpDir(t, 'missing-home');
  const fixture = writeProfile(dir, { memoryHome: path.join(dir, 'does-not-exist') });
  const result = memory.applyServeProfile(fixture.profilePath, { currentUser: 'TESTPC\\tester' });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /记忆库不存在|memoryHome/);
});

test('serve profile rejects a different Windows user', (t) => {
  const dir = tmpDir(t, 'wrong-user');
  const fixture = writeProfile(dir);
  const result = memory.applyServeProfile(fixture.profilePath, { currentUser: 'TESTPC\\other' });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /用户不匹配|userId/);
});

test('serve profile accepts a UTF-8 BOM written by Windows PowerShell', (t) => {
  const dir = tmpDir(t, 'bom');
  const fixture = writeProfile(dir);
  fs.writeFileSync(fixture.profilePath, '\ufeff' + fs.readFileSync(fixture.profilePath, 'utf8'), 'utf8');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    runtime: process.env.YOTTA_MEMORY_RUNTIME_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
  };
  try {
    const result = memory.applyServeProfile(fixture.profilePath, { currentUser: 'TESTPC\\tester' });
    assert.strictEqual(result.error, false, result.text);
    assert.strictEqual(result.profile.memoryHome, fixture.home);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.runtime === undefined) delete process.env.YOTTA_MEMORY_RUNTIME_HOME;
    else process.env.YOTTA_MEMORY_RUNTIME_HOME = saved.runtime;
    if (saved.config === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.config;
  }
});

test('serve --profile rejects a missing profile through the CLI', (t) => {
  const dir = tmpDir(t, 'cli');
  const missing = path.join(dir, 'missing-profile.json');
  const r = spawnSync(process.execPath, [CLI, 'serve', '--profile', missing, '--stdio'], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: dir }),
    timeout: 10000,
  });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /serve profile|服务 profile|profile.*不存在|无法读取/i);
});
