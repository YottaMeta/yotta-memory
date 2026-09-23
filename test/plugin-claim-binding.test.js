'use strict';
// v0.16.6：插件一条命令绑定——key claim --plugin-data 同时写 key 与 identity.json，
// 之后插件启动器无需宿主替换占位符即可读到私密身份。
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const LAUNCHER = path.join(__dirname, '..', 'bin', 'plugin-mcp.js');
const PASS = 'test-pass-plugin-claim';

function tmpDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(args, home, extraEnv) {
  const env = Object.assign({}, process.env);
  delete env.PLUGIN_DATA;
  env.YOTTA_MEMORY_HOME = home;
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8', env: Object.assign(env, extraEnv || {}),
  });
}

function runStdio(args, home, pluginData, message) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_MEMORY_AGENT_ID;
  delete env.YOTTA_MEMORY_AGENT_KEY_FILE;
  env.YOTTA_MEMORY_HOME = home;
  if (pluginData) env.PLUGIN_DATA = pluginData;
  else delete env.PLUGIN_DATA;
  const child = spawn(process.execPath, [LAUNCHER].concat(args), {
    env: env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  child.stdin.write(JSON.stringify(message) + '\n');
  child.stdin.end();
  return new Promise((resolve, reject) => {
    child.on('close', (code) => resolve({ code: code, stdout: stdout, stderr: stderr }));
    child.on('error', reject);
  });
}

test('key claim --plugin-data writes key + identity.json and the plugin launcher uses it', async (t) => {
  const home = tmpDir(t, 'ytm-claim-home-');
  const pluginData = tmpDir(t, 'ytm-claim-plugin-');

  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const bind = run(['key', 'bind', 'codex', '--password', PASS], home);
  assert.strictEqual(bind.status, 0, bind.stderr || bind.stdout);

  const claim = run(['key', 'claim', 'codex', '--plugin-data', pluginData], home);
  assert.strictEqual(claim.status, 0, claim.stderr || claim.stdout);
  assert.match(claim.stdout, /plugin-data/);

  const keyFile = path.join(pluginData, '.yotta-memory-agent-key');
  const identityFile = path.join(pluginData, 'identity.json');
  assert.strictEqual(fs.existsSync(keyFile), true, 'key file written');
  assert.strictEqual(fs.existsSync(identityFile), true, 'identity.json written');
  assert.strictEqual(JSON.parse(fs.readFileSync(identityFile, 'utf8')).agent_id, 'codex');

  const write = run(['remember', 'COMMIT', '插件绑定', '权限验证', '--agent', 'codex',
    '--agent-key-file', keyFile], home);
  assert.strictEqual(write.status, 0, write.stderr || write.stdout);

  const result = await runStdio(['serve', '--stdio', '--tools', 'core',
    '--agent-id', '${AGENT_ID}', '--agent-key-file', '${AGENT_KEY_FILE}'],
    home, pluginData,
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'context', arguments: {} } });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /${AGENT_ID}/);
  const payload = JSON.parse(result.stdout.trim().split('\n').filter(Boolean)[0]);
  assert.strictEqual(payload.result.isError, false, payload.result.content[0].text);
  assert.match(payload.result.content[0].text, /codex/);
});

test('key claim rejects --plugin-data combined with --to', (t) => {
  const home = tmpDir(t, 'ytm-claim-conflict-');
  const init = run(['init', '--encrypt'], home, { YOTTA_MEMORY_PASS: PASS });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);
  const r = run(['key', 'claim', 'codex', '--plugin-data', home, '--to', home], home);
  assert.match(r.stdout + r.stderr, /不能与/);
});
