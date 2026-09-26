'use strict';
// v0.18.0 A3 capacity report + archive exemption regression tests.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const memory = require('../bin/yotta-memory.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function ymd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

function todayStr() {
  return ymd(new Date());
}

function daysAgoStr(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

function withStore(fn) {
  const root = tmpdir('ytm-capacity-store-');
  const configDir = tmpdir('ytm-capacity-config-');
  const agentHome = tmpdir('ytm-capacity-home-');
  const saved = {
    home: process.env.YOTTA_MEMORY_HOME,
    configDir: process.env.YOTTA_MEMORY_CONFIG_DIR,
    agentHome: process.env.YOTTA_MEMORY_AGENT_HOME,
  };
  process.env.YOTTA_MEMORY_HOME = root;
  process.env.YOTTA_MEMORY_CONFIG_DIR = configDir;
  process.env.YOTTA_MEMORY_AGENT_HOME = agentHome;
  try {
    return fn(root, configDir);
  } finally {
    if (saved.home === undefined) delete process.env.YOTTA_MEMORY_HOME; else process.env.YOTTA_MEMORY_HOME = saved.home;
    if (saved.configDir === undefined) delete process.env.YOTTA_MEMORY_CONFIG_DIR; else process.env.YOTTA_MEMORY_CONFIG_DIR = saved.configDir;
    if (saved.agentHome === undefined) delete process.env.YOTTA_MEMORY_AGENT_HOME; else process.env.YOTTA_MEMORY_AGENT_HOME = saved.agentHome;
  }
}

function rel(root, fp) {
  return path.relative(root, fp).replace(/\\/g, '/');
}

function findBySubject(root, subject) {
  const fp = memory.collectEntryFiles(root).filter((f) => fs.readFileSync(f, 'utf8').includes(subject))[0];
  assert.ok(fp, 'entry not found: ' + subject);
  return fp;
}

function patchMeta(fp, patch) {
  let text = fs.readFileSync(fp, 'utf8');
  for (const key of Object.keys(patch)) {
    const re = new RegExp('^' + key + ':.*$', 'm');
    if (re.test(text)) text = text.replace(re, key + ': ' + patch[key]);
    else text = text.replace('\n---\n', '\n' + key + ': ' + patch[key] + '\n---\n');
  }
  fs.writeFileSync(fp, text, 'utf8');
}

function snapshotStore(root) {
  const out = {};
  for (const fp of memory.collectEntryFiles(root)) out[rel(root, fp)] = fs.readFileSync(fp, 'utf8');
  return out;
}

function snapshotOpts() {
  return { snapshotDir: tmpdir('ytm-capacity-snap-'), allowSameVolumeForTest: true };
}

test('capacity report ranks LRU/LFU candidates and excludes cooldown / evergreen entries', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '独有种子ZZQ', '三个月前建立并被今天读过一次', { _today: daysAgoStr(300) });
    memory.rememberCore('FACT', '容量乙', '两百天前建立且从未被读过', { _today: daysAgoStr(200) });
    memory.rememberCore('FACT', '容量丙', '一百五十天前建立且命中三次', { _today: daysAgoStr(150) });
    memory.rememberCore('FACT', '容量冷启动', '五天前的新条目处于冷却期', { _today: daysAgoStr(5) });
    memory.rememberCore('BOUND', '容量边界', 'BOUND 常青豁免不参与淘汰', { owner: 'codex', selfAgent: 'codex', _today: daysAgoStr(200) });
    memory.rememberCore('FACT', '容量钉住', '带 pinned 标签的常青条目', { _today: daysAgoStr(200) });

    const a = findBySubject(root, '独有种子ZZQ');
    const c = findBySubject(root, '容量丙');
    const pinned = findBySubject(root, '容量钉住');
    memory.recallCore('ZZQ', { agent: 'codex' });
    patchMeta(c, {
      hit_days: 's' + daysAgoStr(40) + ':1|s' + daysAgoStr(30) + ':1|s' + daysAgoStr(20) + ':1',
      hit_queries: 'qaaaaaaaa:1|qbbbbbbbb:1|qcccccccc:1',
      last_accessed: daysAgoStr(100),
    });
    patchMeta(pinned, { tags: '["pinned"]' });

    const before = snapshotStore(root);
    const r = memory.capacityCore({ selfAgent: 'codex' });
    assert.strictEqual(r.error, false, r.text);
    const report = r.report;
    assert.strictEqual(report.water.entries, 6, 'water level must count all entries');

    const lruFiles = report.candidates.lru.map((x) => x.file);
    assert.ok(lruFiles.length >= 2, 'lru candidates expected: ' + JSON.stringify(lruFiles));
    assert.strictEqual(lruFiles[0], rel(root, findBySubject(root, '容量乙')), 'LRU first must be the oldest untouched entry');
    assert.ok(lruFiles.indexOf(rel(root, findBySubject(root, '容量冷启动'))) === -1, 'cooldown entry must be excluded');
    assert.ok(lruFiles.indexOf(rel(root, findBySubject(root, '容量边界'))) === -1, 'BOUND must be excluded');
    assert.ok(lruFiles.indexOf(rel(root, pinned)) === -1, 'pinned tag must be excluded');

    const lfuFiles = report.candidates.lfu.map((x) => x.file);
    assert.strictEqual(lfuFiles[0], rel(root, findBySubject(root, '容量乙')), 'LFU first must be the least frequently used entry');
    assert.ok(lfuFiles.indexOf(rel(root, a)) !== -1, 'accessed entry still participates when old enough');
    const after = snapshotStore(root);
    assert.deepStrictEqual(after, before, 'capacity report must be read-only');
  });
});

