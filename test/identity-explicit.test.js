'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function cleanEnv(home, extra) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  delete env.YOTTA_MEMORY_TRUST_ENV_AGENT;
  delete env.YOTTA_MEMORY_AGENT_KEY;
  env.YOTTA_MEMORY_HOME = home;
  return Object.assign(env, extra || {});
}

function run(args, home, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: cleanEnv(home, extraEnv),
  });
}

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-identity-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function initPlain(home) {
  const r = run(['init', '--no-encrypt'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
}

test('untrusted ambient YOTTA_AGENT_ID is ignored rather than becoming an identity', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['context'], home, { YOTTA_AGENT_ID: 'gon-mimo' });
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /必须先声明身份/);
  assert.doesNotMatch(r.stdout, /未受信任的环境身份/);
  assert.doesNotMatch(r.stdout, /gon-mimo/);
  assert.doesNotMatch(r.stdout, /用户画像（gon-mimo）/);
});

test('explicit --agent works as the CLI identity source', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['whoami', '--agent', 'codex'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /当前智能体身份: codex/);
});

test('trusted MCP env is accepted for whoami', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['whoami'], home, {
    YOTTA_AGENT_ID: 'win-opencode-a1',
    YOTTA_MEMORY_TRUST_ENV_AGENT: '1',
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /当前智能体身份: win-opencode-a1/);
});

test('explicit identity wins over an untrusted ambient environment identity', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['whoami', '--agent', 'codex'], home, {
    YOTTA_AGENT_ID: 'gon-mimo',
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /当前智能体身份: codex/);
  assert.doesNotMatch(r.stdout, /身份冲突/);
  assert.doesNotMatch(r.stdout, /gon-mimo/);
});

test('trusted environment identity conflicting with explicit identity is rejected', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['whoami', '--agent', 'codex'], home, {
    YOTTA_AGENT_ID: 'gon-mimo',
    YOTTA_MEMORY_TRUST_ENV_AGENT: '1',
  });
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /身份冲突/);
});

test('private remember requires explicit identity while FACT stays public', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const denied = run(['remember', 'PREF', '身份测试', '不得匿名写入私密区'], home);
  assert.strictEqual(denied.status, 2);
  assert.match(denied.stdout, /私密操作必须先声明显式身份/);
  const publicWrite = run(['remember', 'FACT', '身份测试', '公共事实可匿名写入'], home);
  assert.strictEqual(publicWrite.status, 0, publicWrite.stderr || publicWrite.stdout);
});

test('private remember works with explicit --agent', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const r = run(['remember', 'PREF', '身份测试', '显式身份写入私密区', '--agent', 'codex'], home);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /已记录/);
});

test('context requires explicit identity but works when provided', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const denied = run(['context'], home);
  assert.strictEqual(denied.status, 3);
  assert.match(denied.stdout, /必须先声明身份/);
  const ok = run(['context', '--agent', 'codex'], home);
  assert.strictEqual(ok.status, 0, ok.stderr || ok.stdout);
  assert.match(ok.stdout, /agent_id: codex/);
});

test('profile requires explicit identity', (t) => {
  const home = tmpHome(t);
  initPlain(home);
  const denied = run(['profile'], home);
  assert.strictEqual(denied.status, 3);
  assert.match(denied.stdout, /必须先声明身份/);
});
