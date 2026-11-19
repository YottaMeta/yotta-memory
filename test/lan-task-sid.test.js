'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../bin/yotta-memory.js');

const CLI = path.join(__dirname, '..', 'bin', 'yotta-memory.js');
const SID_A = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const SID_B = 'S-1-5-21-4444444444-5555555555-6666666666-1001';
const SID_C = 'S-1-5-21-7777777777-8888888888-9999999999-1001';
const TASK_A = 'YottaMemoryServe-a8c06b3027d3fc4a';
const TASK_B = 'YottaMemoryServe-e866c88138dcc083';
const TASK_C = 'YottaMemoryServe-ea71127b7d43d69c';
const LEGACY_TASK = 'YottaMemoryServe';
const USER_A = 'TESTPC\\tester';

function tmpDir(t, tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-sid-' + tag + '-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function taskMissing() {
  const err = new Error('ERROR: cannot find the task.');
  err.stderr = 'ERROR: cannot find the task.';
  return err;
}

function taskAccessDenied() {
  const err = new Error('ERROR: Access is denied.');
  err.stderr = 'ERROR: Access is denied.';
  return err;
}

function commandLog(dir) {
  return path.join(dir, 'schtasks-calls.jsonl');
}

function writeStub(dir, name, lines) {
  const stub = path.join(dir, name);
  const shebang = process.platform === 'win32' ? [] : ['#!/usr/bin/env node'];
  fs.writeFileSync(stub, shebang.concat(["'use strict';"], lines).join('\n') + '\n', 'utf8');
  if (process.platform !== 'win32') fs.chmodSync(stub, 0o755);
  return stub;
}

function runCli(args, env) {
  return spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', env: env });
}

function winCliEnv(dir, extra) {
  return Object.assign({}, process.env, {
    YOTTA_LAN_PLATFORM: 'win32',
    YOTTA_LAN_TASK_USER: USER_A,
    YOTTA_LAN_TASK_SID: SID_A,
    YOTTA_LAN_TASK_XML_DIR: dir,
    YOTTA_LAN_STARTUP_DIR: path.join(dir, 'startup'),
    YOTTA_LAN_AUTOSTART_DIR: path.join(dir, 'autostart'),
    YOTTA_MEMORY_HOME: dir,
    YOTTA_MEMORY_CONFIG_DIR: dir,
    YOTTA_MEMORY_RUNTIME_HOME: path.join(dir, 'runtime'),
    YOTTA_LAN_PROFILE_FILE: path.join(dir, 'serve-profile.json'),
  }, extra || {});
}

function coreOpts(dir, extra) {
  return Object.assign({
    taskSid: SID_A,
    userId: USER_A,
    nodePath: 'C:\\node\\node.exe',
    scriptPath: 'C:\\tools\\yotta-memory.js',
    logPath: path.join(dir, 'serve-8787.log'),
    profilePath: path.join(dir, 'serve-profile.json'),
    memoryHome: dir,
    runtimeHome: path.join(dir, 'runtime'),
    configDir: dir,
    xmlDir: dir,
    startupDir: path.join(dir, 'startup'),
    autostartDir: path.join(dir, 'autostart'),
  }, extra || {});
}

function readCalls(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

test('SID task names are stable literals independent of username casing', () => {
  assert.strictEqual(memory.lanWindowsTaskName({ sid: SID_A }), TASK_A);
  assert.strictEqual(memory.lanWindowsTaskName({ sid: SID_A.toLowerCase() }), TASK_A);
  assert.strictEqual(memory.lanWindowsTaskName({ sid: SID_A, userId: 'OTHERPC\\renamed' }), TASK_A);
  assert.strictEqual(memory.lanWindowsTaskName({ sid: SID_B }), TASK_B);
  assert.strictEqual(memory.lanWindowsTaskName({ sid: SID_C }), TASK_C);
});

test('malformed SID overrides fail closed instead of falling back to whoami', () => {
  let whoamiCalled = false;
  const result = memory.lanWindowsTaskSid({
    taskSid: USER_A,
    whoamiFn: () => {
      whoamiCalled = true;
      return { status: 0, stdout: '"TESTPC\\tester","' + SID_A + '"\r\n' };
    },
  });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /SID|用户标识/i);
  assert.strictEqual(whoamiCalled, false);
  assert.throws(() => memory.lanWindowsTaskName({ sid: '' }), /SID|用户标识/i);
  assert.throws(() => memory.lanWindowsTaskName({ sid: USER_A }), /SID|用户标识/i);
});

test('SID discovery parses whoami CSV and canonicalizes casing', () => {
  const result = memory.lanWindowsTaskSid({
    whoamiFn: () => ({
      status: 0,
      stdout: '"TESTPC\\tester","' + SID_A.toLowerCase() + '"\r\n',
      stderr: '',
    }),
  });
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.sid, SID_A);
});

