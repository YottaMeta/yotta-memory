'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);
const pkg = require('../package.json');

function cleanEnv(runtimeHome, extra) {
  const env = Object.assign({}, process.env);
  env.YOTTA_MEMORY_RUNTIME_HOME = runtimeHome;
  env.YOTTA_MEMORY_CONFIG_DIR = path.join(runtimeHome, '.config');
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  delete env.YOTTA_MEMORY_AGENT_KEY;
  return Object.assign(env, extra || {});
}

function run(args, runtimeHome, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(runtimeHome, extraEnv),
    timeout: 60000,
  });
}

function tmpRuntime(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-runtime-m2-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function readManifest(runtimeHome) {
  return JSON.parse(fs.readFileSync(path.join(runtimeHome, 'runtime.json'), 'utf8'));
}

function makeTarball(parent, version) {
  const packageDir = path.join(parent, 'package');
  fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({
    name: '@yottameta/yotta-memory',
    version: version,
    bin: { 'yotta-memory': 'bin/yotta-memory.js' },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(packageDir, 'bin', 'yotta-memory.js'), [
    '#!/usr/bin/env node',
    "'use strict';",
    "console.log('" + version + "');",
    '',
  ].join('\n'), 'utf8');
  const tarball = path.join(parent, 'yotta-memory-' + version + '.tgz');
  const tarArgs = process.platform === 'win32'
    ? ['--force-local', '-czf', tarball, '-C', parent, 'package']
    : ['-czf', tarball, '-C', parent, 'package'];
  const packed = spawnSync('tar', tarArgs, { encoding: 'utf8' });
  assert.strictEqual(packed.status, 0, packed.stderr || packed.stdout);
  return tarball;
}

function currentVersion(runtimeHome) {
  const result = spawnSync(process.execPath, [
    path.join(runtimeHome, 'current', 'bin', 'yotta-memory.js'),
    '--version',
  ], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('runtime install --from-current creates runtime.json and a stable current launcher', (t) => {
  const runtimeHome = tmpRuntime(t);
  const result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const manifest = readManifest(runtimeHome);
  assert.strictEqual(manifest.current, pkg.version);
  assert.ok(manifest.versions[pkg.version]);
  assert.match(manifest.versions[pkg.version].treeHash, /^[a-f0-9]{64}$/);
  assert.strictEqual(currentVersion(runtimeHome), pkg.version);

  const status = run(['runtime', 'status'], runtimeHome);
  assert.strictEqual(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, new RegExp('current:\\s*' + pkg.version.replace(/\./g, '\\.')));
  assert.match(status.stdout, /current path:/);
});

test('runtime install tarball, use and rollback switch the stable current pointer', (t) => {
  const runtimeHome = tmpRuntime(t);
  let result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const altVersion = '9.9.8';
  const tarball = makeTarball(runtimeHome, altVersion);
  result = run(['runtime', 'install', tarball], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  result = run(['runtime', 'use', altVersion], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.strictEqual(currentVersion(runtimeHome), altVersion);

  let manifest = readManifest(runtimeHome);
  assert.strictEqual(manifest.current, altVersion);
  assert.strictEqual(manifest.previous, pkg.version);

  result = run(['runtime', 'rollback'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.strictEqual(currentVersion(runtimeHome), pkg.version);
  manifest = readManifest(runtimeHome);
  assert.strictEqual(manifest.current, pkg.version);
  assert.strictEqual(manifest.previous, altVersion);

  result = run(['runtime', 'use', '9.9.9'], runtimeHome);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /未安装|不存在/);
});

test('runtime use --restart rolls back the current pointer when restart fails', (t) => {
  const runtimeHome = tmpRuntime(t);
  let result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const altVersion = '9.9.8';
  const tarball = makeTarball(runtimeHome, altVersion);
  result = run(['runtime', 'install', tarball], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  result = run(['runtime', 'use', altVersion], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const previousRuntimeHome = process.env.YOTTA_MEMORY_RUNTIME_HOME;
  process.env.YOTTA_MEMORY_RUNTIME_HOME = runtimeHome;
  try {
    const switched = memory.runtimeUseCore(pkg.version, {
      restart: true,
      restartFn: () => ({ error: true, text: 'restart failed by test' }),
    });
    assert.strictEqual(switched.error, true);
    assert.match(switched.text, /回滚|restart failed/);
    assert.strictEqual(readManifest(runtimeHome).current, altVersion);
    assert.strictEqual(currentVersion(runtimeHome), altVersion);
  } finally {
    if (previousRuntimeHome === undefined) delete process.env.YOTTA_MEMORY_RUNTIME_HOME;
    else process.env.YOTTA_MEMORY_RUNTIME_HOME = previousRuntimeHome;
  }
});

test('managed autostart and backup commands point to the stable current launcher', (t) => {
  const runtimeHome = tmpRuntime(t);
  const result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const previousRuntimeHome = process.env.YOTTA_MEMORY_RUNTIME_HOME;
  process.env.YOTTA_MEMORY_RUNTIME_HOME = runtimeHome;
  try {
    const currentBinPattern = /current[\\/]+bin[\\/]+yotta-memory\.js/;
    assert.match(memory.lanTaskRunCmd({ host: '127.0.0.1', port: 8787 }), currentBinPattern);
    assert.match(memory.lanLinuxExecStart({ host: '127.0.0.1', port: 8787 }), currentBinPattern);
    assert.match(memory.lanCrontabLine({ host: '127.0.0.1', port: 8787 }), currentBinPattern);
    assert.match(memory.backupFallbackCommand().args[0], currentBinPattern);
  } finally {
    if (previousRuntimeHome === undefined) delete process.env.YOTTA_MEMORY_RUNTIME_HOME;
    else process.env.YOTTA_MEMORY_RUNTIME_HOME = previousRuntimeHome;
  }
});

test('runtime status reports a missing current pointer as drift', (t) => {
  const runtimeHome = tmpRuntime(t);
  let result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  fs.unlinkSync(path.join(runtimeHome, 'current'));

  result = run(['runtime', 'status'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /drift:/);
  assert.match(result.stdout, /current launcher missing|current pointer/);
});

test('runtime tarball member validation rejects traversal and non-package entries', () => {
  assert.doesNotThrow(() => memory.runtimeValidateTarballEntries([
    'package/',
    'package/package.json',
    'package/bin/yotta-memory.js',
  ]));
  assert.throws(
    () => memory.runtimeValidateTarballEntries(['package/', 'package/package.json', 'package/../../escape']),
    /路径穿越/,
  );
  assert.throws(
    () => memory.runtimeValidateTarballEntries(['package/package.json', 'evil.txt']),
    /package\//,
  );
});
