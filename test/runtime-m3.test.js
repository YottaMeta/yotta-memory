'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function cleanEnv(runtimeHome, extra) {
  const env = Object.assign({}, process.env);
  env.YOTTA_MEMORY_RUNTIME_HOME = runtimeHome;
  env.YOTTA_MEMORY_CONFIG_DIR = path.join(runtimeHome, '.config');
  env.YOTTA_MEMORY_HOME = path.join(runtimeHome, 'memory');
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

function makePlainStore(root) {
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents.json'), '{"agents":{"codex":{}}}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), '{"version":4,"entries":[]}\n', 'utf8');
}

function makeVersionPackage(root, version) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: '@yottameta/yotta-memory',
    version,
    bin: { 'yotta-memory': 'bin/yotta-memory.js' },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(root, 'bin', 'yotta-memory.js'), '#!/usr/bin/env node\n', 'utf8');
}

function makeSkillCopy(root, version) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'SKILL.md'), [
    '---',
    'name: yotta-memory',
    'version: ' + version,
    '---',
    '',
    '# yotta-memory',
    '',
  ].join('\n'), 'utf8');
}

test('MCP handshakes expose runtimePath, identityMode and toolProfile', () => {
  const legacy = memory.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
  }, { agent: 'codex', identityMode: 'stdio-args', toolProfile: 'core' });
  assert.strictEqual(legacy.result.serverInfo.version, '0.16.0');
  assert.match(legacy.result.serverInfo.runtimePath.replace(/\\/g, '/'), /bin\/yotta-memory\.js$/);
  assert.strictEqual(legacy.result.serverInfo.identityMode, 'stdio-args');
  assert.strictEqual(legacy.result.serverInfo.toolProfile, 'core');

  const modern = memory.handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'server/discover',
    params: {
      _meta: Object.assign({
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      }, {}),
    },
  }, { agent: 'codex', identityMode: 'headers', toolProfile: 'full' });
  const info = modern.result._meta['io.modelcontextprotocol/serverInfo'];
  assert.strictEqual(info.version, '0.16.0');
  assert.match(info.runtimePath.replace(/\\/g, '/'), /bin\/yotta-memory\.js$/);
  assert.strictEqual(info.identityMode, 'headers');
  assert.strictEqual(info.toolProfile, 'full');
});

test('stdio serverInfo reports the current launcher path', (t) => {
  const runtimeHome = tmpdir('ytm-runtime-m3-stdio-');
  t.after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
  const installed = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(installed.status, 0, installed.stderr || installed.stdout);

  const launcher = path.join(runtimeHome, 'current', 'bin', 'yotta-memory.js');
  const result = spawnSync(process.execPath, [
    launcher,
    'serve',
    '--stdio',
    '--tools',
    'core',
    '--agent-id',
    'codex',
  ], {
    encoding: 'utf8',
    env: cleanEnv(runtimeHome),
    input: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    }) + '\n',
    timeout: 30000,
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const response = JSON.parse(result.stdout.trim().split(/\r?\n/)[0]);
  assert.strictEqual(response.result.serverInfo.version, '0.16.0');
  assert.strictEqual(response.result.serverInfo.identityMode, 'stdio-args');
  assert.strictEqual(response.result.serverInfo.toolProfile, 'core');
  assert.match(response.result.serverInfo.runtimePath.replace(/\\/g, '/'), /\/current\/bin\/yotta-memory\.js$/);
});

test('doctor --runtime reports a clean aligned runtime', (t) => {
  const runtimeHome = tmpdir('ytm-runtime-m3-clean-');
  const memoryHome = path.join(runtimeHome, 'memory');
  t.after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
  makePlainStore(memoryHome);

  const result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  withEnv({
    YOTTA_MEMORY_RUNTIME_HOME: runtimeHome,
    YOTTA_MEMORY_CONFIG_DIR: path.join(runtimeHome, '.config'),
  }, () => {
    const report = memory.doctorCore({
      root: memoryHome,
      runtime: true,
      mcpConfigPaths: [],
      skillDirs: [],
      processes: [],
    });
    assert.strictEqual(report.ok, true, report.text);
    assert.ok(report.checks.runtime);
    assert.strictEqual(report.checks.runtime.cli.version, '0.16.0');
    assert.strictEqual(report.checks.runtime.current.version, '0.16.0');
    assert.deepStrictEqual(report.checks.runtime.drifts, []);
  });
});