test('Windows console output decodes GBK schtasks errors before classification', () => {
  const gbkMissing = Buffer.from('cfb5cdb3d5d2b2bbb5bdd6b8b6a8b5c4cec4bcfea1a3', 'hex');
  assert.strictEqual(
    memory.decodeWindowsConsoleOutput(gbkMissing),
    '系统找不到指定的文件。',
  );
  assert.strictEqual(memory.decodeWindowsConsoleOutput(Buffer.from('plain utf8')), 'plain utf8');
});

test('lan disable treats a GBK missing-task message as not enabled', (t) => {
  const dir = tmpDir(t, 'gbk-missing');
  const stub = writeStub(dir, 'schtasks-stub.js', [
    "process.stderr.write(Buffer.from('cfb5cdb3d5d2b2bbb5bdd6b8b6a8b5c4cec4bcfea1a3', 'hex'));",
    'process.exit(1);',
  ]);
  const r = runCli(['lan', 'disable'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /未启用|未发现/);
});

test('task ownership accepts only a proven SID or current username match', () => {
  assert.strictEqual(memory.lanWindowsTaskOwnership({
    xml: '<Task><Principals><Principal><UserId>' + SID_A.toLowerCase() + '</UserId></Principal></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  }).status, 'current');
  assert.strictEqual(memory.lanWindowsTaskOwnership({
    xml: '<Task><Principals><Principal><UserId>testpc\\TESTER</UserId></Principal></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  }).status, 'current');
  assert.strictEqual(memory.lanWindowsTaskOwnership({
    xml: '<Task><Principals><Principal><UserId>' + SID_B + '</UserId></Principal></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  }).status, 'foreign');
  assert.strictEqual(memory.lanWindowsTaskOwnership({
    xml: '<Task><Principals><Principal><UserId>TESTPC\\other</UserId></Principal></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  }).status, 'foreign');
  assert.strictEqual(memory.lanWindowsTaskOwnership({
    xml: '<Task><Principals><Principal></Principal></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  }).status, 'unknown');
});

test('task ownership ignores UserId elements outside the Principals block', () => {
  const result = memory.lanWindowsTaskOwnership({
    xml: '<Task><RegistrationInfo><UserId>' + SID_A + '</UserId></RegistrationInfo><Principals></Principals></Task>',
    taskSid: SID_A,
    userId: USER_A,
  });
  assert.strictEqual(result.status, 'unknown');
});

test('Windows enable creates the SID task and persists userSid after a free-target check', (t) => {
  const dir = tmpDir(t, 'enable');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query') throw taskMissing();
      return '';
    },
  }));
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.taskName, TASK_A);
  assert.strictEqual(result.userSid, SID_A);
  const create = calls.find((call) => call.args[0] === '/create');
  assert.ok(create, 'enable must create a scheduled task');
  assert.deepStrictEqual(create.args.slice(0, 3), ['/create', '/tn', TASK_A]);
  const profile = JSON.parse(fs.readFileSync(result.profilePath, 'utf8'));
  assert.strictEqual(profile.userSid, SID_A);
  assert.strictEqual(profile.userId, USER_A);
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete' && call.args[2] === LEGACY_TASK), false);
});

test('Windows enable refuses a SID task owned by another user before writing a profile', (t) => {
  const dir = tmpDir(t, 'conflict');
  const calls = [];
  const profilePath = path.join(dir, 'serve-profile.json');
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    profilePath: profilePath,
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) {
        return '<Task><Principals><Principal><UserId>' + SID_B + '</UserId></Principal></Principals></Task>';
      }
      return '';
    },
  }));
  assert.strictEqual(result.error, true);
  assert.strictEqual(fs.existsSync(profilePath), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/create'), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete'), false);
});

test('Windows enable fails closed when the target task XML cannot prove ownership', (t) => {
  const dir = tmpDir(t, 'target-unknown');
  const profilePath = path.join(dir, 'serve-profile.json');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    profilePath: profilePath,
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) return '<Task><Principals></Principals></Task>';
      return '';
    },
  }));
  assert.strictEqual(result.error, true);
  assert.strictEqual(fs.existsSync(profilePath), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/create'), false);
});

test('legacy task migration happens only after the SID task is created', (t) => {
  const dir = tmpDir(t, 'migrate');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) throw taskMissing();
      if (args[0] === '/query' && args[2] === LEGACY_TASK) {
        return '<Task><Principals><Principal><UserId>' + USER_A.toLowerCase() + '</UserId></Principal></Principals></Task>';
      }
      return '';
    },
  }));
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.legacyMigration, 'migrated');
  const createIndex = calls.findIndex((call) => call.args[0] === '/create' && call.args[2] === TASK_A);
  const deleteIndex = calls.findIndex((call) => call.args[0] === '/delete' && call.args[2] === LEGACY_TASK);
  assert.ok(createIndex >= 0);
  assert.ok(deleteIndex > createIndex);
});

