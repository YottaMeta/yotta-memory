#!/usr/bin/env node
// yotta-memory（元忆）: 有权限边界的文件式智能体记忆 CLI（零依赖）
// v0.2 增强：① index.json 索引+TF 打分 ② 质量分+盖棺分（access_count/last_accessed）③ 读取分区（scope/owner）
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '0.2.7';
const TYPES = ['FACT', 'PREF', 'BOUND', 'COMMIT'];
const TYPE_DIRS = { FACT: 'facts', PREF: 'prefs', BOUND: 'bounds', COMMIT: 'commits' };
const ARCHIVE_DIR = '.archive';
const INDEX_FILE = 'index.json';
const PRIVATE_TYPES = ['PREF', 'BOUND', 'COMMIT'];
const FIELD_ORDER = ['type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags', 'immutable', 'scope', 'owner', 'access_count', 'last_accessed'];

function userRoot() {
  return process.env.YOTTA_MEMORY_HOME || path.join(os.homedir(), '.yottamemory');
}
function projectRoot() {
  return path.join(process.cwd(), '.yottamemory');
}
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function currentAgent() {
  return process.env.YOTTA_AGENT_ID || process.env.AGENT_ID || '';
}
function typeDir(type) {
  const t = String(type).toUpperCase();
  if (!TYPE_DIRS[t]) {
    console.error('未知记忆类型: ' + type + '（可用: ' + TYPES.join(' / ') + '）');
    process.exit(2);
  }
  return TYPE_DIRS[t];
}
function defaultScope(type) {
  return PRIVATE_TYPES.indexOf(String(type).toUpperCase()) === -1 ? 'public' : 'private';
}
function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    let k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[k] = v;
  }
  return { meta: meta, body: text.slice(m[0][0].length + m[0].length) };
}
function escapeYaml(v) {
  return String(v).replace(/\n/g, ' ').replace(/"/g, '\\"');
}
function parseTags(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    let s = v.trim();
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
    return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  return [];
}
function tokenize(s) {
  s = String(s || '').toLowerCase();
  const toks = [];
  const latin = s.match(/[a-z0-9_]+/g);
  if (latin) for (const t of latin) toks.push(t);
  const han = s.match(/[\u4e00-\u9fa5]+/g);
  if (han) {
    for (const seg of han) {
      if (seg.length === 1) toks.push(seg);
      else for (let i = 0; i < seg.length - 1; i++) toks.push(seg.slice(i, i + 2));
    }
  }
  return toks;
}
function buildTokens(subject, statement, tags) {
  const toks = tokenize(subject + ' ' + statement + ' ' + tags.join(' '));
  const m = {};
  for (const t of toks) m[t] = (m[t] || 0) + 1;
  return m;
}
function frontmatterToText(meta, body) {
  const lines = ['---'];
  const ordered = FIELD_ORDER.filter(function (k) { return meta[k] !== undefined && meta[k] !== null && meta[k] !== ''; });
  const extra = Object.keys(meta).filter(function (k) { return FIELD_ORDER.indexOf(k) === -1 && meta[k] !== undefined && meta[k] !== null && meta[k] !== ''; });
  for (const k of ordered.concat(extra)) {
    const v = meta[k];
    if (Array.isArray(v)) lines.push(k + ': ' + JSON.stringify(v));
    else if (typeof v === 'number') lines.push(k + ': ' + v);
    else lines.push(k + ': ' + escapeYaml(v));
  }
  lines.push('---', '');
  const b = body === undefined || body === null ? '' : body;
  return lines.join('\n') + String(b).replace(/^\n+/, '') + '\n';
}
function ensureInit(root) {
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'prefs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bounds'), { recursive: true });
  fs.mkdirSync(path.join(root, 'commits'), { recursive: true });
  fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
  const readme = path.join(root, 'README.md');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# yotta-memory（元忆）记忆库\n\n有权限边界的文件式智能体记忆存储目录。结构：facts/ prefs/ bounds/ commits/ .archive/。\n', 'utf8');
  }
}
function nextSeq(dir) {
  let max = 0;
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^\d{4}-\d{2}-\d{2}-(\d{4})\.md$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return String(max + 1).padStart(4, '0');
}

