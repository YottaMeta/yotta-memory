'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const ROOT = path.join(__dirname, '..');
const MOD = require(CLI);
const PASS = 'test-pass-migration-guidance-0.16.3';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('migrate output presents view and key bind as equivalent authorization paths', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-migration-guidance-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const result = MOD.migrateCore(home, PASS, { agent: 'yottacode-desktop' });
  assert.strictEqual(result.error, false, result.text);
  assert.match(result.text, /yotta-memory view/);
  assert.match(result.text, /yotta-memory key bind/);
  assert.match(result.text, /等价/);
  assert.match(result.text, /yotta-memory key status/);
  assert.match(result.text, /yotta-memory key claim/);
});

test('migration quick-start command is documented in skill and user guides', () => {
  const command = 'echo 主口令 | yotta-memory migrate --password-stdin --recovery-key-out';
  for (const rel of ['SKILL.md', 'USER_GUIDE.md', 'references/faq.md', 'README.zh-CN.md']) {
    assert.ok(read(rel).includes(command), rel + ' missing migration quick-start command');
  }
  assert.ok(
    read('README.md').includes('echo <master-password> | yotta-memory migrate --password-stdin --recovery-key-out'),
    'README.md missing English migration quick-start command'
  );
});

test('CLI help describes migration authorization as view or key bind', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /授权二选一/);
  assert.match(r.stdout, /yotta-memory view/);
  assert.match(r.stdout, /yotta-memory key bind/);
});