test('doctor --runtime reports current runtime drift with repair commands', (t) => {
  const runtimeHome = tmpdir('ytm-runtime-m3-drift-');
  const memoryHome = path.join(runtimeHome, 'memory');
  t.after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
  makePlainStore(memoryHome);

  let result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const manifestPath = path.join(runtimeHome, 'runtime.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.current = '9.9.9';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  withEnv({
    YOTTA_MEMORY_RUNTIME_HOME: runtimeHome,
    YOTTA_MEMORY_CONFIG_DIR: path.join(runtimeHome, '.config'),
  }, () => {
    const report = memory.doctorCore({
      root: memoryHome,
      runtime: true,
      mcpConfigPaths: [],
      skillDirs: [],
      processes: [],
    });
    assert.strictEqual(report.ok, false, report.text);
    const drift = report.checks.runtime.drifts.find((item) => item.kind === 'current-runtime');
    assert.ok(drift, JSON.stringify(report.checks.runtime.drifts));
    assert.strictEqual(drift.actual, '9.9.9');
    assert.strictEqual(drift.expected, '0.16.0');
    assert.match(drift.fix, /runtime/);
    assert.strictEqual(drift.blocking, true);
  });
});

test('doctor --runtime reports MCP config, running server and skill copy drift', (t) => {
  const runtimeHome = tmpdir('ytm-runtime-m3-sources-');
  const memoryHome = path.join(runtimeHome, 'memory');
  const oldVersionRoot = path.join(runtimeHome, 'versions', '0.15.0');
  const oldLauncher = path.join(oldVersionRoot, 'bin', 'yotta-memory.js');
  const mcpConfig = path.join(runtimeHome, 'mcp.json');
  const skillDir = path.join(runtimeHome, 'skills', 'yotta-memory');
  t.after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
  makePlainStore(memoryHome);
  makeVersionPackage(oldVersionRoot, '0.15.0');
  makeSkillCopy(skillDir, '0.15.0');
  fs.writeFileSync(mcpConfig, JSON.stringify({
    mcpServers: {
      'yotta-memory': {
        command: process.execPath,
        args: [oldLauncher, 'serve', '--stdio'],
      },
    },
  }, null, 2), 'utf8');

  const result = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  withEnv({
    YOTTA_MEMORY_RUNTIME_HOME: runtimeHome,
    YOTTA_MEMORY_CONFIG_DIR: path.join(runtimeHome, '.config'),
  }, () => {
    const report = memory.doctorCore({
      root: memoryHome,
      runtime: true,
      mcpConfigPaths: [mcpConfig],
      skillDirs: [skillDir],
      processes: [{ pid: 1234, commandLine: process.execPath + ' "' + oldLauncher + '" serve --stdio' }],
    });
    const drifts = report.checks.runtime.drifts;
    const mcpDrift = drifts.find((item) => item.kind === 'mcp-config');
    const processDrift = drifts.find((item) => item.kind === 'running-server');
    const skillDrift = drifts.find((item) => item.kind === 'skill-copy');
    assert.ok(mcpDrift, JSON.stringify(drifts));
    assert.strictEqual(mcpDrift.actual, '0.15.0');
    assert.strictEqual(mcpDrift.expected, '0.16.0');
    assert.strictEqual(mcpDrift.blocking, true);
    assert.ok(processDrift, JSON.stringify(drifts));
    assert.strictEqual(processDrift.actual, '0.15.0');
    assert.strictEqual(processDrift.blocking, false);
    assert.ok(skillDrift, JSON.stringify(drifts));
    assert.strictEqual(skillDrift.actual, '0.15.0');
    assert.strictEqual(skillDrift.blocking, false);
  });
});

test('doctor --runtime --json is exposed through the CLI', (t) => {
  const runtimeHome = tmpdir('ytm-runtime-m3-cli-');
  const memoryHome = path.join(runtimeHome, 'memory');
  t.after(() => fs.rmSync(runtimeHome, { recursive: true, force: true }));
  makePlainStore(memoryHome);
  const installed = run(['runtime', 'install', '--from-current'], runtimeHome);
  assert.strictEqual(installed.status, 0, installed.stderr || installed.stdout);

  const result = run(['doctor', '--runtime', '--json'], runtimeHome);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.checks.runtime);
  assert.ok(Array.isArray(parsed.checks.runtime.drifts));
  assert.strictEqual(parsed.checks.runtime.cli.version, '0.16.0');
  assert.strictEqual(parsed.checks.runtime.current.version, '0.16.0');
  for (const drift of parsed.checks.runtime.drifts) {
    assert.ok(drift.kind);
    assert.ok(drift.actual);
    assert.ok(drift.expected);
    assert.ok(drift.fix);
    assert.strictEqual(typeof drift.blocking, 'boolean');
  }
});