// ---- 索引（index.json）----
function indexPath(root) { return path.join(root, INDEX_FILE); }
function loadIndex(root) {
  const p = indexPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (d && Array.isArray(d.entries)) return d.entries;
  } catch (e) { /* ignore */ }
  return null;
}
function getIndex(root) { return loadIndex(root) || []; }
function saveIndex(root, entries) {
  const clean = entries.map(function (e) { const c = Object.assign({}, e); delete c.meta; return c; });
  fs.writeFileSync(indexPath(root), JSON.stringify({ version: 2, updated: today(), entries: clean }, null, 2), 'utf8');
}
function buildIndex(root) {
  const entries = [];
  for (const t of Object.keys(TYPE_DIRS)) {
    const dir = path.join(root, TYPE_DIRS[t]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      entries.push(readEntry(fp, root));
    }
  }
  saveIndex(root, entries);
  return entries;
}
function ensureIndex(root) {
  const idx = loadIndex(root);
  if (idx) return idx;
  return buildIndex(root);
}
function upsertIndexEntry(root, entry) {
  const idx = getIndex(root);
  const i = idx.findIndex(function (e) { return e.file === entry.file; });
  if (i >= 0) idx[i] = entry; else idx.push(entry);
  saveIndex(root, idx);
}
function removeIndexEntry(root, file) {
  const idx = getIndex(root);
  const i = idx.findIndex(function (e) { return e.file === file; });
  if (i >= 0) { idx.splice(i, 1); saveIndex(root, idx); }
}
function removeIndexEntries(root, files) {
  const set = new Set(files);
  const idx = getIndex(root);
  const next = idx.filter(function (e) { return !set.has(e.file); });
  if (next.length !== idx.length) saveIndex(root, next);
}

