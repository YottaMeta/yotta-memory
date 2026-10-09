'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const memory = require('../bin/yotta-memory.js');

const BIN = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function writeFact(root, name, subject) {
  const dir = path.join(root, 'facts', '2026', '10');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name + '.md');
  fs.writeFileSync(fp, [
    '---',
    'type: FACT',
    'subject: ' + subject,
    'statement: ' + subject + ' 的正文',
    'scope: public',
    'created: 2026-10-09',
    'updated: 2026-10-09',
    '---',
    '',
    'body',
    '',
  ].join('\n'), 'utf8');
  return fp;
}

function writeIndex(root, entries) {
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 4, entries: entries }, null, 2), 'utf8');
}

function readIndex(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
}

test('index consistency report detects drift and silent heal restores it from files (no memory file touched)', () => {
  const root = tmpdir('ytm-index-heal-');
  try {
    writeFact(root, '2026-10-09-0001', '记忆一');
    writeFact(root, '2026-10-09-0002', '记忆二');
    writeFact(root, '2026-10-09-0003', '记忆三');
    // 模拟并发丢更新：索引里只有前两条
    writeIndex(root, [
      { file: 'facts/2026/10/2026-10-09-0001.md', type: 'FACT', subject: '记忆一' },
      { file: 'facts/2026/10/2026-10-09-0002.md', type: 'FACT', subject: '记忆二' },
    ]);

    const before = memory.indexConsistencyReport(root);
    assert.strictEqual(before.drift, true);
    assert.strictEqual(before.missing, 1);
    assert.strictEqual(before.ghosts, 0);

    const filesBefore = memory.collectEntryFiles(root).length;
    const heal = memory.maybeHealIndex(root, { force: true });
    assert.strictEqual(heal.healed, true);
    assert.strictEqual(memory.collectEntryFiles(root).length, filesBefore);

    const after = memory.indexConsistencyReport(root);
    assert.strictEqual(after.drift, false);
    assert.strictEqual(after.files, 3);
    assert.strictEqual(after.entries, 3);
    assert.strictEqual(readIndex(root).entries.length, 3);
  } finally {
    cleanup(root);
  }
});

test('index consistency check is a no-op when files and index already match', () => {
  const root = tmpdir('ytm-index-noop-');
  try {
    writeFact(root, '2026-10-09-0001', '记忆一');
    writeFact(root, '2026-10-09-0002', '记忆二');
    memory.maybeHealIndex(root, { force: true });
    const bytes = fs.readFileSync(path.join(root, 'index.json'));
    const heal = memory.maybeHealIndex(root, { force: true });
    assert.strictEqual(heal.healed, false);
    assert.deepStrictEqual(fs.readFileSync(path.join(root, 'index.json')), bytes);
  } finally {
    cleanup(root);
  }
});

test('concurrent multi-process writes lose nothing: files == index entries == subjects', async () => {
  const root = tmpdir('ytm-index-concurrent-');
  try {
    const script = path.join(root, 'writer.js');
    fs.writeFileSync(script, [
      'const m = require(' + JSON.stringify(BIN) + ');',
      'const root = process.argv[2], tag = process.argv[3];',
      'for (let i = 0; i < 20; i++) {',
      "  const r = m.rememberCore('FACT', 'conc-' + tag + '-' + i, 'concurrent ' + tag + ' ' + i, { root });",
      "  if (!r || r.error) { console.error('FAIL', JSON.stringify(r)); process.exit(1); }",
      '}',
      'process.exit(0);',
    ].join('\n'), 'utf8');
    const tags = ['a', 'b', 'c', 'd', 'e', 'f'];
    const results = await Promise.all(tags.map((tag) => new Promise((resolve) => {
      const child = spawn(process.execPath, [script, root, tag], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('exit', (code) => resolve(code));
    })));
    assert.deepStrictEqual(results, tags.map(() => 0));

    const report = memory.indexConsistencyReport(root);
    assert.strictEqual(report.drift, false);
    assert.strictEqual(report.files, 120);
    assert.strictEqual(report.entries, 120);

    const subjects = new Set(readIndex(root).entries.map((entry) => entry.subject));
    for (const tag of tags) {
      for (let i = 0; i < 20; i++) {
        assert.ok(subjects.has('conc-' + tag + '-' + i), 'missing ' + tag + '-' + i);
      }
    }
  } finally {
    cleanup(root);
  }
});

test('withIndexLock serializes read-modify-write across processes', async () => {
  const root = tmpdir('ytm-index-lock-');
  try {
    const script = path.join(root, 'locker.js');
    fs.writeFileSync(script, [
      'const m = require(' + JSON.stringify(BIN) + ');',
      'const fs = require("fs");',
      'const path = require("path");',
      'const root = process.argv[2];',
      'const counter = path.join(root, "counter.txt");',
      'for (let i = 0; i < 25; i++) {',
      '  m.withIndexLock(root, function () {',
      '    let n = 0;',
      '    try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch (e) {}',
      '    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2); } catch (e) {}',
      '    fs.writeFileSync(counter, String(n + 1), "utf8");',
      '  });',
      '}',
      'process.exit(0);',
    ].join('\n'), 'utf8');
    const workers = [0, 1, 2].map(() => new Promise((resolve) => {
      const child = spawn(process.execPath, [script, root], { stdio: ['ignore', 'pipe', 'pipe'] });
      child.on('exit', (code) => resolve(code));
    }));
    const codes = await Promise.all(workers);
    assert.deepStrictEqual(codes, [0, 0, 0]);
    assert.strictEqual(parseInt(fs.readFileSync(path.join(root, 'counter.txt'), 'utf8'), 10), 75);
    assert.strictEqual(fs.existsSync(path.join(root, '.index.lock')), false);
  } finally {
    cleanup(root);
  }
});

test('view shows what the files hold: overview counts match, search reaches entries by id and owner', () => {
  const root = tmpdir('ytm-index-display-');
  try {
    const r1 = memory.rememberCore('FACT', '显示对账一', '第一条', { root });
    const r2 = memory.rememberCore('FACT', '显示对账二', '第二条', { root, owner: 'codex' });
    assert.strictEqual(r1.error, false);
    assert.strictEqual(r2.error, false);

    const session = { ownerKeys: {} };
    const overview = memory.viewOverviewCore(root, session);
    const files = memory.collectEntryFiles(root).length;
    assert.strictEqual(overview.files, files);
    assert.strictEqual(overview.total, files);

    const all = memory.viewEntriesCore(root, session, '', 0, 50, '');
    assert.strictEqual(all.count, files);

    const byId = memory.viewEntriesCore(root, session, '0001', 0, 50, '');
    assert.strictEqual(byId.count, 1);
    assert.match(byId.entries[0].file, /0001\.md$/);

    const byOwner = memory.viewEntriesCore(root, session, 'codex', 0, 50, '');
    assert.strictEqual(byOwner.count, 1);
    assert.strictEqual(byOwner.entries[0].owner, 'codex');

    // 默认按时间倒序：最后写入的（mtime 最大 / 序号最大）在最前
    const r3 = memory.rememberCore('FACT', '显示对账三', '第三条', { root });
    assert.strictEqual(r3.error, false);
    const ordered = memory.viewEntriesCore(root, session, '', 0, 50, '');
    assert.match(ordered.entries[0].file, /0003\.md$/);

    // 按智能体筛选
    const onlyCodex = memory.viewEntriesCore(root, session, '', 0, 50, '', 'codex');
    assert.strictEqual(onlyCodex.count, 1);
    assert.strictEqual(onlyCodex.entries[0].owner, 'codex');
  } finally {
    cleanup(root);
  }
});
