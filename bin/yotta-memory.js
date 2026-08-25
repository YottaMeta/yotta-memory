#!/usr/bin/env node
// yotta-memory（元忆）: 有权限边界的文件式智能体记忆 CLI（零依赖）
// v0.4.0 新增：lan（Windows 计划任务开机自启 serve）/ init --dir（显式指定位置）/ serve --stdio（本地零进程模式）/ MCP 工具补 reindex/export/import
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const child_process = require('child_process');

const VERSION = '0.4.1';
const TYPES = ['FACT', 'PREF', 'BOUND', 'COMMIT'];
const TYPE_DIRS = { FACT: 'facts', PREF: 'prefs', BOUND: 'bounds', COMMIT: 'commits' };
const ARCHIVE_DIR = '.archive';
const INDEX_FILE = 'index.json';
const PRIVATE_TYPES = ['PREF', 'BOUND', 'COMMIT'];
const FIELD_ORDER = ['type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags', 'immutable', 'scope', 'owner', 'access_count', 'last_accessed'];
const CONFIG_FILE = 'config.json';
const SERVER_SUBDIR = '.server';
const TOKENS_FILE = 'tokens.json';

// ---- 全局配置（记忆库位置持久化，固定 ~/.yottamemory/config.json）----
function configPath() {
  return path.join(os.homedir(), '.yottamemory', CONFIG_FILE);
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')) || {}; } catch (e) { return {}; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}
function userRoot() {
  if (process.env.YOTTA_MEMORY_HOME) return process.env.YOTTA_MEMORY_HOME;
  const cfg = loadConfig();
  if (cfg.memory_home) return cfg.memory_home;
  return path.join(os.homedir(), '.yottamemory');
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
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')) || {}; } catch (e) { return {}; }
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
  if (!owner) return 'read';
  if (agent && owner === agent) return 'read';
  if (ownerFilter && owner === ownerFilter && agent && ownerFilter === agent) return 'read';
  if (unsafe || String(ownerFilter).toLowerCase() === 'user' || String(agent && '' + agent).toLowerCase() === 'user') return 'read';
  if (hasGrant(agent, owner)) return 'read';
  return 'denied';
}

// ---- 命令 core（CLI 与 MCP 共用；返回 { error, exitCode, text }，不 process.exit）----
function initCore(opts) {
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  ensureInit(root);
  return { error: false, text: '已初始化记忆库: ' + root };
}
function rememberCore(type, subject, statement, opts) {
  const root = userRoot();
  ensureInit(root);
  const t = String(type).toUpperCase();
  if (!TYPE_DIRS[t]) return { error: true, text: '未知记忆类型: ' + type + '（可用: ' + TYPES.join(' / ') + '）' };
  const dir = path.join(root, TYPE_DIRS[t]);
  const stmt = String(statement || '').trim();
  const subj = String(subject || '').trim();
  if (!stmt) return { error: true, text: 'statement 不能为空' };
  if (!subj) return { error: true, text: 'subject 不能为空' };
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
        return { error: false, text: '已更新: ' + fp };
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
  return { error: false, text: '已记录: ' + file };
}
function recallCore(query, opts) {
  const roots = [projectRoot(), userRoot()].filter(function (r) { return fs.existsSync(r); });
  if (!roots.length) return { error: false, exitCode: 0, text: '记忆库不存在，请先运行: yotta-memory init' };
  const limit = opts.limit || 50;
  const onlyType = opts.type ? String(opts.type).toUpperCase() : null;
  const q = query ? String(query).toLowerCase() : '';
  const agent = opts.agent || currentAgent();
  const ownerFilter = opts.owner || '';
  const allSafe = !!opts.unsafe;
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
      return { error: false, exitCode: 3, text: '检测到 ' + deniedCount + ' 条越界访问已被拒绝。\n如需读取其它智能体私密记忆，请加 --unsafe（用户显式授权）或 --owner user。' };
    }
    return { error: false, exitCode: 0, text: '无匹配记忆。' };
  }
  const touchRel = shown.filter(function (h) { return !h.entry.immutable; }).map(function (h) { return h.entry.file; });
  if (touchRel.length) {
    for (const root of roots) {
      bumpReadMeta(root, touchRel);
      touchIndex(root, touchRel);
    }
  }
  const lines = ['共 ' + shown.length + ' 条记忆（' + (hits.length > limit ? '前 ' + limit + ' 条' : '全部') + '）：'];
  for (const h of shown) {
    lines.push('[' + h.entry.type + '] ' + h.entry.subject + ': ' + h.entry.statement);
    lines.push('  ' + path.join(h.root, h.entry.file));
  }
  if (deniedCount > 0 && explicitCross) {
    lines.push('\n[警告] 本次检索共拒绝 ' + deniedCount + ' 条越界访问（其它智能体私密记忆，未授权不展示）。如需读取请加 --unsafe 或 --owner user。');
  }
  return { error: false, exitCode: 0, text: lines.join('\n') };
}
function forgetCore(fileRef) {
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
  if (!target) return { error: true, text: '未找到记忆文件: ' + fileRef };
  fs.unlinkSync(target);
  if (targetRoot) removeIndexEntry(targetRoot, targetRel);
  return { error: false, text: '已删除: ' + target };
}
function archiveCore(opts) {
  const days = opts.days || 180;
  const threshold = (opts.threshold !== undefined && opts.threshold !== null) ? opts.threshold : 0.4;
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
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
  return { error: false, text: '已归档 ' + moved + ' 条旧记忆到 ' + path.join(root, ARCHIVE_DIR) };
}

