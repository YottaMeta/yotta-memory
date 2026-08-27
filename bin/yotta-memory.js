#!/usr/bin/env node
// yotta-memory（元忆）: 有权限边界的文件式智能体记忆 CLI（零依赖）
// v0.4.0 新增：lan（Windows 计划任务开机自启 serve）/ init --dir（显式指定位置）/ serve --stdio（本地零进程模式）/ MCP 工具补 reindex/export/import
// v0.5.0 新增：隐私硬隔离——私密物理分目录 private/<agent_id>/{prefs,bounds,commits}/ + 关闭 --agent 越权读 + 私密写跨智能体需 --unsafe + 禁 shell 直读写（文档红线）
// v0.4.2 新增：iam/whoami 智能体身份自注册（agents.json 唯一性）+ 自我档案 PREF + 私密记忆须声明 owner
// v0.5.3 新增：CLI 选项可前置（--agent 等允许放在子命令前，不再误报"未知命令"）/ lan enable 成功补"服务不会立刻启动"提示（v0.5.2 lan 引号修复无回归）
// v0.5.4 新增：lan enable 在非管理员（schtasks Access denied）时自动降级为用户级 Startup 静默自启（VBS sh.Run 窗口0 + autostart.cmd，node 路径 process.execPath 自动探测）；lan disable/status 同时管理计划任务与 Startup 双机制
// v0.6.0 新增：profile（用户画像聚合，零推断）/ context（开工上下文包）/ iam 扩展（--name/--user/--relationship）/ remember --verify（写后回读）与 --no-hint（关闭类型启发式提示）+ SKILL「记忆守则」
// v0.6.1 新增：context --budget（token 预算，近记忆按剩余预算放行）/ context 内嵌「多智能体接入铁律」段 / remember --source/--weight（来源 + 重要性权重，去重 weight 取 max）/ 近期记忆排序融合 importance（confidence×recency+updated+weight+immutable）
// v0.6.3 修复：lan 开机自启 VBS 自愈——VBS 内联 autostart.cmd 内容，启动时自动重建 .cmd（根治 80070002：wscript 找不到被引用启动文件）
// v0.6.4 新增：lan 命令扩展 Linux——systemd 用户单元（systemctl --user enable/start，登录自启；--onstart 附加 loginctl enable-linger 开机即启）/ systemd 不可用时自动降级用户 crontab @reboot；lanPlatform 测试钩子（YOTTA_LAN_PLATFORM）
// v0.6.5 修复：recall/context 对同一文件显示 2 条——projectRoot 与 userRoot 指向同一目录（如 cwd=home 或其父）时同一索引被遍历两次；新增 memoryRoots() 唯一化根，hasGrant/recallCore/forgetCore/cmdReindex/contextCore 统一走 memoryRoots()
// v0.7.0 新增：私密区机制级加密（AES-256-GCM 信封加密 + PBKDF2 主密钥 + 恢复钥匙）/ 每 owner 加密索引 / 用户查看平台 yotta-memory view / migrate 迁移 / reset-password / key 授权 / context 收工纪律 / init 新建默认加密（--no-encrypt 降级）
// v0.8.0 新增：自我学习/自我进化/自我提升——语义检索（同义词/拼音/字段加权/模糊 + 可选 embedding 插件协议预留）/ feedback 显式反馈闭环（weight/confidence/feedback_net 演化）/ maintain 规则层自组织（统一效用分 utility + 归档/遗忘/去重，默认 dry-run）/ distill 心理日志蒸馏（启发式统计/主题画像/知识地图 + 可选 --model）
// v0.6.2 修复：remember --verify 写后回读改为直查索引 + 权限判定 + 召回匹配性（不再依赖 recall top-N 排序，消除泛化 subject 下偶发误报「回读未命中」）
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const child_process = require('child_process');

