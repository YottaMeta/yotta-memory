// yotta-memory v0.10.0 consolidate / decay / auto-merge / rollback regression tests
// Run: node test/consolidate.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpRoot = path.join(os.tmpdir(), 'yottamem-v010-' + Date.now());
fs.mkdirSync(tmpRoot, { recursive: true });
process.env.USERPROFILE = tmpRoot;
if (process.platform !== 'win32') process.env.HOME = tmpRoot;
process.env.YOTTA_AGENT_ID = 'codex';
process.env.YOTTA_MEMORY_HOME = path.join(tmpRoot, 'lib-main');
const engine = require(path.join(process.cwd(), 'bin/yotta-memory.js'));

let pass = 0, fail = 0;
function chk(name, cond) { if (cond) { pass++; console.log('PASS:', name); } else { fail++; console.log('FAIL:', name); } }
function useLib(name) { const d = path.join(tmpRoot, name); fs.mkdirSync(d, { recursive: true }); process.env.YOTTA_MEMORY_HOME = d; return d; }
function relDate(days) { const d = new Date(); d.setDate(d.getDate() - days); const p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function ageFile(fp, days) {
  let t = fs.readFileSync(fp, 'utf8');
  const d = relDate(days);
  t = t.replace(/^(created|updated): .*$/gm, function (m) { return m.split(':')[0] + ': ' + d; });
  fs.writeFileSync(fp, t, 'utf8');
}
function ageAll(dir, days) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) ageAll(fp, days);
    else if (/\.md(\.enc)?$/.test(f)) ageFile(fp, days);
  }
}
function writeMem(dir, rel, meta) {
  const fp = path.join(dir, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const order = ['type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags', 'immutable', 'scope', 'owner', 'source', 'weight', 'access_count', 'last_accessed', 'feedback_net'];
  const lines = ['---'];
  for (const k of order) {
    if (meta[k] === undefined || meta[k] === null || meta[k] === '') continue;
    const v = meta[k];
    lines.push(k + ': ' + (Array.isArray(v) ? JSON.stringify(v) : String(v)));
  }
  lines.push('---', '');
  fs.writeFileSync(fp, lines.join('\n') + String(meta.statement || '') + '\n', 'utf8');
}
function rel(root, fp) { return path.relative(root, fp).replace(/\\/g, '/'); }
function activeOf(root, prefix) { return engine.collectEntryFiles(root).filter(function (fp) { return rel(root, fp).indexOf(prefix) === 0; }); }
function mdCountDeep(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) n += mdCountDeep(fp);
    else if (/\.md(\.enc)?$/.test(f)) n++;
  }
  return n;
}
function hasSummary(root) {
  for (const fp of engine.collectEntryFiles(root)) {
    const t = fs.readFileSync(fp, 'utf8');
    if (/^subject: 周期摘要/m.test(t)) return true;
  }
  return false;
}
function findBatch(text) { const m = text.match(/批次: ([0-9a-f-]+)/); return m ? m[1] : null; }

// ============ S1 decay unit ============
chk('decay FACT halflife default 730', engine.decayHalflifeDays('FACT', {}) === 730);
chk('decay PREF halflife default 365', engine.decayHalflifeDays('PREF', {}) === 365);
chk('decay COMMIT (task-like) halflife default 90', engine.decayHalflifeDays('COMMIT', {}) === 90);
chk('decay BOUND exempt (null)', engine.decayHalflifeDays('BOUND', {}) === null);
chk('decayRecency BOUND constant 1', engine.decayRecency('BOUND', 99999, {}) === 1);
chk('decayRecency FACT at 730d ~0.5', Math.abs(engine.decayRecency('FACT', 730, {}) - 0.5) < 1e-9);
engine.saveConfig({ maintain_decay_halflife_FACT: 1000 });
chk('config override halflife FACT=1000 honored', engine.decayHalflifeDays('FACT', engine.loadConfig()) === 1000);
engine.saveConfig({});
const old730 = relDate(730);
const ubMeta = { type: 'FACT', confidence: 1, created: old730, updated: old730, last_accessed: old730, source: '', tags: [], subject: 'x', weight: 1, access_count: 0, feedback_net: 0 };
const ub = engine.utilityBreakdown(ubMeta);
chk('utilityBreakdown recency component uses decay (~0.10 at 730d FACT)', Math.abs(ub.recency - 0.1) < 0.02);

