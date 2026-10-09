'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'install.js');

function runInstall(dest) {
  return spawnSync(process.execPath, [BIN, '--dir', dest], { encoding: 'utf8' });
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out;
}

test('installer copies a clean skill slice (no tarballs / fixtures / dev files)', () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-install-hygiene-'));
  try {
    const r = runInstall(stage);
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    const target = path.join(stage, 'yotta-memory');
    const files = listFiles(target);
    assert.ok(files.includes('SKILL.md'), 'SKILL.md must be installed');
    assert.ok(!files.some((f) => f.toLowerCase().endsWith('.tgz')), 'tarballs must not be installed');
    assert.ok(!files.some((f) => f.startsWith('test-fixtures/')), 'test fixtures must not be installed');
    assert.ok(!files.includes('package.json'), 'package.json must not be installed');
    assert.ok(!files.some((f) => f.startsWith('bin/')), 'engine bin must not be installed by the skill installer');
  } finally {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});

test('installer cleans stale tarballs and fixtures from an existing install', () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-install-clean-'));
  try {
    const target = path.join(stage, 'yotta-memory');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'SKILL.md'), '---\nversion: 0.0.0\n---\n', 'utf8');
    fs.writeFileSync(path.join(target, 'old.tgz'), 'stale', 'utf8');
    fs.mkdirSync(path.join(target, 'test-fixtures'), { recursive: true });
    fs.writeFileSync(path.join(target, 'test-fixtures', 'fake.js'), 'stale', 'utf8');

    const r = runInstall(stage);
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    assert.strictEqual(fs.existsSync(path.join(target, 'old.tgz')), false);
    assert.strictEqual(fs.existsSync(path.join(target, 'test-fixtures')), false);
  } finally {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
});