test('foreign legacy task is retained during enable', (t) => {
  const dir = tmpDir(t, 'foreign-enable');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) throw taskMissing();
      if (args[0] === '/query' && args[2] === LEGACY_TASK) {
        return '<Task><Principals><Principal><UserId>TESTPC\\other</UserId></Principal></Principals></Task>';
      }
      return '';
    },
  }));
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.legacyMigration, 'retained-foreign');
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete' && call.args[2] === LEGACY_TASK), false);
});

test('unknown legacy ownership is retained during enable', (t) => {
  const dir = tmpDir(t, 'unknown-legacy');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) throw taskMissing();
      if (args[0] === '/query' && args[2] === LEGACY_TASK) throw taskAccessDenied();
      return '';
    },
  }));
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.legacyMigration, 'retained-unknown');
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete' && call.args[2] === LEGACY_TASK), false);
});

test('failed SID task creation never deletes the legacy task', (t) => {
  const dir = tmpDir(t, 'create-fails');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) throw taskMissing();
      if (args[0] === '/create') {
        const err = new Error('ERROR: The task XML is malformed.');
        err.stderr = 'ERROR: The task XML is malformed.';
        throw err;
      }
      return '';
    },
  }));
  assert.strictEqual(result.mode, 'startup');
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete' && call.args[2] === LEGACY_TASK), false);
});

test('access-denied scheduler lookup falls back to Startup without touching tasks', (t) => {
  const dir = tmpDir(t, 'scheduler-denied');
  const calls = [];
  const result = memory.lanWindowsEnableCore(coreOpts(dir, {
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query') throw taskAccessDenied();
      return '';
    },
  }));
  assert.strictEqual(result.error, false, result.text);
  assert.strictEqual(result.mode, 'startup');
  assert.strictEqual(result.accessDenied, true);
  assert.strictEqual(calls.some((call) => call.args[0] === '/create'), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/delete'), false);
});

