'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withStore(fn) {
  const root = tmpdir('ytm-scale-store-');
  const configDir = tmpdir('ytm-scale-config-');
  const agentHome = tmpdir('ytm-scale-home-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  const oldAgentHome = process.env.YOTTA_MEMORY_AGENT_HOME;
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root, agentHome);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
    if (oldAgentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME;
    else process.env.YOTTA_MEMORY_AGENT_HOME = oldAgentHome;
  }
}

function writeFlatFact(root, name, subject, statement) {
  const fp = path.join(root, 'facts', name);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, [
    '---',
    'type: FACT',
    'subject: ' + subject,
    'statement: ' + statement,
    'scope: public',
    'created: ' + name.slice(0, 10),
    'updated: ' + name.slice(0, 10),
    '---',
    '',
    statement,
    '',
  ].join('\n'), 'utf8');
  return fp;
}

function relativeEntryFiles(root) {
  return memory.collectEntryFiles(root)
    .map((fp) => path.relative(root, fp).replace(/\\/g, '/'))
    .sort();
}

function writeConfig(extra) {
  const configPath = path.join(process.env.YOTTA_MEMORY_CONFIG_DIR, 'config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(Object.assign({ backup_setup_choice: 'manual' }, extra || {}), null, 2), 'utf8');
}

function jsonDoctor(root, extraEnv) {
  const cli = childProcess.execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'yotta-memory.js'), 'doctor', '--json'], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root }, extraEnv || {}),
  });
  return JSON.parse(cli);
}

// ---- B1: 记忆文件按年分层 ----

test('remember writes new entries into the year/month layout', () => {
  withStore((root) => {
    const result = memory.rememberCore('FACT', '分层测试', '新写入应落到年/月子目录', { _today: '2026-09-25' });
    assert.strictEqual(result.error, false, result.text);
    assert.match(result.text, /facts[\\/]2026[\\/]09[\\/]2026-09-25-0001\.md$/);
    assert.ok(fs.existsSync(path.join(root, 'facts', '2026', '09', '2026-09-25-0001.md')));
    assert.deepStrictEqual(relativeEntryFiles(root), ['facts/2026/09/2026-09-25-0001.md']);

    const index = memory.getIndex(root);
    assert.strictEqual(index.length, 1);
    assert.strictEqual(index[0].file, 'facts/2026/09/2026-09-25-0001.md');
  });
});

test('sequence numbering never collides across layout generations', () => {
  withStore((root) => {
    writeFlatFact(root, '2026-09-25-0001.md', '旧平铺', '旧平铺文件仍在原位');
    const first = memory.rememberCore('FACT', '新分层一', '第一条新写入', { _today: '2026-09-25' });
    const second = memory.rememberCore('FACT', '新分层二', '第二条新写入', { _today: '2026-09-25' });

    assert.strictEqual(first.error, false, first.text);
    assert.strictEqual(second.error, false, second.text);
    assert.match(first.text, /2026-09-25-0002\.md$/);
    assert.match(second.text, /2026-09-25-0003\.md$/);
    assert.deepStrictEqual(relativeEntryFiles(root), [
      'facts/2026-09-25-0001.md',
      'facts/2026/09/2026-09-25-0002.md',
      'facts/2026/09/2026-09-25-0003.md',
    ]);
  });
});

test('mixed old flat and new layered files stay readable', () => {
  withStore((root) => {
    writeFlatFact(root, '2026-09-24-0001.md', '旧平铺记忆', '旧路径继续可读');
    const written = memory.rememberCore('FACT', '新分层记忆', '新路径可读', { _today: '2026-09-25' });
    assert.strictEqual(written.error, false, written.text);

    assert.strictEqual(memory.buildIndex(root).length, 2);
    const entries = memory.ensureIndex(root);
    const files = entries.map((e) => e.file).sort();
    assert.deepStrictEqual(files, [
      'facts/2026-09-24-0001.md',
      'facts/2026/09/2026-09-25-0002.md',
    ]);

    memory.forgetCore('2026-09-24-0001.md', { selfAgent: 'codex', unsafe: false });
    assert.deepStrictEqual(relativeEntryFiles(root), ['facts/2026/09/2026-09-25-0002.md']);
    assert.strictEqual(memory.getIndex(root).length, 1);
  });
});

test('export then import round-trips layered memories', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '往返记忆', '导出导入后仍应存在', { _today: '2026-09-25' });
    const exported = path.join(root, 'roundtrip.json');
    const exp = memory.exportCore(root, exported);
    assert.strictEqual(exp.error, false, exp.text);

    const restored = tmpdir('ytm-scale-restore-');
    const imp = memory.importCore(restored, exported);
    assert.strictEqual(imp.error, false, imp.text);
    assert.strictEqual(memory.buildIndex(restored).length, 1);
    assert.deepStrictEqual(relativeEntryFiles(restored), ['facts/2026/09/2026-09-25-0001.md']);
    const entries = memory.ensureIndex(restored);
    assert.strictEqual(entries[0].subject, '往返记忆');
  });
});

