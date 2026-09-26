'use strict';
// v0.18.0 修正回归：本批新能力在 MCP 工具面上的「只读 + 预演」子集。
// 口径（老张 2026-09-26 拍板方案 A）：MCP 只补只读能力（容量报告 / 上下文审计 / 归档预演 / consolidate propose），
// 破坏性覆盖（archive --force、consolidate --apply/--undo）留在本机 CLI 由用户确认后执行。
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const memory = require('../bin/yotta-memory.js');

const FULL = { agent: 'codex', toolProfile: 'full' };

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-mcpsurf-store-');
  const configDir = tmpdir('ytm-mcpsurf-config-');
  const agentHome = tmpdir('ytm-mcpsurf-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

function toolsByName(profile) {
  const map = new Map();
  for (const tool of memory.mcpTools(profile)) map.set(tool.name, tool);
  return map;
}

function rel(root, fp) {
  return path.relative(root, fp).replace(/\\/g, '/');
}

function storeSnapshot(root) {
  const out = {};
  const walk = function (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fp);
      else out[rel(root, fp)] = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

test('MCP full 暴露只读新面，破坏性覆盖仍留在 CLI', () => {
  const tools = toolsByName('full');

  const archive = tools.get('archive');
  assert.ok(archive.inputSchema.properties.dryRun, 'archive 必须接受 dryRun');
  assert.ok(!archive.inputSchema.properties.force, 'archive.force 必须留在本机 CLI');

  const maintain = tools.get('maintain');
  assert.ok(maintain.inputSchema.properties.capacity, 'maintain 必须接受 capacity');

  const context = tools.get('context').inputSchema.properties;
  assert.ok(context.audit && context.auditText && context.gate, 'context 必须暴露 audit / auditText / gate');
  assert.ok(!context.from, 'MCP 不得接受任意文件路径（避免把 --from 变成任意文件读取通道）');

  const consolidate = tools.get('consolidate');
  assert.ok(consolidate, 'consolidate 工具必须存在');
  assert.ok(!consolidate.inputSchema.properties.apply, 'MCP consolidate 必须只读，不得暴露 apply');
  assert.ok(!consolidate.inputSchema.properties.undo && !consolidate.inputSchema.properties.batches, 'MCP consolidate 不得暴露 undo / batches');
});

test('MCP core 分组不受本批影响', () => {
  assert.deepStrictEqual(memory.mcpTools('core').map((t) => t.name), ['context', 'recall', 'search', 'remember']);
});

test('MCP archive dryRun 只预览、零写入；force 不透传', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '普通旧条目', '普通旧条目，应被列为将归档', { _today: daysAgoStr(40) });
    memory.rememberCore('FACT', 'pinned 条目', '带 pinned 标签的旧条目，默认豁免', { _today: daysAgoStr(40) });
    const pinned = memory.collectEntryFiles(root).filter((fp) => fs.readFileSync(fp, 'utf8').includes('pinned 条目'))[0];
    let text = fs.readFileSync(pinned, 'utf8').replace(/^tags:.*$/m, 'tags: [pinned]');
    fs.writeFileSync(pinned, text, 'utf8');
    const before = storeSnapshot(root);

    const r = memory.callTool('archive', { dryRun: true, force: true, days: 7, threshold: 999 }, FULL);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /^预览（未改动）/);
    assert.match(r.text, /将归档 1 条/, 'force 未透传时 pinned 条目应仍被豁免：' + r.text);
    assert.deepStrictEqual(storeSnapshot(root), before, 'MCP 预演不得写盘');
  });
});

test('MCP maintain capacity 返回只读容量报告', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '容量条目', '容量报告只读，不应改动记忆库', { _today: daysAgoStr(40) });
    const before = storeSnapshot(root);

    const r = memory.callTool('maintain', { capacity: true }, FULL);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /容量水位/);
    assert.deepStrictEqual(storeSnapshot(root), before, '容量报告必须只读');
  });
});

test('MCP context audit 只接受内联文本，不读 stdin / 不接受文件路径', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '记忆分层口径', '记忆分层只做写入分层，旧库不自动迁移', {});
    const before = storeSnapshot(root);

    const missing = memory.callTool('context', { audit: true }, FULL);
    assert.strictEqual(missing.error, true);
    assert.match(missing.text, /auditText/);

    const r = memory.callTool('context', {
      audit: true,
      auditText: '# 决策\n- 口径：记忆分层只做写入分层，旧库不自动迁移\n- 决定：数据库采用 PostgreSQL 加密存储\n',
    }, FULL);

    assert.strictEqual(r.error, false, r.text);
    assert.match(r.text, /未落盘/);
    assert.match(r.text, /remember FACT/);
    assert.deepStrictEqual(storeSnapshot(root), before, '审计必须只读');
  });
});

test('MCP consolidate 只出 propose 报告，apply / undo 参数被忽略', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '旧主题甲', '同一个主题的旧记忆甲', { _today: daysAgoStr(400) });
    memory.rememberCore('FACT', '旧主题乙', '同一个主题的旧记忆乙', { _today: daysAgoStr(400) });
    const before = storeSnapshot(root);

    const propose = memory.callTool('consolidate', {}, FULL);
    assert.strictEqual(propose.error, false, propose.text);
    assert.match(propose.text, /propose/);
    assert.deepStrictEqual(storeSnapshot(root), before, 'MCP consolidate 必须保持只读 propose');

    const destructive = memory.callTool('consolidate', { apply: true, yes: true }, FULL);
    assert.strictEqual(destructive.error, true, 'MCP consolidate --apply 必须 fail-closed');
    assert.match(destructive.text, /拒绝/);
    const undo = memory.callTool('consolidate', { undo: 'x' }, FULL);
    assert.strictEqual(undo.error, true, 'MCP consolidate --undo 必须 fail-closed');
    assert.deepStrictEqual(storeSnapshot(root), before, '被拒绝的调用不得写盘');
  });
});