const VERSION = '0.8.3';
const TYPES = ['FACT', 'PREF', 'BOUND', 'COMMIT'];
const TYPE_DIRS = { FACT: 'facts', PREF: 'prefs', BOUND: 'bounds', COMMIT: 'commits' };
const PUBLIC_DIR = 'facts';
const PRIVATE_DIR = 'private';
const PRIVATE_LEAF = ['prefs', 'bounds', 'commits'];
const ARCHIVE_DIR = '.archive';
const INDEX_FILE = 'index.json';
const PRIVATE_TYPES = ['PREF', 'BOUND', 'COMMIT'];
const FIELD_ORDER = ['type', 'subject', 'statement', 'confidence', 'created', 'updated', 'tags', 'immutable', 'scope', 'owner', 'source', 'weight', 'access_count', 'last_accessed', 'feedback_net'];
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
  const m = {};
  const add = function (tok, w) { if (tok) m[tok] = (m[tok] || 0) + w; };
  const subj = String(subject || '');
  const stmt = String(statement || '');
  const tagArr = Array.isArray(tags) ? tags : parseTags(tags);
  // v0.8.0 字段加权：subject × 3 / tags × 2 / statement × 1
  for (const t of tokenize(subj)) add(t, 3);
  for (const t of tokenize(stmt)) add(t, 1);
  for (const t of tokenize(tagArr.join(' '))) add(t, 2);
  // v0.8.0 拼音 token（py: 全拼 / pyi: 首字母），命中按 0.4 权重（去重防长文本重复字虚高）
  for (const t of new Set(pinyinTokens(subj + ' ' + stmt + ' ' + tagArr.join(' ')))) add(t, 0.4);
  return m;
}
// ---- v0.8.0 自我学习：拼音表 + 同义词表 + 语义匹配（零依赖内置数据）----
function loadPinyinTable() {
  try {
    const p = path.join(__dirname, '..', 'references', 'pinyin-common.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) || {};
  } catch (e) { return {}; }
}
const PINYIN_TABLE = loadPinyinTable();
// 同义词组：同组内互相视为同义（查询侧扩展，命中按 0.5 权重）
const SYNONYM_GROUPS = [
  ['记', '记住', '记忆', '记录', '铭记'],
  ['忘', '忘记', '遗忘', '忘掉'],
  ['读', '读取', '检索', '查询', '搜索'],
  ['写', '写入', '记录', '保存', '存储'],
  ['偏好', '喜好', '喜欢', '偏爱'],
  ['承诺', '保证', '约定'],
  ['收工', '结束', '完成', '完毕'],
  ['归档', '封存', '存档'],
  ['删除', '移除', '去掉'],
  ['更新', '修改', '刷新'],
  ['边界', '红线', '禁区', '界限'],
  ['画像', '档案', 'profile'],
  ['命令', '指令', 'cli'],
  ['记忆', 'memory', '记忆库']
];
function synonymSet(token) {
  const out = new Set();
  for (const g of SYNONYM_GROUPS) {
    if (g.indexOf(token) !== -1) { for (const w of g) out.add(w); }
  }
  return out;
}
function pinyinOf(ch) {
  const arr = PINYIN_TABLE[ch];
  if (!arr || !arr.length) return null;
  return arr[0];
}
// 中文字符串 -> 拼音 token：全拼 bigram 'py:yueyong' + 首字母 bigram 'pyi:yy'
function pinyinTokens(s) {
  const out = [];
  const han = String(s || '').match(/[\u4e00-\u9fa5]+/g);
  if (!han) return out;
  const all = han.join('');
  if (all.length === 1) {
    const p = pinyinOf(all);
    if (p) { out.push('py:' + p); out.push('pyi:' + p[0]); }
    return out;
  }
  let initials = '';
  for (let i = 0; i < all.length; i++) { const p = pinyinOf(all[i]); if (p) initials += p[0]; }
  for (let i = 0; i < all.length - 1; i++) {
    const p1 = pinyinOf(all[i]), p2 = pinyinOf(all[i + 1]);
    if (p1 && p2) out.push('py:' + p1 + p2);
  }
  for (let i = 0; i < initials.length - 1; i++) out.push('pyi:' + initials.slice(i, i + 2));
  return out;
}
function editDistance(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (!la) return lb; if (!lb) return la;
  if (Math.abs(la - lb) > 2) return 3;
  let prev = [];
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[lb];
}
// 语义匹配：精确(1.0×，字段加权已入 tokens) / 同义(0.5×) / 拼音(0.4×) / 子串兜底 / 模糊(0.3×)
function semanticMatch(entry, query, wantDetail) {
  const q = String(query || '').toLowerCase();
  const qtoks = tokenize(q);
  const qpy = pinyinTokens(q);
  const toks = entry.tokens || {};
  const hay = ((entry.subject || '') + ' ' + (entry.statement || '') + ' ' + (entry.tags || []).join(' ')).toLowerCase();
  let score = 0;
  const detail = [];
  const qset = new Set(qtoks);
  for (const tt of qtoks) {
    if (toks[tt]) { score += toks[tt]; if (wantDetail) detail.push('精确:' + tt + '(+' + round3(toks[tt]) + ')'); }
  }
  const ext = new Set();
  for (const tt of qtoks) { const s = synonymSet(tt); for (const w of s) ext.add(w); }
  for (const w of ext) {
    if (toks[w] && !qset.has(w)) { score += 0.5 * toks[w]; if (wantDetail) detail.push('同义:' + w + '(+' + round3(0.5 * toks[w]) + ')'); }
  }
  for (const t of qpy) {
    if (toks[t]) { score += 0.4 * toks[t]; if (wantDetail) detail.push('拼音:' + t + '(+' + round3(0.4 * toks[t]) + ')'); }
  }
  // 查询为拼音（拉丁 token）时，匹配条目侧 py:/pyi: token（去前缀）
  for (const tt of qtoks) {
    if (/^[a-z]+$/.test(tt)) {
      if (toks['py:' + tt]) { score += 0.4 * toks['py:' + tt]; if (wantDetail) detail.push('拼音:' + tt + '(+' + round3(0.4 * toks['py:' + tt]) + ')'); }
      if (toks['pyi:' + tt]) { score += 0.4 * toks['pyi:' + tt]; if (wantDetail) detail.push('拼音首字母:' + tt + '(+' + round3(0.4 * toks['pyi:' + tt]) + ')'); }
      // 首字母串（如 yyyd）拆 bigram 匹配 pyi: token
      if (tt.length >= 3) {
        for (let i = 0; i < tt.length - 1; i++) {
          const bg = tt.slice(i, i + 2);
          if (toks['pyi:' + bg]) { score += 0.4 * toks['pyi:' + bg]; if (wantDetail) detail.push('拼音首字母:' + bg + '(+' + round3(0.4 * toks['pyi:' + bg]) + ')'); }
        }
      }
    }
  }
  if (score === 0 && hay.indexOf(q) !== -1) { score = 1; if (wantDetail) detail.push('子串命中'); }
  if (score === 0) {
    const longQtoks = qtoks.filter(function (t) { return t.length >= 4; });
    const keys = Object.keys(toks).filter(function (k) { return k.length >= 4 && k.indexOf(':') === -1; });
    outer:
    for (const t of longQtoks) {
      for (const k of keys) {
        if (Math.abs(k.length - t.length) <= 2 && editDistance(k, t) <= 2) {
          score += 0.3 * toks[k];
          if (wantDetail) detail.push('模糊:' + t + '~' + k + '(+' + round3(0.3 * toks[k]) + ')');
          break outer;
        }
      }
    }
  }
  return { score: score, detail: detail };
}
function round3(n) { return Math.round(n * 1000) / 1000; }
// ---- v0.8.0 自我进化：统一效用分（盖棺分）----
function feedbackNetOf(meta) { return parseInt(meta.feedback_net || '0', 10) || 0; }
function utilityScore(meta) {
  const conf = Math.min(Math.max(parseFloat(meta.confidence || 1.0) || 1.0, 0), 1);
  const acc = parseInt(meta.access_count || '0', 10) || 0;
  const fb = feedbackNetOf(meta);
  const usageScore = 0.5 * (Math.min(acc, 20) / 20) + 0.5 * (fb / (1 + Math.abs(fb)));
  const last = meta.last_accessed || meta.created || '';
  let recencyScore = 0;
  if (last) {
    const d = daysBetween(last, today());
    recencyScore = Math.max(0, 1 - d / 365);
  }
  const typeScore = ({ BOUND: 1.0, COMMIT: 0.9, PREF: 0.8, FACT: 0.6 })[String(meta.type || 'FACT').toUpperCase()] || 0.6;
  let structureScore = 0;
  if (meta.source) structureScore += 0.2;
  const tags = parseTags(meta.tags);
  if (tags.length) structureScore += 0.3;
  if (meta.subject) structureScore += 0.2;
  if (meta.confidence !== undefined && meta.confidence !== null && meta.confidence !== '') structureScore += 0.1;
  structureScore = Math.min(structureScore, 1.0);
  const w = parseFloat(meta.weight || '1.0');
  const weight = (w > 0 ? w : 1.0);
  return ((0.30 * conf) + (0.25 * usageScore) + (0.20 * recencyScore) + (0.15 * typeScore) + (0.10 * structureScore)) * weight;
}
// utility 分项明细（explain / 审计用）
function utilityBreakdown(meta) {
  const conf = Math.min(Math.max(parseFloat(meta.confidence || 1.0) || 1.0, 0), 1);
  const acc = parseInt(meta.access_count || '0', 10) || 0;
  const fb = feedbackNetOf(meta);
  const usageScore = 0.5 * (Math.min(acc, 20) / 20) + 0.5 * (fb / (1 + Math.abs(fb)));
  const last = meta.last_accessed || meta.created || '';
  let recencyScore = 0;
  if (last) { const d = daysBetween(last, today()); recencyScore = Math.max(0, 1 - d / 365); }
  const typeScore = ({ BOUND: 1.0, COMMIT: 0.9, PREF: 0.8, FACT: 0.6 })[String(meta.type || 'FACT').toUpperCase()] || 0.6;
  let structureScore = 0;
  if (meta.source) structureScore += 0.2;
  const tags = parseTags(meta.tags);
  if (tags.length) structureScore += 0.3;
  if (meta.subject) structureScore += 0.2;
  if (meta.confidence !== undefined && meta.confidence !== null && meta.confidence !== '') structureScore += 0.1;
  structureScore = Math.min(structureScore, 1.0);
  const w = parseFloat(meta.weight || '1.0');
  const weight = (w > 0 ? w : 1.0);
  return {
    confidence: round3(0.30 * conf), usage: round3(0.25 * usageScore), recency: round3(0.20 * recencyScore),
    type: round3(0.15 * typeScore), structure: round3(0.10 * structureScore), weight: round3(weight),
    total: round3(((0.30 * conf) + (0.25 * usageScore) + (0.20 * recencyScore) + (0.15 * typeScore) + (0.10 * structureScore)) * weight)
  };
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
      const m = f.match(/^\d{4}-\d{2}-\d{2}-(\d{4})\.md(\.enc)?$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return String(max + 1).padStart(4, '0');
}


// ================= v0.7.0 加密（AES-256-GCM 信封加密 + PBKDF2 主密钥 + 恢复钥匙）=================
const ENC_MAGIC = 'YTMENC1';
const IDX_MAGIC = 'YTMIDX1';
const KEY_MAGIC = 'YTMKEY1';
const KEYS_DIR = 'keys';
const KEY_CACHE_DIR = 'cache';
const ENC_INDEX_FILE = 'index.enc';
const ENC_SUFFIX = '.enc';
const PBKDF2_ITER = 600000;
const GCM_NONCE = 12;
const GCM_TAG = 16;
const AES_ALGO = 'aes-256-gcm';

function encKeysDir(root) { return path.join(root, KEYS_DIR); }
function encSaltPath(root) { return path.join(encKeysDir(root), 'salt'); }
function encOwnerKeyPath(root, id) { return path.join(encKeysDir(root), id + '.key.enc'); }
function encOwnerRecPath(root, id) { return path.join(encKeysDir(root), id + '.key.recovery'); }
function encRecoveryEncPath(root) { return path.join(encKeysDir(root), 'recovery.key.enc'); }
function encCacheDir(root) { return path.join(encKeysDir(root), KEY_CACHE_DIR); }
function encCachePath(root, id) { return path.join(encCacheDir(root), id + '.key'); }
function isEncrypted(root) { return fs.existsSync(encKeysDir(root)); }
function isEncFile(fp) { return String(fp).slice(-ENC_SUFFIX.length) === ENC_SUFFIX; }
function ownerFromPrivatePath(root, fp) {
  const rel = path.relative(root, fp).replace(/\\/g, '/');
  const seg = rel.split('/');
  if (seg[0] === PRIVATE_DIR && seg[1]) return seg[1];
  return '';
}
function collectOwners(root) {
  const pdir = path.join(root, PRIVATE_DIR);
  if (!fs.existsSync(pdir)) return [];
  return fs.readdirSync(pdir).filter(function (id) {
    try { return fs.statSync(path.join(pdir, id)).isDirectory(); } catch (e) { return false; }
  });
}
function ensureKeysDir(root) { fs.mkdirSync(encCacheDir(root), { recursive: true }); }
// owner 来源联合：private/<owner>/ 目录 + keys/*.key.enc（只授权未写记忆时 owner 只在 keys/）
function keyOwners(root) {
  const set = new Set();
  for (const o of collectOwners(root)) set.add(o);
  const kd = encKeysDir(root);
  if (fs.existsSync(kd)) {
    for (const f of fs.readdirSync(kd)) {
      if (f === 'recovery.key.enc') continue;
      const m = /^(.+)\.key\.enc$/.exec(f);
      if (m) set.add(m[1]);
    }
  }
  return Array.from(set);
}
function aesEncryptBytes(key, buf, aad) {
  const nonce = crypto.randomBytes(GCM_NONCE);
  const c = crypto.createCipheriv(AES_ALGO, key, nonce);
  if (aad) c.setAAD(aad);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([nonce, c.getAuthTag(), ct]);
}
function aesDecryptBytes(key, env, aad) {
  if (!env || env.length < GCM_NONCE + GCM_TAG) throw new Error('密文数据损坏');
  const nonce = env.slice(0, GCM_NONCE);
  const tag = env.slice(GCM_NONCE, GCM_NONCE + GCM_TAG);
  const ct = env.slice(GCM_NONCE + GCM_TAG);
  const d = crypto.createDecipheriv(AES_ALGO, key, nonce);
  if (aad) d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
function deriveUmk(password, salt) {
  return crypto.pbkdf2Sync(Buffer.from(String(password), 'utf8'), salt, PBKDF2_ITER, 32, 'sha256');
}
function loadSalt(root) {
  const p = encSaltPath(root);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
function initEncryptionCore(root, password, recoveryKeyIn) {
  ensureKeysDir(root);
  const salt = crypto.randomBytes(16);
  fs.writeFileSync(encSaltPath(root), salt);
  const umk = deriveUmk(password, salt);
  const rk = recoveryKeyIn ? Buffer.from(String(recoveryKeyIn), 'base64') : crypto.randomBytes(32);
  if (rk.length !== 32) throw new Error('恢复钥匙须为 32 字节（base64）');
  fs.writeFileSync(encRecoveryEncPath(root), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(umk, rk, Buffer.from('recovery', 'utf8'))]));
  return { umk: umk, rk: rk, salt: salt };
}
function unwrapRecoveryEnc(root, umk) {
  const p = encRecoveryEncPath(root);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.slice(0, KEY_MAGIC.length).toString('utf8') !== KEY_MAGIC) throw new Error('恢复钥匙文件格式错误');
  return aesDecryptBytes(umk, buf.slice(KEY_MAGIC.length), Buffer.from('recovery', 'utf8'));
}
function wrapOwnerKey(root, umk, rk, owner) {
  const ownerKey = crypto.randomBytes(32);
  const aad = Buffer.from('owner:' + owner, 'utf8');
  fs.writeFileSync(encOwnerKeyPath(root, owner), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(umk, ownerKey, aad)]));
  fs.writeFileSync(encOwnerRecPath(root, owner), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(rk, ownerKey, aad)]));
  return ownerKey;
}
function unwrapOwnerKey(root, owner, umk) {
  const p = encOwnerKeyPath(root, owner);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.slice(0, KEY_MAGIC.length).toString('utf8') !== KEY_MAGIC) throw new Error('密钥文件格式错误: ' + p);
  return aesDecryptBytes(umk, buf.slice(KEY_MAGIC.length), Buffer.from('owner:' + owner, 'utf8'));
}
function unwrapOwnerKeyRecovery(root, owner, rk) {
  const p = encOwnerRecPath(root, owner);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.slice(0, KEY_MAGIC.length).toString('utf8') !== KEY_MAGIC) throw new Error('恢复密钥文件格式错误: ' + p);
  return aesDecryptBytes(rk, buf.slice(KEY_MAGIC.length), Buffer.from('owner:' + owner, 'utf8'));
}
function writeOwnerKeyCache(root, owner, ownerKey) {
  ensureKeysDir(root);
  const p = encCachePath(root, owner);
  fs.writeFileSync(p, ownerKey);
  try { fs.chmodSync(p, 0o600); } catch (e) {}
}
function loadOwnerKeyCache(root, owner) {
  const p = encCachePath(root, owner);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
function revokeOwnerKeyCache(root, owner) {
  const p = encCachePath(root, owner);
  if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
  return false;
}
function getOwnerKeyFor(root, owner) {
  if (!owner) return null;
  if (!isEncrypted(root)) return null;
  return loadOwnerKeyCache(root, owner);
}
function encryptMemoryText(text, ownerKey) {
  const fileKey = crypto.randomBytes(32);
  const wk = aesEncryptBytes(ownerKey, fileKey, Buffer.from('filekey', 'utf8'));
  const data = aesEncryptBytes(fileKey, Buffer.from(text, 'utf8'), Buffer.from('file', 'utf8'));
  return Buffer.concat([Buffer.from(ENC_MAGIC, 'utf8'), wk, data]);
}
function decryptMemoryText(buf, ownerKey) {
  if (buf.slice(0, ENC_MAGIC.length).toString('utf8') !== ENC_MAGIC) throw new Error('非密文文件（缺 ' + ENC_MAGIC + ' 头）');
  const env = buf.slice(ENC_MAGIC.length);
  const wkEnv = env.slice(0, GCM_NONCE + GCM_TAG + 32);
  const fileKey = aesDecryptBytes(ownerKey, wkEnv, Buffer.from('filekey', 'utf8'));
  const dataEnv = env.slice(GCM_NONCE + GCM_TAG + 32);
  return aesDecryptBytes(fileKey, dataEnv, Buffer.from('file', 'utf8')).toString('utf8');
}
function readMemoryText(root, fp, owner) {
  if (!isEncFile(fp)) return fs.readFileSync(fp, 'utf8');
  const key = getOwnerKeyFor(root, owner);
  if (!key) throw new Error('私密区已加密：当前无 ' + owner + ' 的授权密钥，请在用户平台授权（yotta-memory view → 授权本智能体）。');
  return decryptMemoryText(fs.readFileSync(fp), key);
}
function writeMemoryText(root, fp, text, owner) {
  if (!isEncFile(fp)) { fs.writeFileSync(fp, text, 'utf8'); return; }
  const key = getOwnerKeyFor(root, owner);
  if (!key) throw new Error('私密区已加密：当前无 ' + owner + ' 的授权密钥，请在用户平台授权（yotta-memory view → 授权本智能体）。');
  fs.writeFileSync(fp, encryptMemoryText(text, key));
}
function ownerIndexPath(root, owner) { return path.join(root, PRIVATE_DIR, owner, ENC_INDEX_FILE); }
function loadOwnerIndex(root, owner, ownerKey) {
  const p = ownerIndexPath(root, owner);
  if (!fs.existsSync(p)) return [];
  const buf = fs.readFileSync(p);
  if (buf.slice(0, IDX_MAGIC.length).toString('utf8') !== IDX_MAGIC) return [];
  const d = aesDecryptBytes(ownerKey, buf.slice(IDX_MAGIC.length), Buffer.from('index:' + owner, 'utf8'));
  const j = JSON.parse(d.toString('utf8'));
  return Array.isArray(j.entries) ? j.entries : [];
}
function saveOwnerIndex(root, owner, ownerKey, entries) {
  const data = JSON.stringify({ version: 1, updated: today(), entries: entries }, null, 2);
  const env = aesEncryptBytes(ownerKey, Buffer.from(data, 'utf8'), Buffer.from('index:' + owner, 'utf8'));
  const dir = path.join(root, PRIVATE_DIR, owner);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ENC_INDEX_FILE), Buffer.concat([Buffer.from(IDX_MAGIC, 'utf8'), env]));
}
function hasPlaintextPrivate(root) {
  for (const owner of collectOwners(root)) {
    for (const t of PRIVATE_LEAF) {
      const d = path.join(root, PRIVATE_DIR, owner, t);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) return true;
    }
    if (fs.existsSync(path.join(root, PRIVATE_DIR, owner, PROFILE_FILE))) return true;
  }
  return false;
}
function profilePathFor(root, owner) {
  const base = path.join(root, PRIVATE_DIR, owner, PROFILE_FILE);
  if (fs.existsSync(base)) return base;
  return base + ENC_SUFFIX;
}
function readProfileText(root, owner) {
  const p = profilePathFor(root, owner);
  if (!fs.existsSync(p)) return null;
  return readMemoryText(root, p, owner);
}
function writeProfileText(root, owner, text) {
  const dir = path.join(root, PRIVATE_DIR, owner);
  fs.mkdirSync(dir, { recursive: true });
  const encrypted = isEncrypted(root);
  const p = encrypted ? path.join(dir, PROFILE_FILE + ENC_SUFFIX) : path.join(dir, PROFILE_FILE);
  writeMemoryText(root, p, text, owner);
  if (encrypted && fs.existsSync(path.join(dir, PROFILE_FILE))) {
    try { fs.unlinkSync(path.join(dir, PROFILE_FILE)); } catch (e) {}
  }
  return p;
}

