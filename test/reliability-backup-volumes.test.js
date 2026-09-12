'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const memory = require('../bin/yotta-memory.js');

test('backup volume listing keeps only existing writable volumes on a different volume', () => {
  const result = memory.listBackupVolumesCore({
    root: 'D:\\AI_WorkDir\\.yottamemory',
    platform: 'win32',
    candidates: ['Z:\\', 'C:\\', 'H:\\', 'D:\\'],
    existsFn: (candidate) => candidate !== 'Z:\\',
    statFn: () => ({ isDirectory: () => true }),
    accessFn: (candidate) => {
      if (candidate === 'C:\\') throw new Error('not writable');
    },
    statfsFn: () => ({ bsize: 4096, blocks: 1000, bavail: 500 }),
  });

  assert.strictEqual(result.error, false);
  assert.deepStrictEqual(result.volumes.map((item) => item.root), ['H:\\']);
  assert.strictEqual(result.volumes[0].free, 2048000);
});

test('backup volume listing compares POSIX devices instead of the root path', () => {
  const stats = {
    '/': { dev: 1, isDirectory: () => true },
    '/mnt/backup': { dev: 2, isDirectory: () => true },
    '/data/store': { dev: 1, isDirectory: () => true },
  };
  const result = memory.listBackupVolumesCore({
    root: '/data/store',
    platform: 'linux',
    candidates: ['/', '/mnt/backup'],
    existsFn: () => true,
    statFn: (candidate) => stats[candidate],
    accessFn: () => {},
    statfsFn: () => ({ bsize: 1024, blocks: 100, bavail: 60 }),
  });

  assert.strictEqual(result.error, false);
  assert.deepStrictEqual(result.volumes.map((item) => item.root), ['/mnt/backup']);
});

test('backup volume listing reports no candidate instead of inventing a drive', () => {
  const result = memory.listBackupVolumesCore({
    root: 'D:\\AI_WorkDir\\.yottamemory',
    platform: 'win32',
    candidates: ['Z:\\'],
    existsFn: () => false,
    statFn: () => ({ isDirectory: () => true }),
    accessFn: () => {},
    statfsFn: () => ({ bsize: 4096, blocks: 1000, bavail: 500 }),
  });

  assert.strictEqual(result.error, false);
  assert.deepStrictEqual(result.volumes, []);
  assert.match(result.text, /未发现|没有/);
});