// ---- 读取 / 写入记忆文件 ----
function readEntry(fp, root) {
  const parsed = parseFrontmatter(fs.readFileSync(fp, 'utf8'));
  const meta = parsed.meta;
  const type = (meta.type || 'FACT').toUpperCase();
  const subject = meta.subject || '';
  const statement = meta.statement || '';
  const tags = parseTags(meta.tags);
  return {
    file: path.relative(root, fp).replace(/\\/g, '/'),
    type: type,
    scope: meta.scope || defaultScope(type),
    owner: meta.owner || '',
    subject: subject,
    statement: statement,
    tags: tags,
    confidence: parseFloat(meta.confidence || 1.0),
    created: meta.created || '',
    updated: meta.updated || '',
    access_count: parseInt(meta.access_count || '0', 10) || 0,
    last_accessed: meta.last_accessed || '',
    immutable: meta.immutable === 'true',
    tokens: buildTokens(subject, statement, tags),
    meta: meta,
  };
}
function rewriteFrontmatter(fp, patch) {
  const txt = fs.readFileSync(fp, 'utf8');
  const parsed = parseFrontmatter(txt);
  const meta = Object.assign({}, parsed.meta);
  for (const k of Object.keys(patch)) meta[k] = patch[k];
  fs.writeFileSync(fp, frontmatterToText(meta, parsed.body), 'utf8');
}
function bumpReadMeta(root, relFiles) {
  const now = today();
  for (const rel of relFiles) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseFrontmatter(fs.readFileSync(fp, 'utf8'));
    const meta = parsed.meta;
    if (meta.immutable === 'true') continue;
    const acc = (parseInt(meta.access_count || '0', 10) || 0) + 1;
    rewriteFrontmatter(fp, { access_count: acc, last_accessed: now });
  }
}
function touchIndex(root, relFiles) {
  const set = new Set(relFiles);
  const idx = getIndex(root);
  let dirty = false;
  const now = today();
  for (const e of idx) {
    if (set.has(e.file)) { e.access_count = (parseInt(e.access_count, 10) || 0) + 1; e.last_accessed = now; dirty = true; }
  }
  if (dirty) saveIndex(root, idx);
}
function daysBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 99999;
  return Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000));
}
function vitality(meta) {
  const conf = parseFloat(meta.confidence || 1.0);
  const acc = parseInt(meta.access_count || '0', 10) || 0;
  const last = meta.last_accessed || '';
  const accScore = Math.min(acc, 10) / 10;
  let recency = 0;
  if (last) { const d = daysBetween(last, today()); recency = Math.max(0, 1 - Math.floor(d / 30) * 0.2); }
  return 0.4 * conf + 0.3 * accScore + 0.3 * recency;
}
function loadGrants(root) {
  const fp = path.join(root, 'grants.json');
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8')) || {};
  } catch (e) {
    return {};
  }
}
function hasGrant(userAgent, ownerAgent) {
  if (!userAgent || !ownerAgent) return false;
  for (const root of [projectRoot(), userRoot()]) {
    if (!fs.existsSync(root)) continue;
    const grants = loadGrants(root);
    const list = grants[userAgent];
    if (Array.isArray(list) && list.indexOf(ownerAgent) !== -1) return true;
  }
  return false;
}
// 三态读取判定：'read' | 'denied'
function classifyRead(entry, agent, ownerFilter, unsafe) {
  if (entry.scope === 'public') return 'read';
  const owner = entry.owner || '';
  // 无归属的 private：所有 agent 视为自身私密（默认行为保留）
  if (!owner) return 'read';
  // 归属等于当前 agent 或（显式 --owner 等于当前 agent）：自身授权
  if (agent && owner === agent) return 'read';
  if (ownerFilter && owner === ownerFilter && agent && ownerFilter === agent) return 'read';
  // 越界读：需要 --unsafe / identity=user / grant 授权，否则拒绝
  if (unsafe || String(ownerFilter).toLowerCase() === 'user' || String(agent && '' + agent).toLowerCase() === 'user') return 'read';
  if (hasGrant(agent, owner)) return 'read';
  return 'denied';
}

// ---- 命令 ----
function cmdInit(opts) {
  const root = opts.project ? projectRoot() : userRoot();
  ensureInit(root);
  console.log('已初始化记忆库: ' + root);
}

function cmdRemember(type, subject, statement, opts) {
  const root = userRoot();
  ensureInit(root);
  const t = String(type).toUpperCase();
  const dir = path.join(root, typeDir(t));
  const stmt = String(statement || '').trim();
  const subj = String(subject || '').trim();
  if (!stmt) { console.error('statement 不能为空'); process.exit(2); }
  if (!subj) { console.error('subject 不能为空'); process.exit(2); }
  const owner = opts.owner || currentAgent();
  const scope = opts.scope || defaultScope(t);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const parsed = parseFrontmatter(fs.readFileSync(fp, 'utf8'));
      const meta = parsed.meta;
      if ((meta.type || '').toUpperCase() === t && meta.subject === subj && meta.statement === stmt) {
        const patch = { updated: today() };
        if (owner && !meta.owner) patch.owner = owner;
        if (scope && !meta.scope) patch.scope = scope;
        rewriteFrontmatter(fp, patch);
        upsertIndexEntry(root, readEntry(fp, root));
        console.log('已更新: ' + fp);
        return;
      }
    }
  }
  const seq = nextSeq(dir);
  const file = path.join(dir, today() + '-' + seq + '.md');
  const rec = {
    type: t, subject: subj, statement: stmt,
    confidence: 1.0, created: today(), updated: today(),
    tags: [], immutable: false,
    scope: scope, owner: owner, access_count: 0, last_accessed: '',
  };
  fs.writeFileSync(file, frontmatterToText(rec, stmt), 'utf8');
  upsertIndexEntry(root, readEntry(file, root));
  console.log('已记录: ' + file);
}

