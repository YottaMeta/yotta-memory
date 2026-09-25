'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const PASS = 'identity-remove-pass-2026-09-25';

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(home, args) {
  return childProcess.spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { YOTTA_MEMORY_HOME: home }),
  });
}

function withStore(fn, opts) {
  const home = tmpdir('ytm-remove-store-');
  const configDir = tmpdir('ytm-remove-config-');
  const oldHome = process.env.YOTTA_MEMORY_HOME;
  const oldConfigDir = process.env.YOTTA_MEMORY_CONFIG_DIR;
  process.env.YOTTA_MEMORY_HOME = home;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  try {
    return fn(home, opts || {});
  } finally {
    if (oldHome === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = oldHome;
    if (oldConfigDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = oldConfigDir;
  }
}

function hashTree(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort(function (a, b) { return a.name.localeCompare(b.name); })) {
      const fp = path.join(current, item.name);
      if (item.isDirectory()) { walk(fp); continue; }
      out[path.relative(dir, fp).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    }
  })(dir);
  return out;
}

function seedOwner(home, id) {
  const agentHome = tmpdir('ytm-remove-agent-');
  const registered = run(home, ['iam', id]);
  assert.strictEqual(registered.status, 0, registered.stdout + registered.stderr);
  const bound = run(home, ['key', 'bind', id, '--password', PASS]);
  assert.strictEqual(bound.status, 0, bound.stdout + bound.stderr);
  const claimed = run(home, ['key', 'claim', id, '--to', agentHome]);
  assert.strictEqual(claimed.status, 0, claimed.stdout + claimed.stderr);
  const keyFile = path.join(agentHome, '.yotta-memory-agent-key');
  const written = run(home, ['remember', 'PREF', id + ' 的偏好', id + ' 偏好深色主题', '--agent', id, '--agent-key-file', keyFile]);
  assert.strictEqual(written.status, 0, written.stdout + written.stderr);
  return { agentHome: agentHome, keyFile: keyFile };
}

// 加密库 + 两个 owner（codex / xiaoan）+ token + grants + 一条公共事实
function seedEncryptedPair(home) {
  const init = run(home, ['init', '--password', PASS]);
  assert.strictEqual(init.status, 0, init.stdout + init.stderr);
  const codex = seedOwner(home, 'codex');
  const xiaoan = seedOwner(home, 'xiaoan');
  const publicFact = run(home, ['remember', 'FACT', '公共事实', '公共事实内容大家都能看', '--agent', 'codex', '--agent-key-file', codex.keyFile]);
  assert.strictEqual(publicFact.status, 0, publicFact.stdout + publicFact.stderr);
  fs.mkdirSync(path.join(home, '.server'), { recursive: true });
  fs.writeFileSync(path.join(home, '.server', 'tokens.json'), JSON.stringify({ codex: { token: 'token-codex' }, xiaoan: { token: 'token-xiaoan' } }, null, 2), 'utf8');
  fs.writeFileSync(path.join(home, 'grants.json'), JSON.stringify({ user: ['codex', 'xiaoan'], codex: ['xiaoan'] }, null, 2), 'utf8');
  return { codex: codex, xiaoan: xiaoan };
}

function removeOpts(extra) {
  return Object.assign({
    password: PASS,
    yes: true,
    snapshotDir: tmpdir('ytm-remove-snapshot-'),
    allowSameVolumeForTest: true,
  }, extra || {});
}

// ---- identity remove：彻底删除一个 AI 身份 + 它的私密记忆 ----