// ============ S2 consolidate public: dry-run / apply / rollback / batches / filters ============
const pub = useLib('pub');
engine.rememberCore('FACT', 'Alpha 项目进展', 'Alpha 一期已交付 Node 后端', {});
engine.rememberCore('FACT', 'Alpha 项目', 'Alpha 二期进入联调测试阶段', {});
engine.rememberCore('FACT', 'Alpha 项目里程碑', 'Alpha 三期规划评审完成', {});
engine.rememberCore('FACT', 'Alpha 项目最近', 'Alpha 最新进展：今天刚更新', {}); // recent -> not candidate
engine.rememberCore('FACT', 'Alpha 项目重要', 'Alpha 重要约束：保持向后兼容', { weight: 5.0 }); // high utility -> not candidate
ageAll(pub, 700);
// 「最近」条目恢复为今天（验证 min-age 过滤：近期记忆不被收走）
const recentFp = activeOf(pub, 'facts/').filter(function (fp) { return /最近/.test(fs.readFileSync(fp, 'utf8')); })[0];
ageFile(recentFp, 0);
const dry = engine.consolidateCore({});
chk('consolidate dry-run lists summary group', /周期摘要组/.test(dry.text));
chk('consolidate dry-run changes nothing', engine.collectEntryFiles(pub).length === 5 && !hasSummary(pub));
const ap = engine.consolidateCore({ apply: true });
const batchPub = findBatch(ap.text);
chk('consolidate apply creates summary (active)', hasSummary(pub));
chk('consolidate apply archives 3 old originals to .archive/facts', mdCountDeep(path.join(pub, '.archive', 'facts')) === 3);
chk('consolidate apply keeps recent + high-utility entries active', activeOf(pub, 'facts/').length === 3 && hasSummary(pub));
chk('consolidate apply reports batch id', !!batchPub);
const bat = engine.consolidateCore({ batches: true });
chk('consolidate --batches lists the batch', bat.text.indexOf(batchPub) !== -1);
const un = engine.consolidateCore({ undo: batchPub });
chk('consolidate undo restores originals and removes summary', engine.collectEntryFiles(pub).length === 5 && mdCountDeep(path.join(pub, '.archive', 'facts')) === 0 && !hasSummary(pub));
const un2 = engine.consolidateCore({ undo: batchPub });
chk('consolidate undo idempotent (2nd refused)', /已回滚过/.test(un2.text));

// ============ S3 consolidate private: owner-scoped path + rollback ============
const priv = useLib('priv');
engine.rememberCore('PREF', '界面偏好', '偏好深色主题与紧凑布局', { owner: 'codex' });
engine.rememberCore('PREF', '界面偏好', '偏好键盘快捷键操作', { owner: 'codex' });
engine.rememberCore('PREF', '界面偏好', '偏好中文本地化界面', { owner: 'codex' });
ageAll(priv, 700);
const apPriv = engine.consolidateCore({ apply: true });
const batchPriv = findBatch(apPriv.text);
chk('consolidate private archives into .archive/private/codex/prefs', mdCountDeep(path.join(priv, '.archive', 'private', 'codex', 'prefs')) === 3);
chk('consolidate private summary lives in private/codex/prefs', activeOf(priv, 'private/codex/prefs/').length === 1 && hasSummary(priv));
const unPriv = engine.consolidateCore({ undo: batchPriv });
chk('consolidate private undo restores prefs', activeOf(priv, 'private/codex/prefs/').length === 3 && mdCountDeep(path.join(priv, '.archive', 'private', 'codex', 'prefs')) === 0 && !hasSummary(priv));

// ============ S4 exemptions: immutable + BOUND + group<min-group ============
const ex = useLib('exempt');
writeMem(ex, 'facts/2020-01-01-0001.md', { type: 'FACT', subject: '红线主题', statement: '不可变红线一', confidence: 1, created: '2020-01-01', updated: '2020-01-01', tags: [], immutable: true, scope: 'public', owner: '', source: '', weight: 1, access_count: 0, feedback_net: 0 });
writeMem(ex, 'facts/2020-01-01-0002.md', { type: 'FACT', subject: '红线主题', statement: '不可变红线二', confidence: 1, created: '2020-01-01', updated: '2020-01-01', tags: [], immutable: true, scope: 'public', owner: '', source: '', weight: 1, access_count: 0, feedback_net: 0 });
writeMem(ex, 'private/codex/bounds/2020-01-01-0001.md', { type: 'BOUND', subject: '边界主题', statement: '边界一', confidence: 1, created: '2020-01-01', updated: '2020-01-01', tags: [], immutable: false, scope: 'private', owner: 'codex', source: '', weight: 0.5, access_count: 0, feedback_net: 0 });
writeMem(ex, 'private/codex/bounds/2020-01-01-0002.md', { type: 'BOUND', subject: '边界主题', statement: '边界二', confidence: 1, created: '2020-01-01', updated: '2020-01-01', tags: [], immutable: false, scope: 'private', owner: 'codex', source: '', weight: 0.5, access_count: 0, feedback_net: 0 });
engine.consolidateCore({ apply: true });
chk('consolidate exempts immutable + BOUND (nothing archived)', engine.collectEntryFiles(ex).length === 4 && !hasSummary(ex) && mdCountDeep(path.join(ex, '.archive')) === 0);

