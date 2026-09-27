'use strict';
// v0.18.1 A8: distill traceability + typed extraction regression tests.
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
  const root = tmpdir('ytm-distill-store-');
  const configDir = tmpdir('ytm-distill-config-');
  const agentHome = tmpdir('ytm-distill-home-');
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

function cleanEnv(root, configDir, agentHome) {
  const env = Object.assign({}, process.env);
  delete env.YOTTA_AGENT_ID;
  delete env.AGENT_ID;
  env.YOTTA_MEMORY_HOME = root;
  env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  return env;
}

function memText(fields, body) {
  const lines = ['---'];
  for (const key of Object.keys(fields)) lines.push(key + ': ' + fields[key]);
  lines.push('---', '');
  if (body) lines.push(body);
  return lines.join('\n') + '\n';
}

function writeEntry(root, rel, fields, body) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, memText(fields, body), 'utf8');
  return fp;
}

function baseFields(type, subject, statement, tags) {
  return {
    type: type,
    subject: subject,
    statement: statement,
    confidence: '0.9',
    created: '2026-09-20',
    updated: '2026-09-20',
    tags: tags,
    immutable: 'false',
    scope: type === 'FACT' ? 'public' : 'private',
    owner: type === 'FACT' ? '' : 'codex',
    source: 'test',
    weight: '1.0',
  };
}

function seedTyped(root) {
  const entries = [];
  const add = (rel, fields, body) => {
    writeEntry(root, rel, fields, body);
    entries.push({
      file: rel,
      type: fields.type.toUpperCase(),
      scope: fields.scope,
      owner: fields.owner,
      subject: fields.subject,
      statement: fields.statement,
      tags: String(fields.tags || '').split(',').filter(Boolean),
      confidence: 0.9,
      created: fields.created,
      updated: fields.updated,
      access_count: 0,
      last_accessed: '',
      immutable: false,
      source: 'test',
      weight: 1.0,
      feedback_net: 0,
    });
  };
  add('private/codex/commits/2026/09/2026-09-20-0001.md',
    baseFields('COMMIT', '发布踩坑', '推送前没跑测试导致 CI 失败', 'git,教训,push-gate'),
    '避免：推送前先跑 npm test。\n原因：跳过验证。');
  add('private/codex/commits/2026/09/2026-09-20-0002.md',
    baseFields('COMMIT', '上线待办', '完成 SkillHub 上架', 'todo,release'),
    '截止 2026-10-01 前完成。');
  add('private/codex/prefs/2026/09/2026-09-20-0003.md',
    baseFields('PREF', '协作改进', '先出方案再动手', 'growth,改进'),
    '之前直接改文件，后来先给方案，效果更好。');
  add('facts/2026/09/2026-09-20-0004.md',
    baseFields('FACT', '元忆发布', '元忆 0.18.0 已发布', 'release,事件'),
    '结果：四通道公开。');
  add('private/codex/bounds/2026/09/2026-09-20-0005.md',
    baseFields('BOUND', '发布闸门', '未验收不得推送', 'bound,publish'),
    '除非老张放行。');
  memory.saveIndex(root, entries);
}