test('identity remove 真删九项清单，公共明文与其它 owner 不受影响', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    const codexBefore = hashTree(path.join(home, 'private', 'codex'));
    const publicFiles = memory.collectEntryFiles(home).filter(function (fp) { return /^facts\//.test(path.relative(home, fp).replace(/\\/g, '/')); });
    assert.ok(publicFiles.length >= 1, '公共 FACT 应已写入');

    const result = memory.identityRemoveCore(home, 'xiaoan', removeOpts());
    assert.strictEqual(result.error, false, result.text);
    assert.strictEqual(result.steps.length, 9, JSON.stringify(result.steps));
    for (const stepId of ['agents', 'owner-key', 'binding', 'memories', 'token', 'grants', 'reindex']) {
      assert.ok(result.removed.indexOf(stepId) !== -1, '缺少已删除步骤 ' + stepId + ' -> ' + JSON.stringify(result.removed));
    }

    const agents = JSON.parse(fs.readFileSync(path.join(home, 'agents.json'), 'utf8'));
    assert.ok(agents.agents.codex, 'codex 身份必须保留');
    assert.ok(!agents.agents.xiaoan, 'xiaoan 身份必须删除');
    assert.ok(!fs.existsSync(path.join(home, 'keys', 'xiaoan.key.enc')), 'owner 密钥必须删除');
    assert.ok(!fs.existsSync(path.join(home, 'keys', 'bindings', 'xiaoan.key.agent')), 'binding 必须删除');
    assert.ok(!fs.existsSync(path.join(home, 'keys', 'pending', 'xiaoan.key')), 'pending 必须删除');
    assert.ok(!fs.existsSync(path.join(home, 'private', 'xiaoan')), '私密目录必须整体删除');
    assert.ok(!fs.existsSync(path.join(home, 'private', 'xiaoan', 'index.enc')), 'owner 索引必须删除');

    const tokens = JSON.parse(fs.readFileSync(path.join(home, '.server', 'tokens.json'), 'utf8'));
    assert.ok(!tokens.xiaoan, 'token 必须删除');
    assert.ok(tokens.codex, 'codex token 必须保留');
    const grants = JSON.parse(fs.readFileSync(path.join(home, 'grants.json'), 'utf8'));
    assert.deepStrictEqual(grants.user, ['codex'], 'grants 里对 xiaoan 的授权必须清掉');
    assert.deepStrictEqual(grants.codex || [], [], 'codex 对 xiaoan 的授权必须清掉');

    assert.deepStrictEqual(hashTree(path.join(home, 'private', 'codex')), codexBefore, '其它 owner 私密目录必须零变化');
    for (const fp of publicFiles) assert.ok(fs.existsSync(fp), '公共明文必须保留: ' + fp);
    const index = memory.getIndex(home);
    assert.ok(index.some(function (e) { return /公共事实/.test(String(e.subject)); }), '公共索引必须保留公共事实');
    assert.deepStrictEqual(memory.loadOwnerIndex(home, 'xiaoan', Buffer.alloc(32)), []);
  });
});

test('identity remove --dry-run 只列清单，不动任何文件', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    const before = hashTree(home);
    const result = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ dryRun: true }));
    assert.strictEqual(result.error, false, result.text);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.removed.length, 0);
    assert.match(result.text, /预演|dry-run/);
    assert.deepStrictEqual(hashTree(home), before, '预演必须零写入');
  });
});

test('identity remove 拒绝 AI 身份执行（只能用户本人）', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    const aiClaim = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ agent: 'codex', password: '' }));
    assert.strictEqual(aiClaim.error, true);
    assert.match(aiClaim.text, /用户|view|--agent user/);
    assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '拒绝时不得改动记忆');
  });
});

test('identity remove 在加密库必须提供正确主口令或恢复钥匙', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    const missing = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ password: '' }));
    assert.strictEqual(missing.error, true);
    assert.match(missing.text, /口令|恢复钥匙/);
    const wrong = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ password: 'wrong-pass-1234' }));
    assert.strictEqual(wrong.error, true);
    assert.match(wrong.text, /口令|恢复钥匙|不正确|无法/);
    const cli = run(home, ['identity', 'remove', 'xiaoan', '--password', 'wrong-pass-1234', '--yes']);
    assert.strictEqual(cli.status, 2, cli.stdout + cli.stderr);
    assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '失败时不得改动记忆');
  });
});

test('identity remove 在明文库要求显式用户身份，且未配置备份时拒绝', () => {
  withStore((home) => {
    const init = run(home, ['init', '--no-encrypt']);
    assert.strictEqual(init.status, 0, init.stdout + init.stderr);
    const written = run(home, ['remember', 'PREF', '明文偏好', '明文库里的私密偏好', '--agent', 'xiaoan']);
    assert.strictEqual(written.status, 0, written.stdout + written.stderr);
    const noUser = memory.identityRemoveCore(home, 'xiaoan', { yes: true, snapshotDir: tmpdir('ytm-remove-snapshot-'), allowSameVolumeForTest: true });
    assert.strictEqual(noUser.error, true);
    assert.match(noUser.text, /--agent user|用户/);
    const noBackup = memory.identityRemoveCore(home, 'xiaoan', { agent: 'user', yes: true });
    assert.strictEqual(noBackup.error, true);
    assert.match(noBackup.text, /备份|快照/);
    assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '被拒时不得改动记忆');
    const ok = memory.identityRemoveCore(home, 'xiaoan', { agent: 'user', yes: true, snapshotDir: tmpdir('ytm-remove-snapshot-'), allowSameVolumeForTest: true });
    assert.strictEqual(ok.error, false, ok.text);
    assert.ok(!fs.existsSync(path.join(home, 'private', 'xiaoan')));
  });
});

test('identity remove 幂等：重复删除只提示不存在', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    assert.strictEqual(memory.identityRemoveCore(home, 'xiaoan', removeOpts()).error, false);
    const again = memory.identityRemoveCore(home, 'xiaoan', removeOpts());
    assert.strictEqual(again.error, false, again.text);
    assert.strictEqual(again.removed.length, 0);
    assert.match(again.text, /不存在|无需/);
  });
});

