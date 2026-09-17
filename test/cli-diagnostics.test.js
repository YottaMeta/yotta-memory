'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'test-pass-2026-09-17';
const KEY_HOME_ENV = 'YOTTA_MEMORY_AGENT_HOME';
const KEY_FILE_ENV = 'YOTTA_MEMORY_AGENT_KEY_FILE';

function cleanEnv(home, extra) {
  const env = Object.assign({}, process.env);
  for (const key of [
    'YOTTA_AGENT_ID',
    'AGENT_ID',
    'YOTTA_MEMORY_TRUST_ENV_AGENT',
    'YOTTA_MEMORY_AGENT_KEY',
    KEY_HOME_ENV,
    KEY_FILE_ENV,
    'YOTTA_MEMORY_AGENT_HOST',
    'CODEX_HOME',
    'XDG_CONFIG_HOME',
    'OPENCODE_API_KEY',
    'OPENCODE_CONFIG',
  ]) {
    delete env[key];
  }
  env.YOTTA_MEMORY_HOME = home;
  env.YOTTA_MEMORY_PASS = PASS;
  return Object.assign(env, extra || {});
}

function run(args, home, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(home, extraEnv),
  });
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-cli-diagnostics-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function initEncrypted(home) {
  const r = run(['init', '--password', PASS], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
}

function bindOwner(home, owner) {
  const r = run(['key', 'bind', owner, '--password', PASS], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const match = r.stdout.match(/agent_key:\s*([A-Za-z0-9+/=]+)/);
  assert.ok(match, r.stdout);
  return match[1];
}

test('key status reports the default AI_HOME path and claim uses the same discovery rule', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindOwner(home, 'codex');
  const agentHome = path.join(home, 'agent-home');
  const target = path.join(agentHome, '.yotta-memory-agent-key');

  const status = run(['key', 'status', 'codex'], home, { [KEY_HOME_ENV]: agentHome });
  assert.strictEqual(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /host_key:\s*missing/);
  assert.match(status.stdout, /discovery:\s*env:YOTTA_MEMORY_AGENT_HOME/);
  assert.ok(status.stdout.includes('checked: ' + target), status.stdout);

  const claim = run(['key', 'claim', 'codex'], home, { [KEY_HOME_ENV]: agentHome });
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  assert.ok(fs.existsSync(target), 'claim should use the default AI_HOME');
  assert.strictEqual(fs.readFileSync(target, 'utf8').trim(), key);
});

test('explicit agent key file is shared by key status and key claim', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindOwner(home, 'codex');
  const keyFile = path.join(home, 'host', 'custom-agent-key');

  const status = run(['key', 'status', 'codex', '--agent-key-file', keyFile], home);
  assert.strictEqual(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /discovery:\s*option:--agent-key-file/);
  assert.ok(status.stdout.includes('checked: ' + keyFile), status.stdout);

  const claim = run(['key', 'claim', 'codex', '--agent-key-file', keyFile], home);
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  assert.strictEqual(fs.readFileSync(keyFile, 'utf8').trim(), key);
});

test('AI_HOME environment file override takes precedence for claim and status', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  const key = bindOwner(home, 'codex');
  const envFile = path.join(home, 'env', 'agent-key');
  const ignoredHome = path.join(home, 'ignored-home');

  const status = run(['key', 'status', 'codex'], home, {
    [KEY_HOME_ENV]: ignoredHome,
    [KEY_FILE_ENV]: envFile,
  });
  assert.strictEqual(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /discovery:\s*env:YOTTA_MEMORY_AGENT_KEY_FILE/);
  assert.ok(status.stdout.includes('checked: ' + envFile), status.stdout);

  const claim = run(['key', 'claim', 'codex'], home, {
    [KEY_HOME_ENV]: ignoredHome,
    [KEY_FILE_ENV]: envFile,
  });
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  assert.strictEqual(fs.readFileSync(envFile, 'utf8').trim(), key);
  assert.ok(!fs.existsSync(path.join(ignoredHome, '.yotta-memory-agent-key')));
});

test('Codex and OpenCode host defaults resolve to their own AI_HOME', (t) => {
  const home = tmpHome(t);
  initEncrypted(home);
  bindOwner(home, 'codex');
  bindOwner(home, 'win-opencode-a1');

  const codexHome = path.join(home, 'codex-home');
  const codexStatus = run(['key', 'status', 'codex'], home, { CODEX_HOME: codexHome });
  assert.strictEqual(codexStatus.status, 0, codexStatus.stderr || codexStatus.stdout);
  assert.match(codexStatus.stdout, /discovery:\s*host:codex/);
  assert.ok(codexStatus.stdout.includes('checked: ' + path.join(codexHome, '.yotta-memory-agent-key')), codexStatus.stdout);

  const xdgHome = path.join(home, 'xdg');
  const opencodeStatus = run(['key', 'status', 'win-opencode-a1'], home, { XDG_CONFIG_HOME: xdgHome });
  assert.strictEqual(opencodeStatus.status, 0, opencodeStatus.stderr || opencodeStatus.stdout);
  assert.match(opencodeStatus.stdout, /discovery:\s*host:opencode/);
  assert.ok(opencodeStatus.stdout.includes('checked: ' + path.join(xdgHome, 'opencode', '.yotta-memory-agent-key')), opencodeStatus.stdout);
});

test('CLI positional-argument misuse points to the documented command shape', (t) => {
  const home = tmpHome(t);

  const recall = run(['recall', '--query', 'x'], home);
  assert.strictEqual(recall.status, 2);
  assert.match(recall.stderr + recall.stdout, /位置参数/);
  assert.match(recall.stderr + recall.stdout, /recall \[关键词\]/);

  const rememberMissing = run(['remember', '--type', 'FACT'], home);
  assert.strictEqual(rememberMissing.status, 2);
  assert.match(rememberMissing.stderr + rememberMissing.stdout, /位置参数/);
  assert.match(rememberMissing.stderr + rememberMissing.stdout, /remember <type> <subject> <statement>/);

  const rememberShifted = run(['remember', '--type', 'BOUND', '测试'], home);
  assert.strictEqual(rememberShifted.status, 2);
  assert.match(rememberShifted.stderr + rememberShifted.stdout, /位置参数/);
  assert.doesNotMatch(rememberShifted.stderr + rememberShifted.stdout, /未知记忆类型: 测试/);
});

test('top-level usage documents positional remember and recall forms', (t) => {
  const home = tmpHome(t);
  const r = run(['--help'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /remember <type> <subject> <statement>/);
  assert.match(r.stdout, /recall \[关键词\]/);
});