// ---- 索引（index.json）----
function indexPath(root) { return path.join(root, INDEX_FILE); }
const INDEX_VERSION = 4;
// v0.8.1 超大库索引分片：公共 index.json 超过阈值按年份分片（index-<year>.json），避免单文件膨胀。
const INDEX_SHARD_THRESHOLD = 5000;
// 安全校验：分片文件名必须匹配 index-YYYY.json，防 manifest 篡改导致路径穿越。
const SHARD_RE = /^index-\d{4}\.json$/;
function isSafeShardName(name) { return typeof name === 'string' && SHARD_RE.test(name); }
function indexShardName(year) { return 'index-' + year + '.json'; }
function loadIndexManifest(root) {
  const p = indexPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (d && Array.isArray(d.shards)) return d;
  } catch (e) { /* ignore */ }
  return null;
}
function loadIndex(root) {
  const p = indexPath(root);
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!d) return null;
    if (Array.isArray(d.entries)) {
      // v0.8.0 语义索引（字段加权 + 拼音 token）version=3；v0.8.1 分片 version=4；旧版索引返回 null 触发重建
      if (d.version && d.version >= INDEX_VERSION) return d.entries;
      return null;
    }
    if (Array.isArray(d.shards)) {
      // v0.8.1 分片 manifest：串联各分片条目
      if (d.version && d.version < INDEX_VERSION) return null;
      const out = [];
      for (const sh of d.shards) {
        if (!isSafeShardName(sh)) continue;
        const sp = path.join(root, sh);
        if (!fs.existsSync(sp)) continue;
        const sd = JSON.parse(fs.readFileSync(sp, 'utf8'));
        if (sd && Array.isArray(sd.entries)) out.push.apply(out, sd.entries);
      }
      return out;
    }
  } catch (e) { /* ignore */ }
  return null;
}
function getIndex(root) { return loadIndex(root) || []; }
function saveIndex(root, entries) {
  const clean = entries.map(function (e) { const c = Object.assign({}, e); delete c.meta; return c; });
  const old = loadIndexManifest(root);
  if (clean.length > INDEX_SHARD_THRESHOLD) {
    const byYear = {};
    for (const e of clean) {
      const y = String(e.created || '').slice(0, 4) || String(today()).slice(0, 4);
      (byYear[y] = byYear[y] || []).push(e);
    }
    const newShards = [];
    for (const y of Object.keys(byYear).sort()) {
      const name = indexShardName(y);
      fs.writeFileSync(path.join(root, name), JSON.stringify({ version: INDEX_VERSION, year: (parseInt(y, 10) || 0), entries: byYear[y] }, null, 2), 'utf8');
      newShards.push(name);
    }
    fs.writeFileSync(indexPath(root), JSON.stringify({ version: INDEX_VERSION, updated: today(), shards: newShards, count: clean.length }, null, 2), 'utf8');
    if (old && Array.isArray(old.shards)) {
      for (const sh of old.shards) if (newShards.indexOf(sh) === -1 && isSafeShardName(sh)) { try { fs.unlinkSync(path.join(root, sh)); } catch (e) {} }
    }
  } else {
    if (old && Array.isArray(old.shards)) {
      for (const sh of old.shards) { try { fs.unlinkSync(path.join(root, sh)); } catch (e) {} }
    }
    fs.writeFileSync(indexPath(root), JSON.stringify({ version: INDEX_VERSION, updated: today(), entries: clean }, null, 2), 'utf8');
  }
}
function collectEntryFiles(root) {
  const dirs = [];
  const facts = path.join(root, PUBLIC_DIR);
  if (fs.existsSync(facts)) dirs.push(facts);
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
      if (!/\.md(\.enc)?$/.test(f)) continue;
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
  const publicEntries = [];
  const privateByOwner = {};
  for (const fp of collectEntryFiles(root)) {
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    if (rel.indexOf(PRIVATE_DIR + '/') === 0) {
      const owner = rel.split('/')[1] || '';
      if (!getOwnerKeyFor(root, owner)) continue;
      let e;
      try { e = readEntry(fp, root); } catch (err) { continue; }
      (privateByOwner[owner] = privateByOwner[owner] || []).push(e);
    } else {
      try { publicEntries.push(readEntry(fp, root)); } catch (err) { /* ignore */ }
    }
  }
  saveIndex(root, publicEntries);
  for (const owner of Object.keys(privateByOwner)) {
    const key = getOwnerKeyFor(root, owner);
    if (key) saveOwnerIndex(root, owner, key, privateByOwner[owner]);
  }
  const all = publicEntries.slice();
  for (const owner of Object.keys(privateByOwner)) all.push.apply(all, privateByOwner[owner]);
  return all;
}
function ensureIndex(root) {
  if (!isEncrypted(root)) {
    const idx = loadIndex(root);
    return idx || buildIndex(root);
  }
  const all = [];
  const pub = loadIndex(root);
  if (pub) all.push.apply(all, pub);
  for (const owner of collectOwners(root)) {
    const key = getOwnerKeyFor(root, owner);
    if (!key) continue;
    let idx = [];
    try { idx = loadOwnerIndex(root, owner, key); } catch (err) { idx = []; }
    all.push.apply(all, idx);
  }
  return all;
}
function upsertIndexEntry(root, entry) {
  if (isEncrypted(root) && entry.scope !== 'public' && String(entry.file).indexOf(PUBLIC_DIR + '/') !== 0) {
    const owner = entry.owner || String(entry.file).split('/')[1] || '';
    const key = getOwnerKeyFor(root, owner);
    if (!key) return;
    const idx = loadOwnerIndex(root, owner, key);
    const i = idx.findIndex(function (e) { return e.file === entry.file; });
    if (i >= 0) idx[i] = entry; else idx.push(entry);
    saveOwnerIndex(root, owner, key, idx);
    return;
  }
  const idx = getIndex(root);
  const i = idx.findIndex(function (e) { return e.file === entry.file; });
  if (i >= 0) idx[i] = entry; else idx.push(entry);
  saveIndex(root, idx);
}
function removeIndexEntry(root, file) {
  if (isEncrypted(root) && String(file).indexOf(PRIVATE_DIR + '/') === 0) {
    const owner = String(file).split('/')[1] || '';
    const key = getOwnerKeyFor(root, owner);
    if (!key) return;
    const idx = loadOwnerIndex(root, owner, key);
    const next = idx.filter(function (e) { return e.file !== file; });
    if (next.length !== idx.length) saveOwnerIndex(root, owner, key, next);
    return;
  }
  const idx = getIndex(root);
  const i = idx.findIndex(function (e) { return e.file === file; });
  if (i >= 0) { idx.splice(i, 1); saveIndex(root, idx); }
}
function removeIndexEntries(root, files) {
  const set = new Set(files);
  const byOwner = {};
  const pub = [];
  for (const f of files) {
    if (String(f).indexOf(PRIVATE_DIR + '/') === 0) {
      const o = String(f).split('/')[1] || '';
      (byOwner[o] = byOwner[o] || []).push(f);
    } else pub.push(f);
  }
  if (pub.length) {
    const idx = getIndex(root);
    const next = idx.filter(function (e) { return !set.has(e.file); });
    if (next.length !== idx.length) saveIndex(root, next);
  }
  for (const o of Object.keys(byOwner)) {
    const key = getOwnerKeyFor(root, o);
    if (!key) continue;
    const idx = loadOwnerIndex(root, o, key);
    const oset = new Set(byOwner[o]);
    const next = idx.filter(function (e) { return !oset.has(e.file); });
    if (next.length !== idx.length) saveOwnerIndex(root, o, key, next);
  }
}