test('lan disable removes only the current SID task when the legacy task is foreign', (t) => {
  const dir = tmpDir(t, 'disable');
  const logPath = commandLog(dir);
  const stub = writeStub(dir, 'schtasks-stub.js', [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    'fs.appendFileSync(' + JSON.stringify(logPath) + ', JSON.stringify(args) + "\\n");',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(TASK_A) + ") {",
    "  console.log('<Task><Principals><Principal><UserId>' + " + JSON.stringify(SID_A) + " + '</UserId></Principal></Principals></Task>');",
    '  process.exit(0);',
    '}',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(LEGACY_TASK) + ") {",
    "  console.log('<Task><Principals><Principal><UserId>TESTPC\\\\other</UserId></Principal></Principals></Task>');",
    '  process.exit(0);',
    '}',
    "if (args[0] === '/query') { console.error('ERROR: cannot find the task.'); process.exit(1); }",
  ]);
  const r = runCli(['lan', 'disable'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const calls = readCalls(logPath);
  assert.ok(calls.some((args) => args[0] === '/delete' && args[2] === TASK_A));
  assert.strictEqual(calls.some((args) => args[0] === '/delete' && args[2] === LEGACY_TASK), false);
});

test('lan disable refuses all task deletion when SID resolution fails', (t) => {
  const dir = tmpDir(t, 'disable-no-sid');
  const logPath = commandLog(dir);
  const stub = writeStub(dir, 'schtasks-stub.js', [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    'fs.appendFileSync(' + JSON.stringify(logPath) + ', JSON.stringify(args) + "\\n");',
  ]);
  const r = runCli(['lan', 'disable'], winCliEnv(dir, {
    YOTTA_LAN_TASK_SID: USER_A,
    YOTTA_LAN_SCHTASKS_BIN: stub,
  }));
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /SID|用户标识/i);
  assert.deepStrictEqual(readCalls(logPath), []);
});

test('lan disable preserves a SID task owned by another user', (t) => {
  const dir = tmpDir(t, 'disable-foreign-target');
  const logPath = commandLog(dir);
  const stub = writeStub(dir, 'schtasks-stub.js', [
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    'fs.appendFileSync(' + JSON.stringify(logPath) + ', JSON.stringify(args) + "\\n");',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(TASK_A) + ") {",
    "  console.log('<Task><Principals><Principal><UserId>' + " + JSON.stringify(SID_B) + " + '</UserId></Principal></Principals></Task>');",
    '  process.exit(0);',
    '}',
    "if (args[0] === '/query') { console.error('ERROR: cannot find the task.'); process.exit(1); }",
  ]);
  const r = runCli(['lan', 'disable'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.notStrictEqual(r.status, 0);
  const calls = readCalls(logPath);
  assert.strictEqual(calls.some((args) => args[0] === '/delete' && args[2] === TASK_A), false);
  assert.match(r.stderr, /归属|其他用户/);
});

test('lan status warns when the profile predates userSid', (t) => {
  const dir = tmpDir(t, 'status-profile');
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  memory.lanWriteServeProfile({
    profilePath: path.join(dir, 'serve-profile.json'),
    memoryHome: dir,
    runtimeHome: path.join(dir, 'runtime'),
    configDir: dir,
    userId: USER_A,
  });
  const stub = writeStub(dir, 'schtasks-stub.js', [
    'const args = process.argv.slice(2);',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(LEGACY_TASK) + ") { console.error('ERROR: cannot find the task.'); process.exit(1); }",
    "if (args.includes('/xml')) { console.log('<Task><Principals><Principal><LogonType>S4U</LogonType></Principal></Principals></Task>'); }",
    "else { console.log('状态: 就绪'); console.log('登录模式: S4U'); }",
  ]);
  const r = runCli(['lan', 'status'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, new RegExp('计划任务 ' + TASK_A + ': 已启用'));
  assert.match(r.stdout, /userSid/);
});

test('lan status warns when the profile userSid belongs to another user', (t) => {
  const dir = tmpDir(t, 'status-profile-sid-mismatch');
  fs.mkdirSync(path.join(dir, 'runtime'), { recursive: true });
  memory.lanWriteServeProfile({
    profilePath: path.join(dir, 'serve-profile.json'),
    memoryHome: dir,
    runtimeHome: path.join(dir, 'runtime'),
    configDir: dir,
    userId: USER_A,
    userSid: SID_B,
  });
  const stub = writeStub(dir, 'schtasks-stub.js', [
    'const args = process.argv.slice(2);',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(LEGACY_TASK) + ") { console.error('ERROR: cannot find the task.'); process.exit(1); }",
    "if (args.includes('/xml')) { console.log('<Task><Principals><Principal><UserId>' + " + JSON.stringify(SID_A) + " + '</UserId></Principal></Principals></Task>'); }",
    "else { console.log('状态: 就绪'); console.log('登录模式: S4U'); }",
  ]);
  const r = runCli(['lan', 'status'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /userSid.*不一致|不一致.*userSid/);
});

test('lan status warns when the SID task ownership cannot be proven', (t) => {
  const dir = tmpDir(t, 'status-foreign-target');
  const stub = writeStub(dir, 'schtasks-stub.js', [
    'const args = process.argv.slice(2);',
    "if (args[0] === '/query' && args[2] === " + JSON.stringify(LEGACY_TASK) + ") { console.error('ERROR: cannot find the task.'); process.exit(1); }",
    "if (args.includes('/xml')) { console.log('<Task><Principals><Principal><UserId>' + " + JSON.stringify(SID_B) + " + '</UserId></Principal></Principals></Task>'); }",
    "else { console.log('状态: 就绪'); console.log('登录模式: S4U'); }",
  ]);
  const r = runCli(['lan', 'status'], winCliEnv(dir, { YOTTA_LAN_SCHTASKS_BIN: stub }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /归属|其他用户/);
});

test('runtime restart targets only the current SID task', () => {
  const calls = [];
  const result = memory.runtimeRestartManagedServer({
    platform: 'win32',
    taskSid: SID_A,
    userId: USER_A,
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) {
        return '<Task><Principals><Principal><UserId>' + SID_A + '</UserId></Principal></Principals></Task>';
      }
      if (args[0] === '/query' && args[2] === LEGACY_TASK) throw taskMissing();
      return '';
    },
  });
  assert.strictEqual(result.error, false, result.text);
  assert.ok(calls.some((call) => call.args[0] === '/end' && call.args[2] === TASK_A));
  assert.ok(calls.some((call) => call.args[0] === '/run' && call.args[2] === TASK_A));
  assert.strictEqual(calls.some((call) => call.args[0] === '/end' && call.args[2] === LEGACY_TASK), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/run' && call.args[2] === LEGACY_TASK), false);
});

test('runtime restart never runs a legacy task without a SID task', () => {
  const calls = [];
  const result = memory.runtimeRestartManagedServer({
    platform: 'win32',
    taskSid: SID_A,
    userId: USER_A,
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) throw taskMissing();
      if (args[0] === '/query' && args[2] === LEGACY_TASK) {
        return '<Task><Principals><Principal><UserId>' + USER_A + '</UserId></Principal></Principals></Task>';
      }
      return '';
    },
  });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /lan enable|迁移/i);
  assert.strictEqual(calls.some((call) => call.args[0] === '/end'), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/run'), false);
});

test('runtime restart refuses a SID task owned by another user', () => {
  const calls = [];
  const result = memory.runtimeRestartManagedServer({
    platform: 'win32',
    taskSid: SID_A,
    userId: USER_A,
    execFileFn: (command, args) => {
      calls.push({ command: command, args: args });
      if (args[0] === '/query' && args[2] === TASK_A) {
        return '<Task><Principals><Principal><UserId>' + SID_B + '</UserId></Principal></Principals></Task>';
      }
      return '';
    },
  });
  assert.strictEqual(result.error, true);
  assert.match(result.text, /归属|其他用户/);
  assert.strictEqual(calls.some((call) => call.args[0] === '/end'), false);
  assert.strictEqual(calls.some((call) => call.args[0] === '/run'), false);
});

test('non-Windows status does not invoke the Windows SID task path', (t) => {
  const dir = tmpDir(t, 'linux');
  const systemctl = writeStub(dir, 'systemctl-stub.js', ['process.exit(1);']);
  const crontab = writeStub(dir, 'crontab-stub.js', ['process.exit(1);']);
  const r = runCli(['lan', 'status'], Object.assign({}, process.env, {
    YOTTA_LAN_PLATFORM: 'linux',
    YOTTA_LAN_SYSTEMCTL_BIN: systemctl,
    YOTTA_LAN_CRONTAB_BIN: crontab,
    YOTTA_LAN_SYSTEMD_USER_DIR: path.join(dir, 'systemd'),
    YOTTA_MEMORY_CONFIG_DIR: dir,
    YOTTA_LAN_PROFILE_FILE: path.join(dir, 'serve-profile.json'),
    YOTTA_LAN_TASK_SID: '',
  }));
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  assert.doesNotMatch(r.stdout, /YottaMemoryServe-[0-9a-f]{16}/i);
});