function cmdRecall(query, opts) {
  const roots = [projectRoot(), userRoot()].filter(function (r) { return fs.existsSync(r); });
  if (!roots.length) {
    console.log('记忆库不存在，请先运行: yotta-memory init');
    return;
  }
  const limit = opts.limit || 50;
  const onlyType = opts.type ? String(opts.type).toUpperCase() : null;
  const q = query ? String(query).toLowerCase() : '';
  const agent = opts.agent || currentAgent();
  const ownerFilter = opts.owner || '';
  const allSafe = !!opts.unsafe;
  // 是否显式发起跨智能体读取（--all 或 --owner <其它agent>）：只有此时越界读才报错/警告，默认 recall 保持原有静默跳过
  const explicitCross = !!opts.all || (!!ownerFilter && ownerFilter.toLowerCase() !== 'user' && ownerFilter !== agent);
  const hits = [];
  let deniedCount = 0;
  for (const root of roots) {
    const entries = ensureIndex(root);
    for (const e of entries) {
      if (onlyType && e.type !== onlyType) continue;
      const r = classifyRead(e, agent, ownerFilter, allSafe);
      if (r === 'denied') { deniedCount++; continue; }
      let score = 0;
      if (q) {
        const qtoks = tokenize(q);
        for (const tt of qtoks) { if (e.tokens && e.tokens[tt]) score += e.tokens[tt]; }
        if (score === 0) {
          const hay = ((e.subject || '') + ' ' + (e.statement || '') + ' ' + e.tags.join(' ')).toLowerCase();
          if (hay.indexOf(q) !== -1) score = 1;
        }
        if (score === 0) continue;
      } else {
        score = 1;
      }
      hits.push({ entry: e, score: score, root: root });
    }
  }
  hits.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    const pa = a.root === projectRoot() ? 0 : 1;
    const pb = b.root === projectRoot() ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(b.entry.created).localeCompare(String(a.entry.created));
  });
  const shown = hits.slice(0, limit);
  if (!shown.length) {
    if (deniedCount > 0 && explicitCross) {
      console.log('检测到 ' + deniedCount + ' 条越界访问已被拒绝。');
      console.log('如需读取其它智能体私密记忆，请加 --unsafe（用户显式授权）或 --owner user。');
      process.exit(3);
    }
    console.log('无匹配记忆。');
    return;
  }
  const touchRel = shown.filter(function (h) { return !h.entry.immutable; }).map(function (h) { return h.entry.file; });
  if (touchRel.length) {
    for (const root of roots) {
      bumpReadMeta(root, touchRel);
      touchIndex(root, touchRel);
    }
  }
  console.log('共 ' + shown.length + ' 条记忆（' + (hits.length > limit ? '前 ' + limit + ' 条' : '全部') + '）：');
  for (const h of shown) {
    console.log('[' + h.entry.type + '] ' + h.entry.subject + ': ' + h.entry.statement);
    console.log('  ' + path.join(h.root, h.entry.file));
  }
  if (deniedCount > 0 && explicitCross) {
    console.log('\n[警告] 本次检索共拒绝 ' + deniedCount + ' 条越界访问（其它智能体私密记忆，未授权不展示）。如需读取请加 --unsafe 或 --owner user。');
  }
}