// ---- 读取 / 写入记忆文件 ----
function readEntry(fp, root) {
  const owner = ownerFromPrivatePath(root, fp);
  let text;
  if (isEncFile(fp)) {
    const key = getOwnerKeyFor(root, owner);
    if (!key) throw new Error('私密区已加密：当前无 ' + owner + ' 的授权密钥（yotta-memory view → 授权本智能体）。');
    text = decryptMemoryText(fs.readFileSync(fp), key);
  } else {
    text = fs.readFileSync(fp, 'utf8');
  }
  const parsed = parseFrontmatter(text);
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
    feedback_net: feedbackNetOf(meta),
    tokens: buildTokens(subject, statement, tags),
    meta: meta,
  };
}
function rewriteFrontmatter(fp, patch, root, owner) {
  let text;
  try { text = readMemoryText(root || memoryRootForFile(fp), fp, owner || ownerFromPrivatePath(root || memoryRootForFile(fp), fp)); }
  catch (e) { throw e; }
  const parsed = parseFrontmatter(text);
  const meta = Object.assign({}, parsed.meta);
  for (const k of Object.keys(patch)) meta[k] = patch[k];
  writeMemoryText(root || memoryRootForFile(fp), fp, frontmatterToText(meta, parsed.body), owner || ownerFromPrivatePath(root || memoryRootForFile(fp), fp));
}
function bumpReadMeta(root, relFiles) {
  const now = today();
  for (const rel of relFiles) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const owner = ownerFromPrivatePath(root, fp);
    let parsed;
    try { parsed = parseFrontmatter(readMemoryText(root, fp, owner)); } catch (e) { continue; }
    const meta = parsed.meta;
    if (meta.immutable === 'true') continue;
    const acc = (parseInt(meta.access_count || '0', 10) || 0) + 1;
    rewriteFrontmatter(fp, { access_count: acc, last_accessed: now }, root, owner);
  }
}
function touchIndex(root, relFiles) {
  const set = new Set(relFiles);
  const now = today();
  const manifest = loadIndexManifest(root);
  if (manifest && Array.isArray(manifest.shards)) {
    for (const sh of manifest.shards) {
      if (!isSafeShardName(sh)) continue;
      const sp = path.join(root, sh);
      if (!fs.existsSync(sp)) continue;
      let sd = null; try { sd = JSON.parse(fs.readFileSync(sp, 'utf8')); } catch (e) { continue; }
      if (!sd || !Array.isArray(sd.entries)) continue;
      let dirty = false;
      for (const e of sd.entries) {
        if (set.has(e.file)) { e.access_count = (parseInt(e.access_count, 10) || 0) + 1; e.last_accessed = now; dirty = true; }
      }
      if (dirty) fs.writeFileSync(sp, JSON.stringify(sd, null, 2), 'utf8');
    }
    return;
  }
  const idx = getIndex(root);
  let dirty = false;
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
// importance 融合：confidence × (0.5 + recency) + updated 加分 + weight 乘子 + immutable 加分
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
  opts = opts || {};
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  const fresh = !fs.existsSync(path.join(root, PUBLIC_DIR)) && !fs.existsSync(path.join(root, PRIVATE_DIR)) && !fs.existsSync(path.join(root, INDEX_FILE));
  ensureInit(root);
  const wantEncrypt = opts.encrypt || (!opts.noEncrypt && fresh);
  if (wantEncrypt) {
    if (isEncrypted(root)) return { error: false, text: '已初始化记忆库（已启用加密）: ' + root };
    if (hasPlaintextPrivate(root)) return { error: true, text: '检测到明文私密区，请先 yotta-memory migrate 迁移到密文；新建空库可直接 init --encrypt。' };
    const password = String(opts.password || process.env.YOTTA_MEMORY_PASS || '');
    if (!password) return { error: true, text: '启用加密需要主口令：交互输入，或 YOTTA_MEMORY_PASS 环境变量（自动化）。' };
    const r = initEncryptionCore(root, password, null);
    return { error: false, text: '已初始化加密记忆库: ' + root + '\n[恢复钥匙]（务必离线保存，仅此一次，泄露=可解全部私密）: ' + r.rk.toString('base64') };
  }
  return { error: false, text: '已初始化记忆库: ' + root + (isEncrypted(root) ? '（已启用加密）' : '（明文；建议 init --encrypt 或 migrate 启用加密）') };
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
  const encrypted = isEncrypted(root);
  if (scope === 'private' && encrypted && !getOwnerKeyFor(root, owner)) {
    return { error: true, text: '私密区已加密：当前无 ' + owner + ' 的授权密钥，请在用户平台授权（yotta-memory view → 授权本智能体）后再写私密记忆。公共 FACT 不受影响。' };
  }
  const dir = path.join(root, typeSubdir(t, owner));
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      let parsed;
      try { parsed = parseFrontmatter(readMemoryText(root, fp, owner)); } catch (err) { continue; }
      const meta = parsed.meta;
      if ((meta.type || '').toUpperCase() === t && meta.subject === subj && meta.statement === stmt) {
        const patch = { updated: today() };
        if (owner && !meta.owner) patch.owner = owner;
        if (scope && !meta.scope) patch.scope = scope;
        if (opts.source && !meta.source) patch.source = opts.source;
        const w = parseFloat(opts.weight); if (w > 0) patch.weight = Math.max(parseFloat(meta.weight || '1.0') || 1.0, w);
        rewriteFrontmatter(fp, patch, root, owner);
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
  const suffix = (encrypted && scope === 'private') ? ENC_SUFFIX : '';
  const file = path.join(dir, today() + '-' + seq + '.md' + suffix);
  const rec = {
    type: t, subject: subj, statement: stmt,
    confidence: 1.0, created: today(), updated: today(),
    tags: [], immutable: false,
    scope: scope, owner: owner,
    source: opts.source || '',
    weight: (parseFloat(opts.weight) > 0 ? parseFloat(opts.weight) : 1.0),
    access_count: 0, last_accessed: '',
  };
  writeMemoryText(root, file, frontmatterToText(rec, stmt), owner);
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
// v0.8.1: recall 候选预过滤——查询侧一次构建候选 token 集（精确/同义/拼音/拉丁 py），
// 逐条用 token 交集 + 子串 + 模糊长度门槛做粗筛，命中候选才进语义打分，避免 N 大时逐条全量语义/模糊/编辑距离。
// 该闸门是 semanticMatch 命中集的超集，绝不漏掉同义词/拼音/模糊命中，仅做性能粗筛不改语义。
function recallPrefilter(q) {
  const qtoks = tokenize(q);
  const qset = new Set(qtoks);
  const qpy = pinyinTokens(q);
  const ext = new Set();
  for (const tt of qtoks) { const s = synonymSet(tt); for (const w of s) ext.add(w); }
  const qkeys = new Set();
  for (const tt of qtoks) qkeys.add(tt);
  for (const w of ext) qkeys.add(w);
  for (const t of qpy) qkeys.add(t);
  const longQtoks = qtoks.filter(function (t) { return t.length >= 4; });
  for (const tt of qtoks) {
    if (/^[a-z]+$/.test(tt)) {
      qkeys.add('py:' + tt); qkeys.add('pyi:' + tt);
      if (tt.length >= 3) { for (let i = 0; i < tt.length - 1; i++) qkeys.add('pyi:' + tt.slice(i, i + 2)); }
    }
  }
  return function (e) {
    const toks = e.tokens || {};
    const keys = Object.keys(toks);
    for (const k of keys) {
      if (qkeys.has(k)) return true;
      if (longQtoks.length && k.length >= 4 && k.indexOf(':') === -1) {
        for (const t of longQtoks) {
          if (Math.abs(k.length - t.length) <= 2) return true;
        }
      }
    }
    const hay = ((e.subject || '') + ' ' + (e.statement || '') + ' ' + (e.tags || []).join(' ')).toLowerCase();
    if (hay.indexOf(q) !== -1) return true;
    return false;
  };
}
function recallCore(query, opts) {
  opts = opts || {};
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
  const wantExplain = !!opts.explain;
  const useSemantic = opts.semantic !== false;
  const prefilter = (q && useSemantic) ? recallPrefilter(q) : null;
  const hits = [];
  let deniedCount = 0;
  for (const root of roots) {
    const entries = ensureIndex(root);
    for (const e of entries) {
      if (onlyType && e.type !== onlyType) continue;
      const r = classifyRead(e, agent, ownerFilter, allSafe, selfAgent);
      if (r === 'denied') { deniedCount++; continue; }
      let score = 0;
      let detail = null;
      if (q) {
        if (useSemantic) {
          if (prefilter && !prefilter(e)) continue; // v0.8.1 候选预过滤：粗筛后再语义打分
          const m = semanticMatch(e, q, wantExplain);
          score = m.score;
          if (wantExplain && m.detail && m.detail.length) detail = m.detail;
        } else {
          const qtoks = tokenize(q);
          for (const tt of qtoks) { if (e.tokens && e.tokens[tt]) score += e.tokens[tt]; }
          if (score === 0) {
            const hay = ((e.subject || '') + ' ' + (e.statement || '') + ' ' + e.tags.join(' ')).toLowerCase();
            if (hay.indexOf(q) !== -1) score = 1;
          }
        }
        if (score === 0) continue;
      } else {
        score = 1;
      }
      hits.push({ entry: e, score: score, root: root, detail: detail });
    }
  }
  // v0.8.0 融合排序：0.65 × 语义分归一 + 0.35 × 效用分归一
  if (hits.length > 1) {
    let minSem = Infinity, maxSem = -Infinity, minUtil = Infinity, maxUtil = -Infinity;
    for (const h of hits) {
      if (h.score < minSem) minSem = h.score;
      if (h.score > maxSem) maxSem = h.score;
      const u = utilityScore(h.entry);
      if (u < minUtil) minUtil = u;
      if (u > maxUtil) maxUtil = u;
    }
    const spanSem = maxSem - minSem;
    const spanUtil = maxUtil - minUtil;
    for (const h of hits) {
      h.semNorm = spanSem > 0 ? (h.score - minSem) / spanSem : 1;
      h.utilNorm = spanUtil > 0 ? (utilityScore(h.entry) - minUtil) / spanUtil : 1;
      h.finalScore = 0.65 * h.semNorm + 0.35 * h.utilNorm;
    }
    hits.sort(function (a, b) {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (b.score !== a.score) return b.score - a.score;
      const pa = a.root === projectRoot() ? 0 : 1;
      const pb = b.root === projectRoot() ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(b.entry.created).localeCompare(String(a.entry.created));
    });
  } else {
    hits.sort(function (a, b) {
      const pa = a.root === projectRoot() ? 0 : 1;
      const pb = b.root === projectRoot() ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(b.entry.created).localeCompare(String(a.entry.created));
    });
  }
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
    if (wantExplain) {
      if (h.detail && h.detail.length) lines.push('    命中: ' + h.detail.join('、'));
      const ub = utilityBreakdown(h.entry);
      lines.push('    效用分: ' + round3(ub.total) + '（conf ' + ub.confidence + ' + 使用 ' + ub.usage + ' + 时效 ' + ub.recency + ' + 类型 ' + ub.type + ' + 结构 ' + ub.structure + '）×weight ' + ub.weight);
    }
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
  opts = opts || {};
  const cfg = loadConfig();
  const days = opts.days || parseInt(cfg.maintain_archived_age || '180', 10) || 180;
  const threshold = (opts.threshold !== undefined && opts.threshold !== null) ? opts.threshold : (parseFloat(cfg.maintain_archived_utility || 0.35));
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let moved = 0;
  const movedFiles = [];
  for (const fp of collectEntryFiles(root)) {
    const owner = ownerFromPrivatePath(root, fp);
    let meta;
    try { meta = parseFrontmatter(readMemoryText(root, fp, owner)).meta; } catch (e) { continue; }
    if (meta.immutable === 'true') continue;
    if (!meta.created) continue;
    const createdTs = new Date(meta.created).getTime();
    if (isNaN(createdTs)) continue;
    const t = (meta.type || 'FACT').toUpperCase();
    // v0.8.0 统一效用分（盖棺分）替代 vitality
    if (utilityScore(meta) < threshold && createdTs < cutoff) {
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

// ---- v0.8.0 自我学习/自我进化/自我提升：feedback / explain / maintain / distill ----
function auditPath(root, kind) {
  return path.join(root, ARCHIVE_DIR, kind + '-' + today() + '.jsonl');
}
function appendAudit(root, kind, rec) {
  try {
    fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
    fs.appendFileSync(auditPath(root, kind), JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) { /* 审计失败不阻断主流程 */ }
}
function resolveMemoryTarget(ref) {
  const roots = memoryRoots();
  const targetRef = String(ref || '').replace(/\\/g, '/');
  for (const root of roots) {
    const found = resolveMemoryFile(root, targetRef);
    if (found) return { fp: found.fp, root: root, rel: found.rel };
  }
  return null;
}
function checkOwnerWritable(targetRoot, targetRel, selfAgent, unsafe) {
  const seg = String(targetRel).split('/');
  if (seg[0] === PRIVATE_DIR) {
    const owner = seg[1] || '';
    if (!unsafe && (owner && (selfAgent ? owner !== selfAgent : true))) {
      return '拒绝: 不能操作其它智能体 ' + owner + ' 的私密记忆（当前身份 ' + (selfAgent || '未声明') + '）。请用 YOTTA_AGENT_ID 声明自己的身份，或加 --unsafe（用户显式授权）。';
    }
  }
  return null;
}
// 显式使用反馈：useful/useless → weight/confidence/feedback_net 演化（自我学习闭环）
function feedbackCore(ref, opts) {
  opts = opts || {};
  const selfAgent = opts.selfAgent || currentAgent();
  const target = resolveMemoryTarget(ref);
  if (!target) return { error: true, text: '未找到记忆文件: ' + ref };
  const deny = checkOwnerWritable(target.root, target.rel, selfAgent, opts.unsafe);
  if (deny) return { error: true, text: deny };
  const owner = ownerFromPrivatePath(target.root, target.fp);
  let meta;
  try { meta = parseFrontmatter(readMemoryText(target.root, target.fp, owner)).meta; } catch (e) { return { error: true, text: '读取失败: ' + e.message }; }
  if (opts.undo) {
    return feedbackUndoCore(target, owner, meta, selfAgent, opts);
  }
  const useful = !!opts.useful;
  const useless = !!opts.useless;
  if (!useful && !useless) return { error: true, text: '请指定 --useful（有用）或 --useless（没用）。' };
  const cfg = loadConfig();
  const stepW = parseFloat(cfg.feedback_weight_step || 0.2);
  const stepC = parseFloat(cfg.feedback_confidence_step || 0.05);
  const w = parseFloat(meta.weight || '1.0'); const weight = (w > 0 ? w : 1.0);
  const conf = parseFloat(meta.confidence || '1.0'); const confidence = (conf > 0 ? conf : 1.0);
  const fb = feedbackNetOf(meta);
  let nw = weight, nc = confidence, nfb = fb;
  if (useful) { nw = Math.min(weight * (1 + stepW), 3.0); nc = Math.min(confidence + stepC, 1.0); nfb = fb + 1; }
  if (useless) { nw = Math.max(weight * (1 - stepW), 0.2); nc = Math.max(confidence - stepC, 0.3); nfb = fb - 1; }
  const before = { weight: round3(weight), confidence: round3(confidence), feedback_net: fb };
  const after = { weight: round3(nw), confidence: round3(nc), feedback_net: nfb };
  const patch = { weight: after.weight, confidence: after.confidence, feedback_net: after.feedback_net, updated: today() };
  rewriteFrontmatter(target.fp, patch, target.root, owner);
  upsertIndexEntry(target.root, readEntry(target.fp, target.root));
  appendAudit(target.root, 'feedback', { ts: new Date().toISOString(), file: target.rel, action: useful ? 'useful' : 'useless', before: before, after: after, reason: opts.reason || '' });
  const lines = [(useful ? '已反馈 [有用]' : '已反馈 [没用]') + ': ' + target.rel];
  lines.push('  weight ' + before.weight + ' -> ' + after.weight + ' / confidence ' + before.confidence + ' -> ' + after.confidence + ' / feedback_net ' + before.feedback_net + ' -> ' + after.feedback_net);
  if (opts.reason) lines.push('  原因: ' + opts.reason);
  lines.push('  提示: yotta-memory explain ' + target.rel + ' 查看效用分项；feedback --undo 回滚最近一次');
  return { error: false, text: lines.join('\n') };
}
function feedbackUndoCore(target, owner, meta, selfAgent, opts) {
  const cfg = loadConfig();
  const lines = [];
  let restored = false;
  try {
    const log = auditPath(target.root, 'feedback');
    if (!fs.existsSync(log)) return { error: true, text: '无可回滚的反馈记录（' + log + ' 不存在）。' };
    const recs = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    const mine = recs.filter(function (r) { return r.file === target.rel && (r.action === 'useful' || r.action === 'useless'); });
    if (!mine.length) return { error: true, text: '该文件无反馈记录可回滚。' };
    const last = mine[mine.length - 1];
    const patch = { weight: last.before.weight, confidence: last.before.confidence, feedback_net: last.before.feedback_net, updated: today() };
    rewriteFrontmatter(target.fp, patch, target.root, owner);
    upsertIndexEntry(target.root, readEntry(target.fp, target.root));
    appendAudit(target.root, 'feedback', { ts: new Date().toISOString(), file: target.rel, action: 'undo', before: last.after, after: last.before, reason: opts.reason || '' });
    lines.push('已回滚最近一次反馈: ' + target.rel);
    lines.push('  ' + last.action + ' -> 恢复 weight ' + last.after.weight + ' -> ' + last.before.weight + ' / feedback_net ' + last.after.feedback_net + ' -> ' + last.before.feedback_net);
    restored = true;
  } catch (e) { return { error: true, text: '回滚失败: ' + e.message }; }
  return { error: false, text: lines.join('\n') };
}
// 解释单条记忆效用分项（为什么靠前/归档/遗忘）
function explainCore(ref, opts) {
  opts = opts || {};
  const selfAgent = opts.selfAgent || currentAgent();
  const target = resolveMemoryTarget(ref);
  if (!target) return { error: true, text: '未找到记忆文件: ' + ref };
  const owner = ownerFromPrivatePath(target.root, target.fp);
  let entry;
  try { entry = readEntry(target.fp, target.root); } catch (e) { return { error: true, text: '读取失败: ' + e.message }; }
  const deny = checkOwnerWritable(target.root, target.rel, selfAgent, opts.unsafe);
  const readable = !deny;
  const ub = utilityBreakdown(entry);
  const ageDays = entry.created ? daysBetween(entry.created, today()) : 0;
  const cfg = loadConfig();
  const archU = parseFloat(cfg.maintain_archived_utility || 0.35);
  const archAge = parseInt(cfg.maintain_archived_age || '180', 10) || 180;
  const forgetU = parseFloat(cfg.maintain_forget_utility || 0.12);
  const forgetAge = parseInt(cfg.maintain_forget_age || '365', 10) || 365;
  const lines = ['[' + entry.type + '] ' + entry.subject + ': ' + entry.statement];
  lines.push('  文件: ' + target.rel + (readable ? '' : '（其它智能体私密，仅元数据）'));
  lines.push('  效用分: ' + ub.total + ' = confidence ' + ub.confidence + ' + 使用 ' + ub.usage + ' + 时效 ' + ub.recency + ' + 类型 ' + ub.type + ' + 结构 ' + ub.structure + '）×weight ' + ub.weight);
  lines.push('  年龄: ' + ageDays + ' 天 / access_count ' + (entry.access_count || 0) + ' / feedback_net ' + entry.feedback_net + ' / immutable ' + (entry.immutable ? '是' : '否'));
  const importScore = round3(importanceScore(entry));
  lines.push('  importance(旧): ' + importScore + ' / vitality(旧): ' + round3(vitality(entry)));
  if (entry.immutable) lines.push('  状态: immutable 豁免自动归档/遗忘');
  else if (ub.total < forgetU && ageDays > forgetAge && entry.type !== 'BOUND') lines.push('  状态: 遗忘候选（utility < ' + forgetU + ' 且年龄 > ' + forgetAge + ' 天；--purge 才真删）');
  else if (ub.total < archU && ageDays > archAge) lines.push('  状态: 归档候选（utility < ' + archU + ' 且年龄 > ' + archAge + ' 天）');
  else lines.push('  状态: 保留（未达归档/遗忘阈值）');
  return { error: false, text: lines.join('\n') };
}
function jaccardTokens(a, b) {
  const sa = new Set(Object.keys(a.tokens || {}).filter(function (k) { return k.indexOf(':') === -1; }));
  const sb = new Set(Object.keys(b.tokens || {}).filter(function (k) { return k.indexOf(':') === -1; }));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const k of sa) { if (sb.has(k)) inter++; }
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}
function subjectsSimilar(a, b) {
  const sa = String(a.subject || '').toLowerCase();
  const sb = String(b.subject || '').toLowerCase();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  return editDistance(sa, sb) <= 3;
}
// 记忆自组织：规则层自动归档/遗忘/去重（默认 dry-run，--apply 才执行，--purge 才真删）
function maintainCore(opts) {
  opts = opts || {};
  const apply = !!opts.apply;
  const purge = !!opts.purge;
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const cfg = loadConfig();
  const archU = parseFloat(opts.threshold !== undefined && opts.threshold !== null ? opts.threshold : (cfg.maintain_archived_utility || 0.35));
  const archAge = parseInt(opts.age || cfg.maintain_archived_age || '180', 10) || 180;
  const forgetU = parseFloat(cfg.maintain_forget_utility || 0.12);
  const forgetAge = parseInt(cfg.maintain_forget_age || '365', 10) || 365;
  const mode = apply ? (purge ? '执行（含遗忘真删 --purge）' : '执行') : '预览（dry-run，未改动；加 --apply 执行，--purge 才真删）';
  const lines = ['## yotta-memory maintain（记忆自组织）'];
  lines.push('- 模式: ' + mode);
  lines.push('- 归档阈值: utility < ' + archU + ' 且年龄 > ' + archAge + ' 天；遗忘阈值: utility < ' + forgetU + ' 且年龄 > ' + forgetAge + ' 天');
  lines.push('');
  const toArchive = [], toForget = [], skipped = [];
  for (const fp of collectEntryFiles(root)) {
    const owner = ownerFromPrivatePath(root, fp);
    let meta;
    try { meta = parseFrontmatter(readMemoryText(root, fp, owner)).meta; } catch (e) { continue; }
    if (meta.immutable === 'true') { skipped.push({ fp: fp, reason: 'immutable 豁免' }); continue; }
    if (!meta.created) { skipped.push({ fp: fp, reason: '无 created' }); continue; }
    const type = (meta.type || 'FACT').toUpperCase();
    const ageDays = daysBetween(meta.created, today());
    const u = utilityScore(meta);
    const rec = { fp: fp, rel: relOf(root, fp), type: type, ageDays: ageDays, utility: u, meta: meta, owner: owner };
    if (u < forgetU && ageDays > forgetAge) {
      if (type === 'BOUND') { skipped.push({ fp: fp, reason: 'BOUND 豁免遗忘' }); }
      else { toForget.push(rec); continue; }
    }
    if (u < archU && ageDays > archAge) toArchive.push(rec);
  }
  let archived = 0, forgotten = 0;
  if (toArchive.length) {
    lines.push('### 归档候选（' + toArchive.length + ' 条）');
    for (const rec of toArchive) {
      lines.push('- [' + rec.type + '] ' + rec.rel + '（utility ' + round3(rec.utility) + '，' + rec.ageDays + ' 天）— ' + (rec.meta.subject || '') + ': ' + String(rec.meta.statement || '').slice(0, 40) + (rec.type === 'COMMIT' ? '  ⚠️ COMMIT 收工纪律锚点，请确认' : ''));
      if (apply) {
        const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[rec.type]);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(rec.fp, path.join(destDir, path.basename(rec.fp)));
        appendAudit(root, 'audit', { ts: new Date().toISOString(), file: rec.rel, action: 'archive', reason: 'utility<' + round3(rec.utility) + ',age>' + rec.ageDays, utility: round3(rec.utility) });
        archived++;
      }
    }
    lines.push('');
  }
  if (toForget.length) {
    lines.push('### 遗忘候选（' + toForget.length + ' 条，默认不真删；--purge 才删除）');
    for (const rec of toForget) {
      lines.push('- [' + rec.type + '] ' + rec.rel + '（utility ' + round3(rec.utility) + '，' + rec.ageDays + ' 天）');
      if (apply && purge) {
        const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[rec.type]);
        fs.mkdirSync(destDir, { recursive: true });
        const dest = path.join(destDir, path.basename(rec.fp));
        fs.renameSync(rec.fp, dest);
        appendAudit(root, 'audit', { ts: new Date().toISOString(), file: rec.rel, action: 'forget', reason: 'utility<' + round3(rec.utility) + ',age>' + rec.ageDays + ',purge', utility: round3(rec.utility) });
        // 真删前二次确认标记：purge 已显式授权，删除 .archive 内副本前的最终动作 = 记录审计后删除
        try { fs.unlinkSync(dest); } catch (e) { /* 保留副本 */ }
        forgotten++;
      } else if (apply) {
        lines.push('    （--purge 未开启，跳过真删）');
      }
    }
    lines.push('');
  }
  if (apply) {
    if (archived || forgotten) {
      const allMoved = toArchive.concat(toForget).filter(function (r) { return true; });
      removeIndexEntries(root, allMoved.map(function (r) { return r.rel; }));
    }
    lines.push('- 已执行: 归档 ' + archived + ' 条，遗忘 ' + forgotten + ' 条。审计: ' + auditPath(root, 'audit'));
  } else {
    lines.push('- 未执行任何变更（dry-run）。加 --apply 执行归档，--purge 才真删遗忘候选。');
  }
  if (skipped.length) {
    lines.push('');
    lines.push('### 跳过（' + skipped.length + ' 条）');
    const grouped = {};
    for (const s of skipped) { grouped[s.reason] = (grouped[s.reason] || 0) + 1; }
    for (const k of Object.keys(grouped)) lines.push('- ' + k + ': ' + grouped[k] + ' 条');
  }
  // 去重
  if (opts.dedup) {
    lines.push('');
    lines.push('### 去重候选（--dedup）');
    const entries = ensureIndex(root);
    const groups = [];
    const used = new Set();
    for (let i = 0; i < entries.length; i++) {
      if (used.has(i)) continue;
      const g = [entries[i]];
      used.add(i);
      for (let j = i + 1; j < entries.length; j++) {
        if (used.has(j)) continue;
        if (subjectsSimilar(entries[i], entries[j]) && jaccardTokens(entries[i], entries[j]) >= 0.7) {
          g.push(entries[j]); used.add(j);
        }
      }
      if (g.length > 1) groups.push(g);
    }
    if (!groups.length) lines.push('（无重复候选）');
    for (const g of groups) {
      lines.push('- 组: ' + g.map(function (e) { return e.file; }).join(' | '));
      lines.push('  ' + g.map(function (e) { return e.subject + ': ' + e.statement; }).join(' / '));
    }
    lines.push('  合并: yotta-memory maintain --merge <fileA> <fileB>');
  }
  return { error: false, text: lines.join('\n') };
}
// 手动合并两条相似记忆：保留高 confidence，低 confidence 移入 .archive
function mergeCore(refA, refB, opts) {
  opts = opts || {};
  const selfAgent = opts.selfAgent || currentAgent();
  const ta = resolveMemoryTarget(refA);
  const tb = resolveMemoryTarget(refB);
  if (!ta || !tb) return { error: true, text: '未找到记忆文件: ' + refA + ' / ' + refB };
  for (const t of [ta, tb]) {
    const deny = checkOwnerWritable(t.root, t.rel, selfAgent, opts.unsafe);
    if (deny) return { error: true, text: deny };
  }
  if (ta.root !== tb.root) return { error: true, text: '暂不支持跨记忆库合并（' + ta.root + ' vs ' + tb.root + '）。' };
  const root = ta.root;
  const ea = readEntry(ta.fp, root);
  const eb = readEntry(tb.fp, root);
  const keep = ea.confidence >= eb.confidence ? ea : eb;
  const drop = ea.confidence >= eb.confidence ? eb : ea;
  const keepFp = ea.confidence >= eb.confidence ? ta.fp : tb.fp;
  const dropFp = ea.confidence >= eb.confidence ? tb.fp : ta.fp;
  const owner = ownerFromPrivatePath(root, keepFp);
  const tags = Array.from(new Set((keep.tags || []).concat(drop.tags || [])));
  const patch = { updated: today(), tags: JSON.stringify(tags), access_count: (keep.access_count || 0) + (drop.access_count || 0), feedback_net: (keep.feedback_net || 0) + (drop.feedback_net || 0) };
  rewriteFrontmatter(keepFp, patch, root, owner);
  upsertIndexEntry(root, readEntry(keepFp, root));
  const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[drop.type]);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(dropFp));
  fs.renameSync(dropFp, dest);
  removeIndexEntry(root, drop.file);
  appendAudit(root, 'audit', { ts: new Date().toISOString(), file: drop.file, action: 'merge', reason: '并入 ' + keep.file, utility: round3(utilityScore(keep)) });
  return { error: false, text: '已合并: ' + drop.file + ' -> ' + keep.file + '\n  保留: [' + keep.type + '] ' + keep.subject + ': ' + keep.statement + '\n  归档低 confidence: ' + drop.file };
}
// 心理日志蒸馏：统计摘要 / 主题画像 / 知识地图（启发式默认，可选 --model）
function distillCore(opts) {
  opts = opts || {};
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const selfAgent = opts.selfAgent || currentAgent();
  const owner = opts.owner || selfAgent;
  const entries = [];
  for (const r of memoryRoots()) {
    for (const e of ensureIndex(r)) {
      if (classifyRead(e, owner, '', !!opts.unsafe, selfAgent) === 'denied') continue;
      entries.push(e);
    }
  }
  const lines = [];
  lines.push('# 元忆记忆蒸馏报告（v0.8.0）');
  lines.push('');
  lines.push('> 生成: yotta-memory distill | 启发式蒸馏（零依赖）；--model <cmd> 可选外部模型增强');
  lines.push('> 时间: ' + new Date().toISOString() + ' / 可读条目: ' + entries.length + ' 条');
  lines.push('');
  // 1) 统计摘要
  lines.push('## 一、统计摘要');
  lines.push('');
  if (!entries.length) lines.push('（无记忆）');
  const byType = {};
  for (const e of entries) byType[e.type] = (byType[e.type] || 0) + 1;
  lines.push('- 类型分布: ' + Object.keys(byType).map(function (k) { return k + ' ' + byType[k]; }).join(' / '));
  let young = 0, mid = 0, old = 0, veryOld = 0;
  for (const e of entries) {
    if (!e.created) continue;
    const d = daysBetween(e.created, today());
    if (d < 30) young++; else if (d < 90) mid++; else if (d < 180) old++; else veryOld++;
  }
  lines.push('- 年龄分布: <30天 ' + young + ' / 30-90 ' + mid + ' / 90-180 ' + old + ' / >180天 ' + veryOld);
  const hot = entries.slice().sort(function (a, b) { return (b.access_count || 0) - (a.access_count || 0); }).slice(0, 5);
  lines.push('- 热度 Top5（access_count）:');
  for (const h of hot) lines.push('  - [' + h.type + '] ' + h.subject + '（' + (h.access_count || 0) + ' 次）');
  let fbSum = 0, usefulN = 0, uselessN = 0;
  for (const e of entries) { const n = e.feedback_net || 0; fbSum += n; if (n > 0) usefulN++; else if (n < 0) uselessN++; }
  lines.push('- 反馈统计: feedback_net 总和 ' + fbSum + '（正 ' + usefulN + ' 条 / 负 ' + uselessN + ' 条）');
  lines.push('');
  // 2) 主题画像（按 subject 聚类合并）
  lines.push('## 二、主题画像（按 subject 聚类，启发式合并）');
  lines.push('');
  const groups = {};
  for (const e of entries) {
    const key = String(e.subject || '（无主题）');
    (groups[key] = groups[key] || []).push(e);
  }
  const sortedKeys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
  for (const k of sortedKeys) {
    const g = groups[k];
    const best = g.slice().sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); })[0];
    const tags = Array.from(new Set([].concat.apply([], g.map(function (e) { return e.tags || []; }))));
    lines.push('### ' + k + '（' + g.length + ' 条）');
    lines.push('- 代表: ' + best.statement);
    if (tags.length) lines.push('- 标签: ' + tags.join(', '));
    lines.push('- 引用: ' + g.map(function (e) { return e.file; }).join(' / '));
    lines.push('');
  }
  // 3) 知识地图（type + tags 层级）
  lines.push('## 三、知识地图（type → tags）');
  lines.push('');
  const map = {};
  for (const e of entries) {
    const t = e.type;
    (map[t] = map[t] || {});
    const tagKey = (e.tags && e.tags.length) ? e.tags.join(',') : '（无标签）';
    (map[t][tagKey] = map[t][tagKey] || []).push(e);
  }
  for (const t of Object.keys(map).sort()) {
    lines.push('### ' + t);
    for (const tk of Object.keys(map[t]).sort()) {
      lines.push('- ' + tk + ': ' + map[t][tk].map(function (e) { return e.subject; }).join(' / '));
    }
  }
  let body = lines.join('\n') + '\n';
  // 可选模型增强：--model <cmd>，stdin 传结构化摘要，stdout 取提炼文本
  let modelOut = '';
  if (opts.model) {
    try {
      const payload = JSON.stringify({ summary: lines.join('\n'), entries: entries.map(function (e) { return { type: e.type, subject: e.subject, statement: e.statement, tags: e.tags, confidence: e.confidence, access_count: e.access_count, feedback_net: e.feedback_net }; }).slice(0, 200) });
      const r = child_process.spawnSync(String(opts.model), { input: payload, encoding: 'utf8', maxBuffer: 1024 * 1024, shell: process.platform === 'win32' });
      if (r.stdout) modelOut = String(r.stdout).trim();
      if (!modelOut) modelOut = '（模型无输出）';
      body += '\n## 四、模型提炼（--model ' + opts.model + '）\n\n' + modelOut + '\n';
    } catch (e) {
      modelOut = '（模型调用失败: ' + e.message + '）';
      body += '\n## 四、模型提炼\n\n' + modelOut + '\n';
    }
  }
  // 落盘：--out 指定 / 私密 distills / 公共 facts/distills
  let written = '';
  try {
    if (opts.out) {
      const outPath = path.resolve(String(opts.out));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, body, 'utf8');
      written = outPath;
    } else {
      const slug = String((opts.subject || 'distill').replace(/[^\w\u4e00-\u9fa5-]+/g, '-').slice(0, 40));
      const fname = today() + '-' + slug + '.md';
      if (owner && entries.some(function (e) { return e.scope !== 'public' && e.owner === owner; })) {
        const dir = path.join(root, PRIVATE_DIR, owner, 'distills');
        fs.mkdirSync(dir, { recursive: true });
        const fp = path.join(dir, fname);
        const text = frontmatterToText({ type: 'COMMIT', subject: '蒸馏报告 ' + slug, statement: '记忆蒸馏报告（' + today() + '）', confidence: 1.0, created: today(), updated: today(), tags: ['distill'], immutable: false, scope: 'private', owner: owner, source: 'distill', weight: 1.0, access_count: 0, last_accessed: '', feedback_net: 0 }, body);
        writeMemoryText(root, fp, text, owner);
        upsertIndexEntry(root, readEntry(fp, root));
        written = fp;
      } else {
        const dir = path.join(root, PUBLIC_DIR, 'distills');
        fs.mkdirSync(dir, { recursive: true });
        const fp = path.join(dir, fname);
        const text = frontmatterToText({ type: 'FACT', subject: '蒸馏报告 ' + slug, statement: '记忆蒸馏报告（' + today() + '）', confidence: 1.0, created: today(), updated: today(), tags: ['distill'], immutable: false, scope: 'public', owner: '', source: 'distill', weight: 1.0, access_count: 0, last_accessed: '', feedback_net: 0 }, body);
        fs.writeFileSync(fp, text, 'utf8');
        upsertIndexEntry(root, readEntry(fp, root));
        written = fp;
      }
    }
  } catch (e) {
    return { error: false, text: lines.join('\n') + '\n\n[落盘失败] ' + e.message };
  }
  return { error: false, text: body + '\n[已写入] ' + written };
}