test('capacity report only suggests promotion when hits and distinct queries both clear the threshold', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '晋升甲', '三次命中来自三个不同查询', { _today: daysAgoStr(60) });
    memory.rememberCore('FACT', '晋升乙', '三次命中但只有一个查询', { _today: daysAgoStr(60) });
    memory.rememberCore('FACT', '晋升丙', '三个查询但权重已经很高', { _today: daysAgoStr(60), weight: 1.6 });
    const days = 's' + daysAgoStr(40) + ':1|s' + daysAgoStr(30) + ':1|s' + daysAgoStr(20) + ':1';
    patchMeta(findBySubject(root, '晋升甲'), { hit_days: days, hit_queries: 'qaaaaaaaa:1|qbbbbbbbb:1|qcccccccc:1' });
    patchMeta(findBySubject(root, '晋升乙'), { hit_days: days, hit_queries: 'qaaaaaaaa:3' });
    patchMeta(findBySubject(root, '晋升丙'), { hit_days: days, hit_queries: 'qaaaaaaaa:1|qbbbbbbbb:1|qcccccccc:1' });

    const r = memory.capacityCore({ selfAgent: 'codex' });
    const promoted = r.report.promotions.map((x) => x.file);
    assert.deepStrictEqual(promoted, [rel(root, findBySubject(root, '晋升甲'))], 'only the fully qualified entry may be suggested');
    assert.ok(r.report.promotions[0].suggested_command.indexOf('feedback') !== -1, 'promotion must carry an actionable command');
  });
});

test('archive respects cooldown and evergreen exemptions unless --force is explicit', () => {
  withStore((root) => {
    memory.rememberCore('FACT', '归档冷启动', '新条目在冷却期', { _today: daysAgoStr(10) });
    memory.rememberCore('FACT', '归档常青', '带 evergreen 标签', { _today: daysAgoStr(200) });
    memory.rememberCore('FACT', '归档普通', '正常应被归档的旧条目', { _today: daysAgoStr(200) });
    patchMeta(findBySubject(root, '归档常青'), { tags: '["evergreen"]' });
    const coldRel = rel(root, findBySubject(root, '归档冷启动'));
    const everRel = rel(root, findBySubject(root, '归档常青'));
    const normalRel = rel(root, findBySubject(root, '归档普通'));

    const opts = Object.assign({ days: 7, threshold: 999, selfAgent: 'codex' }, snapshotOpts());
    const first = memory.archiveCore(opts);
    assert.strictEqual(first.error, false, first.text);
    assert.ok(first.text.indexOf('冷却期') !== -1 && first.text.indexOf('常青') !== -1, 'archive must report skipped exemptions: ' + first.text);
    const activeAfterFirst = memory.collectEntryFiles(root).map((fp) => rel(root, fp));
    assert.ok(activeAfterFirst.indexOf(coldRel) !== -1, 'cooldown entry must survive');
    assert.ok(activeAfterFirst.indexOf(everRel) !== -1, 'evergreen entry must survive');
    assert.ok(activeAfterFirst.indexOf(normalRel) === -1, 'normal old entry must be archived');

    const forced = memory.archiveCore(Object.assign({}, opts, { force: true }));
    assert.strictEqual(forced.error, false, forced.text);
    const activeAfterForce = memory.collectEntryFiles(root).map((fp) => rel(root, fp));
    assert.ok(activeAfterForce.indexOf(coldRel) === -1, '--force must archive cooldown entries');
    assert.ok(activeAfterForce.indexOf(everRel) === -1, '--force must archive evergreen-tagged entries');
  });
});