function cmdForget(fileRef) {
  const roots = [projectRoot(), userRoot()].filter(function (r) { return fs.existsSync(r); });
  const ref = String(fileRef || '').replace(/\\/g, '/');
  const slash = ref.indexOf('/');
  const dynTypeDir = slash === -1 ? '' : ref.slice(0, slash);
  const dynBase = slash === -1 ? ref : ref.slice(slash + 1);
  let target = null, targetRoot = null, targetRel = null;
  for (const root of roots) {
    if (dynTypeDir) {
      const dir = path.join(root, dynTypeDir);
      if (!fs.existsSync(dir)) continue;
      const cand = path.join(dir, dynBase);
      if (fs.existsSync(cand)) {
        target = cand; targetRoot = root;
        targetRel = dynTypeDir + '/' + path.basename(dynBase);
        break;
      }
      continue;
    }
    for (const t of Object.keys(TYPE_DIRS)) {
      const dir = path.join(root, TYPE_DIRS[t]);
      if (!fs.existsSync(dir)) continue;
      const cand = path.join(dir, dynBase);
      if (fs.existsSync(cand)) {
        target = cand; targetRoot = root;
        targetRel = TYPE_DIRS[t] + '/' + path.basename(dynBase);
        break;
      }
    }
    if (target) break;
  }
  if (!target) { console.error('未找到记忆文件: ' + fileRef); process.exit(2); }
  fs.unlinkSync(target);
  if (targetRoot) removeIndexEntry(targetRoot, targetRel);
  console.log('已删除: ' + target);
}

function cmdArchive(opts) {
  const days = opts.days || 180;
  const threshold = (opts.threshold !== undefined && opts.threshold !== null) ? opts.threshold : 0.4;
  const root = userRoot();
  if (!fs.existsSync(root)) { console.log('记忆库不存在。'); return; }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let moved = 0;
  const movedFiles = [];
  for (const t of Object.keys(TYPE_DIRS)) {
    const dir = path.join(root, TYPE_DIRS[t]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
      if (meta.immutable === 'true') continue;
      if (!meta.created) continue;
      const createdTs = new Date(meta.created).getTime();
      if (isNaN(createdTs)) continue;
      if (vitality(meta) < threshold && createdTs < cutoff) {
        const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[t]);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(fp, path.join(destDir, f));
        movedFiles.push(TYPE_DIRS[t] + '/' + f);
        moved++;
      }
    }
  }
  if (movedFiles.length) removeIndexEntries(root, movedFiles);
  console.log('已归档 ' + moved + ' 条旧记忆到 ' + path.join(root, ARCHIVE_DIR));
}

function cmdReindex() {
  const roots = [projectRoot(), userRoot()].filter(function (r) { return fs.existsSync(r); });
  if (!roots.length) { console.log('记忆库不存在。'); return; }
  for (const root of roots) {
    const n = buildIndex(root).length;
    console.log('已重建索引 ' + root + '（' + n + ' 条）');
  }
}

function collectAll(root) {
  const out = [];
  for (const t of Object.keys(TYPE_DIRS)) {
    const dir = path.join(root, TYPE_DIRS[t]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const e = readEntry(fp, root);
      out.push({ file: e.file, meta: e.meta });
    }
  }
  return out;
}

function cmdExport(outPath) {
  const root = userRoot();
  if (!fs.existsSync(root)) { console.log('记忆库不存在。'); return; }
  const data = { exported: today(), version: VERSION, memories: collectAll(root) };
  const target = outPath || 'yottamemory-export-' + today() + '.json';
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  console.log('已导出 ' + data.memories.length + ' 条记忆 -> ' + target);
}