test('distill reports typed extraction sections with anchors and metrics', () => {
  withStore((root) => {
    seedTyped(root);
    const result = memory.distillCore({ owner: 'codex', selfAgent: 'codex', subject: 'trace' });
    assert.ok(!result.error, result.text);
    assert.match(result.text, /二、分类型提取清单/);
    for (const name of ['教训', '待办', '成长', '事件', '规则边界']) {
      assert.ok(result.text.indexOf('### ' + name) !== -1, 'missing class ' + name);
    }
    assert.match(result.text, /\[溯源: [^\]]+#L\d+-L\d+\]/);
    assert.match(result.text, /三、质量指标/);
    assert.match(result.text, /溯源覆盖率/);
    assert.ok(result.report && result.report.schemaVersion === 1, 'report schemaVersion');
    assert.strictEqual(result.report.metrics.trace_coverage, 1);
    assert.ok(result.report.metrics.compression_ratio > 0);
  });
});

test('distill extracts per-class fields and marks missing elements as 未记录', () => {
  withStore((root) => {
    seedTyped(root);
    const result = memory.distillCore({ owner: 'codex', selfAgent: 'codex', subject: 'fields' });
    const classes = {};
    for (const c of result.report.classes) classes[c.name] = c;
    const lesson = classes['教训'].items[0];
    assert.ok(lesson.fields['触发条件']);
    assert.ok(lesson.fields['规避方法'].indexOf('npm test') !== -1);
    const todo = classes['待办'].items[0];
    assert.ok(todo.fields['截止'].indexOf('2026-10-01') !== -1);
    const growth = classes['成长'].items[0];
    assert.ok(growth.fields['效果'].indexOf('更好') !== -1);
    assert.ok(todo.fields['优先级'] === '未记录', 'missing element must be explicit');
  });
});

test('distill --json emits a structured report through the CLI', () => {
  withStore((root, configDir, agentHome) => {
    seedTyped(root);
    const r = spawnSync(process.execPath, [CLI, 'distill', '--json', '--owner', 'codex', '--agent', 'codex'], {
      encoding: 'utf8',
      env: cleanEnv(root, configDir, agentHome),
    });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const report = JSON.parse(r.stdout);
    assert.strictEqual(report.schemaVersion, 1);
    assert.ok(Array.isArray(report.classes));
    assert.ok(report.metrics && report.metrics.trace_coverage === 1);
  });
});

test('distill handles empty, BOM, invalid-utf8, no-structure and overlong inputs', () => {
  withStore((root) => {
    fs.mkdirSync(path.join(root, 'facts/2026/09'), { recursive: true });
    fs.writeFileSync(path.join(root, 'facts/2026/09/2026-09-20-0101.md'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'facts/2026/09/2026-09-20-0102.md'),
      '\uFEFF' + memText(baseFields('FACT', 'BOM 条目', '带 BOM 的正文', '事件'), '正文内容。'), 'utf8');
    fs.writeFileSync(path.join(root, 'facts/2026/09/2026-09-20-0103.md'), Buffer.from([0x23, 0x20, 0xC3, 0x28, 0x0A]));
    fs.writeFileSync(path.join(root, 'facts/2026/09/2026-09-20-0104.md'), '裸文本内容，没有 frontmatter。\n', 'utf8');
    const long = '长'.repeat(3000);
    writeEntry(root, 'facts/2026/09/2026-09-20-0105.md',
      baseFields('FACT', '超长条目', long, '事件'), '正文');
    const result = memory.distillCore({ owner: 'codex', subject: 'boundary' });
    const reasons = result.report.skipped.map((s) => s.reason);
    assert.ok(reasons.indexOf('empty') !== -1, 'empty not reported: ' + JSON.stringify(reasons));
    assert.ok(reasons.indexOf('encoding') !== -1, 'encoding not reported: ' + JSON.stringify(reasons));
    assert.ok(reasons.indexOf('no-structure') !== -1, 'no-structure not reported: ' + JSON.stringify(reasons));
    assert.ok(reasons.indexOf('truncated') !== -1, 'truncated not reported: ' + JSON.stringify(reasons));
    const bomClass = result.report.classes.filter((c) => c.name !== '其他').reduce((n, c) => n + c.count, 0);
    assert.ok(bomClass >= 1, 'BOM entry should still be analyzed');
    const other = result.report.classes.filter((c) => c.name === '其他')[0];
    assert.ok(other && other.count >= 1, 'no-structure entry should land in 其他');
  });
});

test('distill help lists --owner and --out (parser options cannot drift)', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  const lines = result.stdout.split('\n');
  const start = lines.findIndex((line) => /^\s{2}distill\s/.test(line));
  assert.ok(start >= 0, 'distill section not found in help');
  const distillSection = lines.slice(start, start + 12).join('\n');
  assert.ok(distillSection.indexOf('--owner') !== -1, 'distill help missing --owner');
  assert.ok(distillSection.indexOf('--out') !== -1, 'distill help missing --out');
});
