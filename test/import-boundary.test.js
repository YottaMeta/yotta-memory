'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const MOD = require(CLI);

test('MCP import rejects unsafe private owners without writing outside the store', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-import-boundary-'));
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  process.env.YOTTA_MEMORY_HOME = home;
  t.after(() => {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = oldHome;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const init = MOD.initCore({ dir: home, noEncrypt: true });
  assert.strictEqual(init.error, false, init.text);
  const outsideBase = path.join(os.tmpdir(), 'ytm-import-outside-' + Date.now() + '-' + Math.random().toString(16).slice(2));
  t.after(() => fs.rmSync(outsideBase, { recursive: true, force: true }));
  const owner = path.relative(path.join(home, 'private'), outsideBase);
  const src = path.join(home, 'evil-import.json');
  fs.writeFileSync(src, JSON.stringify({
    format: 'yottamemory',
    memories: [{ meta: { type: 'PREF', subject: 'escape', statement: 'must not write', scope: 'private', owner: owner } }],
  }), 'utf8');
  const result = MOD.callTool('import', { src: 'evil-import.json' }, { agent: 'codex' });
  assert.strictEqual(result.error, true, result.text);
  assert.match(result.text, /owner/);
  assert.ok(!fs.existsSync(outsideBase));
});
