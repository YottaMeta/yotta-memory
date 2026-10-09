'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'yotta-memory.js');

test('--password-stdin strips a UTF-8 BOM from Windows PowerShell pipes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-pw-bom-'));
  try {
    const env = Object.assign({}, process.env, { YOTTA_MEMORY_HOME: root });
    const init = spawnSync(process.execPath, [BIN, 'init', '--dir', root, '--encrypt', '--password-stdin'], {
      input: '\uFEFFsecret-123\r\n',
      encoding: 'utf8',
      env: env,
    });
    assert.strictEqual(init.status, 0, init.stderr || init.stdout);

    // 不带 BOM 的同一口令必须能通过校验（旧行为会把 BOM 存进口令，解锁必失败）。
    const bind = spawnSync(process.execPath, [BIN, 'key', 'bind', 'codex', '--password', 'secret-123'], {
      encoding: 'utf8',
      env: env,
    });
    assert.strictEqual(bind.status, 0, bind.stderr || bind.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