function promptPassword(promptText) {
  return new Promise(function (resolve) {
    const stdin = process.stdin;
    if (!stdin.isTTY) { resolve(null); return; }
    process.stdout.write(promptText);
    let buf = '';
    function done(abort) {
      try { stdin.setRawMode(false); } catch (e) {}
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(abort ? null : buf);
    }
    function onData(chunk) {
      const s = String(chunk);
      for (const c of s) {
        if (c === '\r' || c === '\n') { done(false); return; }
        if (c === '\u0003') { done(true); return; }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    }
    try { stdin.setRawMode(true); } catch (e) { resolve(null); return; }
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

function migrateCore(root, password, recoveryKeyIn) {
  if (!fs.existsSync(root)) return { error: true, text: '记忆库不存在，请先 yotta-memory init。' };
  if (isEncrypted(root)) return { error: true, text: '记忆库已启用加密（keys/ 存在），无需迁移。' };
  if (!hasPlaintextPrivate(root)) return { error: false, text: '无私密明文可迁移（private/ 下无 .md 文件）；如需新建加密库请 init --encrypt。' };
  const salt = crypto.randomBytes(16);
  ensureKeysDir(root);
  fs.writeFileSync(encSaltPath(root), salt);
  const umk = deriveUmk(password, salt);
  const rk = crypto.randomBytes(32);
  fs.writeFileSync(encRecoveryEncPath(root), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(umk, rk, Buffer.from('recovery', 'utf8'))]));
  let moved = 0;
  const owners = collectOwners(root);
  const self = currentAgent();
  for (const owner of owners) {
    const ok = wrapOwnerKey(root, umk, rk, owner);
    if (self && owner === self) writeOwnerKeyCache(root, owner, ok);
    for (const t of PRIVATE_LEAF) {
      const d = path.join(root, PRIVATE_DIR, owner, t);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith('.md')) continue;
        const fp = path.join(d, f);
        const text = fs.readFileSync(fp, 'utf8');
        fs.writeFileSync(fp + ENC_SUFFIX, encryptMemoryText(text, ok));
        fs.unlinkSync(fp);
        moved++;
      }
    }
    const pf = path.join(root, PRIVATE_DIR, owner, PROFILE_FILE);
    if (fs.existsSync(pf)) {
      const text = fs.readFileSync(pf, 'utf8');
      fs.writeFileSync(pf + ENC_SUFFIX, encryptMemoryText(text, ok));
      fs.unlinkSync(pf);
      moved++;
    }
  }
  buildIndex(root);
  let tail = '已迁移 ' + moved + ' 个私密文件（' + owners.length + ' 个 owner）到密文。';
  tail += '\n[恢复钥匙]（务必离线保存，仅此一次，泄露=可解全部私密）: ' + rk.toString('base64');
  if (self && owners.indexOf(self) !== -1) tail += '\n已为本智能体 ' + self + ' 写入授权缓存，可继续读写自己的私密。';
  else tail += '\n各智能体需在用户平台授权（yotta-memory view → 授权本智能体）后才能读写自己的私密。';
  return { error: false, text: tail };
}

