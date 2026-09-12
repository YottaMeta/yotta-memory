'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('forgetCore moves a memory into .trash instead of deleting it permanently', () => {
  const root = tmpdir('ytm-forget-trash-');
  const rel = 'facts/2026-09-12-0001.md';
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '---',
    'type: FACT',
    'subject: 测试记忆',
    'statement: 删除时必须进回收区',
    'scope: public',
    'created: 2026-09-12',
    'updated: 2026-09-12',
    '---',
    '',
    '测试正文',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({
    version: 4,
    entries: [{ file: rel, type: 'FACT', subject: '测试记忆', statement: '删除时必须进回收区' }],
  }), 'utf8');

  const oldHome = process.env.YOTTA_MEMORY_HOME;
  process.env.YOTTA_MEMORY_HOME = root;
  try {
    const result = memory.forgetCore(rel, { selfAgent: 'codex' });
    assert.strictEqual(result.error, false);
    assert.strictEqual(fs.existsSync(file), false);

    const trashFiles = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else trashFiles.push(full);
      }
    };
    walk(path.join(root, '.trash'));
    assert.ok(trashFiles.some((item) => item.endsWith(path.join('facts', '2026-09-12-0001.md'))));
    assert.ok(trashFiles.some((item) => path.basename(item).startsWith('audit-')));

    const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
    assert.strictEqual(index.entries.length, 0);
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
