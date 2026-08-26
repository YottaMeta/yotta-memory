#!/usr/bin/env node
// yotta-memory（元忆）: 有权限边界的文件式智能体记忆 CLI（零依赖）
// v0.4.0 新增：lan（Windows 计划任务开机自启 serve）/ init --dir（显式指定位置）/ serve --stdio（本地零进程模式）/ MCP 工具补 reindex/export/import
// v0.5.0 新增：隐私硬隔离——私密物理分目录 private/<agent_id>/{prefs,bounds,commits}/ + 关闭 --agent 越权读 + 私密写跨智能体需 --unsafe + 禁 shell 直读写（文档红线）
// v0.4.2 新增：iam/whoami 智能体身份自注册（agents.json 唯一性）+ 自我档案 PREF + 私密记忆须声明 owner
// v0.5.3 新增：CLI 选项可前置（--agent 等允许放在子命令前，不再误报"未知命令"）/ lan enable 成功补"服务不会立刻启动"提示（v0.5.2 lan 引号修复无回归）
// v0.5.4 新增：lan enable 在非管理员（schtasks Access denied）时自动降级为用户级 Startup 静默自启（VBS sh.Run 窗口0 + autostart.cmd，node 路径 process.execPath 自动探测）；lan disable/status 同时管理计划任务与 Startup 双机制
// v0.6.0 新增：灵魂盘核心——profile（用户画像聚合，零推断）/ context（开工上下文包）/ iam 扩展（--name/--user/--relationship）/ remember --verify（写后回读）与 --no-hint（关闭类型启发式提示）+ SKILL「记忆守则」
// v0.6.1 新增：灵魂盘机制精髓补齐——context --budget（token 预算，近记忆按剩余预算放行）/ context 内嵌「多智能体接入铁律」段 / remember --source/--weight（来源 + 重要性权重，去重 weight 取 max）/ 近期记忆排序融合 importance（confidence×recency+updated+weight+immutable）
// v0.6.3 修复：lan 开机自启 VBS 自愈——VBS 内联 autostart.cmd 内容，启动时自动重建 .cmd（根治 80070002：wscript 找不到被引用启动文件）
// v0.6.4 新增：lan 命令扩展 Linux——systemd 用户单元（systemctl --user enable/start，登录自启；--onstart 附加 loginctl enable-linger 开机即启）/ systemd 不可用时自动降级用户 crontab @reboot；lanPlatform 测试钩子（YOTTA_LAN_PLATFORM）
// v0.6.5 修复：recall/context 对同一文件显示 2 条——projectRoot 与 userRoot 指向同一目录（如 cwd=home 或其父）时同一索引被遍历两次；新增 memoryRoots() 唯一化根，hasGrant/recallCore/forgetCore/cmdReindex/contextCore 统一走 memoryRoots()
// v0.6.2 修复：remember --verify 写后回读改为直查索引 + 权限判定 + 召回匹配性（不再依赖 recall top-N 排序，消除泛化 subject 下偶发误报「回读未命中」）
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const child_process = require('child_process');