// ---- 命令包装（CLI 入口）----
function cmdInit(opts) {
  const r = initCore(opts);
  console.log(r.text);
}
function cmdRemember(type, subject, statement, opts) {
  const r = rememberCore(type, subject, statement, opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdRecall(query, opts) {
  const r = recallCore(query, opts);
  console.log(r.text);
  if (r.exitCode) process.exit(r.exitCode);
}
function cmdForget(fileRef) {
  const r = forgetCore(fileRef);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdArchive(opts) {
  const r = archiveCore(opts);
  console.log(r.text);
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
function exportCore(root, outPath) {
  const data = { format: 'yottamemory', version: 1, exported: today(), memories: collectAll(root) };
  const target = outPath || path.join(root, 'yottamemory-export-' + today() + '.json');
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  return { error: false, text: '已导出 ' + data.memories.length + ' 条记忆 -> ' + target };
}
function importCore(root, src) {
  if (!src) return { error: true, text: '请提供 JSON 文件路径' };
  let fp = String(src);
  if (!fs.existsSync(fp)) {
    const alt = path.resolve(root, fp);
    if (fs.existsSync(alt)) fp = alt;
  }
  if (!fs.existsSync(fp)) return { error: true, text: 'JSON 文件不存在: ' + src };
  let data;
  try { data = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return { error: true, text: 'JSON 解析失败: ' + (e && e.message ? e.message : String(e)) }; }
  if (!data.memories || !Array.isArray(data.memories)) return { error: true, text: 'JSON 格式不正确（缺少 memories 数组）' };
  ensureInit(root);
  let m = 0;
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
    m++;
  }
  return { error: false, text: '已导入 ' + m + ' 条记忆 -> ' + root };
}
function cmdExport(outPath) {
  const r = exportCore(userRoot(), outPath || 'yottamemory-export-' + today() + '.json');
  console.log(r.text);
}
function cmdImport(src) {
  const r = importCore(userRoot(), src);
  console.log(r.text);
  if (r.error) process.exit(2);
}

// ---- token 管理（每智能体一个，登记 <记忆库>/.server/tokens.json）----
function serverDir(root) { return path.join(root, SERVER_SUBDIR); }
function tokensPath(root) { return path.join(serverDir(root), TOKENS_FILE); }
function loadTokens(root) {
  try { return JSON.parse(fs.readFileSync(tokensPath(root), 'utf8')) || {}; } catch (e) { return {}; }
}
function saveTokens(root, data) {
  fs.mkdirSync(serverDir(root), { recursive: true });
  fs.writeFileSync(tokensPath(root), JSON.stringify(data, null, 2), 'utf8');
  try { fs.chmodSync(tokensPath(root), 0o600); } catch (e) {}
}
function cmdTokenNew(agentId) {
  const root = userRoot();
  ensureInit(root);
  if (!agentId) { console.error('请指定 --agent <id>'); process.exit(2); }
  const data = loadTokens(root);
  data.version = 1;
  data.tokens = data.tokens || {};
  const token = 'ytm_' + crypto.randomBytes(16).toString('hex');
  data.tokens[agentId] = { token: token, created: today() };
  saveTokens(root, data);
  console.log(token);
}
function cmdTokenList() {
  const root = userRoot();
  const data = loadTokens(root);
  const map = data.tokens || {};
  const ids = Object.keys(map);
  if (!ids.length) { console.log('暂无已登记 token（yotta-memory token new --agent <id> 生成）'); return; }
  console.log('已登记智能体:');
  for (const id of ids) console.log('  ' + id + '  (创建于 ' + map[id].created + ')');
}
function cmdTokenRevoke(agentId) {
  const root = userRoot();
  if (!agentId) { console.error('请指定 --agent <id>'); process.exit(2); }
  const data = loadTokens(root);
  data.tokens = data.tokens || {};
  if (data.tokens[agentId]) { delete data.tokens[agentId]; saveTokens(root, data); console.log('已吊销: ' + agentId); }
  else { console.log('未找到已登记智能体: ' + agentId); }
}

// ---- config 命令 ----
function cmdConfigSet(key, value) {
  if (key !== 'memory_home') { console.error('未知配置项: ' + key + '（可用: memory_home）'); process.exit(2); }
  if (!value) { console.error('缺少值: config set memory_home <目录>'); process.exit(2); }
  const cfg = loadConfig();
  cfg.memory_home = value;
  saveConfig(cfg);
  console.log('已记住记忆库位置: ' + value);
}
function cmdConfigGet() {
  const cfg = loadConfig();
  console.log('memory_home: ' + (cfg.memory_home || '(未设置，默认 ~/.yottamemory)'));
  console.log('当前生效用户级位置: ' + userRoot());
  if (cfg.serve && Object.keys(cfg.serve).length) console.log('serve: ' + JSON.stringify(cfg.serve));
}

// ---- MCP serve（局域网 streamable HTTP 记忆引擎，零依赖）----
function mcpTools() {
  return [
    { name: 'remember', description: '写入一条记忆。参数 type(FACT/PREF/BOUND/COMMIT)、subject、statement 必填；owner 可选，默认当前智能体', inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'FACT/PREF/BOUND/COMMIT' }, subject: { type: 'string' }, statement: { type: 'string' }, owner: { type: 'string' } }, required: ['type', 'subject', 'statement'] } },
    { name: 'recall', description: '检索记忆。query 可选；type 可选；limit 可选（默认 20）。只返回当前智能体可读记忆', inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' } } } },
    { name: 'search', description: '检索记忆（同 recall）。query 可选；type 可选；limit 可选（默认 20）', inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' } } } },
    { name: 'forget', description: '删除一条记忆。file 为记忆文件路径（如 facts/2026-08-24-0001.md 或文件名）', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
    { name: 'archive', description: '归档旧记忆。days 默认 180；threshold 默认 0.4', inputSchema: { type: 'object', properties: { days: { type: 'number' }, threshold: { type: 'number' } } } },
    { name: 'reindex', description: '重建索引（手动改 .md 后校正；扫描 facts/prefs/bounds/commits 四目录）', inputSchema: { type: 'object', properties: {} } },
    { name: 'export', description: '导出全部记忆到引擎主机上的 JSON 文件。out 可选（默认 <记忆库>/yottamemory-export-<日期>.json）', inputSchema: { type: 'object', properties: { out: { type: 'string' } } } },
    { name: 'import', description: '从引擎主机上的 JSON 文件导入记忆。src 为文件路径（可绝对路径，或相对记忆库目录）', inputSchema: { type: 'object', properties: { src: { type: 'string' } }, required: ['src'] } },
  ];
}
function callTool(name, args, ctx) {
  const agent = ctx.agent || '';
  try {
    if (name === 'remember') {
      const r = rememberCore(String(args.type || ''), String(args.subject || ''), String(args.statement || ''), { owner: args.owner || agent });
      return { text: r.text, error: r.error };
    }
    if (name === 'recall' || name === 'search') {
      const r = recallCore(args.query ? String(args.query) : null, { limit: args.limit || 20, type: args.type ? String(args.type) : null, agent: agent });
      return { text: r.text, error: r.error };
    }
    if (name === 'forget') {
      const r = forgetCore(String(args.file || ''));
      return { text: r.text, error: r.error };
    }
    if (name === 'archive') {
      const r = archiveCore({ days: args.days, threshold: args.threshold });
      return { text: r.text, error: r.error };
    }
    if (name === 'reindex') {
      const root = userRoot();
      if (!fs.existsSync(root)) return { text: '记忆库不存在。', error: false };
      const cnt = buildIndex(root).length;
      return { text: '已重建索引 ' + root + '（' + cnt + ' 条）', error: false };
    }
    if (name === 'export') {
      const r = exportCore(userRoot(), args.out ? String(args.out) : null);
      return { text: r.text, error: r.error };
    }
    if (name === 'import') {
      const r = importCore(userRoot(), String(args.src || ''));
      return { text: r.text, error: r.error };
    }
    return { text: '未知工具: ' + name, error: true };
  } catch (e) {
    return { text: '错误: ' + (e && e.message ? e.message : String(e)), error: true };
  }
}
function handleMessage(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: msg && msg.id, error: { code: -32600, message: 'invalid request' } };
  const id = msg.id;
  if (id === undefined || id === null) return null;
  const method = msg.method || '';
  const params = msg.params || {};
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id: id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'yotta-memory', version: VERSION } } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id: id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id: id, result: { tools: mcpTools() } };
  if (method === 'tools/call') {
    const out = callTool(params.name || '', params.arguments || {}, ctx);
    return { jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: out.text }], isError: !!out.error } };
  }
  return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } };
}
function cmdServe(opts) {
  if (opts.stdio) { cmdServeStdio(); return; }
  const host = opts.host || '0.0.0.0';
  const port = opts.port || 8787;
  const noAuth = !!opts.noAuth;
  const root = userRoot();
  ensureInit(root);
  function authorize(req) {
    if (noAuth) return { agent: String(req.headers['x-agent-id'] || '') };
    const auth = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return null;
    const token = m[1].trim();
    const agent = String(req.headers['x-agent-id'] || '');
    const tokenMap = (loadTokens(root).tokens) || {};
    if (tokenMap[agent] && tokenMap[agent].token === token) return { agent: agent };
    return null;
  }
  const server = http.createServer(function (req, res) {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname; } catch (e) {}
    if (pathname !== '/mcp') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const auth = authorize(req);
    if (!auth) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized: 需要有效 Bearer token 与 X-Agent-Id' } }));
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write('event: endpoint\ndata: /mcp\n\n');
      const iv = setInterval(function () { res.write(': keep-alive\n\n'); }, 15000);
      req.on('close', function () { clearInterval(iv); });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', function (c) { body += c; });
      req.on('end', function () {
        let msg;
        try { msg = JSON.parse(body); } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'parse error' } }));
          return;
        }
        const resp = handleMessage(msg, auth);
        if (resp === null) { res.writeHead(204); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resp));
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'text/plain' }); res.end('method not allowed');
  });
  server.listen(port, host, function () {
    console.log('yotta-memory 记忆引擎已启动（v' + VERSION + '）');
    console.log('URL: http://' + host + ':' + port + '/mcp');
    console.log('记忆库: ' + root);
    if (noAuth) console.log('鉴权: 已关闭（--no-auth，仅限可信内网）');
    else console.log('鉴权: Bearer token + X-Agent-Id（yotta-memory token new --agent <id> 生成）');
    console.log('按 Ctrl+C 停止');
  });
}

