'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const memory = require(CLI);

function writeEntry(root, rel, statement) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, [
    '---',
    'type: PREF',
    'subject: 分层画像测试',
    'statement: ' + statement,
    'confidence: 1',
    'created: 2026-09-30T00:00:00Z',
    'updated: 2026-09-30T00:00:00Z',
    'tags: []',
    'owner: codex',
    '---',
    '',
    statement,
    '',
  ].join('\n'), 'utf8');
}

test('profile 收录年/月分层的私密条目', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-profile-layered-'));
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    config: process.env.YOTTA_MEMORY_CONFIG_DIR,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = path.join(root, '.config');
  try {
    writeEntry(root, 'private/codex/prefs/2026-08-31-0001.md', 'FLAT_PROFILE_MARKER');
    writeEntry(root, 'private/codex/prefs/2026/09/2026-09-30-0001.md', 'LAYERED_PROFILE_MARKER');

    const result = memory.profileCore({ selfAgent: 'codex', owner: 'codex' });
    assert.equal(result.error, false);
    assert.match(result.text, /FLAT_PROFILE_MARKER/);
    assert.match(result.text, /LAYERED_PROFILE_MARKER/);
    const written = fs.readFileSync(path.join(root, 'private', 'codex', 'profile.md'), 'utf8');
    assert.match(written, /LAYERED_PROFILE_MARKER/);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME;
    else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.config === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR;
    else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.config;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
