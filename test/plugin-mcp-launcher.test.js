'use strict';
// v0.16.6 plugin MCP launcher contract: identity resolution when host does not substitute $ {AGENT_ID} / $ {AGENT_KEY_FILE}.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LAUNCHER = path.join(__dirname, '..', 'bin', 'plugin-mcp.js');
const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'test-pass-plugin-launcher';

function tmpDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cleanEnv(extra) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_MEMORY_AGENT_ID;
  delete env.YOTTA_MEMORY_AGENT_KEY_FILE;
  delete env.PLUGIN_DATA;
  delete env.YOTTA_MEMORY_HOME;
  delete env.YOTTA_MEMORY_PASS;
  return Object.assign(env, extra || {});
}

test('launcher: host-substituted args win', () => {
  const ident = require(LAUNCHER).resolvePluginIdentity(
    { agentId: 'codex', keyFile: 'C:/keys/codex.key' },
    cleanEnv({ YOTTA_MEMORY_AGENT_ID: 'other', PLUGIN_DATA: 'C:/data' }));
  assert.strictEqual(ident.id, 'codex');
  assert.strictEqual(ident.keyFile, 'C:/keys/codex.key');
  assert.strictEqual(ident.source, 'host-args');
});

test('launcher: unsubstituted literal placeholder counts as missing', () => {
  const ident = require(LAUNCHER).resolvePluginIdentity(
    { agentId: '${AGENT_ID}', keyFile: '${AGENT_KEY_FILE}' },
    cleanEnv({}));
  assert.strictEqual(ident, null);
});

test('launcher: env vars are second priority', (t) => {
  const dir = tmpDir(t, 'ytm-plugin-env-');
  const ident = require(LAUNCHER).resolvePluginIdentity(
    { agentId: '${AGENT_ID}', keyFile: '${AGENT_KEY_FILE}' },
    cleanEnv({
      YOTTA_MEMORY_AGENT_ID: 'codex',
      YOTTA_MEMORY_AGENT_KEY_FILE: path.join(dir, 'codex.key'),
      PLUGIN_DATA: dir,
    }));
  assert.strictEqual(ident.id, 'codex');
  assert.strictEqual(ident.keyFile, path.join(dir, 'codex.key'));
  assert.strictEqual(ident.source, 'env');
});

test('launcher: PLUGIN_DATA/identity.json is third priority', (t) => {
  const dir = tmpDir(t, 'ytm-plugin-data-');
  fs.writeFileSync(path.join(dir, 'identity.json'),
    JSON.stringify({ agent_id: 'codex' }), 'utf8');
  const ident = require(LAUNCHER).resolvePluginIdentity(
    { agentId: '${AGENT_ID}', keyFile: '${AGENT_KEY_FILE}' },
    cleanEnv({ PLUGIN_DATA: dir }));
  assert.strictEqual(ident.id, 'codex');
  assert.strictEqual(ident.keyFile, path.join(dir, '.yotta-memory-agent-key'));
  assert.strictEqual(ident.source, 'plugin-data');
});

test('launcher: identity.json may set key_file explicitly', (t) => {
  const dir = tmpDir(t, 'ytm-plugin-data-key-');
  const keyFile = path.join(dir, 'custom', 'agent.key');
  fs.writeFileSync(path.join(dir, 'identity.json'),
    JSON.stringify({ agent_id: 'codex', key_file: keyFile }), 'utf8');
  const ident = require(LAUNCHER).resolvePluginIdentity(
    { agentId: '', keyFile: '' },
    cleanEnv({ PLUGIN_DATA: dir }));
  assert.strictEqual(ident.keyFile, keyFile);
});

test('launcher: guidance text is executable and has no literal placeholder', () => {
  const launcher = require(LAUNCHER);
  const text = launcher.guidanceText('C:/plugin-data');
  assert.doesNotMatch(text, /\$\{AGENT_ID\}|\$\{AGENT_KEY_FILE\}/);
  assert.match(text, /key claim/);
  assert.match(text, /identity\.json/);
  assert.match(text, /C:\/plugin-data/);
});

test('launcher: no identity starts unauthenticated with actionable guidance', (t) => {
  const home = tmpDir(t, 'ytm-plugin-noid-');
  const init = spawnSync(process.execPath, [CLI, 'init', '--encrypt'], {
    encoding: 'utf8',
    env: cleanEnv({ YOTTA_MEMORY_HOME: home, YOTTA_MEMORY_PASS: PASS }),
  });
  assert.strictEqual(init.status, 0, init.stderr || init.stdout);

  const child = spawn(process.execPath, [LAUNCHER, 'serve', '--stdio', '--tools', 'core',
    '--agent-id', '${AGENT_ID}', '--agent-key-file', '${AGENT_KEY_FILE}'], {
    env: cleanEnv({ YOTTA_MEMORY_HOME: home, PLUGIN_DATA: home }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'context', arguments: {} } }) + '\n');
  child.stdin.end();

  return new Promise((resolve, reject) => {
    child.on('close', () => {
      try {
        assert.doesNotMatch(stdout + stderr, /\$\{AGENT_ID\}/);
        assert.match(stderr, /key claim/);
        const line = stdout.trim().split('\n').filter(Boolean)[0];
        const payload = JSON.parse(line);
        assert.match(payload.result.content[0].text, /\u5fc5\u987b\u5148\u58f0\u660e/);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    child.on('error', reject);
  });
});