const solo = useLib('solo');
engine.rememberCore('FACT', '独苗主题', '只有一条旧记忆', {});
ageAll(solo, 700);
const soloRes = engine.consolidateCore({ apply: true });
chk('consolidate group < min-group -> no summary (leave to maintain)', /无可归纳组/.test(soloRes.text) && engine.collectEntryFiles(solo).length === 1 && !hasSummary(solo));

// ============ S5 maintain archive owner-scoped path + BOUND archive skip ============
const mnt = useLib('mnt');
engine.rememberCore('FACT', '旧事实', '很久以前的事实记录', { weight: 0.4 });
engine.rememberCore('PREF', '旧偏好', '很久以前的偏好记录', { owner: 'codex', weight: 0.4 });
engine.rememberCore('BOUND', '旧边界', '很久以前的边界记录', { owner: 'codex', weight: 0.4 });
ageAll(mnt, 400);
const maint = engine.maintainCore({ apply: true });
chk('maintain --apply archives public FACT to .archive/facts', mdCountDeep(path.join(mnt, '.archive', 'facts')) === 1);
chk('maintain --apply archives private PREF to .archive/private/codex/prefs', mdCountDeep(path.join(mnt, '.archive', 'private', 'codex', 'prefs')) === 1);
chk('maintain --apply skips BOUND (stays active, no legacy flat dir)', activeOf(mnt, 'private/codex/bounds/').length === 1 && !fs.existsSync(path.join(mnt, '.archive', 'bounds')));

// ============ S6 dedup confidence + auto-merge + cross-owner preview + undo ============
const dup = useLib('dup');
engine.rememberCore('FACT', '重复主题', 'Alpha 使用 Node 与 Python 编写核心服务', {});
engine.rememberCore('FACT', '重复主题', 'Alpha 使用 Node 与 Python 编写核心服务与测试', {});
engine.rememberCore('FACT', '重复主题', 'Alpha 使用 Node 与 Python 编写核心服务与测试文档', {});
engine.rememberCore('PREF', '私有偏好主题', '喜欢简约设计与快速迭代', { owner: 'codex' });
engine.rememberCore('PREF', '私有偏好主题', '喜欢简约设计与快速迭代发布', { owner: 'codex' });
engine.rememberCore('PREF', '他者偏好主题', '他者喜欢简约设计与快速迭代', { owner: 'alice', unsafe: true });
const dedupDry = engine.maintainCore({ dedup: true });
chk('maintain --dedup lists duplicates with confidence', /置信度 \d/.test(dedupDry.text) && !/已合并/.test(dedupDry.text));
const dedupAp = engine.maintainCore({ dedup: true, apply: true });
const batchDup = findBatch(dedupAp.text);
chk('maintain --dedup --apply auto-merges same-owner high-confidence groups', activeOf(dup, 'facts/').length === 1 && mdCountDeep(path.join(dup, '.archive', 'facts')) === 2);
chk('maintain --dedup --apply leaves other-owner private untouched', activeOf(dup, 'private/alice/prefs/').length === 1);
const unDup = engine.consolidateCore({ undo: batchDup });
chk('auto-merge undo restores merged facts', activeOf(dup, 'facts/').length === 3 && mdCountDeep(path.join(dup, '.archive', 'facts')) === 0);

// ============ S7 maintain archive NOT executed in --dedup mode (mutual exclusion) ============
const mix = useLib('mix');
engine.rememberCore('FACT', '老单条', '很老的零散事实（归档候选，但不是重复）', { weight: 0.4 });
engine.rememberCore('FACT', '重复对 X', '重复内容甲版本一', {});
engine.rememberCore('FACT', '重复对 X', '重复内容甲版本二', {});
ageAll(mix, 400);
const mixRes = engine.maintainCore({ dedup: true, apply: true });
// 若归档路径被误执行，单条也会被移走 -> active 只剩 1；互斥应保持单条 active = 2（1 单条 + 1 合并保留）
chk('--dedup --apply does NOT execute archive path (mutual exclusion)', activeOf(mix, 'facts/').length === 2 && mdCountDeep(path.join(mix, '.archive', 'facts')) === 1 && activeOf(mix, 'facts/').some(function (fp) { return /老单条/.test(fs.readFileSync(fp, 'utf8')); }));

console.log('CONSOLIDATE_RESULTS:', JSON.stringify({ pass: pass, fail: fail }));
process.exit(fail ? 1 : 0);