// ---- stdio 本地零进程模式（照灵魂盘：客户端按需拉起 CLI）----
function cmdServeStdio() {
  const root = userRoot();
  ensureInit(root);
  const ctx = { agent: currentAgent() };
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      const resp = handleMessage(msg, ctx);
      if (resp !== null) process.stdout.write(JSON.stringify(resp) + '\n');
    }
  });
  process.stdin.on('end', function () { process.exit(0); });
}

// ---- lan 命令（Windows 计划任务管理开机自启 serve）----
const LAN_TASK_NAME = 'YottaMemoryServe';
function lanTaskRunCmd(opts) {
  const host = opts.host || '0.0.0.0';
  const port = opts.port || 8787;
  return '"' + process.execPath + '" "' + __filename + '" serve --host ' + host + ' --port ' + port;
}
function cmdLanEnable(opts) {
  if (process.platform !== 'win32') {
    console.error('lan 命令当前仅支持 Windows（计划任务）；本机平台: ' + process.platform);
    process.exit(2);
  }
  const trigger = opts.onstart ? 'onstart' : 'onlogon';
  const tr = lanTaskRunCmd(opts);
  try {
    child_process.execFileSync('schtasks', ['/create', '/tn', LAN_TASK_NAME, '/tr', tr, '/sc', trigger, '/f'], { stdio: 'inherit' });
  } catch (e) {
    console.error('注册计划任务失败（ONSTART 需要管理员权限；ONLOGON 一般不需要；如仍失败请用管理员终端执行）: ' + String((e && e.stderr) || (e && e.message) || e).split(/\r?\n/)[0]);
    process.exit(1);
  }
  console.log('已注册开机自启: 计划任务 ' + LAN_TASK_NAME + '（触发器 ' + trigger + '）');
  console.log('运行命令: ' + tr);
}
function cmdLanDisable() {
  if (process.platform !== 'win32') {
    console.error('lan 命令当前仅支持 Windows（计划任务）；本机平台: ' + process.platform);
    process.exit(2);
  }
  try {
    child_process.execFileSync('schtasks', ['/delete', '/tn', LAN_TASK_NAME, '/f'], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    const msg = String((e && e.stderr) || (e && e.message) || e);
    if (msg.indexOf('cannot find the path') !== -1 || msg.indexOf('没有找到') !== -1) {
      console.log('未启用: 计划任务 ' + LAN_TASK_NAME + ' 不存在，无需移除');
      return;
    }
    console.error('移除计划任务失败: ' + msg.split(/\r?\n/)[0]);
    process.exit(1);
  }
  console.log('已移除开机自启计划任务 ' + LAN_TASK_NAME);
}
function cmdLanStatus() {
  if (process.platform !== 'win32') {
    console.log('lan 命令当前仅支持 Windows（计划任务）；本机平台: ' + process.platform);
    return;
  }
  try {
    const out = child_process.execFileSync('schtasks', ['/query', '/tn', LAN_TASK_NAME, '/fo', 'LIST', '/v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    console.log('已启用: 计划任务 ' + LAN_TASK_NAME + ' 存在');
    const re = /^(状态|Status)\s*:\s*(.+)$/;
    for (const line of String(out).split(/\r?\n/)) {
      const m = re.exec(line.trim());
      if (m) console.log(m[1] + ': ' + m[2]);
    }
  } catch (e) {
    console.log('未启用: 计划任务 ' + LAN_TASK_NAME + ' 不存在（可用 yotta-memory lan enable 注册）');
  }
}

// ---- usage / main ----
function usage() {
  console.log([
    'yotta-memory v' + VERSION + ' — 元忆：有权限边界的文件式智能体记忆',
    '',
    '用法:',
    '  yotta-memory init [--project] [--dir <目录>]  初始化记忆库（默认用户级；--dir 显式指定位置）',
    '  yotta-memory config set memory_home <目录>  持久记住记忆库位置',
    '  yotta-memory config get                   查看当前配置与生效位置',
    '  yotta-memory remember <type> <subject> <statement> [--owner <id>]   写入记忆',
    '  yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]  检索（索引+TF，读取分区）',
    '  yotta-memory forget <文件或文件名>         删除一条记忆',
    '  yotta-memory archive [--days 180] [--threshold 0.4]  归档（盖棺分+年龄）',
    '  yotta-memory reindex                       重建索引',
    '  yotta-memory export [--out 文件.json]      导出全部记忆',
    '  yotta-memory import <文件.json>            导入记忆',
    '  yotta-memory token new --agent <id>       生成/重置某智能体访问 token（登记 .server/tokens.json，打印一次）',
    '  yotta-memory token list                   列出已登记智能体',
    '  yotta-memory token revoke --agent <id>    吊销某智能体 token',
    '  yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio]  启动 MCP 记忆引擎（streamable HTTP；--stdio 本地零进程模式）',
    '  yotta-memory lan enable [--onstart] | disable | status  开机自启管理（Windows 计划任务，默认 ONLOGON）',
    '  yotta-memory --version                    版本',
    '',
    '类型: FACT(公共共享) / PREF(偏好) / BOUND(边界) / COMMIT(承诺)',
    '环境变量: YOTTA_MEMORY_HOME 临时覆盖用户级位置; YOTTA_AGENT_ID/AGENT_ID 当前 agent 标识（读取分区）',
    '远端接入: MCP url http://<主机IP>:8787/mcp；请求头 Authorization: Bearer <token> + X-Agent-Id: <id>',
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
  const valueOpts = new Set(['--type', '--limit', '--days', '--out', '--owner', '--agent', '--threshold', '--scope', '--host', '--port', '--dir']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--project') opts.project = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--unsafe') opts.unsafe = true;
    else if (a === '--no-auth') opts.noAuth = true;
    else if (a === '--stdio') opts.stdio = true;
    else if (a === '--onstart') opts.onstart = true;
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
      else if (a === '--host') opts.host = v;
      else if (a === '--port') opts.port = parseInt(v, 10) || 8787;
      else if (a === '--dir') opts.dir = v;
    } else if (a.startsWith('--')) {
      console.error('未知选项: ' + a);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  switch (first) {
    case 'init': cmdInit(opts); break;
    case 'config': {
      const sub = positional[0];
      if (sub === 'set') cmdConfigSet(positional[1], positional[2]);
      else if (sub === 'get') cmdConfigGet();
      else { console.error('config 子命令: set memory_home <目录> / get'); process.exit(2); }
      break;
    }
    case 'remember': cmdRemember(positional[0], positional[1], positional[2], opts); break;
    case 'recall': cmdRecall(positional[0] || null, opts); break;
    case 'forget': cmdForget(positional[0]); break;
    case 'archive': cmdArchive(opts); break;
    case 'reindex': cmdReindex(); break;
    case 'export': cmdExport(opts.out); break;
    case 'import': cmdImport(positional[0]); break;
    case 'token': {
      const sub = positional[0];
      if (sub === 'new') cmdTokenNew(opts.agent);
      else if (sub === 'list') cmdTokenList();
      else if (sub === 'revoke') cmdTokenRevoke(opts.agent);
      else { console.error('token 子命令: new --agent <id> / list / revoke --agent <id>'); process.exit(2); }
      break;
    }
    case 'serve': cmdServe(opts); break;
    case 'lan': {
      const sub = positional[0];
      if (sub === 'enable') cmdLanEnable(opts);
      else if (sub === 'disable') cmdLanDisable();
      else if (sub === 'status') cmdLanStatus();
      else { console.error('lan 子命令: enable [--onstart] / disable / status'); process.exit(2); }
      break;
    }
    default:
      console.error('未知命令: ' + first);
      usage();
      process.exit(2);
  }
}

if (require.main === module) main();
module.exports = {
  VERSION: VERSION,
  userRoot: userRoot,
  projectRoot: projectRoot,
  rememberCore: rememberCore,
  recallCore: recallCore,
  forgetCore: forgetCore,
  archiveCore: archiveCore,
  mcpTools: mcpTools,
  callTool: callTool,
  handleMessage: handleMessage,
  loadConfig: loadConfig,
  saveConfig: saveConfig,
  loadTokens: loadTokens,
  saveTokens: saveTokens,
};