test('identity remove 支持 --keep-memories / --keep-identity', () => {
  withStore((home) => {
    seedEncryptedPair(home);
    const keepMemories = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ keepMemories: true }));
    assert.strictEqual(keepMemories.error, false, keepMemories.text);
    const agents = JSON.parse(fs.readFileSync(path.join(home, 'agents.json'), 'utf8'));
    assert.ok(!agents.agents.xiaoan, '身份应删除');
    assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '--keep-memories 应保留私密目录');
  });
  withStore((home) => {
    seedEncryptedPair(home);
    const keepIdentity = memory.identityRemoveCore(home, 'xiaoan', removeOpts({ keepIdentity: true }));
    assert.strictEqual(keepIdentity.error, false, keepIdentity.text);
    const agents = JSON.parse(fs.readFileSync(path.join(home, 'agents.json'), 'utf8'));
    assert.ok(agents.agents.xiaoan, '--keep-identity 应保留身份登记');
    assert.ok(!fs.existsSync(path.join(home, 'private', 'xiaoan')), '私密目录应删除');
  });
});

// ---- view 端：用户查看平台里删除 AI ----

function listenLocal(server) {
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () { resolve(server.address().port); });
  });
}
function closeServer(server) {
  return new Promise(function (resolve) { server.close(function () { resolve(); }); });
}
function viewApi(port, pathname, body) {
  return new Promise(function (resolve, reject) {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Host: '127.0.0.1:' + port },
    }, function (res) {
      let text = '';
      res.on('data', function (chunk) { text += chunk; });
      res.on('end', function () {
        let data = null;
        try { data = JSON.parse(text); } catch (error) { data = null; }
        resolve({ status: res.statusCode, data: data, text: text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('view 的删除 AI 走同一套闸门：确认串 + 备份快照 + 用户解锁', async (t) => {
  const home = tmpdir('ytm-remove-view-');
  const configDir = tmpdir('ytm-remove-view-config-');
  process.env.YOTTA_MEMORY_HOME = home;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  t.after(function () {
    delete process.env.YOTTA_MEMORY_HOME;
    delete process.env.YOTTA_MEMORY_CONFIG_DIR;
  });
  seedEncryptedPair(home);

  const server = memory.viewServerCore(home, 0, '127.0.0.1', {
    snapshotDir: tmpdir('ytm-remove-view-snapshot-'),
    allowSameVolumeForTest: true,
  });
  t.after(function () { return closeServer(server); });
  const port = await listenLocal(server);

  const locked = await viewApi(port, '/api/identity-remove', { owner: 'xiaoan', confirm: 'xiaoan' });
  assert.notStrictEqual(locked.status, 200, '未解锁不得删除');

  const unlock = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(unlock.status, 200);

  const badConfirm = await viewApi(port, '/api/identity-remove', { owner: 'xiaoan', confirm: 'codex' });
  assert.strictEqual(badConfirm.status, 400, badConfirm.text);
  assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '确认串不对时不得删除');

  const unsafe = await viewApi(port, '/api/identity-remove', { owner: '../evil', confirm: '../evil' });
  assert.strictEqual(unsafe.status, 400, unsafe.text);

  const removed = await viewApi(port, '/api/identity-remove', { owner: 'xiaoan', confirm: 'xiaoan' });
  assert.strictEqual(removed.status, 200, removed.text);
  assert.ok(!fs.existsSync(path.join(home, 'private', 'xiaoan')));
  const owners = await viewApi(port, '/api/owners');
  assert.ok(owners.data.owners.every(function (o) { return o.owner !== 'xiaoan'; }), '删除后 owner 列表不应再有 xiaoan');
});

test('view 的删除 AI 在未配置独立备份时拒绝', async (t) => {
  const home = tmpdir('ytm-remove-view2-');
  const configDir = tmpdir('ytm-remove-view2-config-');
  process.env.YOTTA_MEMORY_HOME = home;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  t.after(function () {
    delete process.env.YOTTA_MEMORY_HOME;
    delete process.env.YOTTA_MEMORY_CONFIG_DIR;
  });
  seedEncryptedPair(home);
  const server = memory.viewServerCore(home, 0, '127.0.0.1');
  t.after(function () { return closeServer(server); });
  const port = await listenLocal(server);
  const unlock = await viewApi(port, '/api/unlock', { password: PASS });
  assert.strictEqual(unlock.status, 200);
  const refused = await viewApi(port, '/api/identity-remove', { owner: 'xiaoan', confirm: 'xiaoan' });
  assert.strictEqual(refused.status, 400, refused.text);
  assert.match(JSON.stringify(refused.data || refused.text), /备份|快照/);
  assert.ok(fs.existsSync(path.join(home, 'private', 'xiaoan')), '被拒时不得删除');
});
