'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const memory = require('../bin/yotta-memory.js');

test('Windows backup task XML uses a daily trigger and catches missed runs', () => {
  const xml = memory.backupWindowsTaskXml({
    time: '03:30',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    scriptPath: 'C:\\tools\\yotta-memory.js',
    userId: 'DESKTOP\\tester',
  });
  assert.match(xml, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(xml, /<ScheduleByDay>/);
  assert.match(xml, /<DaysInterval>1<\/DaysInterval>/);
  assert.match(xml, /<StartBoundary>.*T03:30:00<\/StartBoundary>/);
  assert.match(xml, /<Arguments>.*yotta-memory\.js.*backup ensure-daily.*<\/Arguments>/);
  assert.match(xml, /<UserId>DESKTOP\\tester<\/UserId>/);
});

test('Linux backup timer persists missed runs and invokes ensure-daily', () => {
  const service = memory.backupSystemdServiceContent({
    nodePath: '/usr/bin/node',
    scriptPath: '/opt/yotta-memory.js',
  });
  const timer = memory.backupSystemdTimerContent({ time: '03:30' });
  assert.match(service, /ExecStart=.*yotta-memory\.js.*backup ensure-daily/);
  assert.match(timer, /OnCalendar=\*-\*-\* 03:30:00/);
  assert.match(timer, /Persistent=true/);
});

test('cron fallback line is owned by a dedicated marker', () => {
  const line = memory.backupCronLine({
    time: '03:30',
    nodePath: '/usr/bin/node',
    scriptPath: '/opt/yotta-memory.js',
    logPath: '/tmp/yotta-memory-backup.log',
  });
  assert.match(line, /^30 3 \* \* \*/);
  assert.match(line, /backup ensure-daily/);
  assert.match(line, /#YTM_BACKUP:yotta-memory-backup/);
});

test('macOS LaunchAgent plist schedules the daily backup command', () => {
  const plist = memory.backupLaunchdPlist({
    time: '03:30',
    nodePath: '/usr/local/bin/node',
    scriptPath: '/opt/yotta-memory.js',
    logPath: '/tmp/yotta-memory-backup.log',
  });
  assert.match(plist, /cn\.yottameta\.yotta-memory\.backup/);
  assert.match(plist, /<key>StartCalendarInterval<\/key>/);
  assert.match(plist, /<integer>3<\/integer>/);
  assert.match(plist, /<integer>30<\/integer>/);
  assert.match(plist, /backup/);
  assert.match(plist, /ensure-daily/);
});

test('serve fallback launches the current runtime with the ensure-daily command', () => {
  const command = memory.backupFallbackCommand();
  assert.strictEqual(command.command, process.execPath);
  assert.deepStrictEqual(command.args.slice(-2), ['backup', 'ensure-daily']);
  assert.match(command.args[0], /yotta-memory\.js$/);
  assert.strictEqual(command.args[1], 'backup');
});

test('Windows scheduler core can use a temporary task name for local integration', () => {
  const calls = [];
  const result = memory.backupScheduleEnableCore({
    platform: 'win32',
    taskName: 'YottaMemoryBackupSelfTest',
    time: '03:30',
    xmlPath: path.join(os.tmpdir(), 'yotta-memory-backup-selftest.xml'),
    execFileFn: (command, args) => {
      calls.push({ command, args });
      return '';
    },
  });
  assert.strictEqual(result.error, false);
  assert.strictEqual(calls[0].command, 'schtasks');
  assert.ok(calls[0].args.includes('YottaMemoryBackupSelfTest'));
});
