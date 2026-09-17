'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const engine = require('../bin/yotta-memory.js');

const CORE_TOOLS = ['context', 'recall', 'search', 'remember'];

test('MCP core 只暴露 context / recall / search / remember', () => {
  const tools = engine.mcpTools('core').map((tool) => tool.name);
  assert.deepStrictEqual(tools, CORE_TOOLS);
});

test('MCP core/full 在 legacy 与 modern tools/list 中保持同一分组', () => {
  const modernMeta = {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  };
  const legacy = engine.handleMessage(
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { agent: 'codex', toolProfile: 'core' },
  );
  const modern = engine.handleMessage(
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: modernMeta },
    { agent: 'codex', toolProfile: 'core' },
  );
  assert.deepStrictEqual(legacy.result.tools.map((tool) => tool.name), CORE_TOOLS);
  assert.deepStrictEqual(modern.result.tools.map((tool) => tool.name), CORE_TOOLS);
});

test('MCP core 调用非核心工具时提示切换到 full', () => {
  const result = engine.callTool('doctor', {}, { agent: 'codex', toolProfile: 'core' });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /--tools full/);
});

test('CLI 拒绝未知 MCP 工具分组', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/yotta-memory.js', 'serve', '--stdio', '--tools', 'unexpected'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
  );
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /工具分组/);
});