async function cmdMigrate(opts) {
  const root = userRoot();
  if (isEncrypted(root)) { console.error('记忆库已启用加密，无需迁移。'); process.exit(2); }
  if (!hasPlaintextPrivate(root)) { console.error('无私密明文可迁移。'); process.exit(2); }
  let password = opts.password || process.env.YOTTA_MEMORY_PASS || '';
  if (!password) {
    password = await promptPassword('主口令（迁移后私密区加密，勿忘；忘口令可用恢复钥匙重设）: ') || '';
    if (!password) { console.error('已取消。'); process.exit(2); }
  }
  const r = migrateCore(root, password, null);
  console.log(r.text);
  if (r.error) process.exit(2);
}

function resetPasswordCore(root, opts) {
  opts = opts || {};
  if (!isEncrypted(root)) return { error: true, text: '记忆库未启用加密。' };
  const salt = loadSalt(root);
  if (!salt) return { error: true, text: '密钥库损坏（缺 keys/salt）。' };
  const owners = keyOwners(root).filter(function (o) { return fs.existsSync(encOwnerKeyPath(root, o)); });
  if (!owners.length) return { error: true, text: '没有可重设的 owner 密钥（keys/ 下无 *.key.enc）。' };
  const newPass = String(opts.newPassword || '');
  if (!newPass) return { error: true, text: '请提供新口令（--new-password 或交互输入）。' };
  if (opts.recoveryKey) {
    const rk = Buffer.from(String(opts.recoveryKey).trim(), 'base64');
    if (rk.length !== 32) return { error: true, text: '恢复钥匙格式错误（须为 32 字节 base64）。' };
    let verified = false;
    for (const o of owners) { try { unwrapOwnerKeyRecovery(root, o, rk); verified = true; break; } catch (e) {} }
    if (!verified) return { error: true, text: '恢复钥匙无效（无法解开任何 owner 密钥）。' };
    const newUmk = deriveUmk(newPass, salt);
    for (const o of owners) {
      const ok = unwrapOwnerKeyRecovery(root, o, rk);
      const aad = Buffer.from('owner:' + o, 'utf8');
      fs.writeFileSync(encOwnerKeyPath(root, o), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(newUmk, ok, aad)]));
    }
    fs.writeFileSync(encRecoveryEncPath(root), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(newUmk, rk, Buffer.from('recovery', 'utf8'))]));
    return { error: false, text: '口令已重设（恢复钥匙验证通过，已重新包裹全部 owner 密钥）。' };
  }
  const curPass = String(opts.password || '');
  if (!curPass) return { error: true, text: '请提供当前口令（--password 或交互输入），或用 --recovery-key。' };
  const curUmk = deriveUmk(curPass, salt);
  let verified = false;
  for (const o of owners) { try { unwrapOwnerKey(root, o, curUmk); verified = true; break; } catch (e) {} }
  if (!verified) return { error: true, text: '当前口令错误。' };
  const newUmk = deriveUmk(newPass, salt);
  for (const o of owners) {
    const ok = unwrapOwnerKey(root, o, curUmk);
    const aad = Buffer.from('owner:' + o, 'utf8');
    fs.writeFileSync(encOwnerKeyPath(root, o), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(newUmk, ok, aad)]));
  }
  fs.writeFileSync(encRecoveryEncPath(root), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(newUmk, unwrapRecoveryEnc(root, curUmk), Buffer.from('recovery', 'utf8'))]));
  return { error: false, text: '口令已重设（当前口令验证通过）。' };
}

async function cmdResetPassword(opts) {
  const root = userRoot();
  if (!isEncrypted(root)) { console.error('记忆库未启用加密。'); process.exit(2); }
  let cur = opts.password || '';
  let rk = opts.recoveryKey || '';
  let np = opts.newPassword || process.env.YOTTA_MEMORY_PASS || '';
  if (!rk && !cur) {
    cur = await promptPassword('当前口令（或 --recovery-key 用恢复钥匙）: ') || '';
    if (!cur) { console.error('已取消。'); process.exit(2); }
  }
  if (!np) {
    np = await promptPassword('新口令: ') || '';
    if (!np) { console.error('已取消。'); process.exit(2); }
    const np2 = await promptPassword('再次输入确认: ') || '';
    if (np2 !== np) { console.error('两次输入不一致。'); process.exit(2); }
  }
  const r = resetPasswordCore(root, { password: cur, recoveryKey: rk, newPassword: np });
  console.log(r.text);
  if (r.error) process.exit(2);
}

function keyAuthorizeCore(root, owner, password) {
  if (!isEncrypted(root)) return { error: true, text: '记忆库未启用加密。' };
  const salt = loadSalt(root);
  if (!salt) return { error: true, text: '密钥库损坏（缺 keys/salt）。' };
  const umk = deriveUmk(password, salt);
  let ok = null;
  try { ok = unwrapOwnerKey(root, owner, umk); } catch (e) { ok = null; }
  if (!ok) {
    let rk = null;
    try { rk = unwrapRecoveryEnc(root, umk); } catch (e) { rk = null; }
    if (!rk) return { error: true, text: '口令错误。' };
    ok = wrapOwnerKey(root, umk, rk, owner);
  }
  writeOwnerKeyCache(root, owner, ok);
  return { error: false, text: '已授权 ' + owner + ' 读取其私密（写入授权缓存 keys/cache/' + owner + '.key）。' };
}

function keyRevokeCore(root, owner) {
  if (!revokeOwnerKeyCache(root, owner)) return { error: false, text: owner + ' 无授权缓存（已是未授权状态）。' };
  return { error: false, text: '已吊销 ' + owner + ' 的授权缓存（该智能体将无法解密其私密）。' };
}

function cmdKeyList() {
  const root = userRoot();
  if (!isEncrypted(root)) { console.log('记忆库未启用加密。'); return; }
  const owners = collectOwners(root);
  const authorized = owners.filter(function (o) { return fs.existsSync(encCachePath(root, o)); });
  console.log('owner: ' + (owners.length ? owners.join(', ') : '（无）'));
  console.log('已授权缓存: ' + (authorized.length ? authorized.join(', ') : '（无）'));
}

async function cmdKeyAuthorize(id, opts) {
  const root = userRoot();
  if (!isEncrypted(root)) { console.error('记忆库未启用加密。'); process.exit(2); }
  if (!id) { console.error('请指定 <id>：yotta-memory key authorize <id>'); process.exit(2); }
  let password = opts.password || process.env.YOTTA_MEMORY_PASS || '';
  if (!password) {
    password = await promptPassword('主口令: ') || '';
    if (!password) { console.error('已取消。'); process.exit(2); }
  }
  const r = keyAuthorizeCore(root, id, password);
  console.log(r.text);
  if (r.error) process.exit(2);
}

function cmdKeyRevoke(id) {
  const root = userRoot();
  if (!id) { console.error('请指定 <id>：yotta-memory key revoke <id>'); process.exit(2); }
  const r = keyRevokeCore(root, id);
  console.log(r.text);
  if (r.error) process.exit(2);
}

// v0.8.1: 查看平台分页——服务端只返回当前页（offset/limit），避免记忆多了一次全量加载/渲染/传输
function viewEntriesCore(root, session, query, offset, limit) {
  limit = Math.max(1, parseInt(limit, 10) || 50);
  offset = Math.max(0, parseInt(offset, 10) || 0);
  const q = String(query || '').toLowerCase();
  const entries = [];
  for (const e of (loadIndex(root) || [])) entries.push(e);
  for (const o of collectOwners(root)) {
    const key = session.ownerKeys[o];
    if (!key) continue;
    try { for (const e of loadOwnerIndex(root, o, key)) entries.push(e); } catch (err) {}
  }
  const all = q ? entries.filter(function (e) {
    return ((e.subject || '') + ' ' + (e.statement || '') + ' ' + (e.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1;
  }) : entries;
  all.sort(function (a, b) { return String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')); });
  const count = all.length;
  const page = all.slice(offset, offset + limit);
  return { count: count, offset: offset, limit: limit, hasMore: offset + limit < count, entries: page };
}
function viewServerCore(root, port, host) {
  let session = { umk: null, ownerKeys: {} };
  const server = http.createServer(function (req, res) {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname; } catch (e) {}
    function json(code, obj) {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    }
    function readBody(cb) {
      let body = '';
      req.on('data', function (c) { body += c; });
      req.on('end', function () {
        let d = {};
        try { d = JSON.parse(body || '{}'); } catch (e) {}
        cb(d);
      });
    }
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(VIEW_HTML);
      return;
    }
    if (req.method === 'POST' && pathname === '/api/status') {
      return json(200, { encrypted: isEncrypted(root), unlocked: !!session.umk, version: VERSION });
    }
    if (req.method === 'POST' && pathname === '/api/unlock') {
      return readBody(function (d) {
        const password = String(d.password || '');
        const salt = loadSalt(root);
        if (!salt) return json(400, { error: '记忆库未启用加密。' });
        const umk = deriveUmk(password, salt);
        const ownerKeys = {};
        const owners = keyOwners(root);
        let verified = false;
        for (const o of owners) {
          try { ownerKeys[o] = unwrapOwnerKey(root, o, umk); verified = true; } catch (e) {}
        }
        if (!verified) return json(401, { error: '口令错误。' });
        session = { umk: umk, ownerKeys: ownerKeys };
        json(200, { ok: true, owners: Object.keys(ownerKeys) });
      });
    }
    if (req.method === 'POST' && pathname === '/api/owners') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      const agents = loadAgents(root).agents || {};
      const owners = keyOwners(root);
      const all = Array.from(new Set(owners.concat(Object.keys(agents))));
      return json(200, { owners: all.map(function (o) { return { owner: o, registered: !!agents[o], authorized: !!session.ownerKeys[o] && fs.existsSync(encCachePath(root, o)) }; }) });
    }
    if (req.method === 'POST' && pathname === '/api/entries') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      return readBody(function (d) { json(200, viewEntriesCore(root, session, d.query, d.offset, d.limit)); });
    }
    if (req.method === 'POST' && pathname === '/api/export') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      const memories = [];
      for (const e of (loadIndex(root) || [])) memories.push({ file: e.file, meta: e.meta });
      for (const o of collectOwners(root)) {
        const key = session.ownerKeys[o];
        if (!key) continue;
        try { for (const e of loadOwnerIndex(root, o, key)) memories.push({ file: e.file, meta: e.meta }); } catch (err) {}
      }
      return json(200, { format: 'yottamemory', version: 2, exported: today(), memories: memories });
    }
    if (req.method === 'POST' && pathname === '/api/authorize') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      return readBody(function (d) {
        const owner = String(d.owner || '');
        if (!owner) return json(400, { error: '缺少 owner。' });
        let ok = session.ownerKeys[owner];
        let rk = null;
        try { rk = unwrapRecoveryEnc(root, session.umk); } catch (e) { rk = null; }
        if (!ok) {
          if (!rk) return json(400, { error: '密钥库缺少恢复钥匙（recovery.key.enc），无法为新 owner 建钥。' });
          ok = wrapOwnerKey(root, session.umk, rk, owner);
          session.ownerKeys[owner] = ok;
        }
        writeOwnerKeyCache(root, owner, ok);
        json(200, { ok: true });
      });
    }
    if (req.method === 'POST' && pathname === '/api/revoke') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      return readBody(function (d) {
        revokeOwnerKeyCache(root, String(d.owner || ''));
        json(200, { ok: true });
      });
    }
    if (req.method === 'POST' && pathname === '/api/reset-password') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      return readBody(function (d) {
        const r = resetPasswordCore(root, { password: String(d.currentPassword || ''), recoveryKey: String(d.recoveryKey || ''), newPassword: String(d.newPassword || '') });
        if (r.error) return json(400, { error: r.text });
        const salt = loadSalt(root);
        if (salt) session = { umk: deriveUmk(String(d.newPassword || ''), salt), ownerKeys: {} };
        json(200, { ok: true, text: r.text });
      });
    }
    if (req.method === 'POST' && pathname === '/api/recovery-key') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      const rk = unwrapRecoveryEnc(root, session.umk);
      if (!rk) return json(400, { error: '未找到恢复钥匙。' });
      return json(200, { recoveryKey: rk.toString('base64') });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  server.listen(port, host, function () {
    console.log('yotta-memory 用户查看平台已启动（v' + VERSION + '）');
    console.log('URL: http://' + host + ':' + port + '（默认仅本机 127.0.0.1；远程需 --host 显式开启）');
    console.log('记忆库: ' + root);
    console.log('输入主口令解锁后可浏览 / 搜索 / 导出全部 AI 的记忆（含私密）。');
    console.log('按 Ctrl+C 停止');
  });
  return server;
}