const VERSION = '0.6.5';
const TYPES = ['FACT', 'PREF', 'BOUND', 'COMMIT'];
const TYPE_DIRS = { FACT: 'facts', PREF: 'prefs', BOUND: 'bounds', COMMIT: 'commits' };
const PUBLIC_DIR = 'facts';
const PRIVATE_DIR = 'private';
const PRIVATE_LEAF = ['prefs', 'bounds', 'commits'];
const ARCHIVE_DIR = '.archive';
const INDEX_FILE = 'index.json';
const PRIVATE_TYPES = ['PREF', 'BOUND', 'COMMIT'];
const FIELD_ORDER = ['type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags', 'immutable', 'scope', 'owner', 'source', 'weight', 'access_count', 'last_accessed'];
const CONFIG_FILE = 'config.json';
const SERVER_SUBDIR = '.server';
const TOKENS_FILE = 'tokens.json';
const AGENTS_FILE = 'agents.json';
const PROFILE_FILE = 'profile.md';
// remember 类型启发式提示关键词（statement 含主观/关系词且 type=FACT 时提示改 PREF，仅提示不拦截）
const HINT_KEYWORDS = ['用户', '偏好', '喜欢', '关系', '称呼', '本人', '希望', '讨厌', '欣赏', '习惯', '忌讳', '介意', '不要', '别用'];

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
// 唯一化记忆库根：projectRoot 与 userRoot 可能指向同一目录（如 cwd=home 或其父时），
// 若不唯一化，recall/context 等会对同一索引遍历两次 -> 同一条记忆重复展示（v0.6.5 修复）。
function memoryRoots() {
  const out = [], seen = new Set();
  for (const r of [projectRoot(), userRoot()]) {
    const abs = path.resolve(r);
    if (!fs.existsSync(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
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
function privateIdDir(root, id) { return path.join(root, PRIVATE_DIR, id); }
// 布局：FACT -> <root>/facts；PREF/BOUND/COMMIT -> <root>/private/<owner>/<type>
function typeSubdir(type, owner) {
  const t = String(type).toUpperCase();
  if (t === 'FACT') return PUBLIC_DIR;
  const id = owner || '';
  return path.join(PRIVATE_DIR, id, TYPE_DIRS[t]);
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
  fs.mkdirSync(path.join(root, PUBLIC_DIR), { recursive: true });
  fs.mkdirSync(path.join(root, PRIVATE_DIR), { recursive: true });
  fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
  const readme = path.join(root, 'README.md');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# yotta-memory（元忆）记忆库\n\n有权限边界的文件式智能体记忆存储目录。结构：facts/（公共 FACT） private/<agent_id>/{prefs,bounds,commits}/（各智能体私密，物理隔离） .archive/（归档）。\n', 'utf8');
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
function collectEntryFiles(root) {
  const dirs = [];
  const facts = path.join(root, PUBLIC_DIR);
  if (fs.existsSync(facts)) dirs.push(path.join(root, PUBLIC_DIR));
  const pdir = path.join(root, PRIVATE_DIR);
  if (fs.existsSync(pdir)) {
    for (const id of fs.readdirSync(pdir)) {
      const idDir = path.join(pdir, id);
      if (!fs.statSync(idDir).isDirectory()) continue;
      for (const t of PRIVATE_LEAF) {
        const d = path.join(idDir, t);
        if (fs.existsSync(d)) dirs.push(d);
      }
    }
  }
  const out = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isFile()) out.push(fp);
    }
  }
  return out;
}
// 迁移：把根下旧平铺 prefs|bounds|commits/*.md 按 frontmatter owner 迁入 private/<owner>/<type>/
function migrateLayout(root) {
  let moved = 0;
  for (const t of PRIVATE_LEAF) {
    const dir = path.join(root, t);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
      const owner = meta.owner || '';
      if (!owner) continue;
      const target = path.join(root, PRIVATE_DIR, owner, t, f);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(fp, target);
      moved++;
    }
  }
  return moved;
}
function buildIndex(root) {
  migrateLayout(root);
  const entries = [];
  for (const fp of collectEntryFiles(root)) entries.push(readEntry(fp, root));
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
    source: meta.source || '',
    weight: (parseFloat(meta.weight) > 0 ? parseFloat(meta.weight) : 1.0),
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
// 灵魂盘 importance 融合：confidence × (0.5 + recency) + updated 加分 + weight 乘子 + immutable 加分
function importanceScore(meta) {
  const conf = parseFloat(meta.confidence || 1.0);
  let ageDays = 999;
  if (meta.created) {
    const d = daysBetween(meta.created, today());
    if (!isNaN(d)) ageDays = d;
  }
  const recency = 1.0 / (1.0 + Math.max(ageDays, 0) / 180.0);
  let score = conf * (0.5 + recency);
  if (meta.updated && meta.created && meta.updated !== meta.created) score += 0.5;
  const w = parseFloat(meta.weight || 1.0); if (w > 0) score *= w;
  if (meta.immutable === 'true') score += 2.0;
  return score;
}
function loadGrants(root) {
  const fp = path.join(root, 'grants.json');
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')) || {}; } catch (e) { return {}; }
}
function hasGrant(userAgent, ownerAgent) {
  if (!userAgent || !ownerAgent) return false;
  for (const root of memoryRoots()) {
    if (!fs.existsSync(root)) continue;
    const grants = loadGrants(root);
    const list = grants[userAgent];
    if (Array.isArray(list) && list.indexOf(ownerAgent) !== -1) return true;
  }
  return false;
}
// 三态读取判定：'read' | 'denied'
// selfAgent 为可信身份（env 声明 / 调用方上下文）；--agent 仅供授权与展示，不得授予跨智能体私密读取。
function classifyRead(entry, agent, ownerFilter, unsafe, selfAgent) {
  if (entry.scope === 'public') return 'read';
  const owner = entry.owner || '';
  if (!owner) return 'read';
  const own = selfAgent || agent;
  if (own && owner === own) return 'read';
  if (unsafe || String(ownerFilter).toLowerCase() === 'user' || String(agent || '').toLowerCase() === 'user') return 'read';
  if (hasGrant(agent || selfAgent, owner)) return 'read';
  return 'denied';
}
// verify 写后回读：直查索引 + 权限判定 + 召回匹配性，不依赖 recall top-N 排序
// （v0.6.2 修复：泛化 subject 下新条目被挤出前 N 条导致误报「回读未命中」）
function verifyWrittenReadable(root, rel, subj, agent) {
  const entries = ensureIndex(root);
  let target = null;
  for (const e of entries) { if (e.file === rel) { target = e; break; } }
  if (!target) return false;
  if (classifyRead(target, agent, '', false, agent) !== 'read') return false;
  const q = String(subj || '').toLowerCase();
  const qtoks = tokenize(q);
  let score = 0;
  for (const tt of qtoks) { if (target.tokens && target.tokens[tt]) score += target.tokens[tt]; }
  if (score === 0) {
    const hay = ((target.subject || '') + ' ' + (target.statement || '') + ' ' + target.tags.join(' ')).toLowerCase();
    if (hay.indexOf(q) !== -1) score = 1;
  }
  return score > 0;
}

// ---- 命令 core（CLI 与 MCP 共用；返回 { error, exitCode, text }，不 process.exit）----
function initCore(opts) {
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  ensureInit(root);
  return { error: false, text: '已初始化记忆库: ' + root };
}
function rememberCore(type, subject, statement, opts) {
  opts = opts || {};
  const root = userRoot();
  ensureInit(root);
  const t = String(type).toUpperCase();
  if (!TYPE_DIRS[t]) return { error: true, text: '未知记忆类型: ' + type + '（可用: ' + TYPES.join(' / ') + '）' };
  const stmt = String(statement || '').trim();
  const subj = String(subject || '').trim();
  if (!stmt) return { error: true, text: 'statement 不能为空' };
  if (!subj) return { error: true, text: 'subject 不能为空' };
  const selfAgent = opts.selfAgent || currentAgent();
  const owner = opts.owner || selfAgent;
  const scope = opts.scope || defaultScope(t);
  if (scope === 'private' && !owner) {
    return { error: true, text: '私密记忆必须声明归属智能体：请设环境变量 YOTTA_AGENT_ID（或 AGENT_ID）、传 --owner <id>，或先 yotta-memory whoami / iam 登记唯一身份。公共记忆(FACT)不受影响。' };
  }
  if (scope === 'private' && owner && selfAgent && owner !== selfAgent && !opts.unsafe) {
    return { error: true, text: '拒绝: 当前声明身份 ' + selfAgent + ' 不能写入其它智能体 ' + owner + ' 的私密区。请用 YOTTA_AGENT_ID 声明自己的身份，或加 --unsafe（用户显式授权）。' };
  }
  const dir = path.join(root, typeSubdir(t, owner));
  fs.mkdirSync(dir, { recursive: true });
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
        if (opts.source && !meta.source) patch.source = opts.source;
        const w = parseFloat(opts.weight); if (w > 0) patch.weight = Math.max(parseFloat(meta.weight || '1.0') || 1.0, w);
        rewriteFrontmatter(fp, patch);
        upsertIndexEntry(root, readEntry(fp, root));
        let text = '已更新: ' + fp;
        if (opts.hint !== false && t === 'FACT') {
          const hit = HINT_KEYWORDS.filter(function (w) { return stmt.indexOf(w) !== -1; });
          if (hit.length) text += '\n[提示] statement 含主观/关系词（' + hit.join('、') + '），疑似用户偏好 / 关系内容——若属此类建议改用 PREF（私密，仅本人可读）。仅提示不拦截；--no-hint 可关闭。';
        }
        if (opts.verify) {
          const rel = path.relative(root, fp).replace(/\\/g, '/');
          const ok = verifyWrittenReadable(root, rel, subj, selfAgent || opts.agent);
          text += '\n[verify] ' + (ok ? '已写回读 OK: ' + rel : '回读未命中，请检查: ' + rel);
        }
        return { error: false, text: text };
      }
    }
  }
  const seq = nextSeq(dir);
  const file = path.join(dir, today() + '-' + seq + '.md');
  const rec = {
    type: t, subject: subj, statement: stmt,
    confidence: 1.0, created: today(), updated: today(),
    tags: [], immutable: false,
    scope: scope, owner: owner,
    source: opts.source || '',
    weight: (parseFloat(opts.weight) > 0 ? parseFloat(opts.weight) : 1.0),
    access_count: 0, last_accessed: '',
  };
  fs.writeFileSync(file, frontmatterToText(rec, stmt), 'utf8');
  upsertIndexEntry(root, readEntry(file, root));
  let text = '已记录: ' + file;
  if (opts.hint !== false && t === 'FACT') {
    const hit = HINT_KEYWORDS.filter(function (w) { return stmt.indexOf(w) !== -1; });
    if (hit.length) text += '\n[提示] statement 含主观/关系词（' + hit.join('、') + '），疑似用户偏好 / 关系内容——若属此类建议改用 PREF（私密，仅本人可读）。仅提示不拦截；--no-hint 可关闭。';
  }
  if (opts.verify) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const ok = verifyWrittenReadable(root, rel, subj, selfAgent || opts.agent);
    text += '\n[verify] ' + (ok ? '已写回读 OK: ' + rel : '回读未命中，请检查: ' + rel);
  }
  return { error: false, text: text };
}
function recallCore(query, opts) {
  const roots = memoryRoots();
  if (!roots.length) return { error: false, exitCode: 0, text: '记忆库不存在，请先运行: yotta-memory init' };
  const limit = opts.limit || 50;
  const onlyType = opts.type ? String(opts.type).toUpperCase() : null;
  const q = query ? String(query).toLowerCase() : '';
  const selfAgent = currentAgent();
  const agent = opts.agent || selfAgent;
  const ownerFilter = opts.owner || '';
  const allSafe = !!opts.unsafe;
  const impersonation = !!(opts.agent && selfAgent && opts.agent !== selfAgent);
  const explicitCross = !!opts.all || impersonation || (!!ownerFilter && ownerFilter.toLowerCase() !== 'user' && ownerFilter !== agent);
  const hits = [];
  let deniedCount = 0;
  for (const root of roots) {
    const entries = ensureIndex(root);
    for (const e of entries) {
      if (onlyType && e.type !== onlyType) continue;
      const r = classifyRead(e, agent, ownerFilter, allSafe, selfAgent);
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
function resolveMemoryFile(root, ref) {
  const map = {};
  for (const fp of collectEntryFiles(root)) {
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    map[rel] = fp;
    const base = path.basename(rel);
    if (!map[base]) map[base] = fp;
  }
  if (map[ref]) return { fp: map[ref], rel: relOf(root, map[ref]) };
  const base = path.basename(ref.replace(/\\/g, '/'));
  if (map[base]) return { fp: map[base], rel: relOf(root, map[base]) };
  return null;
}
function relOf(root, fp) { return path.relative(root, fp).replace(/\\/g, '/'); }
function forgetCore(fileRef, opts) {
  opts = opts || {};
  const selfAgent = opts.selfAgent || currentAgent();
  const roots = memoryRoots();
  const ref = String(fileRef || '').replace(/\\/g, '/');
  let target = null, targetRoot = null, targetRel = null;
  for (const root of roots) {
    const found = resolveMemoryFile(root, ref);
    if (found) { target = found.fp; targetRoot = root; targetRel = found.rel; break; }
  }
  if (!target) return { error: true, text: '未找到记忆文件: ' + fileRef };
  const seg = targetRel.replace(/\\/g, '/').split('/');
  if (seg[0] === 'private') {
    const owner = seg[1] || '';
    if (!opts.unsafe && (owner && (selfAgent ? owner !== selfAgent : true))) {
      return { error: true, text: '拒绝: 不能删除其它智能体 ' + owner + ' 的私密记忆（当前身份 ' + (selfAgent || '未声明') + '）。请用 YOTTA_AGENT_ID 声明自己的身份，或加 --unsafe（用户显式授权）。' };
    }
  }
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
  for (const fp of collectEntryFiles(root)) {
    const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
    if (meta.immutable === 'true') continue;
    if (!meta.created) continue;
    const createdTs = new Date(meta.created).getTime();
    if (isNaN(createdTs)) continue;
    const t = (meta.type || 'FACT').toUpperCase();
    if (vitality(meta) < threshold && createdTs < cutoff) {
      const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[t]);
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(fp, path.join(destDir, path.basename(fp)));
      const rel = relOf(root, fp);
      movedFiles.push(rel);
      moved++;
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
  const o = Object.assign({}, opts);
  if (o.noHint) o.hint = false;
  const r = rememberCore(type, subject, statement, o);
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
  const roots = memoryRoots();
  if (!roots.length) { console.log('记忆库不存在。'); return; }
  for (const root of roots) {
    const n = buildIndex(root).length;
    console.log('已重建索引 ' + root + '（' + n + ' 条）');
  }
}
function collectAll(root) {
  const out = [];
  for (const fp of collectEntryFiles(root)) {
    const e = readEntry(fp, root);
    out.push({ file: e.file, meta: e.meta });
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
    const dir = path.join(root, typeSubdir(t, meta.owner || ''));
    fs.mkdirSync(dir, { recursive: true });
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
      source: meta.source || '',
      weight: (parseFloat(meta.weight) > 0 ? parseFloat(meta.weight) : 1.0),
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
function cmdTokenNew(agentId, opts) {
  const root = userRoot();
  ensureInit(root);
  if (!agentId) { console.error('请指定 --agent <id>'); process.exit(2); }
  const data = loadTokens(root);
  data.version = 1;
  data.tokens = data.tokens || {};
  const conflict = identityConflict(root, agentId);
  if (conflict && !opts.force) {
    console.error("错误: 智能体 ID '" + agentId + "' " + conflict + '。每个 AI 智能体的 ID 必须唯一；确认是同一智能体后加 --force 覆盖。');
    process.exit(2);
  }
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


// ---- 智能体身份登记（agents.json）+ 自我档案 ----
function agentsPath(root) { return path.join(root, AGENTS_FILE); }
function loadAgents(root) {
  try { return JSON.parse(fs.readFileSync(agentsPath(root), 'utf8')) || {}; } catch (e) { return {}; }
}
function saveAgents(root, data) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(agentsPath(root), JSON.stringify(data, null, 2), 'utf8');
}
const SELF_PROFILE_SUBJECT = '自我接入档案';
function selfPrefsDir(root, agentId) { return path.join(root, PRIVATE_DIR, agentId, 'prefs'); }
function findSelfProfile(root, agentId) {
  const dir = selfPrefsDir(root, agentId);
  if (!fs.existsSync(dir)) return '';
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (!fs.statSync(fp).isFile()) continue;
    const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
    if (meta.subject === SELF_PROFILE_SUBJECT && (meta.owner || '') === agentId) return f;
  }
  return '';
}
function parseKvBody(body) {
  const out = {};
  for (const seg of String(body || '').split(';')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/.exec(seg);
    if (m && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}
function selfProfileBody(agentId, root, extra) {
  const lines = [];
  lines.push('agent_id: ' + agentId);
  lines.push('host: ' + os.hostname());
  lines.push('memory_home: ' + root);
  lines.push('mcp_mode: ' + (extra.mcpMode || 'stdio'));
  if (extra.engineUrl) lines.push('engine_url: ' + extra.engineUrl);
  if (extra.token) lines.push('token: ' + extra.token);
  if (extra.name) lines.push('agent_name: ' + extra.name);
  if (extra.userName) lines.push('user_name: ' + extra.userName);
  if (extra.relationship) lines.push('relationship: ' + extra.relationship);
  return lines.join('; ');
}
function writeSelfProfile(root, agentId, extra) {
  extra = extra || {};
  const dir = selfPrefsDir(root, agentId);
  fs.mkdirSync(dir, { recursive: true });
  const existing = findSelfProfile(root, agentId);
  if (existing) {
    // 已有自我档案：合并 kv 字段更新（不重复建文件）
    const fp = path.join(dir, existing);
    const parsed = parseFrontmatter(fs.readFileSync(fp, 'utf8'));
    const kv = parseKvBody(parsed.body);
    kv.agent_id = agentId;
    kv.host = os.hostname();
    kv.memory_home = root;
    kv.mcp_mode = extra.mcpMode || kv.mcp_mode || 'stdio';
    if (extra.engineUrl) kv.engine_url = extra.engineUrl;
    if (extra.token) kv.token = extra.token;
    if (extra.name) kv.agent_name = extra.name;
    if (extra.userName) kv.user_name = extra.userName;
    if (extra.relationship) kv.relationship = extra.relationship;
    const body = Object.keys(kv).map(function (k) { return k + ': ' + kv[k]; }).join('; ');
    const meta = Object.assign({}, parsed.meta);
    meta.updated = today();
    meta.statement = body;
    fs.writeFileSync(fp, frontmatterToText(meta, body), 'utf8');
    upsertIndexEntry(root, readEntry(fp, root));
    return fp;
  }
  const seq = nextSeq(dir);
  const file = path.join(dir, today() + '-' + seq + '.md');
  const body = selfProfileBody(agentId, root, extra);
  const rec = {
    type: 'PREF', subject: SELF_PROFILE_SUBJECT, statement: body,
    confidence: 1.0, created: today(), updated: today(),
    tags: ['自我档案'], immutable: false,
    scope: 'private', owner: agentId, access_count: 0, last_accessed: '',
  };
  fs.writeFileSync(file, frontmatterToText(rec, body), 'utf8');
  upsertIndexEntry(root, readEntry(file, root));
  return file;
}
function identityConflict(root, agentId) {
  const agents = loadAgents(root).agents || {};
  const tokens = loadTokens(root).tokens || {};
  const host = os.hostname();
  const a = agents[agentId];
  if (a && a.host && a.host !== host) return '已被智能体身份登记占用（host=' + a.host + '）';
  if (tokens[agentId]) return '已被远端 token 登记占用（.server/tokens.json）';
  return '';
}
function cmdIam(agentId, opts) {
  const root = userRoot();
  ensureInit(root);
  if (!agentId) { console.error('请指定 <id>：yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]'); process.exit(2); }
  const conflict = identityConflict(root, agentId);
  if (conflict && !opts.force) {
    console.error("错误: ID '" + agentId + "' " + conflict + '。每个 AI 智能体的 ID 必须唯一。请换一个唯一 ID，或确认是同一智能体后加 --force 覆盖。');
    process.exit(2);
  }
  const data = loadAgents(root);
  data.version = 1;
  data.agents = data.agents || {};
  const host = os.hostname();
  const existed = data.agents[agentId];
  data.agents[agentId] = { host: host, created: (existed && existed.created) || today() };
  saveAgents(root, data);
  const file = writeSelfProfile(root, agentId, { mcpMode: 'stdio', name: opts.name, userName: opts.user, relationship: opts.relationship });
  console.log('已登记智能体身份: ' + agentId + '（host=' + host + '，' + (conflict ? '--force 覆盖' : '新建') + '）');
  if (opts.name || opts.user || opts.relationship) {
    console.log('自我档案扩展: ' + [opts.name && '显示名=' + opts.name, opts.user && '用户=' + opts.user, opts.relationship && '关系=' + opts.relationship].filter(Boolean).join(' / '));
  }
  console.log('已写入自我档案: ' + file);
  console.log('本机免 token：以后用 whoami 确认身份；远端接入需 token new --agent ' + agentId);
}
function cmdWhoami() {
  const root = userRoot();
  const id = currentAgent();
  if (!id) {
    console.log('当前未声明智能体身份（YOTTA_AGENT_ID / AGENT_ID 未设置，也未传 --agent）。');
    console.log('本机：请在该智能体的 MCP 配置 env 设 YOTTA_AGENT_ID=<唯一ID>，然后 yotta-memory iam <id> 登记；或 CLI 每次带 --agent <id> / --owner <id>。');
    console.log('远端：X-Agent-Id 请求头 + token（token new --agent <id>）。');
    return;
  }
  const agents = loadAgents(root).agents || {};
  const tokens = loadTokens(root).tokens || {};
  let reg = '未登记';
  if (agents[id]) reg = 'agents.json 已登记（host=' + agents[id].host + '）';
  else if (tokens[id]) reg = 'tokens.json 已登记（远端）';
  const profile = findSelfProfile(root, id);
  console.log('当前智能体身份: ' + id);
  console.log('登记状态: ' + reg);
  console.log('自我档案: ' + (profile ? profile : '未写入（请执行 yotta-memory iam ' + id + '）'));
  if (profile) {
    const kv = parseKvBody(parseFrontmatter(fs.readFileSync(path.join(selfPrefsDir(root, id), profile), 'utf8')).body);
    if (kv.agent_name) console.log('显示名: ' + kv.agent_name);
    if (kv.user_name) console.log('用户: ' + kv.user_name);
    if (kv.relationship) console.log('关系: ' + kv.relationship);
  }
  if (!agents[id] && !tokens[id]) console.log('提示: 请先 yotta-memory iam ' + id + ' 登记唯一身份并落自我档案，再写私密记忆。');
}

// ---- 用户画像聚合（v0.6.0，零推断：只归组呈现原文，结论由承载 AI 依据「记忆守则」内部形成）----
function profileGroups(root, owner) {
  const groups = [];
  const map = {};
  for (const t of PRIVATE_LEAF) {
    const dir = path.join(root, PRIVATE_DIR, owner, t);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const e = readEntry(fp, root);
      const key = e.type + '\u0000' + (e.subject || '') + '\u0000' + e.tags.join(',');
      if (!map[key]) {
        map[key] = { type: e.type, subject: e.subject || '', tags: e.tags || [], items: [] };
        groups.push(map[key]);
      }
      map[key].items.push({
        file: e.file, statement: e.statement, confidence: e.confidence,
        last_accessed: e.last_accessed, updated: e.updated,
      });
    }
  }
  return groups;
}
function profileCore(opts) {
  opts = opts || {};
  const root = userRoot();
  const selfAgent = opts.selfAgent !== undefined ? opts.selfAgent : currentAgent();
  const owner = opts.owner || selfAgent;
  if (!owner) return { error: true, exitCode: 2, text: '请先声明身份（YOTTA_AGENT_ID / AGENT_ID）或传 --owner <id>，再生成画像。' };
  if (selfAgent && owner !== selfAgent && owner !== 'user' && !opts.unsafe && !hasGrant(selfAgent, owner)) {
    return { error: true, exitCode: 3, text: '拒绝: 不能生成其它智能体 ' + owner + ' 的画像（private/' + owner + '/ 为私密区）。如需读取请 --owner user 或 --unsafe（用户显式授权）。' };
  }
  const ownerDir = path.join(root, PRIVATE_DIR, owner);
  if (!fs.existsSync(ownerDir)) return { error: false, text: '该智能体（' + owner + '）暂无画像：private/' + owner + '/ 不存在或为空。' };
  const groups = profileGroups(root, owner);
  if (!groups.length) return { error: false, text: '该智能体（' + owner + '）暂无画像：private/' + owner + '/ 下无 PREF / BOUND / COMMIT 条目。' };
  const lines = [];
  lines.push('# 用户画像（' + owner + '）');
  lines.push('');
  lines.push('> 生成: yotta-memory profile | 引擎零推断：以下为私密记忆原文的结构化归组，画像结论由承载 AI 依据「记忆守则」在内部形成，不当面贴标签。');
  lines.push('> 刷新: ' + today());
  lines.push('');
  for (const g of groups) {
    lines.push('## ' + g.type + ' · ' + (g.subject || '（无主题）') + (g.tags.length ? '  [tags: ' + g.tags.join(', ') + ']' : ''));
    lines.push('');
    for (const it of g.items) {
      const acc = it.last_accessed ? '最近访问 ' + it.last_accessed : '未访问';
      lines.push('- ' + it.statement + '（confidence ' + it.confidence + ' · ' + acc + '）');
      lines.push('  - ' + it.file);
    }
    lines.push('');
  }
  const text = lines.join('\n');
  const outFile = path.join(ownerDir, PROFILE_FILE);
  fs.writeFileSync(outFile, text + '\n', 'utf8');
  return { error: false, text: text + '\n\n[已写入] ' + outFile };
}
function cmdProfile(opts) {
  const r = profileCore(opts);
  console.log(r.text);
  if (r.exitCode) process.exit(r.exitCode);
  if (r.error) process.exit(2);
}

// ---- 开工上下文包（v0.6.0：身份 + 画像 + 近期记忆 + 边界 + 承诺，stdout 不落盘）----
function selfProfileKv(root, id) {
  const profile = findSelfProfile(root, id);
  if (!profile) return {};
  return parseKvBody(parseFrontmatter(fs.readFileSync(path.join(selfPrefsDir(root, id), profile), 'utf8')).body);
}
function contextCore(opts) {
  opts = opts || {};
  const roots = memoryRoots();
  if (!roots.length) return { error: false, exitCode: 0, text: '记忆库不存在，请先运行: yotta-memory init' };
  const root = userRoot();
  const limit = opts.limit || 10;
  const selfAgent = opts.selfAgent !== undefined ? opts.selfAgent : currentAgent();
  const owner = opts.owner || selfAgent;
  const unsafe = !!opts.unsafe;
  const budget = opts.budget ? parseInt(opts.budget, 10) : 0;
  const lines = [];
  function usedChars() { return lines.reduce(function (s, x) { return s + String(x).length + 1; }, 0); }
  lines.push('# 开工上下文包（yotta-memory context）');
  lines.push('');
  lines.push('## 1. 身份');
  lines.push('');
  if (!owner) {
    lines.push('- 未声明智能体身份（无 YOTTA_AGENT_ID / --owner）。私密记忆与画像不可用；请先 whoami / iam。');
  } else {
    lines.push('- agent_id: ' + owner);
    const kv = selfProfileKv(root, owner);
    if (kv.agent_name) lines.push('- agent_name: ' + kv.agent_name);
    if (kv.user_name) lines.push('- user_name: ' + kv.user_name);
    if (kv.relationship) lines.push('- relationship: ' + kv.relationship);
    lines.push('- host: ' + os.hostname());
    lines.push('- memory_home: ' + root);
  }
  lines.push('');
  lines.push('## 1.5 多智能体接入铁律');
  lines.push('');
  lines.push('- 可读：A. 公共 FACT（facts/）B. 本智能体私密（private/<owner>/）C. 其它智能体私密 = 禁区（grant / identity=user / --unsafe 显式授权除外）。');
  lines.push('- 可写：FACT→公共；PREF / BOUND / COMMIT→仅本智能体私密区；禁止写其它智能体私密区。');
  lines.push('- 违规红线：禁止搜索 / 读取 / 总结其它智能体私密；禁止把用户私密关系 / 心理健康 / 生活隐私写入公共区。');
  lines.push('');
  lines.push('## 2. 用户画像摘要');
  lines.push('');
  if (owner) {
    const pf = path.join(root, PRIVATE_DIR, owner, PROFILE_FILE);
    if (fs.existsSync(pf)) {
      lines.push('```markdown');
      lines.push(fs.readFileSync(pf, 'utf8').trim());
      lines.push('```');
    } else {
      const pr = profileCore({ owner: owner, unsafe: unsafe, selfAgent: selfAgent });
      if (!pr.error && pr.text.indexOf('[已写入]') !== -1 && fs.existsSync(pf)) {
        lines.push('（画像不存在，已自动生成一次，见下）');
        lines.push('```markdown');
        lines.push(fs.readFileSync(pf, 'utf8').trim());
        lines.push('```');
      } else {
        lines.push('（该身份暂无画像；可运行 yotta-memory profile 生成）');
      }
    }
  } else {
    lines.push('（未声明身份，跳过画像；先 iam 登记后可生成）');
  }
  lines.push('');
  lines.push('## 3. 近期记忆（按活跃度前 ' + limit + ' 条）');
  lines.push('');
  const recent = [];
  for (const r of roots) {
    for (const e of ensureIndex(r)) {
      if (classifyRead(e, owner, '', unsafe, selfAgent) === 'denied') continue;
      recent.push({ e: e, s: importanceScore(e) });
    }
  }
  recent.sort(function (a, b) { return b.s - a.s; });
  const recentShown = recent.slice(0, limit);
  if (!recentShown.length) lines.push('（暂无记忆）');
  for (const h of recentShown) {
    const line = '- [' + h.e.type + '] ' + h.e.subject + ': ' + h.e.statement;
    if (budget > 0 && usedChars() + line.length > budget) break;
    lines.push(line);
  }
  lines.push('');
  lines.push('## 4. 边界提醒（BOUND）');
  lines.push('');
  const bounds = [];
  for (const r of roots) {
    for (const e of ensureIndex(r)) {
      if (e.type !== 'BOUND') continue;
      if (classifyRead(e, owner, '', unsafe, selfAgent) === 'denied') continue;
      bounds.push(e);
    }
  }
  if (!bounds.length) lines.push('（无）');
  for (const e of bounds) lines.push('- ' + (e.subject || '边界') + ': ' + e.statement);
  lines.push('');
  lines.push('## 5. 承诺 / 锚点（COMMIT）');
  lines.push('');
  const commits = [];
  for (const r of roots) {
    for (const e of ensureIndex(r)) {
      if (e.type !== 'COMMIT') continue;
      if (classifyRead(e, owner, '', unsafe, selfAgent) === 'denied') continue;
      commits.push(e);
    }
  }
  if (!commits.length) lines.push('（无）');
  for (const e of commits) lines.push('- ' + (e.subject || '承诺') + ': ' + e.statement);
  return { error: false, exitCode: 0, text: lines.join('\n') };
}
function cmdContext(opts) {
  const r = contextCore(opts);
  console.log(r.text);
  if (r.exitCode) process.exit(r.exitCode);
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
    { name: 'agent_info', description: '查看当前智能体身份与登记状态（远端读经 token 校验的 X-Agent-Id；本机读 YOTTA_AGENT_ID）。开工先确认「我是谁」，禁止从记忆里抄别人的 ID', inputSchema: { type: 'object', properties: {} } },
    { name: 'profile', description: '生成当前智能体的用户画像（只读聚合 private/<owner>/ 下 PREF/BOUND/COMMIT 原文，零推断，写入 private/<owner>/profile.md）。owner 默认当前智能体', inputSchema: { type: 'object', properties: { owner: { type: 'string' } } } },
  ];
}
function callTool(name, args, ctx) {
  const agent = ctx.agent || '';
  try {
    if (name === 'remember') {
      const ownerArg = args.owner ? String(args.owner) : '';
      if (ownerArg && ownerArg !== agent) return { text: '拒绝: MCP 写入的 owner 必须等于当前智能体身份（' + agent + '），不能写其它智能体私密区。', error: true };
      const r = rememberCore(String(args.type || ''), String(args.subject || ''), String(args.statement || ''), { owner: agent, selfAgent: agent });
      return { text: r.text, error: r.error };
    }
    if (name === 'recall' || name === 'search') {
      const r = recallCore(args.query ? String(args.query) : null, { limit: args.limit || 20, type: args.type ? String(args.type) : null, agent: agent });
      return { text: r.text, error: r.error };
    }
    if (name === 'forget') {
      const r = forgetCore(String(args.file || ''), { selfAgent: agent });
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
    if (name === 'agent_info') {
      const root = userRoot();
      const id = agent || '';
      if (!id) return { text: '当前未声明智能体身份（无 X-Agent-Id / YOTTA_AGENT_ID）。本机请在 MCP 配置 env 设 YOTTA_AGENT_ID=<唯一ID> 并 iam 登记。', error: false };
      const agents = loadAgents(root).agents || {};
      const tokens = loadTokens(root).tokens || {};
      let reg = '未登记';
      if (agents[id]) reg = 'agents.json 已登记（host=' + agents[id].host + '）';
      else if (tokens[id]) reg = 'tokens.json 已登记（远端）';
      const profile = findSelfProfile(root, id);
      let rel = '';
      if (profile) {
        const kv = selfProfileKv(root, id);
        if (kv.agent_name) rel += '\n显示名: ' + kv.agent_name;
        if (kv.user_name) rel += '\n用户: ' + kv.user_name;
        if (kv.relationship) rel += '\n关系: ' + kv.relationship;
      }
      return { text: '当前智能体身份: ' + id + '\n登记状态: ' + reg + '\n自我档案: ' + (profile || '未写入（本地引擎主机执行 yotta-memory iam ' + id + '）') + rel, error: false };
    }
    if (name === 'profile') {
      const ownerArg = args.owner ? String(args.owner) : '';
      const r = profileCore({ owner: ownerArg || agent, selfAgent: agent });
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

// ---- lan command (autostart management for serve) ----
// Windows dual mechanism: (1) schtasks scheduled task (default, needs permission); (2) non-admin
// (Access denied) auto-fallback to user-level Startup silent autostart (VBS sh.Run <autostart.cmd>,
// 0, False + autostart.cmd; node path process.execPath auto-detected, 0.5.4)
// Linux (v0.6.4): (1) systemd user unit (systemctl --user enable/start, login autostart; --onstart
// additionally runs loginctl enable-linger for boot autostart); (2) auto-fallback to user crontab
// @reboot when no systemd user session is available.
const LAN_TASK_NAME = 'YottaMemoryServe';
const LAN_GEN_MARKER = 'Generated by yotta-memory lan enable';
const LAN_UNIT_NAME = 'yotta-memory-serve.service';
const LAN_CRONTAB_MARKER = '#YTM_LAN:yotta-memory-serve';
function lanTaskRunCmd(opts) {
  const host = opts.host || '0.0.0.0';
  const port = opts.port || 8787;
  // schtasks /tr 不接受多余内嵌引号：路径无空格不加引号，含空格/引号用 \" 转义（0.5.2 修复）
  const q = (p) => /[\s"]/.test(p) ? '\\"' + p.replace(/"/g, '\\"') + '\\"' : p;
  return q(process.execPath) + ' ' + q(__filename) + ' serve --host ' + host + ' --port ' + port;
}

function lanServeArgs(opts) {
  return ['serve', '--host', String(opts.host || '0.0.0.0'), '--port', String(opts.port || 8787)];
}
// generic spawn wrapper: YOTTA_LAN_*_BIN may point to a .js stub (testing/advanced use;
// on Windows run it with the current node interpreter automatically)
function lanSpawn(bin, args, spawnOpts) {
  if (process.platform === 'win32' && /\.js$/i.test(String(bin))) {
    return child_process.spawnSync(process.execPath, [bin].concat(args), spawnOpts);
  }
  return child_process.spawnSync(bin, args, spawnOpts);
}
// platform override for testing/advanced use (YOTTA_LAN_PLATFORM=linux/win32/...)
function lanPlatform() { return process.env.YOTTA_LAN_PLATFORM || process.platform; }
// sh-style single-quote quoting (crontab line is executed via /bin/sh -c)
function shQuote(s) {
  const p = String(s);
  if (!/[\s'"\\$\`]/.test(p)) return p;
  return "'" + p.replace(/'/g, "'\\''") + "'";
}
// systemd ExecStart quoting (systemd's own parse rules: double quotes group, \" escapes a quote,
// \\ escapes a backslash)
function systemdEscapeArg(s) {
  const p = String(s);
  if (!/[\s"\\$;]/.test(p)) return p;
  return '"' + p.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
function lanStartupDir() {
  // 测试/高级用途可用 YOTTA_LAN_STARTUP_DIR 覆盖（默认用户级 Startup 目录，免管理员）
  if (process.env.YOTTA_LAN_STARTUP_DIR) return process.env.YOTTA_LAN_STARTUP_DIR;
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}
function lanAutostartDir() {
  // 产品自有目录 ~/.yottamemory/autostart/（引擎数据目录内，非系统配置）；测试可用 YOTTA_LAN_AUTOSTART_DIR 覆盖
  if (process.env.YOTTA_LAN_AUTOSTART_DIR) return process.env.YOTTA_LAN_AUTOSTART_DIR;
  return path.join(os.homedir(), '.yottamemory', 'autostart');
}
function lanVbsPath() { return path.join(lanStartupDir(), 'yotta-memory-serve.vbs'); }
function lanAutostartCmdPath() { return path.join(lanAutostartDir(), 'yotta-memory-autostart.cmd'); }
function lanLogPath(opts) {
  if (process.env.YOTTA_LAN_LOG_FILE) return process.env.YOTTA_LAN_LOG_FILE;
  return path.join(os.homedir(), '.yottamemory', 'serve-' + (opts.port || 8787) + '.log');
}
function lanAutostartCmdContent(opts) {
  const host = opts.host || '0.0.0.0';
  const port = opts.port || 8787;
  const q = (p) => '"' + String(p).replace(/"/g, '""') + '"';
  // 生成文件用纯 ASCII（避免 cmd/VBS 按系统代码页读取中文注释乱码；VBS 自愈内联同一内容）
  return '@echo off\r\n'
    + 'chcp 65001 >nul\r\n'
    + 'rem ' + LAN_GEN_MARKER + '; remove with: yotta-memory lan disable (English only, keep ASCII)\r\n'
    + q(process.execPath) + ' ' + q(__filename) + ' serve --host ' + host + ' --port ' + port + ' >> ' + q(lanLogPath(opts)) + ' 2>&1\r\n';
}
function lanVbsContent(opts) {
  // v0.6.3 自愈：VBS 内联 autostart.cmd 内容，启动时若 .cmd 缺失/被清理即就地重建，
  // 根治 80070002（wscript 找不到被引用的启动文件）。VBS 写 UTF-16LE，wscript 按 Unicode 读取。
  const cmdContent = lanAutostartCmdContent(opts || {});
  // VBS 字符串字面量不能含原始换行：把 CRLF 编码为 Chr(13) & Chr(10) & 拼接，
  // 生成的 VBS 保持单行合法（否则 wscript 报语法错误，.cmd 重建失败）。
  const vbsCmdLiteral = cmdContent
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\n')
    .split('\n')
    .map(function (seg) {
      // 每段都带引号（VBS 字符串字面量），换行用 Chr(13) & Chr(10) 拼接
      return '"' + seg.replace(/"/g, '""') + '"';
    })
    .join(' & Chr(13) & Chr(10) & ');
  const vbsCmdPath = String(lanAutostartCmdPath()).replace(/"/g, '""');
  const lines = [
    "' " + LAN_GEN_MARKER + '; remove with: yotta-memory lan disable',
    "' v0.6.3 self-heal: always rebuild autostart.cmd from embedded content, then run it (fix 80070002)",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh = CreateObject("WScript.Shell")',
    'cmdPath = "' + vbsCmdPath + '"',
    'On Error Resume Next',
    'Set dir = fso.GetParentFolderName(cmdPath)',
    'If Not fso.FolderExists(dir) Then fso.CreateFolder(dir)',
    'Set f = fso.CreateTextFile(cmdPath, True)',
    'f.Write ' + vbsCmdLiteral,
    'f.Close',
    'sh.Run cmdPath, 0, False',
    '',
  ];
  return lines.join('\r\n') + '\r\n';
}
function lanInstallStartup(opts) {
  fs.mkdirSync(lanAutostartDir(), { recursive: true });
  fs.writeFileSync(lanAutostartCmdPath(), lanAutostartCmdContent(opts), 'utf8');
  fs.mkdirSync(lanStartupDir(), { recursive: true });
  // VBS 用 UTF-16LE+BOM：wscript 按 Unicode 读取，中文路径不乱码（纯 ANSI 读取会按系统代码页误读）
  fs.writeFileSync(lanVbsPath(), '\ufeff' + lanVbsContent(opts), 'utf16le');
}
function lanRemoveStartupFiles() {
  // 只删除带产品标记的生成文件，绝不误删用户自己的 Startup 文件
  const removed = [];
  for (const f of [lanVbsPath(), lanAutostartCmdPath()]) {
    try {
      if (lanFileHasMarker(f)) { fs.unlinkSync(f); removed.push(f); }
    } catch (e) { /* 单个文件失败不阻断其它清理 */ }
  }
  return removed;
}
function lanFileHasMarker(f) {
  try {
    if (!fs.existsSync(f)) return false;
    const buf = fs.readFileSync(f);
    const m8 = Buffer.from(LAN_GEN_MARKER, 'utf8');
    const m16 = Buffer.from(LAN_GEN_MARKER, 'utf16le');
    return buf.indexOf(m8) !== -1 || buf.indexOf(m16) !== -1;
  } catch (e) { return false; }
}
function isSchtasksAccessDenied(e) {
  const msg = String((e && e.stderr) || (e && e.message) || e);
  return /access\s+is\s+denied|access\s+denied|拒绝访问/i.test(msg);
}

// ---- lan Linux (systemd user unit / user crontab @reboot) ----
function lanLinuxSystemdUserDir() {
  // override with YOTTA_LAN_SYSTEMD_USER_DIR for testing/advanced use (default ~/.config/systemd/user)
  if (process.env.YOTTA_LAN_SYSTEMD_USER_DIR) return process.env.YOTTA_LAN_SYSTEMD_USER_DIR;
  const cfg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(cfg, 'systemd', 'user');
}
function lanLinuxUnitPath() { return path.join(lanLinuxSystemdUserDir(), LAN_UNIT_NAME); }
function lanLinuxSystemctlBin() { return process.env.YOTTA_LAN_SYSTEMCTL_BIN || 'systemctl'; }
function lanLinuxLoginctlBin() { return process.env.YOTTA_LAN_LOGINCTL_BIN || 'loginctl'; }
function lanLinuxExecStart(opts) {
  return [systemdEscapeArg(process.execPath), systemdEscapeArg(__filename)].concat(lanServeArgs(opts)).join(' ');
}
function lanLinuxUnitContent(opts) {
  // keep comments ASCII (avoid locale/encoding issues); ExecStart uses systemd's own quote rules
  return [
    '# ' + LAN_GEN_MARKER + '; remove with: yotta-memory lan disable (English only, keep ASCII)',
    '',
    '[Unit]',
    'Description=yotta-memory memory engine (lan autostart)',
    '',
    '[Service]',
    'Type=simple',
    'ExecStart=' + lanLinuxExecStart(opts),
    'Restart=on-failure',
    'RestartSec=3',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}
function lanCrontabBin() { return process.env.YOTTA_LAN_CRONTAB_BIN || 'crontab'; }
function lanCrontabLine(opts) {
  const parts = ['@reboot', shQuote(process.execPath), shQuote(__filename)].concat(lanServeArgs(opts));
  return parts.join(' ') + ' >> ' + shQuote(lanLogPath(opts)) + ' 2>&1 ' + LAN_CRONTAB_MARKER;
}
function lanCrontabRead() {
  try {
    const r = lanSpawn(lanCrontabBin(), ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status === 0) return String(r.stdout || '').split(/\r?\n/).filter(function (l) { return l !== ''; });
  } catch (e) { /* crontab unavailable -> treat as empty */ }
  return [];
}
function lanCrontabWrite(lines) {
  const content = lines.join('\n') + (lines.length ? '\n' : '');
  const r = lanSpawn(lanCrontabBin(), ['-'], { input: content, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(String(r.stderr || r.stdout || '').toString().split(/\r?\n/)[0]);
}
function lanCrontabHasOurLine(lines) {
  return lines.some(function (l) { return l.indexOf(LAN_CRONTAB_MARKER) !== -1; });
}
function lanCrontabWithoutOurLine(lines) {
  return lines.filter(function (l) { return l.indexOf(LAN_CRONTAB_MARKER) === -1; });
}
function lanLinuxHasSystemd() {
  try {
    const r = lanSpawn(lanLinuxSystemctlBin(), ['--user', 'show-environment'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return r.status === 0;
  } catch (e) { return false; }
}
function lanLinuxSystemctl(args) {
  const r = lanSpawn(lanLinuxSystemctlBin(), ['--user'].concat(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  return { status: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
}
function lanLinuxInstallSystemd(opts) {
  const dir = lanLinuxSystemdUserDir();
  fs.mkdirSync(dir, { recursive: true });
  const unit = lanLinuxUnitPath();
  fs.writeFileSync(unit, lanLinuxUnitContent(opts), 'utf8');
  lanLinuxSystemctl(['daemon-reload']);
  const en = lanLinuxSystemctl(['enable', LAN_UNIT_NAME]);
  if (en.status !== 0) throw new Error('systemctl --user enable 失败: ' + en.err.split(/\r?\n/)[0]);
  const st = lanLinuxSystemctl(['start', LAN_UNIT_NAME]);
  if (st.status !== 0) {
    console.error('启动服务失败（已注册，稍后可执行 systemctl --user start yotta-memory-serve.service）: ' + st.err.split(/\r?\n/)[0]);
  }
  if (opts.onstart) {
    try {
      const lr = lanSpawn(lanLinuxLoginctlBin(), ['enable-linger'], { stdio: ['ignore', 'pipe', 'pipe'] });
      if (lr.status === 0) console.log('已启用 lingering（开机即启，无需登录）');
      else console.error('提示: 开机即启需 loginctl enable-linger，当前未生效（' + String(lr.stderr || '').split(/\r?\n/)[0] + '）');
    } catch (e) {
      console.error('提示: 开机即启需 loginctl enable-linger，当前无 loginctl（' + String((e && e.message) || e).split(/\r?\n/)[0] + '）');
    }
  }
  return unit;
}
function lanLinuxRemoveSystemd() {
  // only remove our own marker unit file, never a user's own systemd unit
  const unit = lanLinuxUnitPath();
  if (!fs.existsSync(unit) || !lanFileHasMarker(unit)) return false;
  try { lanLinuxSystemctl(['disable', LAN_UNIT_NAME]); } catch (e) {}
  try { lanLinuxSystemctl(['stop', LAN_UNIT_NAME]); } catch (e) {}
  try { fs.unlinkSync(unit); } catch (e) {}
  try { lanLinuxSystemctl(['daemon-reload']); } catch (e) {}
  return true;
}
function lanLinuxInstallCrontab(opts) {
  const lines = lanCrontabWithoutOurLine(lanCrontabRead());
  lines.push(lanCrontabLine(opts));
  lanCrontabWrite(lines);
  return lanCrontabLine(opts);
}
function lanLinuxRemoveCrontab() {
  const cur = lanCrontabRead();
  const lines = lanCrontabWithoutOurLine(cur);
  if (lines.length === cur.length) return false;
  lanCrontabWrite(lines);
  return true;
}
function cmdLanLinuxEnable(opts) {
  if (lanLinuxHasSystemd()) {
    try {
      const unit = lanLinuxInstallSystemd(opts);
      console.log('已注册开机自启: systemd 用户单元 ' + LAN_UNIT_NAME);
      console.log('单元文件: ' + unit);
      console.log('备注: 登录后自动启动（systemctl --user）；如需现在运行请执行 yotta-memory serve');
      if (!opts.onstart) console.log('提示: 如需开机即启（无需登录），请用 --onstart 重新执行 yotta-memory lan enable');
      return;
    } catch (e) {
      const msg = String((e && e.message) || e).split(/\r?\n/)[0];
      console.error('systemd 注册失败: ' + msg);
      console.log('自动改用用户 crontab @reboot 自启...');
    }
  } else {
    console.log('未检测到 systemd 用户会话，改用用户 crontab @reboot 自启...');
  }
  try {
    const line = lanLinuxInstallCrontab(opts);
    console.log('已启用用户 crontab @reboot 自启');
    console.log('启动命令: ' + line);
    console.log('日志: ' + lanLogPath(opts));
    console.log('备注: 开机时自动启动；如需现在运行请执行 yotta-memory serve');
  } catch (e2) {
    console.error('crontab 注册失败: ' + String((e2 && e2.message) || e2).split(/\r?\n/)[0]);
    console.error('请手动配置开机自启（如 ~/.config/autostart/*.desktop 或系统服务），或直接运行 yotta-memory serve');
    process.exit(1);
  }
}
function cmdLanLinuxDisable() {
  let removedAny = false;
  let sawError = false;
  try {
    if (lanLinuxRemoveSystemd()) { console.log('已移除 systemd 用户单元 ' + LAN_UNIT_NAME); removedAny = true; }
  } catch (e) { console.error('移除 systemd 单元失败: ' + String((e && e.message) || e).split(/\r?\n/)[0]); sawError = true; }
  try {
    if (lanLinuxRemoveCrontab()) { console.log('已移除 crontab @reboot 自启'); removedAny = true; }
  } catch (e) { console.error('移除 crontab 自启失败: ' + String((e && e.message) || e).split(/\r?\n/)[0]); sawError = true; }
  if (!removedAny && !sawError) console.log('未启用: 未发现任何自启配置（systemd 单元与 crontab 均不存在）');
  if (sawError) process.exit(1);
}
function cmdLanLinuxStatus() {
  let any = false;
  const unit = lanLinuxUnitPath();
  const unitExists = fs.existsSync(unit) && lanFileHasMarker(unit);
  if (unitExists) {
    any = true;
    console.log('systemd 用户单元 ' + LAN_UNIT_NAME + ': 已注册');
    try {
      const en = lanLinuxSystemctl(['is-enabled', LAN_UNIT_NAME]);
      if (en.status === 0) console.log('  启用状态: ' + String(en.out).trim());
    } catch (e) {}
    try {
      const ac = lanLinuxSystemctl(['is-active', LAN_UNIT_NAME]);
      if (ac.status === 0) console.log('  运行状态: ' + String(ac.out).trim());
    } catch (e) {}
    console.log('  单元文件: ' + unit);
  } else {
    console.log('systemd 用户单元 ' + LAN_UNIT_NAME + ': 未注册');
  }
  const lines = lanCrontabRead();
  if (lanCrontabHasOurLine(lines)) {
    any = true;
    console.log('crontab @reboot: 已启用');
    for (const l of lines) if (l.indexOf(LAN_CRONTAB_MARKER) !== -1) console.log('  ' + l.trim());
  } else {
    console.log('crontab @reboot: 未启用');
  }
  if (!any) console.log('未启用任何开机自启（可用 yotta-memory lan enable 注册）');
}
function cmdLanWinEnable(opts) {
  if (process.platform !== 'win32') {
    console.error('lan 命令当前仅支持 Windows（计划任务 / Startup 自启）；本机平台: ' + process.platform);
    process.exit(2);
  }
  const trigger = opts.onstart ? 'onstart' : 'onlogon';
  const tr = lanTaskRunCmd(opts);
  try {
    child_process.execFileSync('schtasks', ['/create', '/tn', LAN_TASK_NAME, '/tr', tr, '/sc', trigger, '/f'], { stdio: 'inherit' });
    console.log('已注册开机自启: 计划任务 ' + LAN_TASK_NAME + '（触发器 ' + trigger + '）');
    console.log('运行命令: ' + tr);
    console.log('备注: 服务不会立刻启动，需重启/重新登录后自动启动；如需现在运行请执行 yotta-memory serve');
    return;
  } catch (e) {
    const firstLine = String((e && e.stderr) || (e && e.message) || e).split(/\r?\n/)[0];
    if (isSchtasksAccessDenied(e)) console.error('计划任务注册被拒绝（当前用户非管理员，Access denied）: ' + firstLine);
    else console.error('计划任务注册失败（当前环境不可用计划任务）: ' + firstLine);
    console.log('自动改用用户级 Startup 静默自启（免管理员）...');
    try {
      lanInstallStartup(opts);
    } catch (e2) {
      console.error('写 Startup 自启失败: ' + String((e2 && e2.message) || e2).split(/\r?\n/)[0]);
      console.error('请用管理员终端执行 yotta-memory lan enable，或将以下命令手动加入启动项: ' + tr);
      process.exit(1);
    }
    console.log('已启用用户级 Startup 静默自启（无需管理员）');
    console.log('启动脚本: ' + lanVbsPath());
    console.log('启动命令: ' + lanAutostartCmdPath());
    console.log('日志: ' + lanLogPath(opts));
    console.log('备注: 服务不会立刻启动，需重新登录后自动启动；如需现在运行请执行 yotta-memory serve');
    console.log('提示: 如需改回计划任务，请用管理员终端重新执行 yotta-memory lan enable');
    return;
  }
}
function cmdLanWinDisable() {
  if (process.platform !== 'win32') {
    console.error('lan 命令当前仅支持 Windows（计划任务 / Startup 自启）；本机平台: ' + process.platform);
    process.exit(2);
  }
  let sawError = false;
  let removedAny = false;
  try {
    child_process.execFileSync('schtasks', ['/delete', '/tn', LAN_TASK_NAME, '/f'], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('已移除开机自启计划任务 ' + LAN_TASK_NAME);
    removedAny = true;
  } catch (e) {
    const msg = String((e && e.stderr) || (e && e.message) || e);
    if (!/cannot find the (path|file)|没有找到|找不到|不存在/i.test(msg)) {
      console.error('移除计划任务失败: ' + msg.split(/\r?\n/)[0]);
      sawError = true;
    }
  }
  for (const f of lanRemoveStartupFiles()) {
    console.log('已移除 Startup 自启文件: ' + f);
    removedAny = true;
  }
  if (!removedAny && !sawError) console.log('未启用: 未发现任何自启配置（计划任务与 Startup 文件均不存在）');
  if (sawError) process.exit(1);
}
function cmdLanWinStatus() {
  if (process.platform !== 'win32') {
    console.log('lan 命令当前仅支持 Windows（计划任务 / Startup 自启）；本机平台: ' + process.platform);
    return;
  }
  let taskFound = false;
  try {
    const out = child_process.execFileSync('schtasks', ['/query', '/tn', LAN_TASK_NAME, '/fo', 'LIST', '/v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    taskFound = true;
    console.log('计划任务 ' + LAN_TASK_NAME + ': 已启用');
    const re = /^(状态|Status)\s*:\s*(.+)$/;
    for (const line of String(out).split(/\r?\n/)) {
      const m = re.exec(line.trim());
      if (m) console.log('  ' + m[1] + ': ' + m[2]);
    }
  } catch (e) {
    console.log('计划任务 ' + LAN_TASK_NAME + ': 未启用');
  }
  const vbsOk = lanFileHasMarker(lanVbsPath());
  const cmdOk = lanFileHasMarker(lanAutostartCmdPath());
  if (vbsOk && cmdOk) {
    console.log('Startup 静默自启（免管理员）: 已启用');
    console.log('  启动脚本: ' + lanVbsPath());
    console.log('  启动命令: ' + lanAutostartCmdPath());
  } else if (vbsOk || cmdOk) {
    console.log('Startup 静默自启: 部分残留（建议执行 yotta-memory lan disable 后重新 lan enable）');
  } else {
    console.log('Startup 静默自启（免管理员）: 未启用');
  }
  if (!taskFound && !vbsOk && !cmdOk) console.log('未启用任何开机自启（可用 yotta-memory lan enable 注册）');
}

function cmdLanEnable(opts) {
  const p = lanPlatform();
  if (p === 'win32') return cmdLanWinEnable(opts);
  if (p === 'linux') return cmdLanLinuxEnable(opts);
  console.error('lan 命令当前仅支持 Windows / Linux；本机平台: ' + p);
  process.exit(2);
}
function cmdLanDisable() {
  const p = lanPlatform();
  if (p === 'win32') return cmdLanWinDisable();
  if (p === 'linux') return cmdLanLinuxDisable();
  console.error('lan 命令当前仅支持 Windows / Linux；本机平台: ' + p);
  process.exit(2);
}
function cmdLanStatus() {
  const p = lanPlatform();
  if (p === 'win32') return cmdLanWinStatus();
  if (p === 'linux') return cmdLanLinuxStatus();
  console.log('lan 命令当前仅支持 Windows / Linux；本机平台: ' + p);
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
    '  yotta-memory remember <type> <subject> <statement> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]   写入记忆（--source 记录来源；--weight 重要性权重默认 1.0 去重取 max；--verify 写后回读校验；--no-hint 关闭类型启发式提示）',
    '  yotta-memory profile [--owner <id>]    生成用户画像（聚合 private/<owner>/ 原文，零推断，写 profile.md）',
    '  yotta-memory context [--limit N] [--owner <id>] [--budget N]  生成开工上下文包（身份+铁律+画像+近期记忆+边界+承诺；--budget 近期记忆字符预算，0=不限）',
    '  yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]  检索（索引+TF，读取分区；--agent 仅表示“以该身份检索/模拟”，跨智能体私密读取需 --unsafe / 授权）',
    '  yotta-memory forget <文件或文件名>         删除一条记忆',
    '  yotta-memory archive [--days 180] [--threshold 0.4]  归档（盖棺分+年龄）',
    '  yotta-memory reindex                       重建索引',
    '  yotta-memory export [--out 文件.json]      导出全部记忆',
    '  yotta-memory import <文件.json>            导入记忆',
    '  yotta-memory whoami                       查看当前智能体身份与登记状态（读 YOTTA_AGENT_ID / X-Agent-Id，不猜不默认）',
    '  yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]  登记本智能体唯一身份并自动落自我档案（agents.json；ID 必须唯一）',
    '  yotta-memory token new --agent <id> [--force]  生成/重置某智能体访问 token（同 ID 已被其它来源占用需 --force 覆盖）',
    '  yotta-memory token list                   列出已登记智能体',
    '  yotta-memory token revoke --agent <id>    吊销某智能体 token',
    '  yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio]  启动 MCP 记忆引擎（streamable HTTP；--stdio 本地零进程模式）',
    '  yotta-memory lan enable [--onstart] | disable | status  开机自启管理（Windows：计划任务，默认 ONLOGON，非管理员自动降级用户级 Startup 静默自启；Linux：systemd 用户单元，不可用时自动降级用户 crontab @reboot）',
    '  yotta-memory --version                    版本',
    '',
    '类型: FACT(公共共享) / PREF(偏好) / BOUND(边界) / COMMIT(承诺)',
    '环境变量: YOTTA_MEMORY_HOME 临时覆盖用户级位置; YOTTA_AGENT_ID/AGENT_ID 当前 agent 标识（本机声明身份用；私密记忆必须有 owner）',
    '隔离: 公共 FACT 在 facts/；私密 PREF/BOUND/COMMIT 物理分目录 private/<agent_id>/<type>/，禁止 shell 直读写记忆库，一律走本命令',
    '远端接入: MCP url http://<主机IP>:8787/mcp；请求头 Authorization: Bearer <token> + X-Agent-Id: <id>',
    '',
  ].join('\n'));
}
function main() {
  const args = process.argv.slice(2);
  if (!args.length) { usage(); return; }
  const opts = {};
  const positional = [];
  const valueOpts = new Set(['--type', '--limit', '--days', '--out', '--owner', '--agent', '--threshold', '--scope', '--host', '--port', '--dir', '--name', '--user', '--relationship', '--source', '--weight', '--budget']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--version' || a === '-v') { console.log(VERSION); return; }
    if (a === '--help' || a === '-h') { usage(); return; }
    if (a === '--project') opts.project = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--unsafe') opts.unsafe = true;
    else if (a === '--no-auth') opts.noAuth = true;
    else if (a === '--stdio') opts.stdio = true;
    else if (a === '--onstart') opts.onstart = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--verify') opts.verify = true;
    else if (a === '--no-hint') opts.noHint = true;
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
      else if (a === '--name') opts.name = v;
      else if (a === '--user') opts.user = v;
      else if (a === '--relationship') opts.relationship = v;
      else if (a === '--source') opts.source = v;
      else if (a === '--weight') opts.weight = parseFloat(v);
      else if (a === '--budget') opts.budget = parseInt(v, 10) || 0;
    } else if (a.startsWith('--')) {
      console.error('未知选项: ' + a);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  const first = positional[0];
  const rest = positional.slice(1);
  switch (first) {
    case 'init': cmdInit(opts); break;
    case 'whoami': cmdWhoami(); break;
    case 'iam': cmdIam(rest[0], opts); break;
    case 'config': {
      const sub = rest[0];
      if (sub === 'set') cmdConfigSet(rest[1], rest[2]);
      else if (sub === 'get') cmdConfigGet();
      else { console.error('config 子命令: set memory_home <目录> / get'); process.exit(2); }
      break;
    }
    case 'remember': cmdRemember(rest[0], rest[1], rest[2], opts); break;
    case 'recall': cmdRecall(rest[0] || null, opts); break;
    case 'forget': cmdForget(rest[0]); break;
    case 'archive': cmdArchive(opts); break;
    case 'reindex': cmdReindex(); break;
    case 'profile': cmdProfile(opts); break;
    case 'context': cmdContext(opts); break;
    case 'export': cmdExport(opts.out); break;
    case 'import': cmdImport(rest[0]); break;
    case 'token': {
      const sub = rest[0];
      if (sub === 'new') cmdTokenNew(opts.agent, opts);
      else if (sub === 'list') cmdTokenList();
      else if (sub === 'revoke') cmdTokenRevoke(opts.agent);
      else { console.error('token 子命令: new --agent <id> / list / revoke --agent <id>'); process.exit(2); }
      break;
    }
    case 'serve': cmdServe(opts); break;
    case 'lan': {
      const sub = rest[0];
      if (sub === 'enable') cmdLanEnable(opts);
      else if (sub === 'disable') cmdLanDisable();
      else if (sub === 'status') cmdLanStatus();
      else { console.error('lan 子命令: enable [--onstart] / disable / status'); process.exit(2); }
      break;
    }
    default:
      if (!first) { usage(); return; }
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
  memoryRoots: memoryRoots,
  rememberCore: rememberCore,
  recallCore: recallCore,
  profileCore: profileCore,
  contextCore: contextCore,
  importanceScore: importanceScore,
  forgetCore: forgetCore,
  archiveCore: archiveCore,
  mcpTools: mcpTools,
  callTool: callTool,
  handleMessage: handleMessage,
  loadConfig: loadConfig,
  saveConfig: saveConfig,
  loadTokens: loadTokens,
  saveTokens: saveTokens,
  collectEntryFiles: collectEntryFiles,
  migrateLayout: migrateLayout,
  typeSubdir: typeSubdir,
  lanTaskRunCmd: lanTaskRunCmd,
  lanStartupDir: lanStartupDir,
  lanAutostartDir: lanAutostartDir,
  lanVbsPath: lanVbsPath,
  lanAutostartCmdPath: lanAutostartCmdPath,
  lanLogPath: lanLogPath,
  lanAutostartCmdContent: lanAutostartCmdContent,
  lanVbsContent: lanVbsContent,
  lanInstallStartup: lanInstallStartup,
  lanRemoveStartupFiles: lanRemoveStartupFiles,
  lanFileHasMarker: lanFileHasMarker,
  isSchtasksAccessDenied: isSchtasksAccessDenied,
  lanServeArgs: lanServeArgs,
  lanSpawn: lanSpawn,
  lanPlatform: lanPlatform,
  shQuote: shQuote,
  systemdEscapeArg: systemdEscapeArg,
  lanLinuxSystemdUserDir: lanLinuxSystemdUserDir,
  lanLinuxUnitPath: lanLinuxUnitPath,
  lanLinuxSystemctlBin: lanLinuxSystemctlBin,
  lanLinuxLoginctlBin: lanLinuxLoginctlBin,
  lanLinuxExecStart: lanLinuxExecStart,
  lanLinuxUnitContent: lanLinuxUnitContent,
  lanCrontabBin: lanCrontabBin,
  lanCrontabLine: lanCrontabLine,
  lanCrontabRead: lanCrontabRead,
  lanCrontabWrite: lanCrontabWrite,
  lanCrontabHasOurLine: lanCrontabHasOurLine,
  lanCrontabWithoutOurLine: lanCrontabWithoutOurLine,
  lanLinuxHasSystemd: lanLinuxHasSystemd,
  lanLinuxSystemctl: lanLinuxSystemctl,
  lanLinuxInstallSystemd: lanLinuxInstallSystemd,
  lanLinuxRemoveSystemd: lanLinuxRemoveSystemd,
  lanLinuxInstallCrontab: lanLinuxInstallCrontab,
  lanLinuxRemoveCrontab: lanLinuxRemoveCrontab,
  cmdLanWinEnable: cmdLanWinEnable,
  cmdLanWinDisable: cmdLanWinDisable,
  cmdLanWinStatus: cmdLanWinStatus,
  cmdLanLinuxEnable: cmdLanLinuxEnable,
  cmdLanLinuxDisable: cmdLanLinuxDisable,
  cmdLanLinuxStatus: cmdLanLinuxStatus,

};
