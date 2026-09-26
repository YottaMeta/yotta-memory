'use strict';
// v0.18.0 A7: context --audit (compressed-content audit) regression tests.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-audit-store-');
  const configDir = tmpdir('ytm-audit-config-');
  const agentHome = tmpdir('ytm-audit-home-');
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
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function cliEnv(root, configDir, agentHome) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  env.YOTTA_MEMORY_HOME = root;
  env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  return env;
}

function snapshotStore(root) {
  const out = {};
  for (const fp of memory.collectEntryFiles(root)) {
    out[path.relative(root, fp).replace(/\\/g, '/')] = fs.readFileSync(fp, 'utf8');
  }
  return out;
}

function writeInput(root, name, text) {
  const fp = path.join(root, name);
  fs.writeFileSync(fp, text, 'utf8');
  return fp;
}

const AUDIT_INPUT = [
  '## 决策',
  '- 决定：数据库采用 PostgreSQL 加密存储',
  '- 口径：记忆分层只做写入分层，旧库不自动迁移',
  '',
  '## 下一步',
  '- 下一步：为审计命令补 --gate 退出码',
  '',
].join('\n');

test('context --audit separates landed decisions from missing ones', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '记忆分层口径', '记忆分层只做写入分层，旧库不自动迁移', {});
    const input = writeInput(root, 'audit-input.md', AUDIT_INPUT);

    const r = memory.contextCore({ audit: true, from: input, selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    assert.ok(r.report, 'audit must return a structured report');
    assert.ok(r.report.summary.landed >= 1, 'the stored decision must be recognised as landed');
    assert.ok(r.report.summary.missing >= 1, 'unrecorded decisions must be reported as missing');
    assert.ok(/remember/.test(r.text), 'missing items must carry a remember suggestion: ' + r.text);
    const landed = r.report.items.filter((x) => x.status === 'landed');
    assert.ok(landed.some((x) => x.matched_file && x.matched_file.indexOf('facts/') === 0), 'landed item must carry its file reference');
  });
});

test('context --audit --gate controls the exit code', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '记忆分层口径', '记忆分层只做写入分层，旧库不自动迁移', {});
    const input = writeInput(root, 'audit-input.md', AUDIT_INPUT);

    const gated = memory.contextCore({ audit: true, from: input, selfAgent: 'codex', gate: ['0'] });
    assert.strictEqual(gated.exitCode, 1, 'missing items above the gate must exit 1');
    const tolerant = memory.contextCore({ audit: true, from: input, selfAgent: 'codex', gate: ['5'] });
    assert.strictEqual(tolerant.exitCode, 0, 'missing items under the gate must exit 0');
  });
});

test('context --audit only matches entries the current identity may read', () => {
  withStore((root) => {
    memory.rememberCore('PREF', 'alice 私有口径', '周三提交部署申请', { owner: 'alice', selfAgent: 'codex', unsafe: true });
    const input = writeInput(root, 'audit-input.md', '# 决策\n- 口径：周三提交部署申请\n');
    const r = memory.contextCore({ audit: true, from: input, selfAgent: 'codex' });
    assert.strictEqual(r.report.summary.landed, 0, 'cross-owner private memory must not count as landed');
    assert.ok(r.report.summary.missing >= 1);
  });
});

test('context --audit never writes memory or usage hits', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '记忆分层口径', '记忆分层只做写入分层，旧库不自动迁移', {});
    const input = writeInput(root, 'audit-input.md', AUDIT_INPUT);
    const before = snapshotStore(root);
    memory.contextCore({ audit: true, from: input, selfAgent: 'codex' });
    const after = snapshotStore(root);
    assert.deepStrictEqual(after, before, 'audit must be read-only');
  });
});

test('context --audit accepts --from - (stdin) and reports JSON via CLI', () => {
  withStore((root, configDir, agentHome) => {
    memory.rememberCore('FACT', '记忆分层口径', '记忆分层只做写入分层，旧库不自动迁移', {});
    const env = cliEnv(root, configDir, agentHome);
    const r = spawnSync(process.execPath, [CLI, 'context', '--audit', '--from', '-', '--agent', 'codex', '--json'], {
      encoding: 'utf8',
      env,
      input: AUDIT_INPUT,
    });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.summary.landed >= 1);
    assert.ok(parsed.summary.missing >= 1);
  });
});

test('context --audit without --from audits the dropped context list instead', () => {
  withStore((root, configDir, agentHome) => {
    memory.rememberCore('FACT', '走廊条目甲', '近期走廊内容甲', {});
    memory.rememberCore('FACT', '走廊条目乙', '近期走廊内容乙', {});
    const env = cliEnv(root, configDir, agentHome);
    const r = spawnSync(process.execPath, [CLI, 'context', '--audit', '--agent', 'codex'], { encoding: 'utf8', env });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    assert.ok(/丢弃/.test(r.stdout), 'audit fallback must describe the dropped context list: ' + r.stdout);
  });
});

test('context --audit 的 remember 建议 subject 不在标点中间截断', () => {
  withStore((root) => {
    const input = writeInput(root, 'audit-truncate.md', '# 决策\n- 决定采用 Rust 重写洞觅的扫描内核（这条没有落盘）\n');
    const r = memory.contextCore({ audit: true, from: input, selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    const cmd = (r.text.match(/yotta-memory remember FACT "[^"]*"/) || [])[0];
    assert.ok(cmd, 'missing items must carry a remember suggestion: ' + r.text);
    const subject = /FACT "([^"]*)"/.exec(cmd)[1];
    assert.ok(subject.length > 0 && subject.length <= 20, 'subject 必须控制在 20 字符内: ' + subject);
    assert.ok(!/[\s，。；：、,.;:!?！？（）()【】\[\]「」『』“”'"—–\-]$/.test(subject), 'subject 不应以标点结尾: ' + subject);
  });
});