function cmdView(opts) {
  const root = userRoot();
  ensureInit(root);
  if (!isEncrypted(root)) {
    console.error('记忆库未启用加密（无 keys/）。yotta-memory view 是加密库的用户查看平台；请先 init --encrypt 或 migrate。');
    process.exit(2);
  }
  const host = opts.host || '127.0.0.1';
  const port = opts.port || 8788;
  viewServerCore(root, port, host);
}

const VIEW_HTML = "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>元忆 · 用户查看平台</title><style>\nbody{font-family:system-ui,-apple-system,\"Microsoft YaHei\",sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1f2328;background:#fafafa}\nh1{font-size:22px} .card{background:#fff;border:1px solid #e2e2e2;border-radius:10px;padding:16px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}\nbutton{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:7px 14px;cursor:pointer;margin:2px;font-size:14px}\nbutton.danger{background:#dc2626} button.ghost{background:#e5e7eb;color:#1f2328}\ninput,select{padding:8px;border:1px solid #c9c9c9;border-radius:6px;margin:2px;font-size:14px;box-sizing:border-box}\ntable{border-collapse:collapse;width:100%;font-size:13px} td,th{border:1px solid #ececec;padding:6px 8px;text-align:left;vertical-align:top}\n.owner{display:inline-flex;align-items:center;gap:6px;border:1px solid #ddd;border-radius:8px;padding:5px 10px;margin:4px 6px 4px 0;background:#f6f8fa}\n.entry{border-bottom:1px solid #eee;padding:8px 0} .meta{color:#8a8a8a;font-size:12px}\n.err{color:#dc2626;margin-top:8px} .ok{color:#16a34a;margin-top:8px}\n#app{display:none} code{background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:12px}\n</style></head><body>\n<h1>元忆 · 用户查看平台 <span id=\"ver\" style=\"font-size:14px;color:#888\"></span></h1>\n<div id=\"lock\" class=\"card\">\n  <p><b>输入主口令解锁</b>（口令只在本地内存派生，不落盘、不发送远端）。忘口令可在 CLI 用恢复钥匙重设：<code>yotta-memory reset-password --recovery-key &lt;钥匙&gt;</code></p>\n  <input type=\"password\" id=\"pw\" placeholder=\"主口令\" style=\"width:260px\">\n  <button onclick=\"unlock()\">解锁</button>\n  <div class=\"err\" id=\"lockerr\"></div>\n</div>\n<div id=\"app\">\n  <div class=\"card\">\n    <b>AI 列表</b>（✅=已授权可读自己私密，🔒=未授权）\n    <div id=\"owners\" style=\"margin-top:8px\"></div>\n  </div>\n  <div class=\"card\">\n    <b>记忆</b>\n    <input id=\"q\" placeholder=\"搜索关键词\" style=\"width:220px\" onkeydown=\"if(event.key==='Enter'){off=0;load()}\">\n    <button onclick=\"off=0;load()\">搜索</button>\n    <button class=\"ghost\" onclick=\"doExport()\">导出 JSON</button>\n    <button class=\"ghost\" onclick=\"showRk()\">显示恢复钥匙</button>\n    <span id=\"rkout\" style=\"font-size:12px;color:#888;margin-left:8px\"></span>\n    <div id=\"meta\" style=\"margin-top:10px;font-size:12px;color:#666\"></div>\n    <div id=\"entries\" style=\"margin-top:6px\"></div>\n    <div id=\"pager\" style=\"margin-top:10px\">\n      <button class=\"ghost\" id=\"prevb\" onclick=\"prevPage()\">上一页</button>\n      <span id=\"pageinfo\" style=\"font-size:12px;color:#888;margin:0 8px\"></span>\n      <button class=\"ghost\" id=\"nextb\" onclick=\"nextPage()\">下一页</button>\n    </div>\n  </div>\n  <div class=\"card\">\n    <b>重设口令</b><br>\n    <input type=\"password\" id=\"cur\" placeholder=\"当前口令\">\n    <input type=\"password\" id=\"np1\" placeholder=\"新口令\">\n    <input type=\"password\" id=\"np2\" placeholder=\"确认新口令\">\n    <button onclick=\"resetPw()\">重设</button>\n    <span id=\"pwout\"></span>\n  </div>\n</div>\n<script>\nfunction esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\nasync function api(p,b){try{const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return await r.json();}catch(e){return{error:String(e)};}}\nasync function boot(){const s=await api('/api/status');document.getElementById('ver').textContent='v'+(s.version||'');if(s.unlocked){showApp();}}\nfunction showApp(){document.getElementById('lock').style.display='none';document.getElementById('app').style.display='block';loadOwners();load();}\nasync function unlock(){const d=await api('/api/unlock',{password:document.getElementById('pw').value});if(d.error){document.getElementById('lockerr').textContent=d.error;return;}showApp();}\nasync function loadOwners(){const d=await api('/api/owners');const box=document.getElementById('owners');box.innerHTML='';if(!d.owners||!d.owners.length){box.innerHTML='（无 owner）';return;}\n  for(const o of d.owners){const c=document.createElement('span');c.className='owner';c.innerHTML=esc(o.owner)+(o.authorized?' ✅':' 🔒')+' <button class=\"ghost\" data-a=\"'+esc(o.owner)+'\">授权</button><button class=\"danger\" data-r=\"'+esc(o.owner)+'\">吊销</button>';box.appendChild(c);}\n  box.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){api('/api/authorize',{owner:b.getAttribute('data-a')}).then(function(){loadOwners();});};});\n  box.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(){api('/api/revoke',{owner:b.getAttribute('data-r')}).then(function(){loadOwners();});};});\n}\nlet off=0,PS=50;\nasync function load(){const d=await api('/api/entries',{query:document.getElementById('q').value,offset:off,limit:PS});const meta=document.getElementById('meta');const pg=document.getElementById('pageinfo');if(meta)meta.textContent='共 '+d.count+' 条';const lim=d.limit||PS;const totalPg=Math.max(1,Math.ceil(d.count/lim));const curPg=Math.floor((d.offset||0)/lim)+1;if(pg)pg.textContent='第 '+curPg+' / '+totalPg+' 页';const box=document.getElementById('entries');box.innerHTML='';if(d.entries)for(const e of d.entries){const div=document.createElement('div');div.className='entry';div.innerHTML='<b>['+esc(e.type)+'] '+esc(e.subject)+'</b><div>'+esc(e.statement)+'</div><div class=\"meta\">'+esc(e.file)+' · owner='+esc(e.owner||'-')+' · '+esc(e.updated||e.created||'')+'</div>';box.appendChild(div);}const pb=document.getElementById('prevb'),nb=document.getElementById('nextb');if(pb)pb.disabled=(d.offset||0)<=0;if(nb)nb.disabled=!d.hasMore;}\nfunction prevPage(){if(off>=PS){off-=PS;load();}}\nfunction nextPage(){off+=PS;load();}\nasync function doExport(){const d=await api('/api/export');if(d.error){alert(d.error);return;}const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='yottamemory-view-export.json';a.click();}\nasync function showRk(){const d=await api('/api/recovery-key');document.getElementById('rkout').textContent=d.recoveryKey?('恢复钥匙: '+d.recoveryKey):(d.error||'');}\nasync function resetPw(){const np1=document.getElementById('np1').value,np2=document.getElementById('np2').value;if(np1!==np2){document.getElementById('pwout').innerHTML='<span class=\"err\">两次新口令不一致</span>';return;}\n  const d=await api('/api/reset-password',{currentPassword:document.getElementById('cur').value,newPassword:np1});document.getElementById('pwout').innerHTML=d.error?('<span class=\"err\">'+esc(d.error)+'</span>'):('<span class=\"ok\">'+esc(d.text||'ok')+'</span>');}\nboot();\n</script></body></html>";

