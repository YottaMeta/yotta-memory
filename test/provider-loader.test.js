'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const provider = require('../bin/provider');

const FIXTURE = path.join(__dirname, '..', 'test-fixtures', 'fake-provider.js');

function tmpHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'ytm-provider-'));
}

function writeConfig(home, providers) {
  fs.writeFileSync(path.join(home, 'provider.json'), JSON.stringify({ schema: 1, providers }), 'utf8');
}

function baseProvider(extra) {
  return Object.assign({
    id: 'fake',
    capabilities: ['memory.hook'],
    command: [process.execPath, FIXTURE],
  }, extra || {});
}

function withMode(mode) {
  return { command: [process.execPath, FIXTURE].concat(mode ? [mode] : []) };
}

function withHome(home, fn) {
  const savedHome = process.env.YOTTA_PROVIDER_HOME;
  process.env.YOTTA_PROVIDER_HOME = home;
  try {
    return fn();
  } finally {
    if (savedHome === undefined) delete process.env.YOTTA_PROVIDER_HOME; else process.env.YOTTA_PROVIDER_HOME = savedHome;
  }
}

test('未配置 provider.json：not_installed 且不写审计', () => {
  const home = tmpHome();
  try {
    const result = withHome(home, () => provider.runCapability('memory.hook', {}));
    assert.strictEqual(result.status, 'not_installed');
    assert.ok(!fs.existsSync(path.join(home, 'provider-audit.jsonl')));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('正常调用：active + data，审计只有元数据、不含 payload 正文', () => {
  const home = tmpHome();
  try {
    writeConfig(home, [baseProvider(withMode())]);
    const result = withHome(home, () => provider.runCapability('memory.hook', {
      candidates: [{ file: 'facts/secret.md', statement: 'SECRET_MARKER_9f13' }],
    }));
    assert.strictEqual(result.status, 'active');
    assert.strictEqual(result.provider_id, 'fake');
    assert.ok(Array.isArray(result.data.evict));
    const auditFile = path.join(home, 'provider-audit.jsonl');
    const auditText = fs.readFileSync(auditFile, 'utf8');
    assert.ok(!auditText.includes('SECRET_MARKER_9f13'), '审计不得包含 payload 正文');
    const line = JSON.parse(auditText.trim().split('\n')[0]);
    assert.strictEqual(line.capability, 'memory.hook');
    assert.strictEqual(line.status, 'active');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('provider 未声明该 capability：not_installed', () => {
  const home = tmpHome();
  try {
    writeConfig(home, [baseProvider(Object.assign({ capabilities: ['o1.route'] }, withMode()))]);
    const result = withHome(home, () => provider.runCapability('memory.hook', {}));
    assert.strictEqual(result.status, 'not_installed');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('license_required / timeout / invalid_output 状态透传', () => {
  const cases = [
    ['license', 'license_required', {}],
    ['hang', 'timeout', { timeout_ms: 200 }],
    ['invalid', 'invalid_output', {}],
  ];
  for (const item of cases) {
    const home = tmpHome();
    try {
      writeConfig(home, [baseProvider(Object.assign(withMode(item[0]), item[2]))]);
      const result = withHome(home, () => provider.runCapability('memory.hook', {}));
      assert.strictEqual(result.status, item[1], item[0] + ' 应为 ' + item[1]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
});

test('配置非法 / 命令不存在：error，不阻断调用方', () => {
  const home = tmpHome();
  try {
    writeConfig(home, [{ id: 'bad', capabilities: ['memory.hook'], command: 'node evil.js' }]);
    assert.strictEqual(withHome(home, () => provider.runCapability('memory.hook', {})).status, 'error');
    writeConfig(home, [{
      id: 'missing',
      capabilities: ['memory.hook'],
      command: [path.join(home, 'no-such-provider.js')],
    }]);
    assert.strictEqual(withHome(home, () => provider.runCapability('memory.hook', {})).status, 'error');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