test('private entries layer under their owner and stay owner-scoped', () => {
  withStore((root) => {
    const written = memory.rememberCore('PREF', '私密分层', '私密条目按 owner 与年月分层', {
      _today: '2026-09-25',
      agent: 'codex',
      unsafe: false,
    });
    assert.strictEqual(written.error, false, written.text);
    assert.match(written.text, /private[\\/]codex[\\/]prefs[\\/]2026[\\/]09[\\/]2026-09-25-0001\.md$/);
    assert.deepStrictEqual(relativeEntryFiles(root), ['private/codex/prefs/2026/09/2026-09-25-0001.md']);

    const fp = path.join(root, 'private', 'codex', 'prefs', '2026', '09', '2026-09-25-0001.md');
    assert.strictEqual(memory.ownerFromPrivatePath(root, fp), 'codex');
    assert.strictEqual(
      memory.archiveRelFor(root, 'private/codex/prefs/2026/09/2026-09-25-0001.md', 'PREF', 'codex'),
      '.archive/private/codex/prefs/2026/09/2026-09-25-0001.md'
    );

    const entries = memory.ensureIndex(root);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].owner, 'codex');
    assert.strictEqual(entries[0].scope, 'private');
  });
});

test('archiving never flattens two months into one filename', () => {
  withStore((root) => {
    writeFlatFact(root, path.join('2025', '01', '2025-01-02-0001.md'), '一月旧条目', '应归档到 2025/01');
    writeFlatFact(root, path.join('2026', '02', '2025-01-02-0001.md'), '二月旧条目', '应归档到 2026/02');

    assert.strictEqual(
      memory.archiveRelFor(root, 'facts/2025/01/2025-01-02-0001.md', 'FACT', ''),
      '.archive/facts/2025/01/2025-01-02-0001.md'
    );
    assert.strictEqual(
      memory.archiveRelFor(root, 'private/codex/bounds/2026/02/2026-02-02-0001.md.enc', 'BOUND', 'codex'),
      '.archive/private/codex/bounds/2026/02/2026-02-02-0001.md.enc'
    );
    // 旧的平铺文件没有分层信息，仍落到归档根（与旧行为一致）。
    assert.strictEqual(
      memory.archiveRelFor(root, 'facts/2026-02-02-0001.md', 'FACT', ''),
      '.archive/facts/2026-02-02-0001.md'
    );
  });
});

// ---- B2: doctor 规模体检 ----

test('doctor reports a scale section with defaults', () => {
  withStore((root) => {
    writeConfig();
    writeFlatFact(root, '2026-09-24-0001.md', '规模基线', '只有一条记忆');
    fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
      version: 4,
      entries: [{ file: 'facts/2026-09-24-0001.md', type: 'FACT', subject: '规模基线', statement: '只有一条记忆', created: '2026-09-24' }],
    }), 'utf8');

    const report = memory.doctorCore({ root });
    assert.ok(report.checks.scale, 'doctor must expose checks.scale');
    assert.strictEqual(report.checks.scale.entries, 1);
    assert.strictEqual(report.checks.scale.level, 'ok');
    assert.strictEqual(typeof report.checks.scale.cold_start_ms, 'number');
    assert.ok(report.checks.scale.index_bytes > 0);

    const thresholdKeys = Object.keys(report.checks.scale.thresholds).sort();
    assert.deepStrictEqual(thresholdKeys, [
      'scale_info_cold_start_ms',
      'scale_info_entries',
      'scale_info_files_per_dir',
      'scale_info_index_bytes',
      'scale_warn_cold_start_ms',
      'scale_warn_entries',
      'scale_warn_files_per_dir',
      'scale_warn_index_bytes',
    ]);

    const cli = jsonDoctor(root);
    assert.ok(cli.checks.scale, 'doctor --json must carry checks.scale');
  });
});

test('doctor scale thresholds warn when exceeded', () => {
  withStore((root) => {
    writeConfig({
      scale_warn_entries: 0,
      scale_warn_files_per_dir: 0,
      scale_warn_index_bytes: 0,
    });
    writeFlatFact(root, '2026-09-24-0001.md', '规模告警', '超过配置阈值应告警');
    fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 4, entries: [] }), 'utf8');

    const report = memory.doctorCore({ root });
    assert.strictEqual(report.checks.scale.level, 'warning');
    assert.ok(report.checks.scale.warnings.some((item) => /规模/.test(item)));
    assert.ok(report.warnings.some((item) => /规模/.test(item)));
  });
});