// ---- 命令包装（CLI 入口）----
async function cmdInit(opts) {
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  const fresh = !fs.existsSync(path.join(root, PUBLIC_DIR)) && !fs.existsSync(path.join(root, PRIVATE_DIR)) && !fs.existsSync(path.join(root, INDEX_FILE));
  const wantEncrypt = opts.encrypt || (!opts.noEncrypt && fresh);
  let o = Object.assign({}, opts);
  if (wantEncrypt && !o.password && !process.env.YOTTA_MEMORY_PASS) {
    const pw = await promptPassword('主口令（启用加密，勿忘；忘口令可用恢复钥匙重设）: ');
    if (!pw) { console.error('已取消。'); process.exit(2); }
    const pw2 = await promptPassword('再次输入确认: ');
    if (pw2 !== pw) { console.error('两次输入不一致。'); process.exit(2); }
    o.password = pw;
  }
  const r = initCore(o);
  console.log(r.text);
  if (r.error) process.exit(2);
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
function cmdFeedback(ref, opts) {
  const r = feedbackCore(ref, opts);
  console.log(r.text);
  if (r.exitCode) process.exit(r.exitCode);
  if (r.error) process.exit(2);
}
function cmdExplain(ref, opts) {
  const r = explainCore(ref, opts);
  console.log(r.text);
  if (r.exitCode) process.exit(r.exitCode);
  if (r.error) process.exit(2);
}
function cmdMaintain(opts) {
  if (opts.merge) {
    const parts = String(opts.merge).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length < 2) { console.error('--merge 需要两个文件，逗号分隔'); process.exit(2); }
    const r = mergeCore(parts[0], parts[1], opts);
    console.log(r.text);
    if (r.error) process.exit(2);
    return;
  }
  const r = maintainCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdDistill(opts) {
  const r = distillCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
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
  const skipped = {};
  for (const fp of collectEntryFiles(root)) {
    const owner = ownerFromPrivatePath(root, fp);
    if (isEncFile(fp) && !getOwnerKeyFor(root, owner)) { skipped[owner] = true; continue; }
    try {
      const e = readEntry(fp, root);
      out.push({ file: e.file, meta: e.meta });
    } catch (err) { if (owner) skipped[owner] = true; }
  }
  return { memories: out, skipped: Object.keys(skipped) };
}
function exportCore(root, outPath) {
  const res = collectAll(root);
  const data = { format: 'yottamemory', version: 2, exported: today(), memories: res.memories, skippedOwners: res.skipped };
  const target = outPath || path.join(root, 'yottamemory-export-' + today() + '.json');
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  return { error: false, text: '已导出 ' + data.memories.length + ' 条记忆 -> ' + target + (res.skipped.length ? '（跳过无授权私密 owner: ' + res.skipped.join(', ') + '）' : '') };
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
  const encrypted = isEncrypted(root);
  let m = 0, skippedPriv = 0;
  for (const item of data.memories) {
    const meta = item.meta || {};
    const t = (meta.type || 'FACT').toUpperCase();
    if (!TYPE_DIRS[t]) continue;
    const owner = meta.owner || '';
    const scope = meta.scope || defaultScope(t);
    if (encrypted && scope === 'private' && !getOwnerKeyFor(root, owner)) { skippedPriv++; continue; }
    const dir = path.join(root, typeSubdir(t, owner));
    fs.mkdirSync(dir, { recursive: true });
    let seq = nextSeq(dir);
    const suffix = (encrypted && scope === 'private') ? ENC_SUFFIX : '';
    let file = path.join(dir, today() + '-' + seq + '.md' + suffix);
    while (fs.existsSync(file)) { seq = String(parseInt(seq, 10) + 1).padStart(4, '0'); file = path.join(dir, today() + '-' + seq + '.md' + suffix); }
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
      scope: scope,
      owner: owner,
      access_count: parseInt(meta.access_count || '0', 10) || 0,
      last_accessed: meta.last_accessed || '',
    };
    writeMemoryText(root, file, frontmatterToText(rec, rec.statement), owner);
    upsertIndexEntry(root, readEntry(file, root));
    m++;
  }
  return { error: false, text: '已导入 ' + m + ' 条记忆 -> ' + root + (skippedPriv ? '（跳过 ' + skippedPriv + ' 条无授权私密）' : '') };
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
    if (!/\.md(\.enc)?$/.test(f)) continue;
    const fp = path.join(dir, f);
    if (!fs.statSync(fp).isFile()) continue;
    let text;
    try { text = readMemoryText(root, fp, agentId); } catch (err) { continue; }
    const meta = parseFrontmatter(text).meta;
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
  const encrypted = isEncrypted(root);
  const existing = findSelfProfile(root, agentId);
  if (existing) {
    const fp = path.join(dir, existing);
    const parsed = parseFrontmatter(readMemoryText(root, fp, agentId));
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
    writeMemoryText(root, fp, frontmatterToText(meta, body), agentId);
    upsertIndexEntry(root, readEntry(fp, root));
    return fp;
  }
  const seq = nextSeq(dir);
  const file = path.join(dir, today() + '-' + seq + '.md' + (encrypted ? ENC_SUFFIX : ''));
  const body = selfProfileBody(agentId, root, extra);
  const rec = {
    type: 'PREF', subject: SELF_PROFILE_SUBJECT, statement: body,
    confidence: 1.0, created: today(), updated: today(),
    tags: ['自我档案'], immutable: false,
    scope: 'private', owner: agentId, access_count: 0, last_accessed: '',
  };
  writeMemoryText(root, file, frontmatterToText(rec, body), agentId);
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
    const kv = selfProfileKv(root, id);
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
      if (!/\.md(\.enc)?$/.test(f)) continue;
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      let e;
      try { e = readEntry(fp, root); } catch (err) { continue; }
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
  if (isEncrypted(root) && !getOwnerKeyFor(root, owner)) {
    return { error: true, exitCode: 3, text: '私密区已加密：当前无 ' + owner + ' 的授权密钥，请在用户平台授权（yotta-memory view → 授权本智能体）后生成画像。' };
  }
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
  const outFile = writeProfileText(root, owner, text + '\n');
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
  let text;
  try { text = readMemoryText(root, path.join(selfPrefsDir(root, id), profile), id); } catch (e) { return {}; }
  return parseKvBody(parseFrontmatter(text).body);
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
  const FENCE = String.fromCharCode(96, 96, 96);
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
    let pf = profilePathFor(root, owner);
    let pfText = null;
    if (fs.existsSync(pf)) { try { pfText = readProfileText(root, owner); } catch (e) { pfText = null; } }
    if (pfText !== null && pfText !== undefined) {
      lines.push(FENCE + 'markdown');
      lines.push(pfText.trim());
      lines.push(FENCE);
    } else {
      const pr = profileCore({ owner: owner, unsafe: unsafe, selfAgent: selfAgent });
      pf = profilePathFor(root, owner);
      if (!pr.error && pr.text.indexOf('[已写入]') !== -1 && fs.existsSync(pf)) {
        lines.push('（画像不存在，已自动生成一次，见下）');
        lines.push(FENCE + 'markdown');
        let t2 = null; try { t2 = readProfileText(root, owner); } catch (e) {}
        lines.push((t2 === null || t2 === undefined) ? '' : t2.trim());
        lines.push(FENCE);
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
      // v0.8.0 排序融合：0.5×importance(旧) + 0.5×utility(新盖棺分)
      recent.push({ e: e, s: 0.5 * importanceScore(e) + 0.5 * utilityScore(e) });
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
  lines.push('');
  lines.push('## 6. 收工纪律');
  lines.push('');
  const allEntries = [];
  for (const r of roots) for (const e of ensureIndex(r)) allEntries.push(e);
  const myCommits = allEntries.filter(function (e) { return e.type === 'COMMIT' && classifyRead(e, owner, '', unsafe, selfAgent) !== 'denied'; });
  if (!myCommits.length) {
    lines.push('- 最近承诺: 无（收工请补 COMMIT / 交接锚点）');
  } else {
    const latest = myCommits.map(function (e) { return e.updated || e.created || ''; }).sort().pop();
    const d = daysBetween(latest, today());
    lines.push('- 最近承诺: ' + latest + (d > 7 ? '（超期 ' + d + ' 天，请补 COMMIT）' : ''));
  }
  const oldCount = allEntries.filter(function (e) { return e.created && daysBetween(e.created, today()) > 180 && classifyRead(e, owner, '', unsafe, selfAgent) !== 'denied'; }).length;
  if (oldCount > 0) lines.push('- 归档提醒: ' + oldCount + ' 条超 180 天，建议 archive');
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
    { name: 'feedback', description: '显式使用反馈（自我学习）：useful/useless 调整记忆 weight/confidence/feedback_net。file 为记忆文件路径或文件名', inputSchema: { type: 'object', properties: { file: { type: 'string' }, useful: { type: 'boolean' }, useless: { type: 'boolean' }, reason: { type: 'string' } }, required: ['file'] } },
    { name: 'maintain', description: '记忆自组织（自我进化）：规则层归档/遗忘/去重预览。默认 dry-run；apply 才执行，purge 才真删', inputSchema: { type: 'object', properties: { apply: { type: 'boolean' }, purge: { type: 'boolean' }, dedup: { type: 'boolean' }, threshold: { type: 'number' }, age: { type: 'number' } } } },
    { name: 'distill', description: '心理日志蒸馏（自我提升）：统计摘要/主题画像/知识地图。owner 默认当前智能体', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, subject: { type: 'string' }, model: { type: 'string' } } } },
    { name: 'explain', description: '解释单条记忆效用分项（为什么靠前/归档/遗忘）。file 为记忆文件路径或文件名', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
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
    if (name === 'feedback') {
      const r = feedbackCore(String(args.file || ''), { selfAgent: agent, useful: !!args.useful, useless: !!args.useless, reason: args.reason ? String(args.reason) : '' });
      return { text: r.text, error: r.error };
    }
    if (name === 'maintain') {
      const r = maintainCore({ selfAgent: agent, apply: !!args.apply, purge: !!args.purge, dedup: !!args.dedup, threshold: args.threshold, age: args.age });
      return { text: r.text, error: r.error };
    }
    if (name === 'distill') {
      const r = distillCore({ selfAgent: agent, owner: args.owner ? String(args.owner) : agent, subject: args.subject ? String(args.subject) : '', model: args.model ? String(args.model) : '' });
      return { text: r.text, error: r.error };
    }
    if (name === 'explain') {
      const r = explainCore(String(args.file || ''), { selfAgent: agent });
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

// ---- stdio 本地零进程模式（客户端按需拉起 CLI）----
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
  const banner = 'yotta-memory v' + VERSION + ' — 元忆：有权限边界的文件式智能体记忆';
  const sections = [
    ['核心记忆', [
      ['init', '初始化记忆库（新建默认加密：需主口令 + 恢复钥匙；--no-encrypt 降级明文）'],
      ['remember', '写入记忆（--source 来源；--weight 权重；--verify 写后回读校验；--no-hint 关启发）'],
      ['recall', '检索记忆（--type/--limit/--agent/--owner/--all/--unsafe）'],
      ['forget', '删除一条记忆'],
      ['archive', '归档（--days/--threshold 盖棺分+年龄）'],
      ['reindex', '重建索引'],
      ['export', '导出全部记忆（--out 文件.json）'],
      ['import', '导入记忆（<文件.json>）']
    ]],
    ['身份与画像', [
      ['iam', '登记本智能体唯一身份（--name/--user/--relationship；agents.json）'],
      ['whoami', '查看当前智能体身份与登记状态'],
      ['profile', '生成用户画像（聚合 private/<owner>/ 原文，零推断）'],
      ['context', '生成开工上下文包（--limit/--owner/--budget）'],
      ['token', '生成/列出/吊销访问 token（new --agent / list / revoke --agent）']
    ]],
    ['加密与安全', [
      ['migrate', '把明文私密区迁移为密文（需主口令；迁移后打印恢复钥匙）'],
      ['view', '启动用户查看平台（--port/--host；口令解锁浏览/授权/吊销 AI）'],
      ['reset-password', '重设主口令（忘口令用恢复钥匙）'],
      ['key', '管理 AI 私密读取授权缓存（list / authorize <id> / revoke <id>）'],
      ['config', '查看/记住记忆库位置（get / set memory_home <目录>）']
    ]],
    ['平台与服务', [
      ['serve', '启动 MCP 记忆引擎（streamable HTTP；--stdio 本地零进程）'],
      ['lan', '开机自启管理（enable/disable/status；Windows 计划任务 / Linux systemd/crontab）'],
      ['--version', '版本']
    ]]
  ];
  let col = 0;
  for (const s of sections) for (const r of s[1]) if (r[0].length > col) col = r[0].length;
  col += 2;
  const lines = [banner, '', '用法:', '  yotta-memory <命令> [选项]', ''];
  for (const s of sections) {
    lines.push(s[0] + ':');
    for (const r of s[1]) lines.push('  ' + r[0].padEnd(col) + r[1]);
    lines.push('');
  }
  lines.push('类型: FACT(公共共享) / PREF(偏好) / BOUND(边界) / COMMIT(承诺)');
  lines.push('环境变量: YOTTA_MEMORY_HOME 临时覆盖用户级位置; YOTTA_AGENT_ID/AGENT_ID 当前 agent 标识（本机声明身份用；私密记忆必须有 owner）');
  lines.push('隔离: 公共 FACT 在 facts/；私密 PREF/BOUND/COMMIT 物理分目录 private/<agent_id>/<type>/，禁止 shell 直读写记忆库，一律走本命令');
  lines.push('远端接入: MCP url http://<主机IP>:8787/mcp；请求头 Authorization: Bearer <token> + X-Agent-Id: <id>');
  console.log(lines.join('\n'));
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { usage(); return; }
  const opts = {};
  const positional = [];
  const valueOpts = new Set(['--type', '--limit', '--days', '--out', '--owner', '--agent', '--threshold', '--scope', '--host', '--port', '--dir', '--name', '--user', '--relationship', '--source', '--weight', '--budget', '--password', '--new-password', '--recovery-key', '--reason', '--merge', '--model', '--subject']);
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
    else if (a === '--encrypt') opts.encrypt = true;
    else if (a === '--no-encrypt') opts.noEncrypt = true;
    else if (a === '--useful') opts.useful = true;
    else if (a === '--useless') opts.useless = true;
    else if (a === '--undo') opts.undo = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--purge') opts.purge = true;
    else if (a === '--dedup') opts.dedup = true;
    else if (a === '--explain') opts.explain = true;
    else if (a === '--semantic') opts.semantic = true;
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
      else if (a === '--password') opts.password = v;
      else if (a === '--new-password') opts.newPassword = v;
      else if (a === '--recovery-key') opts.recoveryKey = v;
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
    case 'init': await cmdInit(opts); break;
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
    case 'search': cmdRecall(rest[0] || null, opts); break;
    case 'feedback': cmdFeedback(rest[0], opts); break;
    case 'explain': cmdExplain(rest[0], opts); break;
    case 'maintain': cmdMaintain(opts); break;
    case 'distill': cmdDistill(opts); break;
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
    case 'migrate': await cmdMigrate(opts); break;
    case 'view': cmdView(opts); break;
    case 'reset-password': await cmdResetPassword(opts); break;
    case 'key': {
      const sub = rest[0];
      if (sub === 'list') cmdKeyList();
      else if (sub === 'authorize') await cmdKeyAuthorize(rest[1], opts);
      else if (sub === 'revoke') cmdKeyRevoke(rest[1]);
      else { console.error('key 子命令: list / authorize <id> / revoke <id>'); process.exit(2); }
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

if (require.main === module) { main().catch(function (e) { console.error('错误: ' + (e && e.message ? e.message : String(e))); process.exit(2); }); }
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
  feedbackCore: feedbackCore,
  explainCore: explainCore,
  maintainCore: maintainCore,
  mergeCore: mergeCore,
  distillCore: distillCore,
  utilityScore: utilityScore,
  utilityBreakdown: utilityBreakdown,
  semanticMatch: semanticMatch,
  pinyinTokens: pinyinTokens,
  isEncrypted: isEncrypted,
  collectOwners: collectOwners,
  hasPlaintextPrivate: hasPlaintextPrivate,
  initEncryptionCore: initEncryptionCore,
  deriveUmk: deriveUmk,
  loadSalt: loadSalt,
  wrapOwnerKey: wrapOwnerKey,
  unwrapOwnerKey: unwrapOwnerKey,
  unwrapOwnerKeyRecovery: unwrapOwnerKeyRecovery,
  unwrapRecoveryEnc: unwrapRecoveryEnc,
  writeOwnerKeyCache: writeOwnerKeyCache,
  revokeOwnerKeyCache: revokeOwnerKeyCache,
  loadOwnerKeyCache: loadOwnerKeyCache,
  getOwnerKeyFor: getOwnerKeyFor,
  encryptMemoryText: encryptMemoryText,
  decryptMemoryText: decryptMemoryText,
  readMemoryText: readMemoryText,
  writeMemoryText: writeMemoryText,
  loadOwnerIndex: loadOwnerIndex,
  saveOwnerIndex: saveOwnerIndex,
  viewEntriesCore: viewEntriesCore,
  ensureIndex: ensureIndex,
  recallPrefilter: recallPrefilter,
  tokenize: tokenize,
  buildTokens: buildTokens,
  synonymSet: synonymSet,

  loadIndex: loadIndex,
  saveIndex: saveIndex,
  getIndex: getIndex,
  touchIndex: touchIndex,
  loadIndexManifest: loadIndexManifest,
  indexShardName: indexShardName,
  isSafeShardName: isSafeShardName,
  ownerFromPrivatePath: ownerFromPrivatePath,
  isEncFile: isEncFile,
  profilePathFor: profilePathFor,
  readProfileText: readProfileText,
  writeProfileText: writeProfileText,
  migrateCore: migrateCore,
  resetPasswordCore: resetPasswordCore,
  keyAuthorizeCore: keyAuthorizeCore,
  keyRevokeCore: keyRevokeCore,
  promptPassword: promptPassword,
  initCore: initCore,
  viewServerCore: viewServerCore,

};