function cmdImport(src) {
  if (!src || !fs.existsSync(src)) { console.error('请提供 JSON 文件路径'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (!data.memories || !Array.isArray(data.memories)) { console.error('JSON 格式不正确（缺少 memories 数组）'); process.exit(2); }
  const root = userRoot();
  ensureInit(root);
  let n = 0;
  for (const item of data.memories) {
    const meta = item.meta || {};
    const t = (meta.type || 'FACT').toUpperCase();
    if (!TYPE_DIRS[t]) continue;
    const dir = path.join(root, TYPE_DIRS[t]);
    let seq = nextSeq(dir);
    let file = path.join(dir, today() + '-' + seq + '.md');
    while (fs.existsSync(file)) { seq = String(parseInt(seq, 10) + 1).padStart(4, '0'); file = path.join(dir, today() + '-' + seq + '.md'); }
    const rec = {
      type: t,
      subject: meta.subject || '',
      statement: meta.statement || '',
      confidence: parseFloat(meta.confidence || 1.0),
      created: meta.created || today(),
      updated: meta.updated || today(),
      tags: parseTags(meta.tags),
      immutable: meta.immutable === true || meta.immutable === 'true',
      scope: meta.scope || defaultScope(t),
      owner: meta.owner || '',
      access_count: parseInt(meta.access_count || '0', 10) || 0,
      last_accessed: meta.last_accessed || '',
    };
    fs.writeFileSync(file, frontmatterToText(rec, rec.statement), 'utf8');
    upsertIndexEntry(root, readEntry(file, root));
    n++;
  }
  console.log('已导入 ' + n + ' 条记忆 -> ' + root);
}

function usage() {
  console.log([
    'yotta-memory v' + VERSION + ' — 元忆：有权限边界的文件式智能体记忆',
    '',
    '用法:',
    '  yotta-memory init [--project]             初始化记忆库（默认用户级 ~/.yottamemory）',
    '  yotta-memory remember <type> <subject> <statement> [--owner <id>]   写入记忆',
    '  yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]  检索（索引+TF，读取分区；--unsafe 允许越界读其它智能体私密）',
    '  yotta-memory forget <文件或文件名>         删除一条记忆',
    '  yotta-memory archive [--days 180] [--threshold 0.4]  归档（盖棺分+年龄）',
    '  yotta-memory reindex                       重建索引（手动改文件后用）',
    '  yotta-memory export [--out 文件.json]      导出全部记忆',
    '  yotta-memory import <文件.json>            导入记忆',
    '  yotta-memory --version                    版本',
    '',
    '类型: FACT(公共共享) / PREF(偏好) / BOUND(边界) / COMMIT(承诺)',
    '环境变量: YOTTA_MEMORY_HOME 覆盖用户级目录; YOTTA_AGENT_ID/AGENT_ID 作为当前 agent 标识（读取分区）',
    '',
  ].join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) { usage(); return; }
  const first = args[0];
  if (first === '--version' || first === '-v') { console.log(VERSION); return; }
  if (first === '--help' || first === '-h') { usage(); return; }
  const opts = {};
  const positional = [];
  const valueOpts = new Set(['--type', '--limit', '--days', '--out', '--owner', '--agent', '--threshold', '--scope']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--project') opts.project = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--unsafe') opts.unsafe = true;
    else if (valueOpts.has(a)) {
      const v = args[++i];
      if (a === '--type') opts.type = v;
      else if (a === '--limit') opts.limit = parseInt(v, 10) || 50;
      else if (a === '--days') opts.days = parseInt(v, 10) || 180;
      else if (a === '--threshold') opts.threshold = parseFloat(v);
      else if (a === '--out') opts.out = v;
      else if (a === '--owner') opts.owner = v;
      else if (a === '--agent') opts.agent = v;
      else if (a === '--scope') opts.scope = v;
    } else if (a.startsWith('--')) {
      console.error('未知选项: ' + a);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  switch (first) {
    case 'init': cmdInit(opts); break;
    case 'remember': cmdRemember(positional[0], positional[1], positional[2], opts); break;
    case 'recall': cmdRecall(positional[0] || null, opts); break;
    case 'forget': cmdForget(positional[0]); break;
    case 'archive': cmdArchive(opts); break;
    case 'reindex': cmdReindex(); break;
    case 'export': cmdExport(opts.out); break;
    case 'import': cmdImport(positional[0]); break;
    default:
      console.error('未知命令: ' + first);
      usage();
      process.exit(2);
  }
}

main();