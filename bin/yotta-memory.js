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
// v0.12.2 新增：开工 doctor（根目录/密钥库/索引/身份/最近备份）+ 破坏性操作前事务快照门（maintain/consolidate/merge/archive/purge）
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const child_process = require('child_process');
const { AsyncLocalStorage } = require('async_hooks');

const VERSION = '0.16.7';
// @generated view-html:start
const VIEW_HTML = "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>元忆 · 用户查看平台</title><style>\r\nbody{font-family:system-ui,-apple-system,\"Microsoft YaHei\",sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1f2328;background:#fafafa}\r\nh1{font-size:22px} .card{background:#fff;border:1px solid #e2e2e2;border-radius:10px;padding:16px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}\r\nbutton{background:#2563eb;color:#fff;border:0;border-radius:6px;padding:7px 14px;cursor:pointer;margin:2px;font-size:14px}\r\nbutton.danger{background:#dc2626} button.ghost{background:#e5e7eb;color:#1f2328}\r\ninput,select{padding:8px;border:1px solid #c9c9c9;border-radius:6px;margin:2px;font-size:14px;box-sizing:border-box}\r\ntable{border-collapse:collapse;width:100%;font-size:13px} td,th{border:1px solid #ececec;padding:6px 8px;text-align:left;vertical-align:top}\r\n.owner{display:inline-flex;align-items:center;gap:6px;border:1px solid #ddd;border-radius:8px;padding:5px 10px;margin:4px 6px 4px 0;background:#f6f8fa}\r\n.entry{border-bottom:1px solid #eee;padding:8px 0} .meta{color:#8a8a8a;font-size:12px}\r\n.err{color:#dc2626;margin-top:8px} .ok{color:#16a34a;margin-top:8px}\r\n#app{display:none} code{background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:12px}\r\n</style></head><body>\r\n<h1>元忆 · 用户查看平台 <span id=\"ver\" style=\"font-size:14px;color:#888\"></span></h1>\r\n<div id=\"lock\" class=\"card\">\r\n  <p><b>输入主口令解锁</b>（口令只在本地内存派生，不落盘、不发送远端）。忘口令可在 CLI 用恢复钥匙重设：<code>yotta-memory reset-password --recovery-key &lt;钥匙&gt;</code></p>\r\n  <input type=\"password\" id=\"pw\" placeholder=\"主口令\" style=\"width:260px\">\r\n  <button onclick=\"unlock()\">解锁</button>\r\n  <div class=\"err\" id=\"lockerr\"></div>\r\n</div>\r\n<div id=\"app\">\r\n  <div class=\"card\">\r\n    <b>AI 列表</b>（✅=已授权可读自己私密，🔒=未授权）\r\n    <div class=\"meta\" style=\"margin-top:6px\">「授权」由你（用户）操作：确认后生成只显示一次的 agent_key，请立即单独保存；服务端同时写临时待领取文件 <code>keys/pending/&lt;agent_id&gt;.key</code>，供该 AI 新会话领取，领取成功后自动删除。</div>\r\n    <div id=\"owners\" style=\"margin-top:8px\"></div>\r\n  </div>\r\n  <div class=\"card\">\r\n    <b>记忆</b>\r\n    <input id=\"q\" placeholder=\"搜索关键词\" style=\"width:220px\" onkeydown=\"if(event.key==='Enter'){off=0;load()}\">\r\n    <button onclick=\"off=0;load()\">搜索</button>\r\n    <button class=\"ghost\" onclick=\"doExport()\">导出 JSON</button>\r\n    <button class=\"ghost\" onclick=\"showRk()\">显示恢复钥匙</button>\r\n    <span id=\"rkout\" style=\"font-size:12px;color:#888;margin-left:8px\"></span>\r\n    <div id=\"meta\" style=\"margin-top:10px;font-size:12px;color:#666\"></div>\r\n    <div id=\"entries\" style=\"margin-top:6px\"></div>\r\n    <div id=\"pager\" style=\"margin-top:10px\">\r\n      <button class=\"ghost\" id=\"prevb\" onclick=\"prevPage()\">上一页</button>\r\n      <span id=\"pageinfo\" style=\"font-size:12px;color:#888;margin:0 8px\"></span>\r\n      <button class=\"ghost\" id=\"nextb\" onclick=\"nextPage()\">下一页</button>\r\n    </div>\r\n  </div>\r\n  <div class=\"card\">\r\n    <b>重设口令</b><br>\r\n    <input type=\"password\" id=\"cur\" placeholder=\"当前口令\">\r\n    <input type=\"password\" id=\"np1\" placeholder=\"新口令\">\r\n    <input type=\"password\" id=\"np2\" placeholder=\"确认新口令\">\r\n    <button onclick=\"resetPw()\">重设</button>\r\n    <span id=\"pwout\"></span>\r\n  </div>\r\n</div>\r\n<script>\r\nfunction esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\r\nasync function api(p,b){try{const r=await fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return await r.json();}catch(e){return{error:String(e)};}}\r\nasync function boot(){const s=await api('/api/status');document.getElementById('ver').textContent='v'+(s.version||'');if(s.unlocked){showApp();}}\r\nfunction showApp(){document.getElementById('lock').style.display='none';document.getElementById('app').style.display='block';loadOwners();load();}\r\nasync function unlock(){const d=await api('/api/unlock',{password:document.getElementById('pw').value});if(d.error){document.getElementById('lockerr').textContent=d.error;return;}showApp();}\r\nasync function loadOwners(){const d=await api('/api/owners');const box=document.getElementById('owners');box.innerHTML='';if(!d.owners||!d.owners.length){box.innerHTML=esc(d.hint||'（无 owner）');return;}\r\n  for(const o of d.owners){const c=document.createElement('span');c.className='owner';c.innerHTML=esc(o.owner)+(o.authorized?' ✅':' 🔒')+' <button class=\"ghost\" data-a=\"'+esc(o.owner)+'\">授权</button><button class=\"danger\" data-r=\"'+esc(o.owner)+'\">吊销</button>';box.appendChild(c);}\r\n  box.querySelectorAll('[data-a]').forEach(function(b){b.onclick=function(){var owner=b.getAttribute('data-a');if(!confirm('确认由你为用户授权 '+owner+' 读取其私密记忆？授权后将生成只显示一次的 agent_key，请立即保存；同时写入待领取文件供该 AI 新会话领取。AI 不应代为执行该授权操作。'))return;b.disabled=true;api('/api/authorize',{owner:owner}).then(function(d){b.disabled=false;if(!d||d.error){alert((d&&d.error)||'授权失败');loadOwners();return;}if(d.agentKey){showKey(d.agentKey);}loadOwners();});};});\r\n  box.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(){if(!confirm('确认吊销 '+b.getAttribute('data-r')+' 的 agent_key？吊销后该智能体立即失去私密读写能力。'))return;api('/api/revoke',{owner:b.getAttribute('data-r')}).then(function(){loadOwners();});};});\r\nfunction showKey(k){var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99';var box=document.createElement('div');box.className='card';box.style.cssText='max-width:640px;word-break:break-all';var t=document.createElement('div');t.innerHTML='<b>agent_key（只显示一次）</b>';var hint=document.createElement('div');hint.className='meta';hint.textContent='请用户立即单独保存。AI 新会话先执行 yotta-memory key status <agent_id>，有 pending 再执行 key claim <agent_id>；默认写入 AI_HOME/.yotta-memory-agent-key，需要时用 --to 或 --agent-key-file 指定。若 key 丢失，可吊销后重新授权；旧 key 会立即校验失败。';var ta=document.createElement('textarea');ta.readOnly=true;ta.value=k;ta.style.cssText='width:100%;height:72px;margin-top:8px;font-family:monospace;font-size:12px';var close=document.createElement('button');close.textContent='我已保存，关闭';close.onclick=function(){ov.remove();};box.appendChild(t);box.appendChild(hint);box.appendChild(ta);box.appendChild(close);ov.appendChild(box);document.body.appendChild(ov);ta.focus();ta.select();}\r\n}\r\nlet off=0,PS=50;\r\nasync function load(){const d=await api('/api/entries',{query:document.getElementById('q').value,offset:off,limit:PS});const meta=document.getElementById('meta');const pg=document.getElementById('pageinfo');if(meta)meta.textContent='共 '+d.count+' 条';const lim=d.limit||PS;const totalPg=Math.max(1,Math.ceil(d.count/lim));const curPg=Math.floor((d.offset||0)/lim)+1;if(pg)pg.textContent='第 '+curPg+' / '+totalPg+' 页';const box=document.getElementById('entries');box.innerHTML='';if(d.entries)for(const e of d.entries){const div=document.createElement('div');div.className='entry';div.innerHTML='<b>['+esc(e.type)+'] '+esc(e.subject)+'</b><div>'+esc(e.statement)+'</div><div class=\"meta\">'+esc(e.file)+' · owner='+esc(e.owner||'-')+' · '+esc(e.updated||e.created||'')+'</div>';box.appendChild(div);}const pb=document.getElementById('prevb'),nb=document.getElementById('nextb');if(pb)pb.disabled=(d.offset||0)<=0;if(nb)nb.disabled=!d.hasMore;}\r\nfunction prevPage(){if(off>=PS){off-=PS;load();}}\r\nfunction nextPage(){off+=PS;load();}\r\nasync function doExport(){const d=await api('/api/export');if(d.error){alert(d.error);return;}const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='yottamemory-view-export.json';a.click();}\r\nasync function showRk(){const d=await api('/api/recovery-key');document.getElementById('rkout').textContent=d.recoveryKey?('恢复钥匙: '+d.recoveryKey):(d.error||'');}\r\nasync function resetPw(){const np1=document.getElementById('np1').value,np2=document.getElementById('np2').value;if(np1!==np2){document.getElementById('pwout').innerHTML='<span class=\"err\">两次新口令不一致</span>';return;}\r\n  const d=await api('/api/reset-password',{currentPassword:document.getElementById('cur').value,newPassword:np1});document.getElementById('pwout').innerHTML=d.error?('<span class=\"err\">'+esc(d.error)+'</span>'):('<span class=\"ok\">'+esc(d.text||'ok')+'</span>');}\r\nboot();\r\n</script></body></html>\r\n";
// @generated view-html:end
// MCP 协议（2026-07-28 无状态 + 2025-11-25 legacy 握手，dual-era）
const MCP_PROTOCOL_MODERN = '2026-07-28';
const MCP_PROTOCOL_LEGACY = '2025-11-25';
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
const BACKUP_TASK_NAME = 'YottaMemoryBackup';
const BACKUP_SYSTEMD_SERVICE = 'yotta-memory-backup.service';
const BACKUP_SYSTEMD_TIMER = 'yotta-memory-backup.timer';
const BACKUP_CRON_MARKER = '#YTM_BACKUP:yotta-memory-backup';
const BACKUP_LAUNCHD_LABEL = 'cn.yottameta.yotta-memory.backup';
// remember 类型启发式提示关键词（statement 含主观/关系词且 type=FACT 时提示改 PREF，仅提示不拦截）
const HINT_KEYWORDS = ['用户', '偏好', '喜欢', '关系', '称呼', '本人', '希望', '讨厌', '欣赏', '习惯', '忌讳', '介意', '不要', '别用'];

// ---- 全局配置（记忆库位置持久化，固定 ~/.yottamemory/config.json）----
function configPath() {
  if (process.env.YOTTA_MEMORY_CONFIG_DIR) {
    return path.join(path.resolve(process.env.YOTTA_MEMORY_CONFIG_DIR), CONFIG_FILE);
  }
  return path.join(os.homedir(), '.yottamemory', CONFIG_FILE);
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')) || {}; } catch (e) { return {}; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  decayConfigCache = null;
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
function memoryRootId(root) {
  let resolved = path.resolve(String(root));
  if (process.platform === 'win32') resolved = resolved.toLowerCase();
  return crypto.createHash('sha256').update(resolved, 'utf8').digest('hex');
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
// ---- v0.16.0 M2: runtime stable entry ----
const RUNTIME_SCHEMA = 1;
function runtimeRoot() {
  if (process.env.YOTTA_MEMORY_RUNTIME_HOME) return path.resolve(process.env.YOTTA_MEMORY_RUNTIME_HOME);
  return path.join(path.dirname(configPath()), 'runtime');
}
function runtimeManifestPath() { return path.join(runtimeRoot(), 'runtime.json'); }
function runtimeVersionsDir() { return path.join(runtimeRoot(), 'versions'); }
function runtimeVersionDir(version) { return path.join(runtimeVersionsDir(), String(version)); }
function runtimeCurrentDir() { return path.join(runtimeRoot(), 'current'); }
function runtimeCurrentBin() { return path.join(runtimeCurrentDir(), 'bin', 'yotta-memory.js'); }
function isSafeRuntimeVersion(version) {
  const value = String(version || '').trim();
  if (!value || value === '.' || value === '..') return false;
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(value)) return false;
  return !/[\\/]/.test(value);
}
function runtimePathWithin(parent, child) {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  return c === p || c.indexOf(p + path.sep) === 0;
}
function readRuntimeManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeManifestPath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}
function writeRuntimeManifest(manifest) {
  fs.mkdirSync(runtimeRoot(), { recursive: true });
  const target = runtimeManifestPath();
  const temp = target + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(temp, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, target);
}
function runtimeTreeHash(dir) {
  const hash = crypto.createHash('sha256');
  function walk(rel) {
    const full = path.join(dir, rel);
    const entries = fs.readdirSync(full, { withFileTypes: true })
      .sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      const childFull = path.join(dir, childRel);
      if (entry.isDirectory()) {
        walk(childRel);
      } else if (entry.isFile()) {
        hash.update(childRel.replace(/\\/g, '/') + '\0');
        hash.update(fs.readFileSync(childFull));
        hash.update('\0');
      }
    }
  }
  walk('');
  return hash.digest('hex');
}
function runtimePackageVersion(dir) {
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = String(pkg.version || '').trim();
  if (!isSafeRuntimeVersion(version)) throw new Error('runtime 包版本非法: ' + version);
  return version;
}
function runtimeVerifyVersionDir(dir, expected, manifest) {
  if (!fs.existsSync(dir)) return { error: true, text: 'runtime 版本目录不存在: ' + dir };
  let version = '';
  try { version = runtimePackageVersion(dir); } catch (e) { return { error: true, text: e.message }; }
  if (version !== expected) return { error: true, text: 'runtime 版本不一致: 目录为 ' + version + '，请求 ' + expected };
  if (!fs.existsSync(path.join(dir, 'bin', 'yotta-memory.js'))) {
    return { error: true, text: 'runtime 版本缺少 bin/yotta-memory.js: ' + dir };
  }
  const treeHash = runtimeTreeHash(dir);
  const record = manifest && manifest.versions && manifest.versions[expected];
  if (record && record.treeHash && record.treeHash !== treeHash) {
    return { error: true, text: 'runtime 版本内容哈希与 runtime.json 不一致；请重新安装 ' + expected, treeHash: treeHash };
  }
  return { error: false, treeHash: treeHash };
}
function compareRuntimeVersions(a, b) {
  const pa = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
  const pb = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return String(a).localeCompare(String(b));
}
function runtimeListVersions() {
  const dir = runtimeVersionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (name) {
    if (!isSafeRuntimeVersion(name)) return false;
    return fs.existsSync(path.join(dir, name, 'package.json'));
  }).sort(function (a, b) { return compareRuntimeVersions(b, a); });
}
function runtimeManagedScript() {
  const current = runtimeCurrentBin();
  return fs.existsSync(current) ? current : __filename;
}
function runtimePatternToRegExp(pattern) {
  const escaped = String(pattern).split('*').map(function (part) {
    return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }).join('.*');
  return new RegExp('^' + escaped + '$');
}
function runtimeMatchExclude(rel, pattern) {
  const r = String(rel).replace(/\\/g, '/');
  const p = String(pattern).replace(/\\/g, '/').replace(/^\.\//, '');
  if (p.indexOf('*') === -1) return r === p || r.indexOf(p.replace(/\/$/, '') + '/') === 0;
  return runtimePatternToRegExp(p).test(r);
}
function runtimeCopyTreeFiltered(src, dst, excludes, relBase) {
  const base = relBase ? relBase + '/' : '';
  const entries = fs.readdirSync(src, { withFileTypes: true });
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const rel = base + entry.name;
    if (excludes.some(function (pattern) { return runtimeMatchExclude(rel, pattern); })) continue;
    const source = path.join(src, entry.name);
    const target = path.join(dst, entry.name);
    if (entry.isDirectory()) runtimeCopyTreeFiltered(source, target, excludes, rel);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}
function runtimeCopyTree(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    runtimeCopyTreeFiltered(src, dst, [], '');
  } else if (st.isFile()) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}
function runtimeCopyPackageFromRoot(srcRoot, dstRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(srcRoot, 'package.json'), 'utf8'));
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  const includes = ['package.json'].concat(files.filter(function (entry) { return entry && entry[0] !== '!'; }));
  const excludes = files.filter(function (entry) { return entry && entry[0] === '!'; }).map(function (entry) { return entry.slice(1); });
  for (const entry of includes) {
    const rel = String(entry).replace(/^\.\//, '');
    const source = path.join(srcRoot, rel);
    if (!fs.existsSync(source)) continue;
    const target = path.join(dstRoot, rel);
    const st = fs.statSync(source);
    if (st.isDirectory()) {
      runtimeCopyTreeFiltered(source, target, excludes, rel);
    } else if (st.isFile() && !excludes.some(function (pattern) { return runtimeMatchExclude(rel, pattern); })) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}
function runtimeRemoveVersionDir(version) {
  const target = runtimeVersionDir(version);
  if (!runtimePathWithin(runtimeVersionsDir(), target)) throw new Error('拒绝删除 runtime 目录外的路径: ' + target);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}
function runtimeSwitchCurrent(version) {
  const dir = runtimeVersionDir(version);
  if (!fs.existsSync(path.join(dir, 'package.json'))) throw new Error('runtime 版本未安装: ' + version);
  fs.mkdirSync(runtimeRoot(), { recursive: true });
  const temp = path.join(runtimeRoot(), '.current-' + process.pid + '-' + Date.now());
  const current = runtimeCurrentDir();
  try {
    fs.symlinkSync(dir, temp, process.platform === 'win32' ? 'junction' : 'dir');
    if (fs.existsSync(current)) {
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(current);
      else throw new Error('current 已存在且不是可替换的指针: ' + current);
    }
    fs.renameSync(temp, current);
  } catch (e) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (ignore) {}
    throw e;
  }
}
function runtimeInstallPrepared(pkgRoot, version, opts) {
  opts = opts || {};
  if (!isSafeRuntimeVersion(version)) return { error: true, text: '非法 runtime 版本: ' + version };
  fs.mkdirSync(runtimeVersionsDir(), { recursive: true });
  const finalDir = runtimeVersionDir(version);
  const staging = path.join(runtimeVersionsDir(), '.' + version + '.tmp-' + process.pid + '-' + Date.now());
  try {
    runtimeCopyTree(pkgRoot, staging);
    if (runtimePackageVersion(staging) !== version) throw new Error('安装包版本与目标版本不一致');
    if (!fs.existsSync(path.join(staging, 'bin', 'yotta-memory.js'))) throw new Error('安装包缺少 bin/yotta-memory.js');
    const treeHash = runtimeTreeHash(staging);
    if (fs.existsSync(finalDir)) {
      const existingHash = runtimeTreeHash(finalDir);
      if (existingHash === treeHash) {
        fs.rmSync(staging, { recursive: true, force: true });
        return { error: false, installed: false, version: version, treeHash: treeHash, path: finalDir, text: 'runtime ' + version + ' 已安装且内容一致。' };
      }
      if (!opts.force) throw new Error('runtime ' + version + ' 已安装且内容不同；如需覆盖请加 --force。');
      runtimeRemoveVersionDir(version);
    }
    fs.renameSync(staging, finalDir);
    const previousManifest = readRuntimeManifest();
    const manifest = previousManifest || { schema: RUNTIME_SCHEMA, current: '', previous: '', versions: {}, updatedAt: '' };
    manifest.schema = RUNTIME_SCHEMA;
    manifest.versions = manifest.versions || {};
    manifest.versions[version] = Object.assign({}, manifest.versions[version], {
      version: version,
      path: finalDir,
      treeHash: treeHash,
      installedAt: new Date().toISOString(),
      source: opts.source || 'unknown',
    });
    if (!manifest.current) manifest.current = version;
    manifest.updatedAt = new Date().toISOString();
    writeRuntimeManifest(manifest);
    if (manifest.current === version) {
      try {
        runtimeSwitchCurrent(version);
      } catch (e) {
        if (previousManifest) writeRuntimeManifest(previousManifest);
        return { error: true, text: '切换 current 失败: ' + e.message };
      }
    }
    return { error: false, installed: true, version: version, treeHash: treeHash, path: finalDir, text: '已安装 runtime ' + version + ' 到 ' + finalDir };
  } catch (e) {
    try { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); } catch (ignore) {}
    return { error: true, text: e.message };
  }
}
function runtimeValidateTarballEntries(entries) {
  const normalized = (entries || []).map(function (entry) {
    return String(entry || '').replace(/\\/g, '/').replace(/\/+$/, '');
  }).filter(Boolean);
  if (!normalized.length) throw new Error('runtime tarball 为空');
  for (const entry of normalized) {
    if (entry[0] === '/' || /^[A-Za-z]:/.test(entry)) throw new Error('runtime tarball 含绝对路径成员: ' + entry);
    const parts = entry.split('/');
    if (parts.indexOf('..') !== -1) throw new Error('runtime tarball 含路径穿越成员: ' + entry);
    if (parts[0] !== 'package') throw new Error('runtime tarball 含 package/ 之外的成员: ' + entry);
  }
  if (normalized.indexOf('package/package.json') === -1) throw new Error('runtime tarball 缺少 package/package.json');
}
function tarPathArg(value) {
  const abs = path.resolve(String(value));
  return process.platform === 'win32' ? abs.replace(/\\/g, '/') : abs;
}
function runtimeListTarballEntries(tarball) {
  const tarBin = process.env.YOTTA_RUNTIME_TAR || 'tar';
  const tarArgs = process.platform === 'win32'
    ? ['--force-local', '-tzf', tarPathArg(tarball)]
    : ['-tzf', tarPathArg(tarball)];
  const listed = child_process.spawnSync(tarBin, tarArgs, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (listed.error) throw new Error('无法执行 tar: ' + listed.error.message);
  if (listed.status !== 0) throw new Error('读取 runtime tarball 失败: ' + String(listed.stderr || listed.stdout || '').trim());
  return String(listed.stdout || '').split(/\r?\n/).filter(Boolean);
}
function runtimeExtractTarball(tarball, tempDir) {
  runtimeValidateTarballEntries(runtimeListTarballEntries(tarball));
  const tarBin = process.env.YOTTA_RUNTIME_TAR || 'tar';
  const tarArgs = process.platform === 'win32'
    ? ['--force-local', '-xzf', tarPathArg(tarball), '-C', tarPathArg(tempDir)]
    : ['-xzf', tarPathArg(tarball), '-C', tarPathArg(tempDir)];
  const result = child_process.spawnSync(tarBin, tarArgs, { encoding: 'utf8' });
  if (result.error) throw new Error('无法执行 tar: ' + result.error.message);
  if (result.status !== 0) throw new Error('解压 runtime tarball 失败: ' + String(result.stderr || result.stdout || '').trim());
  const packaged = path.join(tempDir, 'package');
  if (fs.existsSync(path.join(packaged, 'package.json'))) return packaged;
  if (fs.existsSync(path.join(tempDir, 'package.json'))) return tempDir;
  throw new Error('runtime tarball 中未找到 package/package.json');
}
function runtimeInstallFromCurrent(opts) {
  opts = opts || {};
  const srcRoot = path.join(__dirname, '..');
  const pkgPath = path.join(srcRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return { error: true, text: '当前运行时不是完整 npm 包（缺少 package.json），无法安装稳定入口。' };
  let version = '';
  try { version = runtimePackageVersion(srcRoot); } catch (e) { return { error: true, text: e.message }; }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-runtime-current-'));
  try {
    const staged = path.join(temp, 'package');
    runtimeCopyPackageFromRoot(srcRoot, staged);
    return runtimeInstallPrepared(staged, version, { source: 'current', force: !!opts.force });
  } catch (e) {
    return { error: true, text: e.message };
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (ignore) {}
  }
}
function runtimeInstallTarball(tarball, requestedVersion, opts) {
  opts = opts || {};
  const abs = path.resolve(String(tarball || ''));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { error: true, text: 'runtime tarball 不存在: ' + abs };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-runtime-tarball-'));
  try {
    const pkgRoot = runtimeExtractTarball(abs, temp);
    const version = runtimePackageVersion(pkgRoot);
    if (requestedVersion && String(requestedVersion) !== version) {
      throw new Error('runtime 包版本 ' + version + ' 与请求版本 ' + requestedVersion + ' 不一致');
    }
    return runtimeInstallPrepared(pkgRoot, version, { source: abs, force: !!opts.force });
  } catch (e) {
    return { error: true, text: e.message };
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (ignore) {}
  }
}
function runtimeNpmSpec() {
  const candidates = [];
  if (process.env.npm_execpath) candidates.push(process.env.npm_execpath);
  candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  candidates.push(path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return { command: process.execPath, args: [path.resolve(candidate)] };
  }
  return null;
}
function runtimeRunNpm(args, opts) {
  const spec = runtimeNpmSpec();
  if (!spec) throw new Error('无法定位 npm CLI；请改用 runtime install <本地 tarball>。');
  const result = child_process.spawnSync(spec.command, spec.args.concat(args), {
    cwd: (opts && opts.cwd) || process.cwd(),
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.error) throw new Error('npm 执行失败: ' + result.error.message);
  if (result.status !== 0) throw new Error('npm 执行失败: ' + String(result.stderr || result.stdout || '').trim());
  return result;
}
function runtimeInstallVersion(version, opts) {
  const target = String(version || '').trim();
  if (!isSafeRuntimeVersion(target)) return { error: true, text: '非法 runtime 版本: ' + target };
  if (target === VERSION) return runtimeInstallFromCurrent(opts);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-runtime-pack-'));
  try {
    fs.mkdirSync(runtimeRoot(), { recursive: true });
    runtimeRunNpm(['pack', '@yottameta/yotta-memory@' + target, '--pack-destination', temp], { cwd: runtimeRoot() });
    const tarball = fs.readdirSync(temp).filter(function (name) { return /\.tgz$/i.test(name); })[0];
    if (!tarball) throw new Error('npm pack 未生成 tarball');
    return runtimeInstallTarball(path.join(temp, tarball), target, opts);
  } catch (e) {
    return { error: true, text: e.message };
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch (ignore) {}
  }
}
function runtimeUseCore(version, opts) {
  opts = opts || {};
  const target = String(version || '').trim();
  if (!isSafeRuntimeVersion(target)) return { error: true, text: '非法 runtime 版本: ' + target };
  const manifest = readRuntimeManifest();
  if (!manifest) return { error: true, text: 'runtime 未初始化，请先运行 yotta-memory runtime install --from-current。' };
  const dir = runtimeVersionDir(target);
  if (!fs.existsSync(dir)) return { error: true, text: 'runtime 版本未安装: ' + target };
  const check = runtimeVerifyVersionDir(dir, target, manifest);
  if (check.error) return check;
  const previous = manifest.current && manifest.current !== target ? manifest.current : (manifest.previous && manifest.previous !== target ? manifest.previous : '');
  const previousManifest = JSON.parse(JSON.stringify(manifest));
  try {
    runtimeSwitchCurrent(target);
  } catch (e) {
    return { error: true, text: '切换 current 失败: ' + e.message };
  }
  manifest.schema = RUNTIME_SCHEMA;
  manifest.current = target;
  manifest.previous = previous || '';
  manifest.updatedAt = new Date().toISOString();
  manifest.versions = manifest.versions || {};
  manifest.versions[target] = Object.assign({}, manifest.versions[target], { treeHash: check.treeHash, lastUsedAt: new Date().toISOString() });
  try {
    writeRuntimeManifest(manifest);
  } catch (e) {
    try { if (previous) runtimeSwitchCurrent(previous); } catch (ignore) {}
    return { error: true, text: '写入 runtime.json 失败: ' + e.message };
  }
  let tail = '；如需重启受管 server，请加 --restart';
  if (opts.restart) {
    const restart = opts.restartFn ? opts.restartFn() : runtimeRestartManagedServer();
    if (restart && restart.error) {
      let rollbackText = '';
      if (previous) {
        try {
          runtimeSwitchCurrent(previous);
          const rollback = JSON.parse(JSON.stringify(previousManifest));
          rollback.current = previous;
          rollback.previous = target;
          rollback.updatedAt = new Date().toISOString();
          writeRuntimeManifest(rollback);
          (opts.restartFn ? opts.restartFn() : runtimeRestartManagedServer());
          rollbackText = '；已回滚 current 到 ' + previous;
        } catch (e) {
          rollbackText = '；回滚失败: ' + e.message;
        }
      }
      return { error: true, text: '受管 server 重启失败: ' + (restart.text || '') + rollbackText };
    }
    tail = '；受管 server 已重启';
  }
  return { error: false, text: '已切换 current 到 ' + target + tail + '。', version: target, treeHash: check.treeHash };
}
function runtimeRollbackCore(opts) {
  const manifest = readRuntimeManifest();
  if (!manifest || !manifest.current) return { error: true, text: 'runtime 未初始化或没有当前版本。' };
  if (!manifest.previous) return { error: true, text: '没有可回滚的 runtime 版本。' };
  const target = manifest.previous;
  const result = runtimeUseCore(target, opts);
  if (result.error) return result;
  return { error: false, text: '已回滚 current 到 ' + target + '。' + result.text, version: target };
}
function runtimeStatusCore() {
  const root = runtimeRoot();
  const manifest = readRuntimeManifest();
  const lines = ['runtime root: ' + root];
  const drift = [];
  if (!manifest) {
    lines.push('runtime: 未初始化');
    lines.push('提示: yotta-memory runtime install --from-current');
    return { error: false, text: lines.join('\n'), runtimeRoot: root, drift: ['runtime manifest missing'] };
  }
  lines.push('current: ' + (manifest.current || '(none)'));
  lines.push('current path: ' + runtimeCurrentDir());
  if (manifest.previous) lines.push('previous: ' + manifest.previous);
  if (!manifest.current) drift.push('current version missing in runtime.json');
  else {
    const dir = runtimeVersionDir(manifest.current);
    if (!fs.existsSync(dir)) drift.push('current version dir missing');
    if (!fs.existsSync(runtimeCurrentBin())) drift.push('current launcher missing');
    else {
      try {
        const real = fs.realpathSync(runtimeCurrentDir());
        if (path.resolve(real) !== path.resolve(dir)) drift.push('current pointer mismatch');
      } catch (e) {
        drift.push('current pointer unreadable');
      }
    }
  }
  const versions = runtimeListVersions();
  lines.push('versions: ' + (versions.length ? versions.join(', ') : '(none)'));
  lines.push('drift: ' + (drift.length ? drift.join('; ') : 'none'));
  return { error: false, text: lines.join('\n'), runtimeRoot: root, manifest: manifest, drift: drift };
}
function runtimeListCore() {
  const manifest = readRuntimeManifest() || { current: '', versions: {} };
  const versions = runtimeListVersions();
  const lines = ['runtime versions:'];
  if (!versions.length) lines.push('  (none)');
  for (const version of versions) {
    const record = (manifest.versions && manifest.versions[version]) || {};
    lines.push('  ' + version + (manifest.current === version ? '  [current]' : '') + (record.treeHash ? '  ' + record.treeHash.slice(0, 12) + '...' : ''));
  }
  return { error: false, text: lines.join('\n'), versions: versions, current: manifest.current || '' };
}
function runtimeExecutionPath() {
  const invoked = process.argv && process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (invoked && path.basename(invoked).toLowerCase() === 'yotta-memory.js') return invoked;
  return path.resolve(__filename);
}
function runtimeEnsureForManagedTask() {
  const manifest = readRuntimeManifest();
  if (manifest && manifest.current) {
    const check = runtimeVerifyVersionDir(runtimeVersionDir(manifest.current), manifest.current, manifest);
    if (!check.error && fs.existsSync(runtimeCurrentBin())) {
      return { error: false, text: 'runtime current 已就绪: ' + manifest.current, version: manifest.current };
    }
  }
  return runtimeInstallFromCurrent({ force: false });
}
function runtimeRestartManagedServer() {
  const platform = lanPlatform();
  if (platform === 'win32') {
    const query = child_process.spawnSync('schtasks', ['/query', '/tn', LAN_TASK_NAME, '/fo', 'LIST'], { encoding: 'utf8' });
    if (query.status !== 0) return { error: true, text: '未检测到受管计划任务 ' + LAN_TASK_NAME + '。' };
    const end = child_process.spawnSync('schtasks', ['/end', '/tn', LAN_TASK_NAME], { encoding: 'utf8' });
    const run = child_process.spawnSync('schtasks', ['/run', '/tn', LAN_TASK_NAME], { encoding: 'utf8' });
    if (run.status !== 0) return { error: true, text: '计划任务重启失败: ' + String(run.stderr || run.stdout || '').trim() };
    return { error: false, text: '已重启计划任务 ' + LAN_TASK_NAME + (end.status === 0 ? '' : '（原任务未在运行）') };
  }
  if (platform === 'linux') {
    const unit = lanLinuxUnitPath();
    if (fs.existsSync(unit) && lanFileHasMarker(unit)) {
      const result = lanLinuxSystemctl(['restart', LAN_UNIT_NAME]);
      if (result.status !== 0) return { error: true, text: 'systemd 重启失败: ' + String(result.err || '').trim() };
      return { error: false, text: '已重启 systemd 用户单元 ' + LAN_UNIT_NAME };
    }
    if (lanCrontabHasOurLine(lanCrontabRead())) {
      return { error: true, text: '受管 server 由 crontab @reboot 启动，无法在线重启；请手动重启。' };
    }
  }
  return { error: true, text: '未检测到可管理的 server 自启配置，未执行重启。' };
}
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
let RUNTIME_AGENT = { id: '', agentKey: '' };
const IDENTITY_CONTEXT = new AsyncLocalStorage();
const RUNTIME_OWNER_KEYS = new Map();
function setRuntimeAgent(id, agentKey) {
  RUNTIME_AGENT = { id: String(id || '').trim(), agentKey: String(agentKey || '').trim() };
  RUNTIME_OWNER_KEYS.clear();
}
function currentRuntimeIdentity() {
  return IDENTITY_CONTEXT.getStore() || RUNTIME_AGENT;
}
function runWithIdentity(identity, fn) {
  const store = {
    id: String((identity && identity.id) || '').trim(),
    agentKey: String((identity && identity.agentKey) || '').trim(),
  };
  return IDENTITY_CONTEXT.run(store, fn);
}
function legacyIdentityEnvNames() {
  return ['YOTTA_AGENT_ID', 'AGENT_ID', 'YOTTA_MEMORY_AGENT_KEY', 'YOTTA_MEMORY_TRUST_ENV_AGENT']
    .filter(function (name) { return String(process.env[name] || '').trim() !== ''; });
}
function legacyIdentityEnvError() {
  const names = legacyIdentityEnvNames();
  if (!names.length) return '';
  return [
    '[YTM_IDENTITY_ENV_REMOVED] 检测到旧身份环境变量: ' + names.join(', '),
    '0.16.0 已删除身份 env：HTTP / 远程 MCP 只用请求头 Authorization + X-Agent-Id + X-Agent-Key；stdio MCP 只用显式参数 --agent-id <id> + --agent-key-file <path>。',
    'CLI 仍使用 --agent <id> + --agent-key/--agent-key-file。请从宿主 MCP 配置中移除身份 env 后重试。',
  ].join('\n');
}
function resolveIdentity(opts) {
  opts = opts || {};
  const explicitAgent = String(opts.agent || opts.selfAgent || '').trim();
  const explicitAgentId = String(opts.agentId || '').trim();
  if (explicitAgent && explicitAgentId && explicitAgent !== explicitAgentId) {
    return { id: '', agentKey: '', source: 'conflict', error: '身份冲突：--agent ' + explicitAgent + ' 与 --agent-id ' + explicitAgentId + ' 不一致，请只保留一个身份参数。' };
  }
  const explicit = explicitAgent || explicitAgentId;
  let explicitKey = String(opts.agentKey || '').trim();
  const keyFile = String(opts.agentKeyFile || '').trim();
  if (keyFile) {
    let fileKey = '';
    try { fileKey = fs.readFileSync(path.resolve(keyFile), 'utf8').trim(); } catch (e) {
      if (e && e.code === 'ENOENT') {
        return {
          id: explicit,
          agentKey: '',
          source: 'missing-key-file',
          keyFile: keyFile,
          warning: '未找到 agent-key 文件: ' + keyFile + '；已降级为未授权模式（公共 FACT 可读，私密操作需要显式授权）。',
          error: '',
        };
      }
      return { id: '', agentKey: '', source: 'invalid-key-file', error: '无法读取 agent-key 文件: ' + keyFile };
    }
    if (!fileKey) return { id: '', agentKey: '', source: 'invalid-key-file', error: 'agent-key 文件为空: ' + keyFile };
    if (explicitKey && explicitKey !== fileKey) return { id: '', agentKey: '', source: 'key-conflict', error: '--agent-key 与 --agent-key-file 内容不一致。' };
    explicitKey = fileKey;
  }
  if (explicit && !isSafeAgentId(explicit)) {
    return { id: '', agentKey: '', source: 'invalid', error: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  }
  if (explicit) {
    return { id: explicit, agentKey: explicitKey, source: 'explicit', error: '' };
  }
  return { id: '', agentKey: '', source: 'none', error: '' };
}
function identityDiagnostic(ident) {
  ident = ident || {};
  const invalid = !!ident.error;
  const authenticated = !invalid && !!ident.agentKey;
  const mode = invalid ? 'invalid' : (authenticated ? 'authenticated' : (ident.id ? 'unauthenticated' : 'anonymous'));
  const agentKeyStatus = invalid ? 'invalid' : (authenticated ? 'present' : (ident.source === 'missing-key-file' ? 'missing' : 'not-provided'));
  const out = {
    agentId: ident.id || '',
    mode: mode,
    agentKeyStatus: agentKeyStatus,
    source: ident.source || 'none',
  };
  if (ident.keyFile) out.keyFile = path.resolve(String(ident.keyFile));
  if (ident.source === 'missing-key-file') {
    out.action = '由用户在 yotta-memory view 中授权，或执行 yotta-memory key bind ' + (ident.id || '<id>') + '；随后 AI 执行 key status / key claim。';
  }
  return out;
}
function isSafeAgentId(id) {
  const value = String(id || '');
  if (!value || value.length > 128) return false;
  if (value === '.' || value === '..') return false;
  if (/[\\/]/.test(value)) return false;
  if (/[\u0000-\u001f]/.test(value)) return false;
  return true;
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
// ---- 安全边界：路径必须落在记忆库根内（防 MCP 任意路径读写，v0.8.5）----
function resolveWithinRoot(root, p) {
  let abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(root, p);
  const r = path.resolve(root);
  if (abs === r) return abs;
  if (abs.startsWith(r + path.sep)) return abs;
  return null;
}
function isWithinRoot(root, p) { return !!resolveWithinRoot(root, p); }
// 把命令行安全拆分为 argv（支持 ' " 引号包参，但绝不经过 shell，防元字符注入）
function splitCommandArgv(s) {
  const argv = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < String(s).length; i++) {
    const c = String(s)[i];
    if (quote) {
      if (c === quote) { quote = null; continue; }
      if (c === '\\' && quote === '"') { cur += String(s)[i + 1] || ''; i++; continue; }
      cur += c; continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ' ' || c === '\t') { if (cur) { argv.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) argv.push(cur);
  return argv;
}
// 模型命令允许清单：环境变量 YOTTA_DISTILL_MODELS（逗号分隔可执行名，不含扩展名）或 config.distill_models；
// 未配置时放行（本地宿主 CLI 自担风险，但已去除 shell 注入面）；MCP 已在上层直接拒绝 model，不达此处。
function distillModelAllowlist() {
  const env = (process.env.YOTTA_DISTILL_MODELS || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  if (env.length) return env;
  const cfg = loadConfig();
  const c = cfg && (cfg.distill_models || []);
  if (Array.isArray(c) && c.length) return c.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
  return null;
}
// 安全执行外部模型命令：仅允许清单内可执行名；argv 分离、不经 shell。
function runDistillModel(modelStr, payload) {
  const argv = splitCommandArgv(modelStr);
  if (!argv.length) throw new Error('模型命令为空');
  const base = path.basename(argv[0]).toLowerCase().replace(/\.exe$/i, '');
  const allow = distillModelAllowlist();
  if (allow && allow.length && allow.indexOf(base) === -1) {
    throw new Error('模型命令不在允许清单内: ' + base + '（可用: ' + allow.join(', ') + '；或设环境变量 YOTTA_DISTILL_MODELS）');
  }
  const r = child_process.spawnSync(argv[0], argv.slice(1), { input: payload, encoding: 'utf8', maxBuffer: 1024 * 1024, shell: false, windowsHide: true });
  return r;
}
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function runEmbeddingPlugin(command, texts, timeoutMs) {
  const argv = splitCommandArgv(String(command || ''));
  if (!argv.length) throw new Error('embedding 命令为空');
  const payload = JSON.stringify({ texts: (texts || []).map(String) });
  const timeout = Math.max(1, parseInt(timeoutMs, 10) || 3000);
  const r = child_process.spawnSync(argv[0], argv.slice(1), {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: false,
    windowsHide: true,
    timeout: timeout
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('embedding 插件退出码 ' + r.status);
  const parsed = JSON.parse(String(r.stdout || ''));
  if (!parsed || !Array.isArray(parsed.vectors)) throw new Error('embedding 插件输出缺少 vectors 数组');
  if (parsed.vectors.length !== texts.length) throw new Error('embedding 向量数量不匹配');
  return parsed.vectors;
}
function embeddingCandidates(entries, query, opts) {
  opts = opts || {};
  const command = opts.embedding || '';
  if (!command) return [];
  const texts = [String(query || '')].concat((entries || []).map(function (e) {
    return [e.subject || '', e.statement || '', (e.tags || []).join(' ')].join(' ');
  }));
  const root = opts.root ? String(opts.root) : '';
  let cache = {};
  let cachePath = '';
  if (root) {
    cachePath = path.join(root, '.embed', 'cache.json');
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (err) {
      cache = {};
    }
  }
  const keys = texts.map(function (text) {
    return crypto.createHash('sha256').update(command + '\0' + text).digest('hex');
  });
  const missing = [];
  const missingIndexes = [];
  const vectors = new Array(texts.length);
  for (let i = 0; i < texts.length; i++) {
    if (cache[keys[i]]) {
      vectors[i] = cache[keys[i]];
    } else {
      missing.push(texts[i]);
      missingIndexes.push(i);
    }
  }
  if (missing.length) {
    const missingVectors = runEmbeddingPlugin(command, missing, opts.embeddingTimeout);
    for (let i = 0; i < missingVectors.length; i++) {
      const idx = missingIndexes[i];
      vectors[idx] = missingVectors[i];
      cache[keys[idx]] = missingVectors[i];
    }
    if (cachePath) {
      try { fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8'); } catch (err) {}
    }
  }
  const queryVec = vectors[0];
  const out = [];
  for (let i = 1; i < vectors.length; i++) {
    const sim = cosineSimilarity(queryVec, vectors[i]);
    if (sim > 0) out.push({ entry: entries[i - 1], score: sim, detail: ['embedding:' + round3(sim)] });
  }
  return out;
}
function effectiveEmbeddingCommand(opts) {
  opts = opts || {};
  if (opts.embedding) return String(opts.embedding);
  const cfg = loadConfig();
  return cfg && cfg.embedding_cmd ? String(cfg.embedding_cmd) : '';
}
function effectiveEmbeddingTimeout(opts) {
  opts = opts || {};
  if (opts.embeddingTimeout) return parseInt(opts.embeddingTimeout, 10) || 3000;
  const cfg = loadConfig();
  return cfg && cfg.embedding_timeout ? parseInt(cfg.embedding_timeout, 10) || 3000 : 3000;
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
  const recencyScore = decayRecency(String(meta.type || 'FACT').toUpperCase(), last ? daysBetween(last, today()) : 0, decayConfig());
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
  const recencyScore = decayRecency(String(meta.type || 'FACT').toUpperCase(), last ? daysBetween(last, today()) : 0, decayConfig());
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
const AGENT_MAGIC = 'YTMAGENT1';
const KEYS_DIR = 'keys';
const KEY_CACHE_DIR = 'cache';
const AGENT_BINDINGS_DIR = 'bindings';
const AGENT_PENDING_DIR = 'pending';
const AGENT_KEY_FILENAME = '.yotta-memory-agent-key';
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
function encBindingsDir(root) { return path.join(encKeysDir(root), AGENT_BINDINGS_DIR); }
function encAgentBindingPath(root, id) { return path.join(encBindingsDir(root), id + '.key.agent'); }
function encPendingDir(root) { return path.join(encKeysDir(root), AGENT_PENDING_DIR); }
function encPendingPath(root, id) { return path.join(encPendingDir(root), id + '.key'); }
function agentKeyFilePath(agentHome) { return path.join(path.resolve(agentHome), AGENT_KEY_FILENAME); }
function detectAgentHost(owner) {
  const hint = String(process.env.YOTTA_MEMORY_AGENT_HOST || '').trim().toLowerCase();
  if (hint === 'codex' || hint === 'opencode') return hint;
  const id = String(owner || '').toLowerCase();
  if (/(^|[-_.])opencode([-_.]|$)/.test(id)) return 'opencode';
  if (id === 'codex' || id.indexOf('codex-') === 0) return 'codex';
  if (process.env.OPENCODE_API_KEY || process.env.OPENCODE_CONFIG) return 'opencode';
  if (process.env.CODEX_HOME) return 'codex';
  return 'generic';
}
function resolveAgentKeyLocation(owner, opts) {
  opts = opts || {};
  const explicitHome = String(opts.to || '').trim();
  const explicitFile = String(opts.agentKeyFile || '').trim();
  const explicitPluginData = String(opts.pluginData || '').trim();
  if (explicitHome && explicitFile) {
    return { ok: false, error: '--to 与 --agent-key-file 不能同时使用。' };
  }
  if (explicitPluginData && (explicitHome || explicitFile)) {
    return { ok: false, error: '--plugin-data 不能与 --to / --agent-key-file 同时使用。' };
  }
  if (explicitPluginData) {
    return { ok: true, file: agentKeyFilePath(explicitPluginData), source: 'option:--plugin-data' };
  }
  if (explicitFile) {
    return { ok: true, file: path.resolve(explicitFile), source: 'option:--agent-key-file' };
  }
  if (explicitHome) {
    return { ok: true, file: agentKeyFilePath(explicitHome), source: 'option:--to' };
  }
  const envFile = String(process.env.YOTTA_MEMORY_AGENT_KEY_FILE || '').trim();
  if (envFile) {
    return { ok: true, file: path.resolve(envFile), source: 'env:YOTTA_MEMORY_AGENT_KEY_FILE' };
  }
  const envHome = String(process.env.YOTTA_MEMORY_AGENT_HOME || '').trim();
  if (envHome) {
    return { ok: true, file: agentKeyFilePath(envHome), source: 'env:YOTTA_MEMORY_AGENT_HOME' };
  }
  const host = detectAgentHost(owner);
  if (host === 'codex') {
    const home = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
    return { ok: true, file: agentKeyFilePath(home), source: 'host:codex' };
  }
  if (host === 'opencode') {
    const base = process.env.XDG_CONFIG_HOME ? path.resolve(process.env.XDG_CONFIG_HOME) : path.join(os.homedir(), '.config');
    return { ok: true, file: agentKeyFilePath(path.join(base, 'opencode')), source: 'host:opencode' };
  }
  return { ok: true, file: agentKeyFilePath(path.join(os.homedir(), '.' + owner)), source: 'host:generic' };
}
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
function recoverOwnerKeyFromRecovery(root, owner, umk, rk) {
  if (!isSafeAgentId(owner) || !Buffer.isBuffer(rk)) return null;
  try {
    const ownerKey = unwrapOwnerKeyRecovery(root, owner, rk);
    if (!ownerKey) return null;
    fs.writeFileSync(encOwnerKeyPath(root, owner), Buffer.concat([
      Buffer.from(KEY_MAGIC, 'utf8'),
      aesEncryptBytes(umk, ownerKey, Buffer.from('owner:' + owner, 'utf8')),
    ]));
    return ownerKey;
  } catch (e) {
    return null;
  }
}
function privateOwnerHasData(root, owner) {
  if (!isSafeAgentId(owner)) return false;
  const dir = path.join(root, PRIVATE_DIR, owner);
  if (!fs.existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch (e) { continue; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      } else if (entry.isFile() && entry.name !== ENC_INDEX_FILE) {
        return true;
      }
    }
  }
  return false;
}
function revokeOwnerKeyCache(root, owner) {
  const p = encCachePath(root, owner);
  if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
  return false;
}
function writeAgentBinding(root, owner, ownerKey, agentKey) {
  if (!isSafeAgentId(owner)) throw new Error('非法 agent ID');
  if (!Buffer.isBuffer(agentKey) || agentKey.length !== 32) throw new Error('agent_key 必须是 32 字节');
  fs.mkdirSync(encBindingsDir(root), { recursive: true });
  const aad = Buffer.from('agent:' + owner, 'utf8');
  const env = aesEncryptBytes(agentKey, ownerKey, aad);
  fs.writeFileSync(encAgentBindingPath(root, owner), Buffer.concat([Buffer.from(AGENT_MAGIC, 'utf8'), env]));
  try { fs.chmodSync(encAgentBindingPath(root, owner), 0o600); } catch (e) {}
}
function writePendingAgentKey(root, owner, agentKey) {
  if (!isSafeAgentId(owner)) throw new Error('非法 agent ID');
  if (!Buffer.isBuffer(agentKey) || agentKey.length !== 32) throw new Error('agent_key 必须是 32 字节');
  fs.mkdirSync(encPendingDir(root), { recursive: true });
  const fp = encPendingPath(root, owner);
  fs.writeFileSync(fp, agentKey.toString('base64') + '\n', { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(fp, 0o600); } catch (e) {}
  return fp;
}
function writeAgentBindingWithPending(root, owner, ownerKey, agentKey) {
  writeAgentBinding(root, owner, ownerKey, agentKey);
  try {
    return writePendingAgentKey(root, owner, agentKey);
  } catch (e) {
    try { fs.unlinkSync(encAgentBindingPath(root, owner)); } catch (ignore) {}
    try { fs.unlinkSync(encPendingPath(root, owner)); } catch (ignore) {}
    throw e;
  }
}
function removePendingAgentKey(root, owner) {
  if (!isSafeAgentId(owner)) return false;
  const fp = encPendingPath(root, owner);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
function readPendingAgentKey(root, owner) {
  if (!isSafeAgentId(owner)) return null;
  const fp = encPendingPath(root, owner);
  if (!fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, 'utf8').trim();
  if (!raw) throw new Error('pending agent_key 文件为空');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('pending agent_key 格式错误');
  return key;
}
function readAgentKeyFile(fp) {
  const raw = fs.readFileSync(path.resolve(String(fp)), 'utf8').trim();
  if (!raw) throw new Error('agent-key 文件为空');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('agent-key 文件格式错误');
  return key;
}
function unwrapAgentBinding(root, owner, agentKey) {
  if (!isSafeAgentId(owner)) return null;
  if (!Buffer.isBuffer(agentKey) || agentKey.length !== 32) return null;
  const p = encAgentBindingPath(root, owner);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.slice(0, AGENT_MAGIC.length).toString('utf8') !== AGENT_MAGIC) throw new Error('agent binding 文件格式错误: ' + p);
  return aesDecryptBytes(agentKey, buf.slice(AGENT_MAGIC.length), Buffer.from('agent:' + owner, 'utf8'));
}
function getOwnerKeyFor(root, owner, identity) {
  if (!owner) return null;
  if (!isEncrypted(root)) return null;
  const current = identity || currentRuntimeIdentity();
  if (!current.id || current.id !== owner || !current.agentKey) return null;
  const agentKey = Buffer.from(current.agentKey, 'base64');
  return unwrapAgentBinding(root, owner, agentKey);
}
function validatePrivateIdentity(root, ident, owner) {
  if (!ident || !ident.id) return '私密操作必须先声明显式身份。';
  if (!isSafeAgentId(owner || ident.id)) return '非法 owner ID：只允许单段名称，禁止 /、\\、.. 和控制字符。';
  if (!isEncrypted(root)) return '';
  const current = currentRuntimeIdentity();
  const agentKey = ident.agentKey || (current.id === ident.id ? current.agentKey : '');
  if (!agentKey) {
    if (ident.source === 'missing-key-file') {
      return '未找到 agent-key 文件: ' + ident.keyFile + '；当前为未授权模式（公共 FACT 可读）。该私密操作需要先由用户执行 yotta-memory view 授权或 yotta-memory key bind ' + (owner || ident.id) + '，再由 AI 执行 yotta-memory key status ' + (owner || ident.id) + ' → key claim ' + (owner || ident.id) + '。';
    }
    return '记忆库已加密，但缺少 agent_key。CLI 请使用 --agent-key <key> 或 --agent-key-file <path>；stdio MCP 请使用 --agent-id <id> + --agent-key-file <path>；HTTP MCP 请发送 X-Agent-Key 请求头。若该 agent 尚未绑定，请执行 yotta-memory key bind ' + (owner || ident.id) + '。';
  }
  const context = IDENTITY_CONTEXT.getStore();
  if (context) {
    context.id = ident.id;
    context.agentKey = agentKey;
  } else {
    setRuntimeAgent(ident.id, agentKey);
  }
  try {
    if (!getOwnerKeyFor(root, owner || ident.id, { id: ident.id, agentKey: agentKey })) {
      return 'agent_key 校验失败：未找到 ' + (owner || ident.id) + ' 的 agent binding（可能已吊销）。请由用户重新授权，或由用户执行 yotta-memory key bind ' + (owner || ident.id) + '。';
    }
  } catch (e) {
    return 'agent_key 无效或 binding 损坏：' + e.message;
  }
  return '';
}
function legacyCacheOwners(root) {
  if (!isEncrypted(root)) return [];
  const dir = encCacheDir(root);
  if (!fs.existsSync(dir)) return [];
  const found = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return found; }
  for (const f of names) {
    if (!/\.key$/.test(f)) continue;
    const owner = f.slice(0, -4);
    if (!isSafeAgentId(owner)) continue;
    if (found.indexOf(owner) === -1) found.push(owner);
  }
  return found;
}
function migrationRequiredInfo(root) {
  if (!isEncrypted(root)) return null;
  const owners = new Set();
  for (const owner of collectOwners(root)) owners.add(owner);
  for (const owner of legacyCacheOwners(root)) owners.add(owner);
  const actionable = [];
  const legacyOnly = [];
  for (const owner of owners) {
    const hasPrivate = fs.existsSync(path.join(root, PRIVATE_DIR, owner)) || fs.existsSync(path.join(root, PRIVATE_DIR, owner, PROFILE_FILE)) || fs.existsSync(path.join(root, PRIVATE_DIR, owner, PROFILE_FILE + ENC_SUFFIX));
    const hasLegacy = fs.existsSync(encCachePath(root, owner));
    const bound = fs.existsSync(encAgentBindingPath(root, owner));
    if (!hasPrivate) {
      if (hasLegacy) legacyOnly.push(owner);
      continue;
    }
    if (!bound) actionable.push(owner);
  }
  if (!actionable.length) return null;
  const reasons = [];
  if (actionable.some(function (owner) { return fs.existsSync(encCachePath(root, owner)); })) reasons.push('legacy_cache');
  reasons.push('no_agent_binding');
  const entries = actionable.map(function (owner) {
    const ownerReasons = [];
    if (fs.existsSync(encCachePath(root, owner))) ownerReasons.push('legacy_cache');
    ownerReasons.push('no_agent_binding');
    return { agent: owner, reason: ownerReasons.join(',') };
  });
  return {
    marker: '[YTM_MIGRATION_REQUIRED] agent=' + actionable.join(',') + ' reason=' + reasons.join(','),
    owners: actionable,
    reasons: reasons,
    entries: entries,
    legacyOnly: legacyOnly,
  };
}
function migrationReminderText(root) {
  const info = migrationRequiredInfo(root);
  if (!info) return '';
  let text = info.marker + '\nAI 提醒（升级后首次调用元忆 / 重启会话时请主动转达）：旧版授权缓存不再加载，需要重新授权。请让用户自己执行 `yotta-memory view` → 浏览器打开平台 → 输入主口令 → 点「授权」并保存只展示一次的 `agent_key`；这是用户侧操作，AI 不得代替用户执行 `migrate` / `key bind` 迁移，只负责提醒和讲解步骤。';
  if (info.legacyOnly && info.legacyOnly.length) {
    text += '\n另有 legacy 明文 cache 缺少可迁移私密数据（不属于迁移清单）: ' + info.legacyOnly.join(', ') + '；如需清理请单独确认。';
  }
  return text;
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
// selfAgent 为调用方显式声明的可信身份（CLI 参数 / stdio 参数 / HTTP 请求头）；--owner 仅供授权与展示，不得授予跨智能体私密读取。
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
function isExistingStore(root) {
  return ['facts', 'private', 'keys', 'index.json'].some(function (name) {
    return fs.existsSync(path.join(root, name));
  });
}
function initCore(opts) {
  opts = opts || {};
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  const existing = isExistingStore(root);
  if (existing && opts.attach) {
    const mode = isEncrypted(root) ? '加密' : '明文';
    let text = '已接入现有记忆库（当前模式：' + mode + '）: ' + root;
    if (!isEncrypted(root)) text += '\n提示：当前为明文模式，私密内容未加密；如需启用加密，请运行 yotta-memory migrate（空明文库同样可用）。';
    return { error: false, text: text };
  }
  if (existing && opts.force) {
    return { error: true, text: '拒绝: --force 不能覆盖现有记忆库；已有记忆库的强制重建必须由完整备份与显式确认保护，当前版本不提供覆盖初始化路径。如只是接入，请使用 init --attach。' };
  }
  if (existing) {
    return { error: true, text: '拒绝: 目标已是现有记忆库: ' + root + '。如只是接入，请使用 init --attach；不要执行覆盖初始化。' };
  }
  const fresh = true;
  ensureInit(root);
  const wantEncrypt = opts.encrypt || (!opts.noEncrypt && fresh);
  if (wantEncrypt) {
    if (isEncrypted(root)) return { error: false, text: '已初始化记忆库（已启用加密）: ' + root };
    if (hasPlaintextPrivate(root)) return { error: true, text: '检测到明文私密区，请先 yotta-memory migrate 迁移到密文；新建空库可直接 init --encrypt。' };
    const password = String(opts.password || process.env.YOTTA_MEMORY_PASS || '');
    if (!password) return { error: true, text: '启用加密需要主口令：交互输入、--password-stdin（推荐）或 YOTTA_MEMORY_PASS 环境变量（自动化）。' };
    const r = initEncryptionCore(root, password, null);
    if (opts.recoveryKeyOut) {
      const outPath = path.resolve(String(opts.recoveryKeyOut));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, r.rk.toString('base64') + '\n', { encoding: 'utf8', mode: 0o600 });
      return { error: false, text: '已初始化加密记忆库: ' + root + '\n[恢复钥匙] 已写入文件: ' + outPath + '（务必离线保存，仅此一次，泄露=可解全部私密；不要把钥匙粘贴到对话中）' };
    }
    return { error: false, text: '已初始化加密记忆库: ' + root + '\n[恢复钥匙]（务必离线保存，仅此一次，泄露=可解全部私密）: ' + r.rk.toString('base64') };
  }
  return { error: false, text: '已初始化记忆库: ' + root + (isEncrypted(root) ? '（已启用加密）' : '（明文；私密内容未加密，如需启用加密请运行 migrate）') };
}

function backupDestination(opts) {
  opts = opts || {};
  const configured = opts.dir || process.env.YOTTA_MEMORY_BACKUP_DIR || loadConfig().backup_dir || '';
  return configured ? path.resolve(String(configured)) : null;
}
function sameVolume(left, right) {
  return path.parse(path.resolve(left)).root.toLowerCase() === path.parse(path.resolve(right)).root.toLowerCase();
}
function platformPathApi(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}
function normalizeVolumeCandidate(candidate, platform) {
  const p = platformPathApi(platform);
  const value = String(candidate || '').trim();
  if (!value) return '';
  if (platform === 'win32') {
    const drive = /^([A-Za-z]):[\\/]*$/.exec(value);
    if (drive) return drive[1].toUpperCase() + ':\\';
  }
  return p.resolve(value);
}
function sameVolumeOnPlatform(left, right, platform, statFn) {
  if (platform === 'win32') {
    return path.win32.parse(left).root.toLowerCase() === path.win32.parse(right).root.toLowerCase();
  }
  try {
    return statFn(left).dev === statFn(right).dev;
  } catch (_) {
    return left === right;
  }
}
function defaultVolumeCandidates(platform) {
  if (platform === 'win32') {
    const out = [];
    for (let i = 65; i <= 90; i++) {
      const root = String.fromCharCode(i) + ':\\';
      if (fs.existsSync(root)) out.push(root);
    }
    return out;
  }
  try {
    const output = child_process.execFileSync('df', ['-Pk'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const excluded = /^\/(proc|sys|dev|run|snap|boot)(\/|$)/;
    return output.split(/\r?\n/).slice(1).map(function (line) {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 6 ? parts[parts.length - 1] : '';
    }).filter(function (mount) {
      return mount && mount.charAt(0) === '/' && !excluded.test(mount);
    });
  } catch (_) {
    return [];
  }
}
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return (unit === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + units[unit];
}
function listBackupVolumesCore(opts) {
  opts = opts || {};
  const platform = opts.platform || process.platform;
  const p = platformPathApi(platform);
  const rootForStore = opts.root || userRoot();
  const storeRoot = normalizeVolumeCandidate(rootForStore, platform);
  const candidates = opts.candidates || defaultVolumeCandidates(platform);
  const existsFn = opts.existsFn || fs.existsSync;
  const statFn = opts.statFn || fs.statSync;
  const statfsFn = opts.statfsFn || fs.statfsSync;
  const accessFn = opts.accessFn || fs.accessSync;
  const volumes = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeVolumeCandidate(candidate, platform);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      if (!existsFn(normalized)) continue;
      const stat = statFn(normalized);
      if (!stat || !stat.isDirectory()) continue;
      accessFn(normalized, fs.constants.W_OK);
      if (sameVolumeOnPlatform(storeRoot, normalized, platform, statFn)) continue;
      const usage = statfsFn(normalized);
      const blockSize = Number(usage && usage.bsize) || 0;
      const availableBlocks = Number(usage && usage.bavail) || 0;
      const totalBlocks = Number(usage && usage.blocks) || 0;
      volumes.push({
        root: normalized,
        writable: true,
        sameVolume: false,
        free: blockSize * availableBlocks,
        total: blockSize * totalBlocks,
      });
    } catch (_) {
      // A mounted path that is not currently accessible is not a valid recommendation.
    }
  }
  volumes.sort(function (a, b) { return String(a.root).localeCompare(String(b.root)); });
  const lines = volumes.length
    ? ['可用的独立卷（排除记忆库所在卷 ' + storeRoot + '）:'].concat(volumes.map(function (v) {
      return '- ' + v.root + '  可用 ' + formatBytes(v.free);
    }))
    : ['未发现可写的独立卷（已排除记忆库所在卷 ' + storeRoot + '）；请接入另一块磁盘或独立分区后重试。'];
  return { error: false, volumes: volumes, text: lines.join('\n') };
}
function validBackupTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
}
function backupTimeParts(value) {
  const text = String(value || '');
  if (!validBackupTime(text)) throw new Error('备份时间格式无效: ' + text + '（应为 HH:MM）');
  const parts = text.split(':');
  return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1], 10), text: text };
}
function xmlEscape(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch];
  });
}
function backupWindowsTaskXml(opts) {
  opts = opts || {};
  const time = backupTimeParts(opts.time || '03:30');
  const nodePath = opts.nodePath || process.execPath;
  const scriptPath = opts.scriptPath || runtimeManagedScript();
  const userId = opts.userId || '';
  const principal = userId
    ? '<Principal id="Author"><UserId>' + xmlEscape(userId) + '</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>'
    : '<Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>';
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '<RegistrationInfo><Description>Yotta Memory daily backup</Description></RegistrationInfo>',
    '<Triggers><CalendarTrigger><StartBoundary>2026-01-01T' + time.text + ':00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>',
    '<Principals>' + principal + '</Principals>',
    '<Settings>',
    '<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '<AllowHardTerminate>true</AllowHardTerminate>',
    '<StartWhenAvailable>true</StartWhenAvailable>',
    '<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
    '<IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>',
    '<Enabled>true</Enabled>',
    '<Hidden>false</Hidden>',
    '<RunOnlyIfIdle>false</RunOnlyIfIdle>',
    '<WakeToRun>false</WakeToRun>',
    '<ExecutionTimeLimit>PT2H</ExecutionTimeLimit>',
    '<Priority>7</Priority>',
    '</Settings>',
    '<Actions Context="Author"><Exec><Command>' + xmlEscape(nodePath) + '</Command><Arguments>"' + xmlEscape(scriptPath) + '" backup ensure-daily</Arguments></Exec></Actions>',
    '</Task>',
  ].join('\r\n');
}
function backupSystemdServiceContent(opts) {
  opts = opts || {};
  const nodePath = opts.nodePath || process.execPath;
  const scriptPath = opts.scriptPath || runtimeManagedScript();
  return [
    '[Unit]',
    'Description=Yotta Memory daily backup',
    '',
    '[Service]',
    'Type=oneshot',
    'ExecStart=' + systemdEscapeArg(nodePath) + ' ' + systemdEscapeArg(scriptPath) + ' backup ensure-daily',
    'Nice=10',
    '',
  ].join('\n');
}
function backupSystemdTimerContent(opts) {
  opts = opts || {};
  const time = backupTimeParts(opts.time || '03:30');
  return [
    '[Unit]',
    'Description=Yotta Memory daily backup timer',
    '',
    '[Timer]',
    'OnCalendar=*-*-* ' + time.text + ':00',
    'Persistent=true',
    'RandomizedDelaySec=300',
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
}
function backupCronLine(opts) {
  opts = opts || {};
  const time = backupTimeParts(opts.time || '03:30');
  const nodePath = opts.nodePath || process.execPath;
  const scriptPath = opts.scriptPath || runtimeManagedScript();
  const logPath = opts.logPath || '';
  const redirect = logPath ? ' >> ' + shQuote(logPath) + ' 2>&1' : '';
  return time.minute + ' ' + time.hour + ' * * * ' + shQuote(nodePath) + ' ' + shQuote(scriptPath) + ' backup ensure-daily' + redirect + ' ' + BACKUP_CRON_MARKER;
}
function backupLaunchdPlist(opts) {
  opts = opts || {};
  const time = backupTimeParts(opts.time || '03:30');
  const nodePath = opts.nodePath || process.execPath;
  const scriptPath = opts.scriptPath || runtimeManagedScript();
  const logPath = opts.logPath || '';
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>Label</key><string>' + BACKUP_LAUNCHD_LABEL + '</string>',
    '<key>ProgramArguments</key><array>',
    '<string>' + xmlEscape(nodePath) + '</string>',
    '<string>' + xmlEscape(scriptPath) + '</string>',
    '<string>backup</string>',
    '<string>ensure-daily</string>',
    '</array>',
    '<key>StartCalendarInterval</key><dict>',
    '<key>Hour</key><integer>' + time.hour + '</integer>',
    '<key>Minute</key><integer>' + time.minute + '</integer>',
    '</dict>',
  ];
  if (logPath) {
    lines.push('<key>StandardOutPath</key><string>' + xmlEscape(logPath) + '</string>');
    lines.push('<key>StandardErrorPath</key><string>' + xmlEscape(logPath) + '</string>');
  }
  lines.push('</dict></plist>');
  return lines.join('\n');
}
function schedulerExec(opts, command, args, input) {
  if (opts && typeof opts.execFileFn === 'function') return opts.execFileFn(command, args, { input: input });
  return child_process.execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    input: input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
}
function schedulerTry(opts, command, args, input) {
  try {
    return { ok: true, stdout: String(schedulerExec(opts, command, args, input) || '') };
  } catch (error) {
    return {
      ok: false,
      stdout: String((error && error.stdout) || ''),
      error: String((error && error.message) || error),
    };
  }
}
function backupScheduleEnableCore(opts) {
  opts = opts || {};
  const platform = opts.platform || process.platform;
  const time = opts.time || '03:30';
  try { backupTimeParts(time); } catch (error) { return { error: true, text: error.message }; }
  const nodePath = opts.nodePath || process.execPath;
  const scriptPath = opts.scriptPath || runtimeManagedScript();
  try {
    if (platform === 'win32') {
      const userId = opts.userId || (process.env.USERDOMAIN && process.env.USERNAME ? process.env.USERDOMAIN + '\\' + process.env.USERNAME : '');
      const taskName = opts.taskName || BACKUP_TASK_NAME;
      const xmlPath = opts.xmlPath || path.join(os.tmpdir(), taskName + '.xml');
      fs.writeFileSync(xmlPath, '\ufeff' + backupWindowsTaskXml({ time: time, nodePath: nodePath, scriptPath: scriptPath, userId: userId }), 'utf16le');
      schedulerExec(opts, 'schtasks', ['/create', '/tn', taskName, '/xml', xmlPath, '/f']);
      return { error: false, scheduler: 'windows-task', taskName: taskName, text: '已注册 Windows 每日备份任务: ' + taskName };
    }
    if (platform === 'linux') {
      const unitDir = opts.unitDir || path.join(os.homedir(), '.config', 'systemd', 'user');
      const servicePath = path.join(unitDir, BACKUP_SYSTEMD_SERVICE);
      const timerPath = path.join(unitDir, BACKUP_SYSTEMD_TIMER);
      fs.mkdirSync(unitDir, { recursive: true });
      fs.writeFileSync(servicePath, backupSystemdServiceContent({ nodePath: nodePath, scriptPath: scriptPath }), 'utf8');
      fs.writeFileSync(timerPath, backupSystemdTimerContent({ time: time }), 'utf8');
      const reload = schedulerTry(opts, 'systemctl', ['--user', 'daemon-reload']);
      const enable = reload.ok ? schedulerTry(opts, 'systemctl', ['--user', 'enable', '--now', BACKUP_SYSTEMD_TIMER]) : reload;
      if (enable.ok) {
        return { error: false, scheduler: 'linux-systemd', unit: BACKUP_SYSTEMD_TIMER, text: '已注册 systemd 用户定时器: ' + BACKUP_SYSTEMD_TIMER };
      }
      const logPath = opts.logPath || path.join(os.homedir(), '.yottamemory', 'backup.log');
      const line = backupCronLine({ time: time, nodePath: nodePath, scriptPath: scriptPath, logPath: logPath });
      const current = schedulerTry(opts, 'crontab', ['-l']);
      const kept = current.stdout.split(/\r?\n/).filter(function (item) {
        return item && item.indexOf(BACKUP_CRON_MARKER) === -1;
      });
      kept.push(line);
      schedulerExec(opts, 'crontab', ['-'], kept.join('\n') + '\n');
      return {
        error: false,
        scheduler: 'linux-cron',
        unit: 'crontab',
        warning: 'systemd 用户定时器不可用，已降级用户 crontab: ' + enable.error,
        text: '已注册用户 crontab 每日备份；systemd 不可用。',
      };
    }
    if (platform === 'darwin') {
      const dir = opts.launchAgentDir || path.join(os.homedir(), 'Library', 'LaunchAgents');
      const plistPath = path.join(dir, BACKUP_LAUNCHD_LABEL + '.plist');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(plistPath, backupLaunchdPlist({
        time: time,
        nodePath: nodePath,
        scriptPath: scriptPath,
        logPath: opts.logPath || path.join(os.homedir(), 'Library', 'Logs', 'yotta-memory-backup.log'),
      }), 'utf8');
      const uid = typeof process.getuid === 'function' ? process.getuid() : '';
      const bootstrap = schedulerTry(opts, 'launchctl', ['bootstrap', 'gui/' + uid, plistPath]);
      if (!bootstrap.ok) schedulerTry(opts, 'launchctl', ['load', '-w', plistPath]);
      return { error: false, scheduler: 'macos-launchd', plist: plistPath, text: '已注册 macOS LaunchAgent 每日备份。' };
    }
  } catch (error) {
    return { error: true, text: '注册自动备份调度失败: ' + error.message };
  }
  return { error: true, text: '当前平台暂不支持自动备份调度: ' + platform };
}
function backupScheduleDisableCore(opts) {
  opts = opts || {};
  const platform = opts.platform || process.platform;
  try {
    if (platform === 'win32') {
      const taskName = opts.taskName || BACKUP_TASK_NAME;
      const result = schedulerTry(opts, 'schtasks', ['/delete', '/tn', taskName, '/f']);
      if (!result.ok && !/cannot find|找不到|不存在/i.test(result.error)) return { error: true, text: result.error };
      return { error: false, scheduler: 'windows-task', text: result.ok ? '已移除 Windows 备份任务。' : 'Windows 备份任务未注册。' };
    }
    if (platform === 'linux') {
      schedulerTry(opts, 'systemctl', ['--user', 'disable', '--now', BACKUP_SYSTEMD_TIMER]);
      const unitDir = opts.unitDir || path.join(os.homedir(), '.config', 'systemd', 'user');
      for (const name of [BACKUP_SYSTEMD_SERVICE, BACKUP_SYSTEMD_TIMER]) {
        try { fs.unlinkSync(path.join(unitDir, name)); } catch (_) {}
      }
      const current = schedulerTry(opts, 'crontab', ['-l']);
      const kept = current.stdout.split(/\r?\n/).filter(function (item) {
        return item && item.indexOf(BACKUP_CRON_MARKER) === -1;
      });
      schedulerTry(opts, 'crontab', ['-'], kept.join('\n') + (kept.length ? '\n' : ''));
      return { error: false, scheduler: 'linux', text: '已移除 systemd 定时器与备份 cron 行。' };
    }
    if (platform === 'darwin') {
      const dir = opts.launchAgentDir || path.join(os.homedir(), 'Library', 'LaunchAgents');
      const plistPath = path.join(dir, BACKUP_LAUNCHD_LABEL + '.plist');
      const uid = typeof process.getuid === 'function' ? process.getuid() : '';
      schedulerTry(opts, 'launchctl', ['bootout', 'gui/' + uid, plistPath]);
      try { fs.unlinkSync(plistPath); } catch (_) {}
      return { error: false, scheduler: 'macos-launchd', text: '已移除 macOS LaunchAgent 备份。' };
    }
  } catch (error) {
    return { error: true, text: '移除自动备份调度失败: ' + error.message };
  }
  return { error: true, text: '当前平台暂不支持自动备份调度: ' + platform };
}
function backupScheduleStatusCore(opts) {
  opts = opts || {};
  const platform = opts.platform || process.platform;
  if (platform === 'win32') {
    const taskName = opts.taskName || BACKUP_TASK_NAME;
    const result = schedulerTry(opts, 'schtasks', ['/query', '/tn', taskName, '/fo', 'LIST']);
    return { error: false, registered: result.ok, scheduler: 'windows-task', text: result.ok ? 'Windows 备份任务已注册。' : 'Windows 备份任务未注册。' };
  }
  if (platform === 'linux') {
    const unitDir = opts.unitDir || path.join(os.homedir(), '.config', 'systemd', 'user');
    const timer = fs.existsSync(path.join(unitDir, BACKUP_SYSTEMD_TIMER));
    let cron = false;
    try {
      cron = schedulerTry(opts, 'crontab', ['-l']).stdout.indexOf(BACKUP_CRON_MARKER) !== -1;
    } catch (_) {}
    return { error: false, registered: timer || cron, scheduler: timer ? 'linux-systemd' : (cron ? 'linux-cron' : ''), text: timer || cron ? 'Linux 备份定时器已注册。' : 'Linux 备份定时器未注册。' };
  }
  if (platform === 'darwin') {
    const dir = opts.launchAgentDir || path.join(os.homedir(), 'Library', 'LaunchAgents');
    const registered = fs.existsSync(path.join(dir, BACKUP_LAUNCHD_LABEL + '.plist'));
    return { error: false, registered: registered, scheduler: 'macos-launchd', text: registered ? 'macOS 备份 LaunchAgent 已注册。' : 'macOS 备份 LaunchAgent 未注册。' };
  }
  return { error: false, registered: false, scheduler: '', text: '当前平台不支持自动备份调度: ' + platform };
}
function backupFallbackCommand() {
  return { command: process.execPath, args: [runtimeManagedScript(), 'backup', 'ensure-daily'] };
}
function startBackupFallback() {
  const cfg = loadConfig();
  if (!cfg.backup_enabled) return;
  const launch = function () {
    try {
      const spec = backupFallbackCommand();
      const child = child_process.spawn(spec.command, spec.args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (error) {
      console.error('备份补跑启动失败: ' + error.message);
    }
  };
  const initial = setTimeout(launch, 10000);
  if (initial.unref) initial.unref();
  const interval = setInterval(launch, 6 * 60 * 60 * 1000);
  if (interval.unref) interval.unref();
}
function backupSetupCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  if (!isExistingStore(root)) return { error: true, text: '记忆库不存在或未初始化: ' + root };
  const cfg = loadConfig();
  const nowIso = new Date().toISOString();
  if (opts.manual) {
    cfg.backup_enabled = false;
    cfg.backup_schedule = 'manual';
    cfg.backup_setup_choice = 'manual';
    cfg.backup_setup_at = nowIso;
    delete cfg.backup_dir;
    saveConfig(cfg);
    return {
      error: false,
      configured: false,
      manual: true,
      text: '已记录：用户选择手动备份。未注册自动备份，也不会在会话开工时反复提示。',
    };
  }
  if (!opts.dir) return { error: true, text: '缺少备份目录 --dir <目录>。请先运行 backup volumes，只从实际枚举结果中选择。' };
  const dir = path.resolve(String(opts.dir));
  const same = opts.sameVolumeFn ? !!opts.sameVolumeFn(root, dir) : sameVolume(root, dir);
  if (same) return { error: true, text: '拒绝: 备份目录与记忆库在同一卷，请选择实际存在的独立卷。' };
  const time = String(opts.time || '03:30');
  if (!validBackupTime(time)) return { error: true, text: '备份时间格式无效: ' + time + '（应为 HH:MM，例如 03:30）' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) {
    return { error: true, text: '备份目录不可写: ' + dir + '（' + error.message + '）' };
  }
  const created = backupCreateCore({
    root: root,
    dir: dir,
    allowSameVolume: !!opts.allowSameVolume,
  });
  if (created.error) return created;
  cfg.backup_dir = dir;
  cfg.backup_enabled = true;
  cfg.backup_schedule = 'daily';
  cfg.backup_time = time;
  cfg.backup_max_age_hours = opts.maxAgeHours !== undefined ? opts.maxAgeHours : 36;
  cfg.backup_setup_choice = 'daily';
  cfg.backup_setup_at = nowIso;
  cfg.backup_last_success = created.manifest.created;
  cfg.backup_last_backup_id = created.id;
  delete cfg.backup_last_error;
  saveConfig(cfg);
  let schedule = null;
  if (!opts.skipSchedule && typeof backupScheduleEnableCore === 'function') {
    schedule = backupScheduleEnableCore({ dir: dir, time: time, root: root });
    if (schedule && schedule.error) {
      cfg.backup_scheduler_error = schedule.text;
      delete cfg.backup_scheduler;
    } else if (schedule) {
      cfg.backup_scheduler = schedule.scheduler || '';
      delete cfg.backup_scheduler_error;
    }
    saveConfig(cfg);
  }
  return {
    error: false,
    configured: true,
    id: created.id,
    dir: dir,
    time: time,
    schedule: schedule,
    text: '已启用每日自动备份: ' + dir + '（每天 ' + time + '）\n首份备份: ' + created.id
      + (schedule && schedule.error ? '\n[警告] ' + schedule.text + '；serve 补跑仍会在启动后检查。' : ''),
  };
}
function backupStatusCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  const cfg = loadConfig();
  const configuredDir = opts.dir || opts.backupDir || cfg.backup_dir;
  const dir = configuredDir ? path.resolve(String(configuredDir)) : '';
  const maxAge = Number(cfg.backup_max_age_hours) || 36;
  if (!dir) {
    const manual = cfg.backup_setup_choice === 'manual';
    return {
      error: false,
      configured: false,
      enabled: false,
      healthy: false,
      manual: manual,
      text: manual
        ? '备份状态: 手动模式（未配置自动备份）'
        : '备份状态: 未配置\n请运行 backup volumes，只从实际枚举结果中选择独立卷，并由用户确认后再运行 backup setup。',
    };
  }
  const listed = backupListCore({ dir: dir });
  const latest = listed.backups[0] || null;
  const now = opts.now ? new Date(opts.now).getTime() : Date.now();
  const createdTs = latest && latest.created ? new Date(latest.created).getTime() : NaN;
  const ageHours = isNaN(createdTs) ? null : (now - createdTs) / 3600000;
  const fresh = ageHours !== null && ageHours <= maxAge;
  const same = opts.sameVolumeFn ? !!opts.sameVolumeFn(root, dir) : sameVolume(root, dir);
  const independent = !same;
  const healthy = !!latest && fresh && independent && !cfg.backup_last_error && !cfg.backup_scheduler_error;
  const lines = [
    '备份状态: ' + (cfg.backup_enabled ? '已启用' : '已关闭'),
    '- 备份目录: ' + dir,
    '- 独立卷: ' + (independent ? '是' : '否（不可作为可靠备份）'),
    '- 计划: ' + (cfg.backup_schedule || 'manual') + (cfg.backup_time ? ' ' + cfg.backup_time : ''),
    '- 调度器: ' + (cfg.backup_scheduler || '(未注册)'),
    '- 调度异常: ' + (cfg.backup_scheduler_error || '(无)'),
    '- 上次成功: ' + (cfg.backup_last_success || (latest && latest.created) || '(无)'),
    '- 备份年龄: ' + (ageHours === null ? '(无可用备份)' : ageHours.toFixed(1) + ' 小时'),
    '- 最近失败: ' + (cfg.backup_last_error || '(无)'),
    '- 健康: ' + (healthy ? '正常' : '异常'),
  ];
  return {
    error: false,
    configured: true,
    enabled: !!cfg.backup_enabled,
    healthy: healthy,
    independent: independent,
    latest: latest,
    ageHours: ageHours,
    text: lines.join('\n'),
  };
}
function localDateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function latestBackupByCreated(backups) {
  return (backups || []).slice().sort(function (a, b) {
    return String(b.created || '').localeCompare(String(a.created || ''));
  })[0] || null;
}
function acquireBackupLock(lockPath, now, staleHours) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const maxAgeMs = (staleHours || 6) * 3600000;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      created: new Date(nowMs).toISOString(),
    }), { encoding: 'utf8', flag: 'wx' });
    return { acquired: true };
  } catch (error) {
    if (error.code !== 'EEXIST') return { acquired: false, error: error };
    try {
      const stat = fs.statSync(lockPath);
      if (nowMs - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(lockPath);
        return acquireBackupLock(lockPath, now, staleHours);
      }
    } catch (_) {
      try { fs.unlinkSync(lockPath); } catch (__) {}
      return acquireBackupLock(lockPath, now, staleHours);
    }
    return { acquired: false, fresh: true };
  }
}
function releaseBackupLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch (_) {}
}
function backupEnsureDailyCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  const cfg = loadConfig();
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowIso = now.toISOString();
  if (!cfg.backup_enabled || cfg.backup_schedule === 'manual') {
    return { error: false, created: false, skipped: true, reason: 'disabled', text: '自动备份未启用；跳过 ensure-daily。' };
  }
  const dir = cfg.backup_dir ? path.resolve(String(cfg.backup_dir)) : '';
  if (!dir) {
    const text = '自动备份已启用但未配置 backup_dir；拒绝执行。';
    cfg.backup_last_attempt = nowIso;
    cfg.backup_last_error = text;
    saveConfig(cfg);
    return { error: true, created: false, skipped: false, text: text };
  }
  const same = opts.sameVolumeFn ? !!opts.sameVolumeFn(root, dir) : sameVolume(root, dir);
  if (same) {
    const text = '拒绝: 备份目录与记忆库在同一卷，不执行每日备份。';
    cfg.backup_last_attempt = nowIso;
    cfg.backup_last_error = text;
    saveConfig(cfg);
    return { error: true, created: false, skipped: false, text: text };
  }
  const lockPath = opts.lockPath || path.join(path.dirname(configPath()), 'backup.lock');
  const lock = acquireBackupLock(lockPath, now, opts.staleHours);
  if (!lock.acquired) {
    if (lock.error) {
      const text = '备份锁创建失败: ' + lock.error.message;
      cfg.backup_last_attempt = nowIso;
      cfg.backup_last_error = text;
      saveConfig(cfg);
      return { error: true, created: false, skipped: false, text: text };
    }
    return { error: false, created: false, skipped: true, reason: 'already-running', text: '已有备份任务在运行；跳过本次 ensure-daily。' };
  }
  try {
    const listed = backupListCore({ dir: dir });
    if (listed.error) throw new Error(listed.text);
    const todayKey = localDateKey(now);
    const latest = latestBackupByCreated(listed.backups);
    if (latest && latest.created && localDateKey(latest.created) === todayKey) {
      cfg.backup_last_check = nowIso;
      cfg.backup_last_success = latest.created;
      cfg.backup_last_backup_id = latest.id;
      delete cfg.backup_last_error;
      saveConfig(cfg);
      return { error: false, created: false, skipped: true, reason: 'already-backed-up', id: latest.id, text: '今天已有备份 ' + latest.id + '；跳过。' };
    }
    const created = backupCreateCore({
      root: root,
      dir: dir,
      now: nowIso,
      allowSameVolume: !!opts.allowSameVolume,
    });
    if (created.error) throw new Error(created.text);
    cfg.backup_last_attempt = nowIso;
    cfg.backup_last_check = nowIso;
    cfg.backup_last_success = created.manifest.created;
    cfg.backup_last_backup_id = created.id;
    delete cfg.backup_last_error;
    saveConfig(cfg);
    return { error: false, created: true, skipped: false, id: created.id, path: created.path, text: '每日备份完成: ' + created.id };
  } catch (error) {
    cfg.backup_last_attempt = nowIso;
    cfg.backup_last_check = nowIso;
    cfg.backup_last_error = error.message;
    saveConfig(cfg);
    return { error: true, created: false, skipped: false, text: '每日备份失败: ' + error.message };
  } finally {
    releaseBackupLock(lockPath);
  }
}
function backupHealthCore(opts) {
  opts = opts || {};
  const cfg = loadConfig();
  const configuredDir = opts.dir || opts.backupDir || cfg.backup_dir;
  if (!configuredDir && cfg.backup_setup_choice !== 'manual') {
    return {
      level: 'warning',
      needsSetup: true,
      text: '尚未配置独立盘备份。AI 应先运行 yotta-memory backup volumes，只展示当前实际存在的可写异卷；由用户确认目录后，再运行 backup setup 启用每日自动备份。',
    };
  }
  if (!configuredDir && cfg.backup_setup_choice === 'manual') return { level: 'none', needsSetup: false, text: '' };
  const status = backupStatusCore(opts);
  const maxAge = Number(cfg.backup_max_age_hours) || 36;
  if (cfg.backup_last_error) return { level: 'warning', needsSetup: false, text: '最近一次备份失败: ' + cfg.backup_last_error };
  if (cfg.backup_scheduler_error) return { level: 'warning', needsSetup: false, text: '每日备份调度注册异常: ' + cfg.backup_scheduler_error };
  if (!status.latest) return { level: 'warning', needsSetup: true, text: '自动备份已启用，但还没有成功备份。请检查 backup 目录与调度器。' };
  if (status.ageHours !== null && status.ageHours > maxAge) {
    return { level: 'warning', needsSetup: false, text: '最近备份已过期（' + status.ageHours.toFixed(1) + ' 小时，超过 ' + maxAge + ' 小时）；请检查备份盘与每日调度。' };
  }
  return { level: 'none', needsSetup: false, text: '' };
}
// ---- v0.16.0 M3: runtime drift diagnosis ----
function runtimePathList(value) {
  const pattern = path.delimiter === ':' ? /[;:\n]/ : /[;\n]/;
  return String(value || '').split(pattern).map(function (item) { return item.trim(); }).filter(Boolean);
}
function runtimeVersionFromDir(dir) {
  let current = path.resolve(String(dir || ''));
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const version = String(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '').trim();
        if (version) return version;
      } catch (e) {}
    }
    const skillPath = path.join(current, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      try {
        const text = fs.readFileSync(skillPath, 'utf8');
        const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
        if (match) {
          const versionLine = match[1].split(/\r?\n/).find(function (line) { return /^version\s*:/.test(line); });
          if (versionLine) {
            const version = versionLine.slice(versionLine.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
            if (version) return version;
          }
        }
      } catch (e) {}
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '';
}
function runtimeVersionFromPath(target) {
  const value = String(target || '').trim();
  if (!value) return '';
  const normalized = value.replace(/\\/g, '/');
  const versionMatch = normalized.match(/\/versions\/([^/]+)\/bin\/yotta-memory\.js$/i);
  if (versionMatch) return versionMatch[1];
  const abs = path.resolve(value);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return runtimeVersionFromDir(abs);
  const base = path.basename(abs).toLowerCase();
  const dir = path.dirname(abs);
  return runtimeVersionFromDir(base === 'yotta-memory.js' ? path.dirname(dir) : dir);
}
function runtimeExtractLauncherPaths(text) {
  const found = new Set();
  const add = function (value) {
    const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
    if (!raw) return;
    const parts = splitCommandArgv(raw);
    for (const part of parts) {
      const token = part.replace(/^['"]|['"]$/g, '');
      if (/yotta-memory\.js$/i.test(token.replace(/[;,]$/, ''))) found.add(token.replace(/[;,]$/, ''));
    }
  };
  const parsed = [];
  try {
    const value = JSON.parse(String(text || ''));
    const walk = function (node) {
      if (typeof node === 'string') parsed.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.keys(node).forEach(function (key) { walk(node[key]); });
    };
    walk(value);
  } catch (e) {}
  for (const value of parsed) if (/yotta-memory\.js/i.test(value)) add(value);
  const raw = String(text || '').replace(/\\\\/g, '\\');
  const patterns = [
    /[A-Za-z]:[\\/][^"'\r\n|;]+?yotta-memory\.js/gi,
    /(?:\.{0,2}[\\/])?[^"'\s|;]+?yotta-memory\.js/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw)) !== null) add(match[0]);
  }
  return Array.from(found);
}
function runtimeConfigIdentityMode(text) {
  const raw = String(text || '');
  if (/YOTTA_AGENT_ID|YOTTA_MEMORY_AGENT_KEY|YOTTA_MEMORY_TRUST_ENV_AGENT/.test(raw)) return 'legacy-env';
  if (/--agent-id/.test(raw) && /--agent-key-file/.test(raw)) return 'stdio-args';
  if (/X-Agent-Id|Authorization/i.test(raw)) return 'headers';
  return 'unknown';
}
function runtimeDiscoverProcesses() {
  try {
    if (process.platform === 'win32') {
      const script = "$p=Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*yotta-memory*' }; if ($p) { $p | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress }";
      const result = child_process.spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      });
      if (result.status !== 0 || !String(result.stdout || '').trim()) return [];
      const parsed = JSON.parse(String(result.stdout).trim());
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows.map(function (row) {
        return { pid: row.ProcessId, commandLine: row.CommandLine || '' };
      });
    }
    const result = child_process.spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 10000 });
    if (result.status !== 0) return [];
    return String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(function (line) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      return match ? { pid: parseInt(match[1], 10), commandLine: match[2] } : null;
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}
function runtimeDiscoverSkillDirs() {
  const explicit = runtimePathList(process.env.YOTTA_MEMORY_SKILL_DIRS);
  if (explicit.length) return explicit;
  const candidates = [];
  const add = function (base) {
    if (!base) return;
    candidates.push(path.join(base, 'skills', 'yotta-memory'));
    candidates.push(path.join(base, 'yotta-memory'));
  };
  add(process.env.CODEX_HOME);
  if (process.env.XDG_CONFIG_HOME) candidates.push(path.join(process.env.XDG_CONFIG_HOME, 'opencode', 'skills', 'yotta-memory'));
  add(process.env.HERMES_HOME);
  add(path.join(os.homedir(), '.codex'));
  candidates.push(path.join(os.homedir(), '.config', 'opencode', 'skills', 'yotta-memory'));
  return Array.from(new Set(candidates)).filter(function (dir) { return fs.existsSync(dir); });
}
function runtimeDoctorCore(opts) {
  opts = opts || {};
  const drifts = [];
  const warnings = [];
  const mcpConfigPaths = opts.mcpConfigPaths !== undefined
    ? opts.mcpConfigPaths
    : runtimePathList(process.env.YOTTA_MEMORY_MCP_CONFIGS);
  const skillDirs = opts.skillDirs !== undefined ? opts.skillDirs : runtimeDiscoverSkillDirs();
  const processes = opts.processes !== undefined ? opts.processes : runtimeDiscoverProcesses();
  const manifest = readRuntimeManifest();
  const currentDir = runtimeCurrentDir();
  const currentBin = runtimeCurrentBin();
  const manifestVersion = manifest && manifest.current ? String(manifest.current) : '';
  const installedCurrentVersion = fs.existsSync(path.join(currentDir, 'package.json'))
    ? runtimeVersionFromDir(currentDir)
    : '';

  const checks = {
    cli: { path: runtimeExecutionPath(), version: VERSION },
    current: {
      path: currentDir,
      version: manifestVersion || installedCurrentVersion || '',
      installedVersion: installedCurrentVersion,
      manifestVersion: manifestVersion,
    },
    runtimeRoot: runtimeRoot(),
    mcpConfigs: [],
    runningServers: [],
    skillCopies: [],
    identityModes: [],
    drifts: drifts,
  };

  if (!manifest || !manifest.current) {
    drifts.push({
      kind: 'current-runtime',
      source: runtimeManifestPath(),
      actual: 'missing',
      expected: VERSION,
      fix: 'yotta-memory runtime install --from-current',
      blocking: true,
    });
  } else {
    const versionDir = runtimeVersionDir(manifest.current);
    if (!fs.existsSync(versionDir)) {
      drifts.push({
        kind: 'current-runtime',
        source: runtimeManifestPath(),
        actual: manifest.current,
        expected: VERSION,
        fix: 'yotta-memory runtime install --from-current && yotta-memory runtime use ' + VERSION + ' --restart',
        blocking: true,
      });
    } else if (manifest.current !== VERSION) {
      drifts.push({
        kind: 'current-runtime',
        source: runtimeManifestPath(),
        actual: manifest.current,
        expected: VERSION,
        fix: 'yotta-memory runtime install --from-current && yotta-memory runtime use ' + VERSION + ' --restart',
        blocking: true,
      });
    }
    if (fs.existsSync(versionDir)) {
      if (!fs.existsSync(currentBin)) {
        drifts.push({
          kind: 'current-runtime',
          source: currentDir,
          actual: 'launcher-missing',
          expected: VERSION,
          fix: 'yotta-memory runtime use ' + manifest.current + ' --force',
          blocking: true,
        });
      } else {
        try {
          const real = fs.realpathSync(currentDir);
          if (path.resolve(real) !== path.resolve(versionDir)) {
            drifts.push({
              kind: 'current-runtime',
              source: currentDir,
              actual: 'pointer-mismatch',
              expected: manifest.current,
              fix: 'yotta-memory runtime use ' + manifest.current + ' --restart',
              blocking: true,
            });
          }
        } catch (e) {
          drifts.push({
            kind: 'current-runtime',
            source: currentDir,
            actual: 'pointer-unreadable',
            expected: manifest.current,
            fix: 'yotta-memory runtime use ' + manifest.current + ' --restart',
            blocking: true,
          });
        }
      }
    }
  }

  const legacyEnv = legacyIdentityEnvNames();
  if (legacyEnv.length) {
    drifts.push({
      kind: 'identity-mode',
      source: 'process-env',
      actual: 'legacy-env',
      expected: 'headers|stdio-args',
      fix: '移除 ' + legacyEnv.join(', ') + '，HTTP 改用请求头，stdio 改用 --agent-id + --agent-key-file',
      blocking: true,
    });
  }

  for (const configPath of mcpConfigPaths) {
    const abs = path.resolve(String(configPath));
    let text = '';
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      warnings.push('MCP 配置无法读取: ' + abs);
      checks.mcpConfigs.push({ path: abs, readable: false, version: 'unknown', identityMode: 'unknown' });
      continue;
    }
    const launchers = runtimeExtractLauncherPaths(text);
    const identityMode = runtimeConfigIdentityMode(text);
    const version = launchers.length ? (runtimeVersionFromPath(launchers[0]) || 'unknown') : 'unknown';
    checks.mcpConfigs.push({ path: abs, readable: true, launcher: launchers[0] || '', version: version, identityMode: identityMode });
    checks.identityModes.push({ source: abs, mode: identityMode });
    if (identityMode === 'legacy-env') {
      drifts.push({
        kind: 'identity-mode',
        source: abs,
        actual: 'legacy-env',
        expected: 'headers|stdio-args',
        fix: '从 MCP 配置移除身份 env，HTTP 改用请求头，stdio 改用 --agent-id + --agent-key-file',
        blocking: true,
      });
    }
    if (version !== 'unknown' && version !== VERSION) {
      drifts.push({
        kind: 'mcp-config',
        source: abs,
        actual: version,
        expected: VERSION,
        fix: '把 MCP 配置中的运行时路径改为 ' + runtimeCurrentBin() + ' 后重启该 MCP',
        blocking: true,
      });
    }
  }

  for (const processInfo of processes || []) {
    const row = typeof processInfo === 'string' ? { pid: '', commandLine: processInfo } : (processInfo || {});
    const commandLine = String(row.commandLine || '');
    if (!commandLine || commandLine.indexOf('yotta-memory') === -1 || commandLine.indexOf('serve') === -1) continue;
    const launchers = runtimeExtractLauncherPaths(commandLine);
    const launcher = launchers[0] || '';
    const version = launcher ? (runtimeVersionFromPath(launcher) || 'unknown') : 'unknown';
    checks.runningServers.push({ pid: row.pid || '', launcher: launcher, version: version });
    if (version !== 'unknown' && version !== VERSION) {
      drifts.push({
        kind: 'running-server',
        source: 'pid=' + String(row.pid || 'unknown'),
        actual: version,
        expected: VERSION,
        fix: 'yotta-memory runtime use ' + VERSION + ' --restart 或重启对应 MCP 客户端',
        blocking: false,
      });
    }
  }

  for (const skillDir of skillDirs) {
    const abs = path.resolve(String(skillDir));
    if (!fs.existsSync(path.join(abs, 'SKILL.md'))) continue;
    const version = runtimeVersionFromDir(abs) || 'unknown';
    checks.skillCopies.push({ path: abs, version: version });
    if (version !== 'unknown' && version !== VERSION) {
      drifts.push({
        kind: 'skill-copy',
        source: abs,
        actual: version,
        expected: VERSION,
        fix: '用官方安装器更新该 yotta-memory 技能副本',
        blocking: false,
      });
    }
  }

  const lines = [
    '## 运行时一致性',
    '- CLI: ' + VERSION + ' (' + runtimeExecutionPath() + ')',
    '- current: ' + (checks.current.version || '(missing)') + ' (' + currentDir + ')',
    '- runtime.json: ' + runtimeManifestPath(),
  ];
  if (checks.mcpConfigs.length) {
    for (const item of checks.mcpConfigs) lines.push('- MCP 配置: ' + item.path + ' -> ' + item.version + ' / ' + item.identityMode);
  } else lines.push('- MCP 配置: (未提供或未发现)');
  if (checks.runningServers.length) {
    for (const item of checks.runningServers) lines.push('- 运行中 server: pid=' + item.pid + ' -> ' + item.version);
  } else lines.push('- 运行中 server: (未发现)');
  if (checks.skillCopies.length) {
    for (const item of checks.skillCopies) lines.push('- 技能副本: ' + item.path + ' -> ' + item.version);
  } else lines.push('- 技能副本: (未提供或未发现)');
  if (!drifts.length) lines.push('- 漂移: 无');
  for (const drift of drifts) {
    lines.push('- [漂移] ' + drift.kind + ': actual=' + drift.actual + ' expected=' + drift.expected + ' fix=' + drift.fix + ' blocking=' + (drift.blocking ? 'yes' : 'no'));
  }
  return {
    ok: !drifts.some(function (drift) { return drift.blocking; }),
    checks: checks,
    drifts: drifts,
    warnings: warnings,
    text: lines.join('\n'),
  };
}
function storeHasMemoryData(root) {
  const factsDir = path.join(root, PUBLIC_DIR);
  if (fs.existsSync(factsDir)) {
    try {
      if (fs.readdirSync(factsDir).some(function (f) { return /\.md(\.enc)?$/.test(f); })) return true;
    } catch (e) {}
  }
  if (hasPlaintextPrivate(root)) return true;
  for (const owner of collectOwners(root)) {
    for (const t of PRIVATE_LEAF) {
      const dir = path.join(root, PRIVATE_DIR, owner, t);
      if (!fs.existsSync(dir)) continue;
      try {
        if (fs.readdirSync(dir).some(function (f) { return f.endsWith(ENC_SUFFIX); })) return true;
      } catch (e) {}
    }
  }
  return false;
}
function storeHasPublicFacts(root) {
  const factsDir = path.join(root, PUBLIC_DIR);
  if (!fs.existsSync(factsDir)) return false;
  try {
    return fs.readdirSync(factsDir).some(function (f) { return /\.md(\.enc)?$/.test(f); });
  } catch (e) {
    return false;
  }
}
// 开工可靠性检查：只读检查根目录、密钥库、索引、身份登记与最近备份。
function doctorCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  const cfg = loadConfig();
  const identity = identityDiagnostic(resolveIdentity(opts));
  const checks = {};
  const warnings = [];
  const critical = [];
  const exists = isExistingStore(root);
  const hasData = storeHasMemoryData(root);
  const hasPublicFacts = storeHasPublicFacts(root);
  checks.root = { ok: exists, path: root };
  if (!exists) critical.push('记忆库不存在或基本结构缺失: ' + root);

  const encrypted = isEncrypted(root);
  checks.encrypted = { enabled: encrypted };
  if (encrypted) {
    const saltOk = fs.existsSync(encSaltPath(root));
    const recoveryOk = fs.existsSync(encRecoveryEncPath(root));
    checks.keys = { salt: saltOk, recovery: recoveryOk };
    if (!saltOk) critical.push('密钥库异常: 缺少 keys/salt');
    if (!recoveryOk) critical.push('密钥库异常: 缺少 keys/recovery.key.enc（恢复钥匙文件）');
  } else if (exists && hasPlaintextPrivate(root)) {
    checks.keys = { mode: 'plaintext' };
    warnings.push('当前私密区为明文；建议运行 yotta-memory migrate 启用加密。');
  } else {
    checks.keys = { mode: 'plaintext' };
  }

  const idxFile = indexPath(root);
  if (!fs.existsSync(idxFile)) {
    checks.index = { exists: false, valid: false };
    if (hasPublicFacts) warnings.push('公共索引缺失；可运行 yotta-memory reindex 重建。');
    else checks.index.fresh = true;
  } else if (!loadIndex(root)) {
    checks.index = { exists: true, valid: false };
    warnings.push('公共索引无法解析或版本过旧；可运行 yotta-memory reindex 重建。');
  } else {
    checks.index = { exists: true, valid: true };
  }

  if (!fs.existsSync(agentsPath(root))) {
    checks.agents = { exists: false, valid: false };
    if (hasData) warnings.push('agents.json 缺失；智能体身份登记不可用。');
    else checks.agents.fresh = true;
  } else {
    try {
      JSON.parse(fs.readFileSync(agentsPath(root), 'utf8'));
      checks.agents = { exists: true, valid: true };
    } catch (error) {
      checks.agents = { exists: true, valid: false };
      warnings.push('agents.json 无法解析；请先恢复身份登记。');
    }
  }
  checks.identity = identity;

  const migration = migrationRequiredInfo(root);
  if (migration) {
    checks.agentBindings = { ok: false, pending: migration.owners };
    warnings.push(migrationReminderText(root));
  } else if (encrypted) {
    checks.agentBindings = { ok: true, pending: [] };
  }

  const configuredDir = opts.dir || opts.backupDir || cfg.backup_dir;
  if (!configuredDir) {
    if (cfg.backup_setup_choice === 'manual') {
      checks.backup = { configured: false, manual: true, independent: false };
    } else {
      const health = backupHealthCore({ root: root, now: opts.now, sameVolumeFn: opts.sameVolumeFn });
      checks.backup = { configured: false, manual: false, independent: false };
      if (health.text) warnings.push(health.text);
    }
  } else {
    const status = backupStatusCore({
      root: root,
      dir: configuredDir,
      now: opts.now,
      sameVolumeFn: opts.sameVolumeFn,
    });
    checks.backup = {
      configured: true,
      manual: false,
      independent: !!status.independent,
      latest: status.latest ? status.latest.id : '',
      ageHours: status.ageHours,
      healthy: !!status.healthy,
    };
    if (!status.independent) {
      critical.push('备份目录与记忆库在同一卷，不能作为可靠备份。');
    }
    if (!status.latest) {
      warnings.push('备份目录已配置，但还没有成功备份；请运行 yotta-memory backup create 或 backup ensure-daily。');
    } else {
      const maxAge = Number(cfg.backup_max_age_hours) || 36;
      if (status.ageHours !== null && status.ageHours > maxAge) {
        warnings.push('最近备份已过期（' + status.ageHours.toFixed(1) + ' 小时，超过 ' + maxAge + ' 小时）；请检查备份盘与每日调度。');
      }
    }
    if (cfg.backup_last_error) warnings.push('最近一次备份失败: ' + cfg.backup_last_error);
    if (cfg.backup_scheduler_error) warnings.push('每日备份调度异常: ' + cfg.backup_scheduler_error);
  }

  let runtimeReport = null;
  if (opts.runtime) {
    runtimeReport = runtimeDoctorCore(opts);
    checks.runtime = runtimeReport.checks;
    for (const drift of runtimeReport.drifts) {
      const message = '运行时漂移 [' + drift.kind + ']: actual=' + drift.actual + ' expected=' + drift.expected + '；修复: ' + drift.fix + '；阻断: ' + (drift.blocking ? '是' : '否');
      if (drift.blocking) critical.push(message);
      else warnings.push(message);
    }
    for (const warning of runtimeReport.warnings || []) warnings.push(warning);
  }

  const level = critical.length ? 'critical' : (warnings.length ? 'warning' : 'ok');
  const agentHomeEnv = String(process.env.YOTTA_MEMORY_AGENT_HOME || '').trim();
  const lines = [
    '# yotta-memory doctor（开工可靠性检查）',
    '',
    '- 结果: ' + (level === 'critical' ? '严重' : (level === 'warning' ? '警告' : '正常')),
    '- 记忆库: ' + root,
    '- 加密: ' + (encrypted ? '是' : '否'),
    '- agent home: ' + (agentHomeEnv || '(未设置 YOTTA_MEMORY_AGENT_HOME，按宿主默认检测)'),
    '- 备份目录: ' + (configuredDir || (cfg.backup_setup_choice === 'manual' ? '手动模式' : '(未配置)')),
  ];
  for (const message of critical) lines.push('- [严重] ' + message);
  for (const message of warnings) lines.push('- [警告] ' + message);
  if (!critical.length && !warnings.length) lines.push('- 检查项: 全部通过');
  if (runtimeReport) {
    lines.push('');
    lines.push(runtimeReport.text);
  }
  if (level === 'critical') {
    lines.push('');
    lines.push('- 破坏性写入已锁定：先运行 yotta-memory doctor 修复严重问题。');
  }
  return {
    error: false,
    schemaVersion: 1,
    ok: critical.length === 0,
    level: level,
    encryption: encrypted,
    migration_required: migration ? migration.entries : [],
    critical: critical,
    warnings: warnings,
    checks: checks,
    identity: identity,
    root: root,
    text: lines.join('\n'),
  };
}
// 破坏性写入前的统一快照门：先 doctor，再创建新的整库快照，最后写事务审计。
function destructiveGuardCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  // snapshotDir / allowSameVolumeForTest 仅用于 core 测试注入；CLI 的 --allow-same-volume 不进入破坏性写入门。
  const snapshotDir = opts.snapshotDir || opts.backupDir || loadConfig().backup_dir || '';
  const sameVolumeFn = opts.sameVolumeFn || (opts.allowSameVolumeForTest ? function () { return false; } : undefined);
  const report = doctorCore({
    root: root,
    backupDir: snapshotDir || undefined,
    now: opts.now,
    sameVolumeFn: sameVolumeFn,
  });
  if (!report.ok) {
    return {
      error: true,
      doctor: report,
      text: '拒绝: 开工可靠性检查未通过，破坏性操作已锁定。\n' + report.text,
    };
  }
  if (!snapshotDir) {
    return {
      error: true,
      doctor: report,
      text: '拒绝: 未配置独立备份目录，不能执行破坏性操作。请先运行 backup volumes，由用户确认位置后执行 backup setup。',
    };
  }
  const snapshot = backupCreateCore({
    root: root,
    dir: snapshotDir,
    now: opts.now,
    allowSameVolume: !!opts.allowSameVolumeForTest,
    sameVolumeFn: sameVolumeFn,
  });
  if (snapshot.error) {
    return {
      error: true,
      doctor: report,
      text: '拒绝: 事务快照失败，原记忆未改动。\n' + snapshot.text,
    };
  }
  const transaction = 'txn-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
  const auditOk = appendAudit(root, 'audit', {
    action: 'transaction_start',
    ts: new Date().toISOString(),
    transaction: transaction,
    operation: opts.action || 'destructive',
    root: root,
    snapshot: snapshot.id,
    snapshotPath: snapshot.path,
  });
  if (!auditOk) {
    return {
      error: true,
      doctor: report,
      snapshot: snapshot,
      text: '拒绝: 事务审计写入失败，原记忆未改动。快照已保留: ' + snapshot.id,
    };
  }
  return {
    error: false,
    doctor: report,
    snapshot: snapshot,
    transaction: transaction,
    text: '事务快照: ' + snapshot.id,
  };
}
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function listBackupFiles(dir, baseDir) {
  const out = [];
  const walk = function (current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        out.push({
          path: path.relative(baseDir, full).replace(/\\/g, '/'),
          size: fs.statSync(full).size,
          sha256: sha256File(full),
        });
      }
    }
  };
  walk(dir);
  return out;
}
function isAllowedBackupPath(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) return true;
  const top = normalized.split('/')[0];
  if (top === 'facts' || top === 'private' || top === '.archive') return true;
  if (top === 'agents.json' || top === 'index.json' || /^index-\d{4}\.json$/.test(top)) return true;
  if (top === 'keys') {
    return normalized !== 'keys/cache' && normalized.indexOf('keys/cache/') !== 0 &&
      normalized !== 'keys/pending' && normalized.indexOf('keys/pending/') !== 0;
  }
  return false;
}
function backupCreateCore(opts) {
  opts = opts || {};
  const root = path.resolve(opts.root || userRoot());
  if (!isExistingStore(root)) return { error: true, text: '记忆库不存在或未初始化: ' + root };
  const destBase = backupDestination(opts);
  if (!destBase) return { error: true, text: '未配置备份目录。请用 --dir <目录>、YOTTA_MEMORY_BACKUP_DIR 或 config set backup_dir <目录>。' };
  const same = opts.sameVolumeFn ? !!opts.sameVolumeFn(root, destBase) : sameVolume(root, destBase);
  if (!opts.allowSameVolume && same) {
    return { error: true, text: '拒绝: 备份目录与记忆库在同一卷。请把备份放到独立盘或独立卷。' };
  }
  const createdAt = new Date(opts.now || Date.now()).toISOString();
  const id = os.hostname() + '-' + createdAt.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
  const target = path.join(destBase, id);
  try {
    fs.mkdirSync(destBase, { recursive: true });
    fs.cpSync(root, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: function (src) {
        const rel = path.relative(root, src).replace(/\\/g, '/');
        return isAllowedBackupPath(rel);
      },
    });
    const files = listBackupFiles(target, target);
    const manifest = {
      id: id,
      version: VERSION,
      created: createdAt,
      source: root,
      files: files,
    };
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { error: false, id: id, path: target, manifest: manifest, text: '已创建备份: ' + target + '（' + files.length + ' 文件）' };
  } catch (error) {
    return { error: true, text: '备份失败: ' + error.message };
  }
}
function backupListCore(opts) {
  opts = opts || {};
  const destBase = backupDestination(opts);
  if (!destBase) return { error: true, backups: [], text: '未配置备份目录。请用 --dir <目录>、YOTTA_MEMORY_BACKUP_DIR 或 config set backup_dir <目录>。' };
  if (!fs.existsSync(destBase)) return { error: false, backups: [], text: '（无备份）' };
  const backups = [];
  for (const entry of fs.readdirSync(destBase, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(destBase, entry.name);
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(path.join(full, 'manifest.json'), 'utf8')); } catch (_) {}
    backups.push({
      id: entry.name,
      path: full,
      created: manifest && manifest.created ? manifest.created : '',
      files: manifest && Array.isArray(manifest.files) ? manifest.files.length : null,
      manifest: manifest,
    });
  }
  backups.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
  const lines = backups.length
    ? backups.map(function (b) { return '- ' + b.id + '  ' + (b.created || '?') + '  ' + (b.files === null ? 'manifest 缺失' : b.files + ' 文件'); })
    : ['（无备份）'];
  return { error: false, backups: backups, text: lines.join('\n') };
}
function backupDoctorCore(opts) {
  opts = opts || {};
  const listed = backupListCore(opts);
  if (listed.error) return { error: true, ok: false, text: listed.text };
  const id = opts.id || (listed.backups[0] && listed.backups[0].id);
  if (!id) return { error: false, ok: false, text: '没有可检查的备份。' };
  const backup = listed.backups.find(function (item) { return item.id === id; });
  if (!backup) return { error: true, ok: false, text: '未找到备份: ' + id };
  if (!backup.manifest || !Array.isArray(backup.manifest.files)) {
    return { error: false, ok: false, text: '备份 manifest 缺失或损坏: ' + id };
  }
  const bad = [];
  for (const file of backup.manifest.files) {
    if (!isSafeRelativePathForBackup(file.path)) { bad.push(file.path + '（路径不安全）'); continue; }
    const full = path.join(backup.path, file.path);
    if (!fs.existsSync(full)) { bad.push(file.path + '（缺失）'); continue; }
    const stat = fs.statSync(full);
    if (stat.size !== file.size) { bad.push(file.path + '（大小不符）'); continue; }
    if (sha256File(full) !== file.sha256) bad.push(file.path + '（哈希不符）');
  }
  return {
    error: false,
    ok: bad.length === 0,
    text: bad.length ? '备份体检失败: ' + id + '\n' + bad.join('\n') : '备份体检通过: ' + id + '（' + backup.manifest.files.length + ' 文件）',
  };
}
function isSafeRelativePathForBackup(value) {
  if (typeof value !== 'string' || value === '' || path.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/).includes('..');
}
function backupRestoreCore(id, opts) {
  opts = opts || {};
  if (!id) return { error: true, text: '请指定备份 ID: yotta-memory backup restore <id> --to <目录>' };
  const destBase = backupDestination(opts);
  if (!destBase) return { error: true, text: '未配置备份目录。请用 --dir <目录> 或 config set backup_dir <目录>。' };
  const source = path.join(destBase, id);
  if (!fs.existsSync(path.join(source, 'manifest.json'))) return { error: true, text: '备份不存在或 manifest 缺失: ' + id };
  if (!opts.to) return { error: true, text: '拒绝恢复到未指定位置。请使用 --to <新目录>；默认不覆盖正在使用的记忆库。' };
  const target = path.resolve(String(opts.to));
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    return { error: true, text: '恢复目标非空，拒绝覆盖: ' + target };
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: function (src) { return path.basename(src) !== 'manifest.json'; },
    });
    return { error: false, path: target, text: '已恢复到: ' + target };
  } catch (error) {
    return { error: true, text: '恢复失败: ' + error.message };
  }
}
function findFirstEncryptedPrivateFile(root) {
  const pdir = path.join(root, PRIVATE_DIR);
  if (!fs.existsSync(pdir)) return null;
  const owners = fs.readdirSync(pdir);
  for (const owner of owners) {
    const ownerDir = path.join(pdir, owner);
    if (!fs.statSync(ownerDir).isDirectory()) continue;
    for (const type of PRIVATE_LEAF) {
      const dir = path.join(ownerDir, type);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.md' + ENC_SUFFIX)) continue;
        const fp = path.join(dir, name);
        if (fs.statSync(fp).isFile()) return { fp: fp, owner: owner, rel: relOf(root, fp) };
      }
    }
  }
  return null;
}
function backupDrillCore(opts) {
  opts = opts || {};
  const destBase = backupDestination(opts);
  if (!destBase) return { error: true, ok: false, text: '未配置备份目录。请用 --dir <目录> 或 config set backup_dir <目录>。' };
  const listed = backupListCore({ dir: destBase });
  if (listed.error) return { error: true, ok: false, text: listed.text };
  const id = opts.id || (listed.backups[0] && listed.backups[0].id);
  if (!id) return { error: true, ok: false, text: '没有可演练的备份。' };
  let target = opts.to ? path.resolve(String(opts.to)) : '';
  let tempParent = '';
  if (!target) {
    tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ytm-drill-'));
    target = path.join(tempParent, 'restored');
  }
  function fail(text, checks) {
    if (tempParent) {
      try { fs.rmSync(tempParent, { recursive: true, force: true }); } catch (_) {}
    }
    return { error: true, ok: false, text: text, checks: checks || {} };
  }
  const verified = backupDoctorCore({ dir: destBase, id: id });
  if (!verified.ok) return fail('恢复演练失败: 备份 manifest 校验未通过。\n' + verified.text, { manifest: false });
  const restored = backupRestoreCore(id, { dir: destBase, to: target });
  if (restored.error) return fail(restored.text, { manifest: true, index: false });
  let indexOk = false;
  let indexError = '';
  try {
    buildIndex(target);
    indexOk = true;
  } catch (error) {
    indexError = error.message;
  }
  if (!indexOk) return fail('恢复演练失败: 恢复副本无法重建索引: ' + indexError, { manifest: true, index: false });
  const privateFile = findFirstEncryptedPrivateFile(target);
  let privateCheck = { checked: false, decrypted: true, source: 'no-private-entry' };
  if (privateFile) {
    let ownerKey = null;
    let source = '';
    try {
      if (opts.recoveryKey) {
        ownerKey = unwrapOwnerKeyRecovery(target, privateFile.owner, Buffer.from(String(opts.recoveryKey), 'base64'));
        source = 'recovery-key';
      } else if (opts.password) {
        const salt = loadSalt(target);
        if (!salt) throw new Error('恢复副本缺少 keys/salt');
        ownerKey = unwrapOwnerKey(target, privateFile.owner, deriveUmk(opts.password, salt));
        source = 'password';
      }
    } catch (error) {
      ownerKey = null;
    }
    if (!ownerKey) {
      return fail('恢复演练失败: 已恢复文件结构，但无法解密测试私密记忆。请提供 --recovery-key 或 --password；legacy keys/cache 明文缓存不再作为恢复凭证。', {
        manifest: true,
        index: true,
        private: { checked: true, decrypted: false, source: '', file: privateFile.rel },
      });
    }
    try {
      decryptMemoryText(fs.readFileSync(privateFile.fp), ownerKey);
      privateCheck = { checked: true, decrypted: true, source: source, file: privateFile.rel, owner: privateFile.owner };
    } catch (error) {
      return fail('恢复演练失败: 测试私密记忆解密失败（' + error.message + '）。', {
        manifest: true,
        index: true,
        private: { checked: true, decrypted: false, source: source, file: privateFile.rel },
      });
    }
  }
  if (tempParent) {
    try { fs.rmSync(tempParent, { recursive: true, force: true }); } catch (_) {}
  }
  const checks = { manifest: true, index: true, private: privateCheck };
  const lines = [
    '恢复演练通过: ' + id,
    '- manifest / SHA-256: 通过',
    '- 恢复副本索引: 通过',
    '- 测试私密解密: ' + (privateCheck.checked ? ('通过（' + privateCheck.source + '，' + privateCheck.file + '）') : '跳过（备份中没有加密私密条目）'),
  ];
  return {
    error: false,
    ok: true,
    id: id,
    restoredTo: tempParent ? '(临时副本已清理)' : target,
    checks: checks,
    text: lines.join('\n'),
  };
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
  const ident = resolveIdentity(opts);
  const selfAgent = ident.id;
  const owner = opts.owner || selfAgent;
  const scope = opts.scope || defaultScope(t);
  if (scope === 'private' && ident.error) {
    return { error: true, text: ident.error };
  }
  if (scope === 'private') {
    const keyError = validatePrivateIdentity(root, ident, owner);
    if (keyError) return { error: true, text: keyError };
  }
  if (scope === 'private' && !owner) {
    return { error: true, text: '私密记忆必须显式声明归属智能体：CLI 传 --agent <id>；stdio MCP 传 --agent-id <id> + --agent-key-file <path>；HTTP MCP 发送 X-Agent-Id + X-Agent-Key。公共记忆(FACT)不受影响。' };
  }
  if (scope === 'private' && owner && selfAgent && owner !== selfAgent && !opts.unsafe) {
    return { error: true, text: '拒绝: 当前显式身份 ' + selfAgent + ' 不能写入其它智能体 ' + owner + ' 的私密区。请传正确的 --agent <id>，或加 --unsafe（用户显式授权）。' };
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
  const ident = resolveIdentity(opts);
  if (ident.error) return { error: true, exitCode: 3, text: ident.error };
  const selfAgent = ident.id;
  const agent = selfAgent;
  const ownerFilter = opts.owner || '';
  const allSafe = !!opts.unsafe;
  if (ownerFilter && !isSafeAgentId(ownerFilter)) {
    return { error: true, exitCode: 3, text: '非法 owner ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  }
  if (!selfAgent && (opts.all || ownerFilter)) {
    return {
      error: true,
      exitCode: 3,
      text: '显式跨智能体读取必须先声明身份：CLI 传 --agent <id>；stdio MCP 传 --agent-id <id> + --agent-key-file <path>；HTTP MCP 发送 X-Agent-Id + X-Agent-Key。',
    };
  }
  if (selfAgent && !allSafe) {
    for (const root of roots) {
      const keyError = validatePrivateIdentity(root, ident, ownerFilter || selfAgent);
      if (keyError && isEncrypted(root)) {
        return { error: true, exitCode: 3, text: keyError };
      }
    }
  }
  const explicitCross = !!opts.all || (!!ownerFilter && ownerFilter !== agent);
  const wantExplain = !!opts.explain;
  const useSemantic = opts.semantic !== false;
  const prefilter = (q && useSemantic) ? recallPrefilter(q) : null;
  const embeddingMap = new Map();
  const embeddingCommand = effectiveEmbeddingCommand(opts);
  const embeddingTimeout = effectiveEmbeddingTimeout(opts);
  if (q && embeddingCommand) {
    for (const root of roots) {
      const rootEntries = ensureIndex(root).filter(function (e) {
        return classifyRead(e, agent, ownerFilter, allSafe, selfAgent) !== 'denied';
      });
      try {
        const hits = embeddingCandidates(rootEntries, q, {
          embedding: embeddingCommand,
          embeddingTimeout: embeddingTimeout,
          root: root
        });
        for (const h of hits) {
          embeddingMap.set(root + '\0' + h.entry.file, h);
        }
      } catch (err) {
        // Plugin failure is not fatal; keep lexical-only recall.
      }
    }
  }
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
      const embeddingHit = embeddingMap.get(root + '\0' + e.file) || null;
      if (q) {
        if (useSemantic) {
          if (prefilter && !prefilter(e) && !embeddingHit) continue; // v0.8.1 候选预过滤：粗筛后再语义打分；embedding 命中可越过词法预过滤
          const m = semanticMatch(e, q, wantExplain);
          score = m.score;
          if (wantExplain && m.detail && m.detail.length) detail = m.detail;
          if (embeddingHit) {
            score = Math.max(score, embeddingHit.score);
            if (wantExplain && embeddingHit.detail) {
              detail = (detail || []).concat(embeddingHit.detail);
            }
          }
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
  if (!selfAgent) lines.push('[注意] 未声明身份，本次仅读取公共 FACT；私密 PREF / BOUND / COMMIT 已跳过。');
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
  return {
    error: false,
    exitCode: 0,
    text: lines.join('\n'),
    entries: shown.map(function (h) {
      return {
        root: h.root,
        file: h.entry.file,
        type: h.entry.type,
        subject: h.entry.subject,
        statement: h.entry.statement,
        score: h.finalScore === undefined ? h.score : h.finalScore
      };
    })
  };
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
function appendTrashAudit(root, record) {
  const dir = path.join(root, '.trash');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'audit-' + today() + '.jsonl'), JSON.stringify(record) + '\n', 'utf8');
}
function forgetCore(fileRef, opts) {
  opts = opts || {};
  const selfAgent = resolveIdentity(opts).id;
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
      return { error: true, text: '拒绝: 不能删除其它智能体 ' + owner + ' 的私密记忆（当前身份 ' + (selfAgent || '未声明') + '）。请用 --agent / --agent-id 声明自己的身份，或加 --unsafe（用户显式授权）。' };
    }
  }
  const trashFile = path.join(
    targetRoot,
    '.trash',
    new Date().toISOString().replace(/[:.]/g, '-'),
    targetRel,
  );
  try {
    fs.mkdirSync(path.dirname(trashFile), { recursive: true });
    fs.renameSync(target, trashFile);
  } catch (error) {
    return { error: true, text: '召回区写入失败，原记忆未删除: ' + error.message };
  }
  if (targetRoot) removeIndexEntry(targetRoot, targetRel);
  if (targetRoot) {
    appendTrashAudit(targetRoot, {
      ts: new Date().toISOString(),
      action: 'forget',
      file: targetRel,
      trash: relOf(targetRoot, trashFile),
      owner: ownerFromPrivatePath(targetRoot, target),
      selfAgent,
    });
  }
  return { error: false, text: '已移入回收区: ' + trashFile };
}
function archiveCore(opts) {
  opts = opts || {};
  const cfg = loadConfig();
  const days = opts.days || parseInt(cfg.maintain_archived_age || '180', 10) || 180;
  const threshold = (opts.threshold !== undefined && opts.threshold !== null) ? opts.threshold : (parseFloat(cfg.maintain_archived_utility || 0.35));
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const guard = destructiveGuardCore({
    root: root,
    action: 'archive',
    snapshotDir: opts.snapshotDir,
    backupDir: opts.backupDir,
    allowSameVolumeForTest: opts.allowSameVolumeForTest,
    sameVolumeFn: opts.sameVolumeFn,
    now: opts.now,
  });
  if (guard.error) return { error: true, text: guard.text };
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
    if (t === 'BOUND') continue; // v0.10.0 BOUND 豁免归档（边界常驻）
    // v0.8.0 统一效用分（盖棺分）替代 vitality
    if (utilityScore(meta) < threshold && createdTs < cutoff) {
      const destDir = archiveDirFor(root, t, owner);
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(fp, path.join(destDir, path.basename(fp)));
      const rel = relOf(root, fp);
      movedFiles.push(rel);
      moved++;
    }
  }
  if (movedFiles.length) removeIndexEntries(root, movedFiles);
  return { error: false, text: '已归档 ' + moved + ' 条旧记忆到 ' + path.join(root, ARCHIVE_DIR) + '\n事务快照: ' + guard.snapshot.id };
}

// ---- v0.8.0 自我学习/自我进化/自我提升：feedback / explain / maintain / distill ----
function auditPath(root, kind) {
  return path.join(root, ARCHIVE_DIR, kind + '-' + today() + '.jsonl');
}
function appendAudit(root, kind, rec) {
  try {
    fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
    fs.appendFileSync(auditPath(root, kind), JSON.stringify(rec) + '\n', 'utf8');
    return true;
  } catch (e) { return false; }
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
      return '拒绝: 不能操作其它智能体 ' + owner + ' 的私密记忆（当前身份 ' + (selfAgent || '未声明') + '）。请用 --agent / --agent-id 声明自己的身份，或加 --unsafe（用户显式授权）。';
    }
  }
  return null;
}
// 显式使用反馈：useful/useless → weight/confidence/feedback_net 演化（自我学习闭环）
function feedbackCore(ref, opts) {
  opts = opts || {};
  const selfAgent = resolveIdentity(opts).id;
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
  const selfAgent = resolveIdentity(opts).id;
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
  const hlText = entry.type === 'BOUND' ? 'BOUND 不衰减' : (decayHalflifeDays(entry.type, cfg) + ' 天');
  const archU = parseFloat(cfg.maintain_archived_utility || 0.35);
  const archAge = parseInt(cfg.maintain_archived_age || '180', 10) || 180;
  const forgetU = parseFloat(cfg.maintain_forget_utility || 0.12);
  const forgetAge = parseInt(cfg.maintain_forget_age || '365', 10) || 365;
  const lines = ['[' + entry.type + '] ' + entry.subject + ': ' + entry.statement];
  lines.push('  文件: ' + target.rel + (readable ? '' : '（其它智能体私密，仅元数据）'));
  lines.push('  效用分: ' + ub.total + ' = confidence ' + ub.confidence + ' + 使用 ' + ub.usage + ' + 时效 ' + ub.recency + '（半衰 ' + hlText + '） + 类型 ' + ub.type + ' + 结构 ' + ub.structure + '）×weight ' + ub.weight);
  lines.push('  年龄: ' + ageDays + ' 天 / access_count ' + (entry.access_count || 0) + ' / feedback_net ' + entry.feedback_net + ' / immutable ' + (entry.immutable ? '是' : '否'));
  const importScore = round3(importanceScore(entry));
  lines.push('  importance(旧): ' + importScore + ' / vitality(旧): ' + round3(vitality(entry)));
  if (entry.immutable) lines.push('  状态: immutable 豁免自动归档/遗忘');
  else if (entry.type === 'BOUND') lines.push('  状态: BOUND 豁免归档/遗忘（边界常驻）');
  else if (ub.total < forgetU && ageDays > forgetAge) lines.push('  状态: 遗忘候选（utility < ' + forgetU + ' 且年龄 > ' + forgetAge + ' 天；--purge 才真删）');
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
  let guard = null;
  if (apply) {
    guard = destructiveGuardCore({
      root: root,
      action: opts.dedup ? 'maintain --dedup --apply' : (purge ? 'maintain --apply --purge' : 'maintain --apply'),
      snapshotDir: opts.snapshotDir,
      backupDir: opts.backupDir,
      allowSameVolumeForTest: opts.allowSameVolumeForTest,
      sameVolumeFn: opts.sameVolumeFn,
      now: opts.now,
    });
    if (guard.error) return { error: true, text: guard.text };
  }
  const cfg = loadConfig();
  const archU = parseFloat(opts.threshold !== undefined && opts.threshold !== null ? opts.threshold : (cfg.maintain_archived_utility || 0.35));
  const archAge = parseInt(opts.age || cfg.maintain_archived_age || '180', 10) || 180;
  const forgetU = parseFloat(cfg.maintain_forget_utility || 0.12);
  const forgetAge = parseInt(cfg.maintain_forget_age || '365', 10) || 365;
  const mode = opts.dedup ? (apply ? '查重执行（--dedup --apply 只自动合并高置信重复组，不执行归档/遗忘）' : '查重预览（--dedup；不执行归档/遗忘）') : (apply ? (purge ? '执行（含遗忘真删 --purge）' : '执行') : '预览（dry-run，未改动；加 --apply 执行，--purge 才真删）');
  const lines = ['## yotta-memory maintain（记忆自组织）'];
  lines.push('- 模式: ' + mode);
  lines.push('- 归档阈值: utility < ' + archU + ' 且年龄 > ' + archAge + ' 天；遗忘阈值: utility < ' + forgetU + ' 且年龄 > ' + forgetAge + ' 天');
  if (guard) lines.push('- 事务快照: ' + guard.snapshot.id);
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
    if (u < archU && ageDays > archAge) {
      if (type === 'BOUND') skipped.push({ fp: fp, reason: 'BOUND 豁免归档' });
      else toArchive.push(rec);
    }
  }
  let archived = 0, forgotten = 0;
  if (toArchive.length) {
    lines.push('### 归档候选（' + toArchive.length + ' 条）');
    for (const rec of toArchive) {
      lines.push('- [' + rec.type + '] ' + rec.rel + '（utility ' + round3(rec.utility) + '，' + rec.ageDays + ' 天）— ' + (rec.meta.subject || '') + ': ' + String(rec.meta.statement || '').slice(0, 40) + (rec.type === 'COMMIT' ? '  ⚠️ COMMIT 收工纪律锚点，请确认' : ''));
      if (apply && !opts.dedup) {
        const destDir = archiveDirFor(root, rec.type, rec.owner);
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
      if (apply && purge && !opts.dedup) {
        const destDir = archiveDirFor(root, rec.type, rec.owner);
        fs.mkdirSync(destDir, { recursive: true });
        const dest = path.join(destDir, path.basename(rec.fp));
        fs.renameSync(rec.fp, dest);
        appendAudit(root, 'audit', { ts: new Date().toISOString(), file: rec.rel, action: 'forget', reason: 'utility<' + round3(rec.utility) + ',age>' + rec.ageDays + ',purge', utility: round3(rec.utility) });
        // 真删前二次确认标记：purge 已显式授权，删除 .archive 内副本前的最终动作 = 记录审计后删除
        try { fs.unlinkSync(dest); } catch (e) { /* 保留副本 */ }
        forgotten++;
      } else if (apply && !opts.dedup) {
        lines.push('    （--purge 未开启，跳过真删）');
      }
    }
    lines.push('');
  }
  if (!opts.dedup) {
    if (apply) {
      if (archived || forgotten) {
        const allMoved = toArchive.concat(toForget).filter(function (r) { return true; });
        removeIndexEntries(root, allMoved.map(function (r) { return r.rel; }));
      }
      lines.push('- 已执行: 归档 ' + archived + ' 条，遗忘 ' + forgotten + ' 条。审计: ' + auditPath(root, 'audit'));
    } else {
      lines.push('- 未执行任何变更（dry-run）。加 --apply 执行归档，--purge 才真删遗忘候选。');
    }
  }
  if (skipped.length) {
    lines.push('');
    lines.push('### 跳过（' + skipped.length + ' 条）');
    const grouped = {};
    for (const s of skipped) { grouped[s.reason] = (grouped[s.reason] || 0) + 1; }
    for (const k of Object.keys(grouped)) lines.push('- ' + k + ': ' + grouped[k] + ' 条');
  }
  // 去重（v0.10.0：置信度分档 + --apply 自动合并；--dedup 与归档/遗忘互斥）
  if (opts.dedup) appendDedupBlock(lines, root, opts);
  return { error: false, text: lines.join('\n') };
}
// 手动合并两条相似记忆：保留高 confidence，低 confidence 移入 .archive
function mergeCore(refA, refB, opts) {
  opts = opts || {};
  const selfAgent = resolveIdentity(opts).id;
  const ta = resolveMemoryTarget(refA);
  const tb = resolveMemoryTarget(refB);
  if (!ta || !tb) return { error: true, text: '未找到记忆文件: ' + refA + ' / ' + refB };
  for (const t of [ta, tb]) {
    const deny = checkOwnerWritable(t.root, t.rel, selfAgent, opts.unsafe);
    if (deny) return { error: true, text: deny };
  }
  if (ta.root !== tb.root) return { error: true, text: '暂不支持跨记忆库合并（' + ta.root + ' vs ' + tb.root + '）。' };
  const root = ta.root;
  const guard = destructiveGuardCore({
    root: root,
    action: 'merge',
    snapshotDir: opts.snapshotDir,
    backupDir: opts.backupDir,
    allowSameVolumeForTest: opts.allowSameVolumeForTest,
    sameVolumeFn: opts.sameVolumeFn,
    now: opts.now,
  });
  if (guard.error) return { error: true, text: guard.text };
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
  return { error: false, text: '已合并: ' + drop.file + ' -> ' + keep.file + '\n  保留: [' + keep.type + '] ' + keep.subject + ': ' + keep.statement + '\n  归档低 confidence: ' + drop.file + '\n  事务快照: ' + guard.snapshot.id };
}
// 心理日志蒸馏：统计摘要 / 主题画像 / 知识地图（启发式默认，可选 --model）
function distillCore(opts) {
  opts = opts || {};
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const selfAgent = resolveIdentity(opts).id;
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
      const r = runDistillModel(String(opts.model), payload);
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

function readPasswordFromStdin() {
  try {
    const text = fs.readFileSync(0, 'utf8');
    return String(text || '').replace(/\r?\n$/, '');
  } catch (e) {
    return '';
  }
}

async function resolvePasswordInput(opts, promptText, options) {
  opts = opts || {};
  options = options || {};
  const direct = options.field === 'new' ? String(opts.newPassword || '') : String(opts.password || '');
  if (direct) return { password: direct, source: 'option', error: '' };
  if (opts.passwordStdin) {
    const password = readPasswordFromStdin();
    if (!password) {
      return { password: '', source: 'stdin', error: '--password-stdin 没有读到内容；请通过管道传入主口令。' };
    }
    return { password: password, source: 'stdin', error: '' };
  }
  const envPass = String(process.env.YOTTA_MEMORY_PASS || '');
  if (envPass) return { password: envPass, source: 'env', error: '' };
  if (!process.stdin.isTTY) {
    return { password: '', source: 'non-tty', error: '当前为非交互环境，无法读取主口令。请使用 --password-stdin（推荐，管道传入）或设置 YOTTA_MEMORY_PASS；不要把口令直接写在命令行参数里。' };
  }
  const password = await promptPassword(promptText);
  if (!password) return { password: '', source: 'prompt', error: '已取消。' };
  return { password: password, source: 'prompt', error: '' };
}

function migrateCore(root, password, recoveryKeyIn) {
  // 第三个参数历史上是 recovery key；兼容旧调用，同时支持 { agent, recoveryKey } 选项对象。
  const opts = recoveryKeyIn && typeof recoveryKeyIn === 'object' ? recoveryKeyIn : {};
  if (!fs.existsSync(root)) return { error: true, text: '记忆库不存在，请先 yotta-memory init。' };
  if (isEncrypted(root)) return { error: true, text: '记忆库已启用加密（keys/ 存在），无需迁移。' };
  const salt = crypto.randomBytes(16);
  ensureKeysDir(root);
  fs.writeFileSync(encSaltPath(root), salt);
  const umk = deriveUmk(password, salt);
  const rk = crypto.randomBytes(32);
  fs.writeFileSync(encRecoveryEncPath(root), Buffer.concat([Buffer.from(KEY_MAGIC, 'utf8'), aesEncryptBytes(umk, rk, Buffer.from('recovery', 'utf8'))]));
  let moved = 0;
  const owners = collectOwners(root);
  const self = resolveIdentity(opts).id;
  for (const owner of owners) {
    const ok = wrapOwnerKey(root, umk, rk, owner);
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
  let tail = moved > 0
    ? ('已迁移 ' + moved + ' 个私密文件（' + owners.length + ' 个 owner）到密文。')
    : '私密区为空；已为明文库启用加密（未迁移文件、未创建 owner key）。';
  if (opts.recoveryKeyOut) {
    const outPath = path.resolve(String(opts.recoveryKeyOut));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, rk.toString('base64') + '\n', { encoding: 'utf8', mode: 0o600 });
    tail += '\n[恢复钥匙] 已写入文件: ' + outPath + '（务必离线保存，仅此一次，泄露=可解全部私密；不要把钥匙粘贴到对话中）';
  } else {
    tail += '\n[恢复钥匙]（务必离线保存，仅此一次，泄露=可解全部私密）: ' + rk.toString('base64');
  }
  tail += '\n迁移不会写明文 owner key cache。下一步为每个 agent 做一次授权，二选一（等价）：';
  tail += '\n  推荐：yotta-memory view → 浏览器解锁 → 授权 <id> → 保存一次性 agent_key';
  tail += '\n  高级：yotta-memory key bind <id>';
  tail += '\n授权后 AI 执行：yotta-memory key status <id> → yotta-memory key claim <id> → <AI_HOME>/.yotta-memory-agent-key';
  tail += '\n然后带 agent-key-file 重建加密索引：yotta-memory reindex --agent <id> --agent-key-file <AI_HOME>/.yotta-memory-agent-key';
  if (self && owners.indexOf(self) !== -1) tail += '\n你的身份：' + self + '。推荐直接在 yotta-memory view 页面授权它。';
  return { error: false, text: tail };
}

async function cmdMigrate(opts) {
  const root = userRoot();
  if (isEncrypted(root)) { console.error('记忆库已启用加密，无需迁移。'); process.exit(2); }
  let password = opts.password || process.env.YOTTA_MEMORY_PASS || '';
  if (!password) {
    const got = await resolvePasswordInput(opts, '主口令（迁移后私密区加密，勿忘；忘口令可用恢复钥匙重设）: ');
    if (got.error) { console.error(got.error); process.exit(2); }
    password = got.password;
  }
  const r = migrateCore(root, password, { agent: opts.agent, recoveryKey: null, recoveryKeyOut: opts.recoveryKeyOut });
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
    const got = await resolvePasswordInput(opts, '当前口令（或 --recovery-key 用恢复钥匙）: ');
    if (got.error) { console.error(got.error); process.exit(2); }
    cur = got.password;
  }
  if (!np) {
    const got = await resolvePasswordInput(opts, '新口令: ', { field: 'new' });
    if (got.error) { console.error(got.error); process.exit(2); }
    np = got.password;
    if (got.source === 'prompt') {
      const np2 = await promptPassword('再次输入确认: ') || '';
      if (np2 !== np) { console.error('两次输入不一致。'); process.exit(2); }
    }
  }
  const r = resetPasswordCore(root, { password: cur, recoveryKey: rk, newPassword: np });
  console.log(r.text);
  if (r.error) process.exit(2);
}

function keyBindCore(root, owner, opts) {
  opts = opts || {};
  if (!isSafeAgentId(owner)) return { error: true, text: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  if (!isEncrypted(root)) return { error: true, text: '记忆库未启用加密。' };
  const salt = loadSalt(root);
  if (!salt) return { error: true, text: '密钥库损坏（缺 keys/salt）。' };
  let ownerKey = null;
  if (opts.recoveryKey) {
    const rk = Buffer.from(String(opts.recoveryKey), 'base64');
    if (rk.length !== 32) return { error: true, text: '恢复钥匙须为 32 字节（base64）。' };
    try { ownerKey = unwrapOwnerKeyRecovery(root, owner, rk); } catch (e) { ownerKey = null; }
    if (!ownerKey) return { error: true, text: '恢复钥匙无法解开 ' + owner + ' 的 owner key。' };
  } else {
    const password = String(opts.password || '');
    if (!password) return { error: true, text: '请提供主口令（--password 或交互输入），或用 --recovery-key。' };
    const umk = deriveUmk(password, salt);
    try { ownerKey = unwrapOwnerKey(root, owner, umk); } catch (e) { ownerKey = null; }
    if (!ownerKey) {
      let rk = null;
      try { rk = unwrapRecoveryEnc(root, umk); } catch (e) { rk = null; }
      if (!rk) return { error: true, text: '口令错误，或该 owner 的密钥不存在。' };
      ownerKey = recoverOwnerKeyFromRecovery(root, owner, umk, rk);
      if (!ownerKey) {
        if (privateOwnerHasData(root, owner)) {
          return { error: true, text: '检测到 private/' + owner + ' 仍有密文，但 keys/' + owner + '.key.enc 与恢复文件均不可用；拒绝新建 owner key（会导致旧数据无法解密）。请从备份恢复原 owner key，或使用恢复钥匙修复后重试。' };
        }
        ownerKey = wrapOwnerKey(root, umk, rk, owner);
      }
    }
  }
  const agentKey = crypto.randomBytes(32);
  const pendingFile = writeAgentBindingWithPending(root, owner, ownerKey, agentKey);
  revokeOwnerKeyCache(root, owner);
  return {
    error: false,
    agentKey: agentKey.toString('base64'),
    pendingFile: pendingFile,
    text: '已绑定 ' + owner + ' 的 agent_key，并删除旧明文 cache。\nagent_key: ' + agentKey.toString('base64') + '\n待领取文件: ' + pendingFile + '\nAI 在新会话执行 yotta-memory key status ' + owner + '，有 pending 再执行 yotta-memory key claim ' + owner + '；用户请另外保存此 key；此 key 只显示一次。',
  };
}

function keyRevokeCore(root, owner) {
  if (!isSafeAgentId(owner)) return { error: true, text: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  let removed = false;
  const binding = encAgentBindingPath(root, owner);
  if (fs.existsSync(binding)) { fs.unlinkSync(binding); removed = true; }
  if (removePendingAgentKey(root, owner)) removed = true;
  if (revokeOwnerKeyCache(root, owner)) removed = true;
  if (!removed) return { error: false, text: owner + ' 无 agent binding（已是未绑定状态）。' };
  return { error: false, text: '已吊销 ' + owner + ' 的 agent_key binding；该 agent 将无法解密其私密。' };
}

function keyClaimCore(root, owner, opts) {
  if (!isSafeAgentId(owner)) return { error: true, text: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  const location = resolveAgentKeyLocation(owner, opts);
  if (!location.ok) return { error: true, text: location.error };
  const pending = encPendingPath(root, owner);
  if (!fs.existsSync(pending)) {
    return { error: true, text: '未找到待领取 agent_key：' + pending + '。请先在 yotta-memory view 中授权，或执行 yotta-memory key bind ' + owner + '。' };
  }
  let agentKey;
  try {
    agentKey = readPendingAgentKey(root, owner);
    if (!agentKey) throw new Error('pending agent_key 不存在');
    if (!unwrapAgentBinding(root, owner, agentKey)) {
      throw new Error('agent binding 不存在或已失效');
    }
  } catch (e) {
    return { error: true, text: 'agent_key 校验失败：' + e.message + '。未写入宿主目录，pending 文件保留。' };
  }
  let targetDir;
  let targetFile;
  let tempFile;
  try {
    targetFile = location.file;
    targetDir = path.dirname(targetFile);
    fs.mkdirSync(targetDir, { recursive: true });
    tempFile = path.join(targetDir, AGENT_KEY_FILENAME + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
    fs.writeFileSync(tempFile, agentKey.toString('base64') + '\n', { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(tempFile, 0o600); } catch (e) {}
    try {
      fs.renameSync(tempFile, targetFile);
    } catch (e) {
      fs.rmSync(targetFile, { force: true });
      fs.renameSync(tempFile, targetFile);
    }
    const readBack = fs.readFileSync(targetFile, 'utf8').trim();
    if (readBack !== agentKey.toString('base64')) throw new Error('宿主 key 文件回读不一致');
  } catch (e) {
    try { if (tempFile) fs.rmSync(tempFile, { force: true }); } catch (ignore) {}
    return { error: true, text: '写入宿主 key 文件失败：' + e.message + '。pending 文件保留，可重试。' };
  }
  removePendingAgentKey(root, owner);
  let identityFile = '';
  if (opts && opts.pluginData) {
    try {
      const dataDir = path.resolve(String(opts.pluginData));
      fs.mkdirSync(dataDir, { recursive: true });
      identityFile = path.join(dataDir, 'identity.json');
      const tempIdentity = identityFile + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
      fs.writeFileSync(tempIdentity, JSON.stringify({ agent_id: owner }, null, 2) + '\n', { encoding: 'utf8' });
      try { fs.renameSync(tempIdentity, identityFile); }
      catch (e) { fs.rmSync(identityFile, { force: true }); fs.renameSync(tempIdentity, identityFile); }
    } catch (e) {
      identityFile = '';
    }
  }
  const identityLine = identityFile ? '\n插件身份文件: ' + identityFile : '';
  return {
    error: false,
    targetFile: targetFile,
    identityFile: identityFile,
    source: location.source,
    text: '已领取 ' + owner + ' 的 agent_key。\n目标文件: ' + targetFile + identityLine + '\n发现规则: ' + location.source + '\npending 文件已删除。',
  };
}

function keyStatusCore(root, owner, opts) {
  if (!isSafeAgentId(owner)) return { error: true, text: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' };
  const location = resolveAgentKeyLocation(owner, opts);
  if (!location.ok) return { error: true, text: location.error };
  const binding = fs.existsSync(encAgentBindingPath(root, owner));
  const pending = fs.existsSync(encPendingPath(root, owner));
  let hostKey = 'missing';
  if (fs.existsSync(location.file)) {
    hostKey = 'invalid';
    try {
      const key = readAgentKeyFile(location.file);
      if (binding && unwrapAgentBinding(root, owner, key)) hostKey = 'valid';
    } catch (e) {}
  }
  return {
    error: false,
    binding: binding,
    pending: pending,
    hostKey: hostKey,
    targetFile: location.file,
    source: location.source,
    text: 'agent: ' + owner + '\nbinding: ' + (binding ? 'yes' : 'no') + '\npending: ' + (pending ? 'yes' : 'no') + '\nhost_key: ' + hostKey + '\nchecked: ' + location.file + '\ndiscovery: ' + location.source,
  };
}

function keyListCore(root) {
  root = root || userRoot();
  if (!isEncrypted(root)) return { text: '记忆库未启用加密。' };
  const owners = keyOwners(root);
  const bound = owners.filter(function (o) { return fs.existsSync(encAgentBindingPath(root, o)); });
  const pending = owners.filter(function (o) { return fs.existsSync(encPendingPath(root, o)); });
  const legacy = owners.filter(function (o) { return fs.existsSync(encCachePath(root, o)); });
  const lines = [
    'owner: ' + (owners.length ? owners.join(', ') : '（无）'),
    '已绑定 agent_key: ' + (bound.length ? bound.join(', ') : '（无）'),
    '待领取 agent_key: ' + (pending.length ? pending.join(', ') : '（无）'),
    'legacy 明文 cache: ' + (legacy.length ? legacy.join(', ') + '（升级后不再加载）' : '（无）'),
  ];
  return { text: lines.join('\n'), owners: owners, bound: bound, pending: pending, legacy: legacy };
}

function cmdKeyList() {
  const root = userRoot();
  const r = keyListCore(root);
  console.log(r.text);
  if (!r.owners) return;
  const reminder = migrationReminderText(root);
  if (reminder) console.log('\n' + reminder);
}

async function cmdKeyBind(id, opts) {
  const root = userRoot();
  if (!isEncrypted(root)) { console.error('记忆库未启用加密。'); process.exit(2); }
  if (!id) { console.error('请指定 <id>：yotta-memory key bind <id>'); process.exit(2); }
  let password = opts.password || process.env.YOTTA_MEMORY_PASS || '';
  if (!password && !opts.recoveryKey) {
    const got = await resolvePasswordInput(opts, '主口令: ');
    if (got.error) { console.error(got.error); process.exit(2); }
    password = got.password;
  }
  const r = keyBindCore(root, id, { password: password, recoveryKey: opts.recoveryKey });
  console.log(r.text);
  if (r.error) process.exit(2);
}

async function cmdKeyAuthorize(id, opts) {
  console.error('提示: key authorize 已由 key bind 替代，本次按 bind 执行。');
  return cmdKeyBind(id, opts);
}

function cmdKeyRevoke(id) {
  const root = userRoot();
  if (!id) { console.error('请指定 <id>：yotta-memory key revoke <id>'); process.exit(2); }
  const r = keyRevokeCore(root, id);
  console.log(r.text);
  if (r.error) process.exit(2);
}

function cmdKeyClaim(id, opts) {
  const root = userRoot();
  if (!id) { console.error('请指定 <id>：yotta-memory key claim <id> [--to <AI_HOME> | --plugin-data <PLUGIN_DATA> | --agent-key-file <文件>]'); process.exit(2); }
  const r = keyClaimCore(root, id, opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}

function cmdKeyStatus(id, opts) {
  const root = userRoot();
  if (!id) { console.error('请指定 <id>：yotta-memory key status <id> [--to <AI_HOME> | --plugin-data <PLUGIN_DATA> | --agent-key-file <文件>]'); process.exit(2); }
  const r = keyStatusCore(root, id, opts);
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
function viewHostName(req) {
  const raw = String(req.headers.host || '').trim();
  if (!raw) return '';
  try {
    return new URL('http://' + raw).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch (e) {
    return '';
  }
}
function viewHostAllowed(req, bindHost) {
  const name = viewHostName(req);
  if (!name) return false;
  const bind = String(bindHost || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (bind !== '127.0.0.1' && bind !== 'localhost' && bind !== '::1') return true;
  return name === '127.0.0.1' || name === 'localhost' || name === '::1';
}
function viewOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let originHost = '';
  try {
    originHost = new URL(String(origin)).host.toLowerCase();
  } catch (e) {
    return false;
  }
  const requestHost = String(req.headers.host || '').trim().toLowerCase();
  return !!requestHost && originHost === requestHost;
}
function viewServerCore(root, port, host, opts) {
  opts = opts || {};
  let session = { umk: null, ownerKeys: {} };
  const server = http.createServer(function (req, res) {
    if (!viewHostAllowed(req, host) || !viewOriginAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('forbidden');
      return;
    }
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname; } catch (e) {}
    function json(code, obj) {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
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
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(viewHtml());
      return;
    }
    if (req.method === 'POST' && pathname === '/api/status') {
      return json(200, { encrypted: isEncrypted(root), unlocked: !!session.umk, version: VERSION, rootId: memoryRootId(root) });
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
        if (!verified && owners.length === 0) {
          try { unwrapRecoveryEnc(root, umk); verified = true; } catch (e) {}
        }
        if (!verified) return json(401, { error: owners.length === 0 ? '口令错误；空加密库已用恢复钥匙校验失败。' : '口令错误。' });
        session = { umk: umk, ownerKeys: ownerKeys };
        json(200, {
          ok: true,
          owners: Object.keys(ownerKeys),
          hint: owners.length === 0 ? '当前没有 owner。请先在终端执行 yotta-memory iam <id>，再回到本页授权。' : '',
        });
      });
    }
    if (req.method === 'POST' && pathname === '/api/owners') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      const agents = loadAgents(root).agents || {};
      const owners = keyOwners(root);
      const all = Array.from(new Set(owners.concat(Object.keys(agents))));
      return json(200, {
        owners: all.map(function (o) { return { owner: o, registered: !!agents[o], authorized: fs.existsSync(encAgentBindingPath(root, o)) }; }),
        hint: all.length ? '' : '当前没有 owner。请先在终端执行 yotta-memory iam <id>，再回到本页授权。',
      });
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
        if (!isSafeAgentId(owner)) return json(400, { error: '非法 owner ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' });
        if (fs.existsSync(encAgentBindingPath(root, owner))) {
          return json(409, { error: '该智能体已有 agent binding。为避免打断在用的 agent_key，请先“吊销”，再重新授权生成新 key。' });
        }
        let ok = session.ownerKeys[owner];
        let rk = null;
        try { rk = unwrapRecoveryEnc(root, session.umk); } catch (e) { rk = null; }
        if (!ok) {
          if (!rk) return json(400, { error: '密钥库缺少恢复钥匙（recovery.key.enc），无法为新 owner 建钥。' });
          ok = recoverOwnerKeyFromRecovery(root, owner, session.umk, rk);
          if (!ok) {
            if (privateOwnerHasData(root, owner)) {
              return json(400, { error: '检测到 private/' + owner + ' 仍有密文，但 keys/' + owner + '.key.enc 与恢复文件均不可用；拒绝新建 owner key（会导致旧数据无法解密）。请从备份恢复原 owner key，或使用 CLI 恢复钥匙修复后重试。' });
            }
            ok = wrapOwnerKey(root, session.umk, rk, owner);
          }
          session.ownerKeys[owner] = ok;
        }
        const agentKey = crypto.randomBytes(32);
        const pendingFile = writeAgentBindingWithPending(root, owner, ok, agentKey);
        revokeOwnerKeyCache(root, owner);
        json(200, { ok: true, agentKey: agentKey.toString('base64'), pendingFile: pendingFile, text: 'agent_key 只显示一次，请用户自行保存；AI 可由 pending 文件领取并写入宿主目录。' });
      });
    }
    if (req.method === 'POST' && pathname === '/api/revoke') {
      if (!session.umk) return json(401, { error: '请先解锁。' });
      return readBody(function (d) {
        const owner = String(d.owner || '');
        if (!isSafeAgentId(owner)) return json(400, { error: '非法 owner ID：只允许单段名称，禁止 /、\\、.. 和控制字符。' });
        const binding = encAgentBindingPath(root, owner);
        if (fs.existsSync(binding)) fs.unlinkSync(binding);
        removePendingAgentKey(root, owner);
        revokeOwnerKeyCache(root, owner);
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
  server.on('error', function (e) {
    const message = 'yotta-memory view 启动失败: ' + (e && e.message ? e.message : String(e)) + '；请检查端口是否被占用，或使用 --port <其它端口>。';
    if (typeof opts.onError === 'function') {
      opts.onError(e, message);
      return;
    }
    console.error(message);
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

function probeViewPort(host, port) {
  return new Promise(function (resolve) {
    const socket = net.connect({ host: host, port: port });
    let done = false;
    function finish(state) {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (e) {}
      resolve(state);
    }
    socket.setTimeout(800, function () { finish('timeout'); });
    socket.once('connect', function () { finish('open'); });
    socket.once('error', function (e) { finish(e && e.code === 'ECONNREFUSED' ? 'closed' : 'error'); });
  });
}

function probeViewStatus(host, port) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({});
    const req = http.request({
      host: host,
      port: port,
      path: '/api/status',
      method: 'POST',
      timeout: 800,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.version || typeof parsed.unlocked !== 'boolean') {
            resolve({ detected: false });
            return;
          }
          resolve({
            detected: true,
            rootId: typeof parsed.rootId === 'string' ? parsed.rootId : '',
            version: String(parsed.version),
            unlocked: !!parsed.unlocked,
          });
        } catch (e) {
          resolve({ detected: false });
        }
      });
    });
    req.on('timeout', function () { req.destroy(); resolve({ detected: false }); });
    req.on('error', function () { resolve({ detected: false }); });
    req.end(body);
  });
}

async function cmdView(opts) {
  const root = userRoot();
  ensureInit(root);
  if (!isEncrypted(root)) {
    console.log('记忆库未启用加密（无 keys/）。yotta-memory view 是加密库的用户查看平台；请先 init --encrypt 或 migrate。');
    process.exit(2);
  }
  const host = opts.host || '127.0.0.1';
  const port = opts.port || 8788;
  const state = await probeViewPort(host, port);
  if (state === 'open') {
    const status = await probeViewStatus(host, port);
    if (status.detected && status.rootId === memoryRootId(root)) {
      console.log('检测到已在运行的 yotta-memory view: http://' + host + ':' + port + '（无需重复启动）');
      return;
    }
    if (status.detected) {
      const reason = status.rootId
        ? '该服务属于另一个 memory_home（rootId 不匹配）'
        : '该服务是旧版 view，未提供 memory_home 指纹（rootId）';
      console.error('检测到端口 ' + host + ':' + port + ' 上的 yotta-memory view 无法复用：' + reason + '。请关闭该进程，或使用 --port <其它端口>。');
      process.exit(2);
    }
    console.error('端口已被占用: ' + host + ':' + port + '。请关闭占用进程，或使用 --port <其它端口>。');
    process.exit(2);
  }
  viewServerCore(root, port, host, {
    onError: function (e, message) {
      console.error(message);
      process.exit(2);
    },
  });
}

function viewHtml() {
  return VIEW_HTML;
}

// ---- 命令包装（CLI 入口）----
async function cmdInit(opts) {
  const root = opts.dir ? path.resolve(String(opts.dir)) : (opts.project ? projectRoot() : userRoot());
  if (isExistingStore(root) && !opts.attach) {
    const blocked = initCore(Object.assign({}, opts));
    console.log(blocked.text);
    if (blocked.error) process.exit(2);
    return;
  }
  const fresh = !isExistingStore(root);
  const wantEncrypt = opts.encrypt || (!opts.noEncrypt && fresh);
  let o = Object.assign({}, opts);
  if (wantEncrypt && !o.password) {
    const got = await resolvePasswordInput(o, '主口令（启用加密，勿忘；忘口令可用恢复钥匙重设）: ');
    if (got.error) { console.error(got.error); process.exit(2); }
    if (got.source === 'prompt') {
      const pw2 = await promptPassword('再次输入确认: ');
      if (pw2 !== got.password) { console.error('两次输入不一致。'); process.exit(2); }
    }
    o.password = got.password;
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
function cmdForget(fileRef, opts) {
  const ident = resolveIdentity(opts);
  if (ident.error) {
    console.log(ident.error);
    process.exit(3);
  }
  const r = forgetCore(fileRef, {
    selfAgent: ident.id,
    unsafe: !!(opts && opts.unsafe),
  });
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdArchive(opts) {
  const r = archiveCore(opts);
  console.log(r.text);
}
function cmdBackupCreate(opts) {
  const r = backupCreateCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupVolumes(opts) {
  const r = listBackupVolumesCore(opts);
  if (opts.json) console.log(JSON.stringify({ root: userRoot(), volumes: r.volumes }, null, 2));
  else console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupSetup(opts) {
  const r = backupSetupCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupStatus(opts) {
  const r = backupStatusCore(opts);
  if (opts.json) console.log(JSON.stringify(r, null, 2));
  else console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupEnsureDaily(opts) {
  const r = backupEnsureDailyCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupSchedule(action, opts) {
  let r;
  if (action === 'enable') {
    const runtime = runtimeEnsureForManagedTask();
    if (runtime.error) {
      console.error('runtime 稳定入口未就绪，拒绝注册备份任务: ' + runtime.text);
      process.exit(1);
    }
    opts = Object.assign({}, opts, { scriptPath: runtimeManagedScript() });
    r = backupScheduleEnableCore(opts);
  }
  else if (action === 'disable') r = backupScheduleDisableCore(opts);
  else if (action === 'status') r = backupScheduleStatusCore(opts);
  else {
    console.error('backup schedule 子命令: enable [--time HH:MM] / disable / status');
    process.exit(2);
  }
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupList(opts) {
  const r = backupListCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupDoctor(opts) {
  const r = backupDoctorCore(opts);
  console.log(r.text);
  if (r.error || !r.ok) process.exit(2);
}
function cmdBackupRestore(id, opts) {
  const r = backupRestoreCore(id, opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdBackupDrill(id, opts) {
  const r = backupDrillCore(Object.assign({}, opts, { id: id || opts.id }));
  console.log(r.text);
  if (r.error) process.exit(2);
}
function cmdDoctor(opts) {
  const r = doctorCore(opts);
  if (opts.json) console.log(JSON.stringify(r, null, 2));
  else console.log(r.text);
  if (!r.ok) process.exit(2);
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
  for (const item of data.memories) {
    const meta = item.meta || {};
    const t = (meta.type || 'FACT').toUpperCase();
    if (!TYPE_DIRS[t]) continue;
    const owner = String(meta.owner || '');
    const scope = meta.scope || defaultScope(t);
    if (scope === 'private' && !isSafeAgentId(owner)) {
      return { error: true, text: '拒绝: 导入的私密条目 owner 非法（只允许单段名称，禁止 /、\\、.. 和控制字符）。' };
    }
  }
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
  if (!isSafeAgentId(agentId)) { console.error('非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。'); process.exit(2); }
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
  if (!isSafeAgentId(agentId)) { console.error('非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。'); process.exit(2); }
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
  if (!isSafeAgentId(agentId)) { console.error('非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。'); process.exit(2); }
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
  const profileIdentity = resolveIdentity({ agent: agentId, agentKey: opts.agentKey, agentKeyFile: opts.agentKeyFile });
  if (profileIdentity && !profileIdentity.error && profileIdentity.id) {
    setRuntimeAgent(profileIdentity.id, profileIdentity.agentKey);
  }
  let profile = '';
  let profileWarning = '';
  try {
    profile = writeSelfProfile(root, agentId, { mcpMode: 'stdio', name: opts.name, userName: opts.user, relationship: opts.relationship });
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    if (isEncrypted(root) && /授权密钥|加密/.test(message)) {
      profileWarning = '自我档案暂未写入：当前加密库还没有 ' + agentId + ' 的授权密钥。请先完成授权（yotta-memory view 或 yotta-memory key bind ' + agentId + '），再在已授权的会话中执行 yotta-memory iam ' + agentId + ' --force --agent-key-file <宿主key文件> 写入档案。';
    } else {
      throw e;
    }
  }
  console.log('已登记智能体身份: ' + agentId + '（host=' + host + '，' + (conflict ? '--force 覆盖' : '新建') + '）');
  if (opts.name || opts.user || opts.relationship) {
    console.log('自我档案扩展: ' + [opts.name && '显示名=' + opts.name, opts.user && '用户=' + opts.user, opts.relationship && '关系=' + opts.relationship].filter(Boolean).join(' / '));
  }
  if (profile) console.log('已写入自我档案: ' + profile);
  if (profileWarning) console.log(profileWarning);
  console.log('本机免 token：以后用 whoami 确认身份；远端接入需 token new --agent ' + agentId);
}
function cmdWhoami(opts) {
  const root = userRoot();
  const ident = resolveIdentity(opts);
  if (ident.error) {
    if (opts.json) console.log(JSON.stringify({ identity: identityDiagnostic(ident), error: ident.error }, null, 2));
    else console.log(ident.error);
    process.exit(2);
  }
  const id = ident.id;
  if (!id) {
    if (opts.json) {
      console.log(JSON.stringify({ identity: identityDiagnostic(ident), registration: 'none', profile: '' }, null, 2));
      return;
    }
    console.log('当前未声明显式智能体身份（身份不再从环境变量读取）。');
    console.log('CLI：请传 --agent <唯一ID>。stdio MCP：使用 --agent-id <唯一ID> + --agent-key-file <path>。HTTP MCP：发送 X-Agent-Id + X-Agent-Key。');
    console.log('远端：token + X-Agent-Id + X-Agent-Key（token new --agent <id>；agent_key 由 view 授权生成）。');
    return;
  }
  const agents = loadAgents(root).agents || {};
  const tokens = loadTokens(root).tokens || {};
  let reg = '未登记';
  if (agents[id]) reg = 'agents.json 已登记（host=' + agents[id].host + '）';
  else if (tokens[id]) reg = 'tokens.json 已登记（远端）';
  const profile = findSelfProfile(root, id);
  const kv = profile ? selfProfileKv(root, id) : {};
  if (opts.json) {
    console.log(JSON.stringify({
      identity: identityDiagnostic(ident),
      registration: reg,
      profile: profile || '',
      agentName: kv.agent_name || '',
      userName: kv.user_name || '',
      relationship: kv.relationship || '',
    }, null, 2));
    return;
  }
  console.log('当前智能体身份: ' + id);
  console.log('登记状态: ' + reg);
  console.log('自我档案: ' + (profile ? profile : '未写入（请执行 yotta-memory iam ' + id + '）'));
  if (profile) {
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
  const ident = resolveIdentity(opts);
  if (ident.error) return { error: true, exitCode: 3, text: ident.error };
  if (!ident.id) {
    return {
      error: true,
      exitCode: 3,
      text: '生成私密画像必须先声明身份：CLI 传 --agent <id>；stdio MCP 传 --agent-id <id> + --agent-key-file <path>；HTTP MCP 发送 X-Agent-Id + X-Agent-Key。',
    };
  }
  const selfAgent = ident.id;
  const owner = opts.owner || selfAgent;
  const keyError = validatePrivateIdentity(root, ident, owner);
  if (keyError) return { error: true, exitCode: 3, text: keyError };
  if (!owner) return { error: true, exitCode: 2, text: '请先声明身份（--agent / --agent-id）或传 --owner <id>，再生成画像。' };
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
// v0.14.0：长期摘要优先 / 近期走廊 / 会话闭环上下文编排。
// 摘要只认 consolidate 产物，不新增第二套摘要格式。
function isConsolidatedSummary(entry) {
  if (!entry) return false;
  if (entry.source === 'consolidate') return true;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  return tags.indexOf('consolidate') !== -1 && tags.indexOf('summary') !== -1;
}
function contextRecentKey(entry) {
  return String((entry && (entry.updated || entry.created)) || '');
}
function compareContextRecent(a, b) {
  const byTime = contextRecentKey(b).localeCompare(contextRecentKey(a));
  if (byTime !== 0) return byTime;
  return (b.access_count || 0) - (a.access_count || 0);
}
function contextCore(opts) {
  opts = opts || {};
  const roots = memoryRoots();
  if (!roots.length) return { error: false, exitCode: 0, text: '记忆库不存在，请先运行: yotta-memory init' };
  const root = userRoot();
  const limit = parseInt(opts.limit || '10', 10) || 10;
  const ident = resolveIdentity(opts);
  if (ident.error) return { error: true, exitCode: 3, text: ident.error };
  if (!ident.id) {
    return {
      error: true,
      exitCode: 3,
      text: '开工上下文包含私密画像 / 边界 / 承诺，必须先声明身份：CLI 传 --agent <id>；stdio MCP 传 --agent-id <id> + --agent-key-file <path>；HTTP MCP 发送 X-Agent-Id + X-Agent-Key。',
    };
  }
  const selfAgent = ident.id;
  const owner = opts.owner || selfAgent;
  const keyError = validatePrivateIdentity(root, ident, owner);
  if (keyError) return { error: true, exitCode: 3, text: keyError };
  const unsafe = !!opts.unsafe;
  const budget = opts.budget ? parseInt(opts.budget, 10) : 0;
  const focus = opts.focus ? String(opts.focus) : '';
  const explain = !!opts.explain;
  const embeddingCommand = effectiveEmbeddingCommand(opts);
  const embeddingTimeout = effectiveEmbeddingTimeout(opts);
  const trace = [];
  const lines = [];
  const shownFiles = new Set();
  const FENCE = String.fromCharCode(96, 96, 96);
  function usedChars() { return lines.reduce(function (s, x) { return s + String(x).length + 1; }, 0); }
  function appendContextEntry(entry, reason, options) {
    options = options || {};
    if (!entry) return false;
    if (shownFiles.has(entry.file)) {
      trace.push('[dropped] ' + entry.file + ' reason: duplicate');
      return false;
    }
    const line = '- [' + entry.type + '] ' + entry.subject + ': ' + entry.statement;
    if (options.budget !== false && budget > 0 && usedChars() + line.length > budget) {
      trace.push('[dropped] ' + entry.file + ' reason: budget_exceeded');
      return false;
    }
    lines.push(line);
    shownFiles.add(entry.file);
    trace.push('[included] ' + entry.file + ' reason: ' + reason);
    return true;
  }
  lines.push('# 开工上下文包（yotta-memory context）');
  lines.push('');
  lines.push('## 1. 身份');
  lines.push('');
  if (!owner) {
    lines.push('- 未声明智能体身份（无 --agent / --agent-id / X-Agent-Id）。私密记忆与画像不可用；请先 whoami / iam。');
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

  const readableEntries = [];
  for (const r of roots) {
    for (const e of ensureIndex(r)) {
      if (classifyRead(e, owner, '', unsafe, selfAgent) === 'denied') continue;
      readableEntries.push(e);
    }
  }

  lines.push('## 2.5 长期理解摘要');
  lines.push('');
  const summaries = readableEntries.filter(isConsolidatedSummary).sort(compareContextRecent);
  const summaryLimit = Math.min(3, Math.max(0, limit));
  if (!summaries.length) lines.push('（暂无周期摘要；可用 yotta-memory consolidate --apply 生成）');
  for (const e of summaries.slice(0, summaryLimit)) {
    appendContextEntry(e, 'summary_priority', { budget: false });
  }
  lines.push('');

  if (focus) {
    lines.push('## 2.6 任务相关记忆（--focus）');
    lines.push('');
    const focused = recallCore(focus, {
      limit: limit,
      owner: owner,
      unsafe: unsafe,
      selfAgent: selfAgent,
      embedding: embeddingCommand,
      embeddingTimeout: embeddingTimeout
    });
    const focusedEntries = focused.entries || [];
    if (!focusedEntries.length) lines.push('（无匹配记忆）');
    for (const e of focusedEntries) {
      appendContextEntry(e, 'focus_match score: ' + round3(e.score));
    }
    lines.push('');
  }

  lines.push('## 3. 近期走廊（按时间）');
  lines.push('');
  const corridor = readableEntries
    .filter(function (e) { return !isConsolidatedSummary(e) && e.type !== 'BOUND' && e.type !== 'COMMIT'; })
    .sort(compareContextRecent)
    .filter(function (e) { return !shownFiles.has(e.file); })
    .slice(0, limit);
  if (!corridor.length) lines.push('（暂无近期记忆）');
  for (const e of corridor) appendContextEntry(e, 'recent_corridor');
  lines.push('');

  lines.push('## 4. 近期高价值记忆（补位）');
  lines.push('');
  const highValue = readableEntries
    .filter(function (e) { return !isConsolidatedSummary(e) && e.type !== 'BOUND' && e.type !== 'COMMIT' && !shownFiles.has(e.file); })
    .map(function (e) { return { e: e, s: 0.5 * importanceScore(e) + 0.5 * utilityScore(e) }; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, limit);
  if (!highValue.length) lines.push('（暂无补位条目）');
  for (const h of highValue) appendContextEntry(h.e, 'high_value_backfill');
  lines.push('');
  lines.push('## 5. 边界提醒（BOUND）');
  lines.push('');
  const bounds = readableEntries.filter(function (e) { return e.type === 'BOUND'; }).sort(compareContextRecent);
  if (!bounds.length) lines.push('（无）');
  for (const e of bounds) lines.push('- ' + (e.subject || '边界') + ': ' + e.statement);
  lines.push('');
  lines.push('## 6. 承诺 / 锚点（COMMIT）');
  lines.push('');
  const commits = readableEntries.filter(function (e) { return e.type === 'COMMIT'; }).sort(compareContextRecent);
  if (!commits.length) lines.push('（无）');
  for (const e of commits) lines.push('- ' + (e.subject || '承诺') + ': ' + e.statement);
  lines.push('');
  lines.push('## 7. 本会话闭环契约');
  lines.push('');
  lines.push('- 开工：本上下文包已加载；身份、长期摘要、边界与承诺以本包为准。');
  lines.push('- 进行中：出现事实 / 偏好 / 边界 / 纠正 / 承诺信号时立即 `remember <type> <subject> <statement> --verify`，不攒到收工。');
  lines.push('- 收工前复盘：检查本轮是否留下 COMMIT / 会话小结；有关键结论但未落盘时补写并 `recall` 回读，无长期价值不硬凑。');
  lines.push('');
  const allEntries = readableEntries;
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
  if (explain) {
    lines.push('');
    lines.push('## 8. 选择解释（--explain）');
    lines.push('');
    if (!trace.length) lines.push('（无选择记录）');
    for (const t of trace) lines.push(t);
  }
  const reliability = doctorCore({ root: root });
  if (reliability.level !== 'ok') {
    lines.push('');
    lines.push('## 可靠性提醒');
    lines.push('');
    for (const message of reliability.critical) lines.push('- [严重] ' + message);
    for (const message of reliability.warnings) lines.push('- [警告] ' + message);
    if (!reliability.ok) lines.push('- 破坏性写入已锁定：先运行 yotta-memory doctor 修复严重问题。');
  }
  return { error: false, exitCode: 0, text: lines.join('\n') };
}
function cmdContext(opts) {
  const r = contextCore(opts);
  console.log(r.text);
  if (r.error) {
    const reminder = migrationReminderText(userRoot());
    if (reminder) console.log('\n' + reminder);
  }
  if (r.exitCode) process.exit(r.exitCode);
}

// ---- config 命令 ----
// v0.10.0：maintain_* / consolidate_* 数值键纳入 config set/get（此前只支持 3 个键但文档已写可调）
function isNumericConfigKey(key) { return /^(maintain_|consolidate_|backup_max_age_hours$)/.test(key); }
function cmdConfigSet(key, value) {
  const known = ['memory_home', 'embedding_cmd', 'embedding_timeout', 'backup_dir', 'backup_enabled', 'backup_schedule', 'backup_time', 'backup_max_age_hours', 'backup_setup_choice', 'maintain_archived_utility', 'maintain_archived_age', 'maintain_forget_utility', 'maintain_forget_age', 'maintain_decay_halflife_FACT', 'maintain_decay_halflife_PREF', 'maintain_decay_halflife_COMMIT', 'consolidate_min_age', 'consolidate_min_idle', 'consolidate_max_utility', 'consolidate_min_group', 'consolidate_period'];
  if (known.indexOf(key) === -1) { console.error('未知配置项: ' + key + '（可用: memory_home / backup_dir / embedding_cmd / embedding_timeout / maintain_* / consolidate_*）'); process.exit(2); }
  if (value === undefined || value === null || value === '') { console.error('缺少值: config set ' + key + ' <值>'); process.exit(2); }
  const cfg = loadConfig();
  if (key === 'memory_home') cfg.memory_home = value;
  else if (key === 'backup_dir') cfg.backup_dir = value;
  else if (key === 'backup_enabled') cfg.backup_enabled = value !== 'false' && value !== '0';
  else if (key === 'backup_schedule' || key === 'backup_time' || key === 'backup_setup_choice') cfg[key] = value;
  else if (key === 'embedding_cmd') cfg.embedding_cmd = value;
  else if (key === 'embedding_timeout') cfg.embedding_timeout = parseInt(value, 10) || 3000;
  else if (isNumericConfigKey(key)) {
    const n = parseFloat(value);
    if (!(n >= 0)) { console.error('配置项 ' + key + ' 需要非负数值'); process.exit(2); }
    cfg[key] = n;
  }
  saveConfig(cfg);
  console.log('已写入配置: ' + key + ' = ' + (key === 'memory_home' || key === 'backup_dir' || key === 'embedding_cmd' ? value : cfg[key]));
}
function cmdConfigGet(opts) {
  const cfg = loadConfig();
  if (opts && opts.json) {
    console.log(JSON.stringify(Object.assign({}, cfg, {
      effective_memory_home: userRoot(),
      identity: identityDiagnostic(resolveIdentity(opts)),
    }), null, 2));
    return;
  }
  console.log('memory_home: ' + (cfg.memory_home || '(未设置，默认 ~/.yottamemory)'));
  console.log('backup_dir: ' + (cfg.backup_dir || '(未设置)'));
  console.log('backup_enabled: ' + (cfg.backup_enabled === undefined ? '(未设置)' : cfg.backup_enabled));
  console.log('backup_schedule: ' + (cfg.backup_schedule || '(未设置)'));
  console.log('backup_time: ' + (cfg.backup_time || '(未设置)'));
  console.log('embedding_cmd: ' + (cfg.embedding_cmd || '(未设置)'));
  console.log('embedding_timeout: ' + (cfg.embedding_timeout || 3000));
  const keys = ['memory_home', 'backup_dir', 'backup_enabled', 'backup_schedule', 'backup_time', 'backup_max_age_hours', 'backup_setup_choice', 'embedding_cmd', 'embedding_timeout', 'maintain_archived_utility', 'maintain_archived_age', 'maintain_forget_utility', 'maintain_forget_age', 'maintain_decay_halflife_FACT', 'maintain_decay_halflife_PREF', 'maintain_decay_halflife_COMMIT', 'consolidate_min_age', 'consolidate_min_idle', 'consolidate_max_utility', 'consolidate_min_group', 'consolidate_period'];
  for (const k of keys) {
    if (k === 'memory_home' || k === 'backup_dir' || k === 'backup_enabled' || k === 'backup_schedule' || k === 'backup_time' || k === 'embedding_cmd' || k === 'embedding_timeout') continue;
    if (cfg[k] !== undefined) console.log(k + ': ' + cfg[k]);
  }
  console.log('当前生效用户级位置: ' + userRoot());
  if (cfg.serve && Object.keys(cfg.serve).length) console.log('serve: ' + JSON.stringify(cfg.serve));
}

// ---- MCP serve（局域网 streamable HTTP 记忆引擎，零依赖）----
const MCP_CORE_TOOL_NAMES = ['context', 'recall', 'search', 'remember'];
function normalizeMcpToolProfile(profile) {
  return String(profile || 'full').trim().toLowerCase() === 'core' ? 'core' : 'full';
}
function mcpTools(profile) {
  const tools = [
    { name: 'remember', description: '写入一条记忆。参数 type(FACT/PREF/BOUND/COMMIT)、subject、statement 必填；owner 可选，默认当前智能体', inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'FACT/PREF/BOUND/COMMIT' }, subject: { type: 'string' }, statement: { type: 'string' }, owner: { type: 'string' } }, required: ['type', 'subject', 'statement'] } },
    { name: 'recall', description: '检索记忆。query 可选；type 可选；limit 可选（默认 20）；explain 可选。只返回当前智能体可读记忆；embedding 插件只能由本机 config 配置，远端不可传命令', inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' }, embeddingTimeout: { type: 'number' }, explain: { type: 'boolean' } } } },
    { name: 'search', description: '检索记忆（同 recall）。query 可选；type 可选；limit 可选（默认 20）；explain 可选；embedding 插件只能由本机 config 配置，远端不可传命令', inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' }, embeddingTimeout: { type: 'number' }, explain: { type: 'boolean' } } } },
    { name: 'context', description: '生成开工上下文包。focus 可选；limit 可选；budget 可选；explain 可选；embedding 插件只能由本机 config 配置，远端不可传命令', inputSchema: { type: 'object', properties: { focus: { type: 'string' }, limit: { type: 'number' }, budget: { type: 'number' }, explain: { type: 'boolean' }, embeddingTimeout: { type: 'number' } } } },
    { name: 'doctor', description: '开工可靠性检查：检查记忆库根目录、密钥库、索引、身份登记与最近备份；只读，不会修改记忆', inputSchema: { type: 'object', properties: {} } },
    { name: 'forget', description: '删除一条记忆。file 为记忆文件路径（如 facts/2026-08-24-0001.md 或文件名）', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
    { name: 'archive', description: '归档旧记忆。days 默认 180；threshold 默认 0.4', inputSchema: { type: 'object', properties: { days: { type: 'number' }, threshold: { type: 'number' } } } },
    { name: 'reindex', description: '重建索引（手动改 .md 后校正；扫描 facts/prefs/bounds/commits 四目录）', inputSchema: { type: 'object', properties: {} } },
    { name: 'export', description: '导出全部记忆到记忆库内的 JSON 文件。out 可选（默认 <记忆库>/yottamemory-export-<日期>.json；仅限记忆库内路径）', inputSchema: { type: 'object', properties: { out: { type: 'string' } } } },
    { name: 'import', description: '从记忆库内的 JSON 文件导入记忆。src 为文件路径（相对记忆库目录，或记忆库内绝对路径；仅限记忆库内）', inputSchema: { type: 'object', properties: { src: { type: 'string' } }, required: ['src'] } },
    { name: 'agent_info', description: '查看当前智能体身份与登记状态（HTTP 读经 token 校验的 X-Agent-Id；stdio 读 --agent-id 显式参数）。开工先确认「我是谁」，禁止从记忆里抄别人的 ID', inputSchema: { type: 'object', properties: {} } },
    { name: 'profile', description: '生成当前智能体的用户画像（只读聚合 private/<owner>/ 下 PREF/BOUND/COMMIT 原文，零推断，写入 private/<owner>/profile.md）。owner 默认当前智能体', inputSchema: { type: 'object', properties: { owner: { type: 'string' } } } },
    { name: 'feedback', description: '显式使用反馈（自我学习）：useful/useless 调整记忆 weight/confidence/feedback_net。file 为记忆文件路径或文件名', inputSchema: { type: 'object', properties: { file: { type: 'string' }, useful: { type: 'boolean' }, useless: { type: 'boolean' }, reason: { type: 'string' } }, required: ['file'] } },
    { name: 'maintain', description: '记忆自组织（自我进化）：规则层归档/遗忘/去重预览。默认 dry-run；apply 才执行，purge 才真删', inputSchema: { type: 'object', properties: { apply: { type: 'boolean' }, purge: { type: 'boolean' }, dedup: { type: 'boolean' }, threshold: { type: 'number' }, age: { type: 'number' } } } },
    { name: 'distill', description: '心理日志蒸馏（自我提升）：统计摘要/主题画像/知识地图。owner 默认当前智能体（MCP 不支持 --model 外部命令）', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, subject: { type: 'string' } } } },
    { name: 'explain', description: '解释单条记忆效用分项（为什么靠前/归档/遗忘）。file 为记忆文件路径或文件名', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
  ];
  if (normalizeMcpToolProfile(profile) !== 'core') return tools;
  return MCP_CORE_TOOL_NAMES
    .map((name) => tools.find((tool) => tool.name === name))
    .filter(Boolean);
}
function callTool(name, args, ctx) {
  return runWithIdentity({
    id: ctx && ctx.agent,
    agentKey: ctx && ctx.agentKey,
  }, function () {
    return callToolInner(name, args, ctx);
  });
}
function callToolInner(name, args, ctx) {
  const agent = (ctx && ctx.agent) || '';
  const toolProfile = normalizeMcpToolProfile(ctx && ctx.toolProfile);
  if (toolProfile === 'core' && MCP_CORE_TOOL_NAMES.indexOf(name) === -1) {
    return { text: '工具 ' + name + ' 属于 full 分组，当前 MCP 以 core 模式启动。需要完整工具集时请使用 --tools full 重新启动。', error: true };
  }
  if (agent && !isSafeAgentId(agent)) return { text: '非法 agent ID：只允许单段名称，禁止 /、\\、.. 和控制字符。', error: true };
  try {
    if (name === 'remember') {
      const ownerArg = args.owner ? String(args.owner) : '';
      if (ownerArg && ownerArg !== agent) return { text: '拒绝: MCP 写入的 owner 必须等于当前智能体身份（' + agent + '），不能写其它智能体私密区。', error: true };
      const r = rememberCore(String(args.type || ''), String(args.subject || ''), String(args.statement || ''), { owner: agent, selfAgent: agent });
      return { text: r.text, error: r.error };
    }
    if (name === 'recall' || name === 'search') {
      const r = recallCore(args.query ? String(args.query) : null, {
        limit: args.limit || 20,
        type: args.type ? String(args.type) : null,
        agent: agent,
        embeddingTimeout: args.embeddingTimeout || 3000,
        explain: !!args.explain
      });
      return { text: r.text, error: r.error };
    }
    if (name === 'context') {
      const r = contextCore({
        focus: args.focus ? String(args.focus) : '',
        limit: args.limit || 10,
        budget: args.budget || 0,
        explain: !!args.explain,
        embeddingTimeout: args.embeddingTimeout || 3000,
        selfAgent: agent
      });
      return { text: r.text, error: r.error };
    }
    if (name === 'doctor') {
      const r = doctorCore({ selfAgent: agent });
      return { text: r.text, error: !r.ok };
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
      const root = userRoot();
      let out = null;
      if (args.out) {
        const safe = resolveWithinRoot(root, String(args.out));
        if (!safe) return { text: '拒绝: MCP 导出路径必须位于记忆库内（' + root + '），已阻止任意路径写入。', error: true };
        out = safe;
      }
      const r = exportCore(root, out);
      return { text: r.text, error: r.error };
    }
    if (name === 'import') {
      const root = userRoot();
      const src = String(args.src || '');
      const safe = resolveWithinRoot(root, src);
      if (!safe) return { text: '拒绝: MCP 导入路径必须位于记忆库内（' + root + '），已阻止任意路径读取。', error: true };
      const r = importCore(root, safe);
      return { text: r.text, error: r.error };
    }
    if (name === 'agent_info') {
      const root = userRoot();
      const id = agent || '';
      if (!id) return { text: '当前未声明智能体身份（无 X-Agent-Id / --agent-id）。stdio 请使用 --agent-id <唯一ID> + --agent-key-file <path>；HTTP 请发送 X-Agent-Id + X-Agent-Key。', error: false };
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
      if (args.model) return { text: '拒绝: MCP 不支持 --model（任意命令执行风险）；请在引擎主机本地 CLI 执行 yotta-memory distill --model <命令>。', error: true };
      const r = distillCore({ selfAgent: agent, owner: args.owner ? String(args.owner) : agent, subject: args.subject ? String(args.subject) : '', model: '' });
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
function reqVersion(params) {
  const meta = (params && params._meta) || {};
  return meta['io.modelcontextprotocol/protocolVersion'] || null;
}
function mcpIdentityMode(ctx) {
  const mode = String((ctx && ctx.identityMode) || '').trim().toLowerCase();
  if (mode === 'headers' || mode === 'stdio-args') return mode;
  if (ctx && ctx.agent) return 'stdio-args';
  return 'unknown';
}
function mcpServerInfo(ctx) {
  return {
    name: 'yotta-memory',
    version: VERSION,
    runtimePath: runtimeExecutionPath(),
    identityMode: mcpIdentityMode(ctx),
    toolProfile: normalizeMcpToolProfile(ctx && ctx.toolProfile),
  };
}
function modernOk(payload, ttl, ctx) {
  const out = { resultType: 'complete' };
  Object.assign(out, payload);
  if (ttl) { out.ttlMs = ttl[0]; out.cacheScope = ttl[1]; }
  out._meta = { 'io.modelcontextprotocol/serverInfo': mcpServerInfo(ctx) };
  return out;
}
function unsupportedVersion(id, pv) {
  return { jsonrpc: '2.0', id: id, error: { code: -32022, message: 'Unsupported protocol version', data: { supported: [MCP_PROTOCOL_MODERN], requested: pv } } };
}
function handleMessage(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: msg && msg.id, error: { code: -32600, message: 'invalid request' } };
  const id = msg.id;
  if (id === undefined || id === null) return null;
  const method = msg.method || '';
  const params = msg.params || {};
  const pv = reqVersion(params);
  if (pv !== null) {
    // ---- modern（2026-07-28 无状态）----
    if (pv !== MCP_PROTOCOL_MODERN) return unsupportedVersion(id, pv);
    const toolProfile = normalizeMcpToolProfile(ctx && ctx.toolProfile);
    if (method === 'server/discover') {
      return { jsonrpc: '2.0', id: id, result: modernOk({
        supportedVersions: [MCP_PROTOCOL_MODERN],
        capabilities: { tools: {} },
        instructions: '元忆 MCP（基于 MCP 最新协议 2026-07-28，向后兼容 2025-11-25 及更早握手）：当前工具分组 ' + toolProfile + '；文件式智能体记忆 remember/recall/search/context/forget/archive/maintain 等读写检索与维护；私密按 owner 物理隔离，数据不出本机。'
      }, [3600000, 'public'], ctx) };
    }
    if (method === 'tools/list') return { jsonrpc: '2.0', id: id, result: modernOk({ tools: mcpTools(toolProfile) }, [300000, 'public'], ctx) };
    if (method === 'tools/call') {
      const out = callTool(params.name || '', params.arguments || {}, ctx);
      return { jsonrpc: '2.0', id: id, result: modernOk({ content: [{ type: 'text', text: out.text }], isError: !!out.error }, null, ctx) };
    }
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id: id, error: { code: -32601, message: "initialize removed in MCP 2026-07-28; use server/discover. supported: ['2026-07-28']" } };
    }
    return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } };
  }
  // ---- legacy（<=2025-11-25，initialize 握手；响应保持旧形状）----
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id: id, result: { protocolVersion: MCP_PROTOCOL_LEGACY, capabilities: { tools: {} }, serverInfo: mcpServerInfo(ctx) } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id: id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id: id, result: { tools: mcpTools(ctx && ctx.toolProfile) } };
  if (method === 'tools/call') {
    const out = callTool(params.name || '', params.arguments || {}, ctx);
    return { jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: out.text }], isError: !!out.error } };
  }
  return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } };
}
function cmdServe(opts) {
  if (opts.stdio) { cmdServeStdio(opts); return; }
  const legacyEnvError = legacyIdentityEnvError();
  if (legacyEnvError) {
    console.error(legacyEnvError);
    process.exit(2);
  }
  if (opts.agent || opts.agentId) {
    console.error('HTTP MCP 不接受 --agent/--agent-id 启动参数：身份只从请求头 Authorization + X-Agent-Id + X-Agent-Key 读取。');
    process.exit(2);
  }
  const host = opts.host || '0.0.0.0';
  const port = opts.port || 8787;
  const noAuth = !!opts.noAuth;
  const root = userRoot();
  ensureInit(root);
  function authorize(req) {
    const agentId = String(req.headers['x-agent-id'] || '').trim();
    const agentKey = String(req.headers['x-agent-key'] || '').trim();
    const toolProfile = normalizeMcpToolProfile(opts.toolProfile);
    if (noAuth) return { agent: agentId, agentKey: agentKey, toolProfile: toolProfile, identityMode: 'headers' };
    if (!agentId || !agentKey) return null;
    const auth = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return null;
    const token = m[1].trim();
    const agent = agentId;
    const tokenMap = (loadTokens(root).tokens) || {};
    if (tokenMap[agent] && tokenMap[agent].token === token) return { agent: agent, agentKey: agentKey, toolProfile: toolProfile, identityMode: 'headers' };
    return null;
  }
  function originAllowed(req) {
    const origin = req.headers['origin'];
    if (!origin) return true;
    let oHost = '';
    try { oHost = new URL(origin).host; } catch (e) { return false; }
    const hHost = req.headers['host'] || '';
    const allowed = [hHost, 'localhost', 'localhost:' + port, '127.0.0.1', '127.0.0.1:' + port, '[::1]', '[::1]:' + port];
    return oHost === hHost || allowed.indexOf(oHost) !== -1;
  }
  function sendJson(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }
  const server = http.createServer(function (req, res) {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname; } catch (e) {}
    if (pathname !== '/mcp') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    if (!originAllowed(req)) {
      sendJson(res, 403, { jsonrpc: '2.0', error: { code: -32000, message: 'origin not allowed' } });
      return;
    }
    const auth = authorize(req);
    if (!auth) {
      sendJson(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized: 需要有效 Bearer token 与 X-Agent-Id；加密私密操作还需 X-Agent-Key' } });
      return;
    }
    if (req.method === 'GET') {
      // deprecated 兼容：HTTP+SSE 端点（MCP 2026-07-28 起正式 Deprecated，12 个月窗口内保留给老客户端；新客户端走 POST）
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
          sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'parse error' } });
          return;
        }
        const metaPv = reqVersion(msg.params) || null;
        const hdrPv = req.headers['mcp-protocol-version'] || null;
        if (hdrPv && metaPv && hdrPv !== metaPv) {
          sendJson(res, 400, { jsonrpc: '2.0', id: msg.id, error: { code: -32020, message: 'HeaderMismatch: MCP-Protocol-Version header/body 不一致', data: { header: hdrPv, body: metaPv } } });
          return;
        }
        const mcpMethod = req.headers['mcp-method'];
        if (mcpMethod && metaPv === MCP_PROTOCOL_MODERN && mcpMethod !== msg.method) {
          sendJson(res, 400, { jsonrpc: '2.0', id: msg.id, error: { code: -32020, message: 'HeaderMismatch: Mcp-Method header/body 不一致', data: { header: mcpMethod, body: msg.method } } });
          return;
        }
        const resp = handleMessage(msg, auth);
        if (resp === null) { res.writeHead(204); res.end(); return; }
        sendJson(res, 200, resp);
      });
      return;
    }
    res.writeHead(405, { 'Content-Type': 'text/plain' }); res.end('method not allowed');
  });
  server.listen(port, host, function () {
    console.log('yotta-memory 记忆引擎已启动（v' + VERSION + '）');
    console.log('URL: http://' + host + ':' + port + '/mcp');
    console.log('记忆库: ' + root);
    console.log('MCP 协议: 2026-07-28（modern，server/discover）/ 2025-11-25（legacy 握手兼容）');
    console.log('工具分组: ' + normalizeMcpToolProfile(opts.toolProfile));
    if (noAuth) console.log('鉴权: 已关闭（--no-auth，仅限可信内网）');
    else console.log('鉴权: Bearer token + X-Agent-Id + X-Agent-Key（token 由 token new 生成，agent_key 由 view 授权生成）');
    console.log('按 Ctrl+C 停止');
    startBackupFallback();
  });
}
// ---- stdio 本地零进程模式（客户端按需拉起 CLI）----
function cmdServeStdio(opts) {
  const legacyEnvError = legacyIdentityEnvError();
  if (legacyEnvError) {
    console.error(legacyEnvError);
    process.exit(2);
  }
  if (opts.agent) {
    console.error('stdio MCP 不接受 --agent：请使用显式参数 --agent-id <id> + --agent-key-file <path>。');
    process.exit(2);
  }
  if (opts.agentKey) {
    console.error('stdio MCP 不接受 --agent-key：命令行会暴露 key；请使用 --agent-key-file <path>。');
    process.exit(2);
  }
  const ident = resolveIdentity(opts);
  if (ident.error) {
    console.error(ident.error);
    process.exit(2);
  }
  const root = userRoot();
  ensureInit(root);
  const ctx = {
    agent: ident.id,
    agentKey: ident.agentKey,
    toolProfile: normalizeMcpToolProfile(opts && opts.toolProfile),
    identityMode: 'stdio-args',
  };
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
  return q(process.execPath) + ' ' + q(runtimeManagedScript()) + ' serve --host ' + host + ' --port ' + port;
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
    + q(process.execPath) + ' ' + q(runtimeManagedScript()) + ' serve --host ' + host + ' --port ' + port + ' >> ' + q(lanLogPath(opts)) + ' 2>&1\r\n';
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
  return [systemdEscapeArg(process.execPath), systemdEscapeArg(runtimeManagedScript())].concat(lanServeArgs(opts)).join(' ');
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
  const parts = ['@reboot', shQuote(process.execPath), shQuote(runtimeManagedScript())].concat(lanServeArgs(opts));
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
  const runtime = runtimeEnsureForManagedTask();
  if (runtime.error) {
    console.error('runtime 稳定入口未就绪，拒绝注册开机自启: ' + runtime.text);
    process.exit(1);
  }
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

// ================= v0.10.0 压缩遗忘：分类型衰减 / consolidate 周期摘要 / 自动合并 / 批次回滚 =================
var decayConfigCache = null;

function decayConfig() {
  if (decayConfigCache) return decayConfigCache;
  try { decayConfigCache = loadConfig() || {}; } catch (e) { decayConfigCache = {}; }
  return decayConfigCache;
}

// 分类型衰减半衰期（天）：FACT 慢 / PREF 中 / COMMIT（任务类）快；BOUND 固定不衰减
function decayHalflifeDays(type, cfg) {
  cfg = cfg || {};
  const t = String(type || 'FACT').toUpperCase();
  if (t === 'BOUND') return null;
  const d = parseFloat(cfg['maintain_decay_halflife_' + t]);
  if (d > 0) return d;
  return ({ FACT: 730, PREF: 365, COMMIT: 90 })[t] || 365;
}

// 指数半衰时效：recency = 0.5^(d / halfLife)；BOUND 恒 1.0（不衰减）
function decayRecency(type, ageDays, cfg) {
  const hl = decayHalflifeDays(type, cfg);
  if (hl === null) return 1;
  if (!(ageDays > 0)) return 1;
  return Math.pow(0.5, ageDays / hl);
}

// v0.10.0 归档目标目录：公共 .archive/facts/；私密 .archive/private/<owner>/<type>/（带 owner，防跨 owner 撞名）
function archiveDirFor(root, type, owner) {
  const t = String(type || 'FACT').toUpperCase();
  if (t === 'FACT') return path.join(root, ARCHIVE_DIR, 'facts');
  if (owner) return path.join(root, ARCHIVE_DIR, PRIVATE_DIR, owner, TYPE_DIRS[t] || 'facts');
  return path.join(root, ARCHIVE_DIR, TYPE_DIRS[t] || 'facts');
}

function newBatchId() {
  const d = new Date();
  const p = function (n, w) { return String(n).padStart(w || 2, '0'); };
  let rand = '';
  try { rand = crypto.randomBytes(3).toString('hex'); } catch (e) { rand = String(Math.floor(Math.random() * 16777215)).padStart(6, '0'); }
  return p(d.getFullYear(), 4) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + rand;
}

function collectAuditRecords(root) {
  const out = [];
  const log = auditPath(root, 'audit');
  if (!fs.existsSync(log)) return out;
  const raw = fs.readFileSync(log, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) { /* 跳过坏行 */ }
  }
  return out;
}

function listBatchesCore(opts) {
  opts = opts || {};
  const limit = (opts.limit && opts.limit > 0) ? opts.limit : 20;
  const roots = memoryRoots();
  const manifests = [];
  for (const root of roots) {
    for (const rec of collectAuditRecords(root)) {
      if (rec.action !== 'manifest') continue;
      manifests.push({ root: root, batch: rec.batch, ts: rec.ts || '', command: rec.command || '', mode: rec.mode || '' });
    }
  }
  manifests.sort(function (a, b) { return String(b.batch).localeCompare(String(a.batch)); });
  const lines = ['## yotta-memory consolidate --batches（近期批次审计）'];
  if (!manifests.length) lines.push('（无批次记录；批次由 v0.10.0+ consolidate / maintain --dedup --apply 写入 .archive/audit-<日期>.jsonl）');
  const shown = manifests.slice(0, limit);
  for (const m of shown) {
    lines.push('- ' + m.batch + '  [' + (m.command || '?') + ' / ' + (m.mode || '') + ']  root=' + m.root);
  }
  if (manifests.length > shown.length) lines.push('（共 ' + manifests.length + ' 个批次，显示前 ' + shown.length + ' 个；--limit N 查看更多）');
  lines.push('回滚: yotta-memory consolidate --undo <batch>');
  return { error: false, text: lines.join('\n') };
}

function findBatchRecords(batch) {
  const out = [];
  for (const root of memoryRoots()) {
    for (const rec of collectAuditRecords(root)) {
      if (rec.batch === batch) out.push({ root: root, rec: rec });
    }
  }
  return out;
}

function consolidateUndoCore(batch, opts) {
  opts = opts || {};
  const lines = ['## yotta-memory consolidate --undo ' + batch];
  const recs = findBatchRecords(batch);
  if (!recs.length) return { error: true, text: '未找到批次 ' + batch + '（.archive/audit-<日期>.jsonl 无该 batch 记录）。' };
  const done = recs.some(function (x) { return x.rec.action === 'undo_done'; });
  if (done) return { error: false, text: lines.join('\n') + '\n批次 ' + batch + ' 已回滚过（幂等拒绝重复执行）。' };
  const force = !!opts.force;
  let err = null;
  // 1) 删除 consolidate 生成的摘要（含索引）
  for (const x of recs) {
    if (x.rec.action !== 'summary_create') continue;
    const fp = path.join(x.root, x.rec.file);
    try { if (resolveWithinRoot(x.root, fp) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { err = err || ('摘要删除失败: ' + x.rec.file + ' ' + e.message); }
    if (resolveWithinRoot(x.root, fp)) removeIndexEntry(x.root, x.rec.file);
    lines.push('- 已删除摘要: ' + x.rec.file);
  }
  // 2) 合并回滚：keep 还原最早 before 影像；drop 从 .archive 归位
  const mergeKeeps = {};
  for (const x of recs) {
    if (x.rec.action !== 'merge') continue;
    const kf = x.rec.keepFile;
    if (!mergeKeeps[kf]) mergeKeeps[kf] = [];
    mergeKeeps[kf].push(x);
  }
  for (const kf of Object.keys(mergeKeeps)) {
    const xs = mergeKeeps[kf].sort(function (a, b) { return String(a.rec.ts || '').localeCompare(String(b.rec.ts || '')); });
    const first = xs[0];
    const keepFp = path.join(first.root, kf);
    const owner = ownerFromPrivatePath(first.root, keepFp);
    const before = first.rec.before || {};
    try {
      const patch = {};
      if (before.updated !== undefined) patch.updated = before.updated;
      if (before.tags !== undefined) patch.tags = JSON.stringify(before.tags);
      if (before.access_count !== undefined) patch.access_count = before.access_count;
      if (before.feedback_net !== undefined) patch.feedback_net = before.feedback_net;
      if (Object.keys(patch).length && fs.existsSync(keepFp)) {
        rewriteFrontmatter(keepFp, patch, first.root, owner);
        upsertIndexEntry(first.root, readEntry(keepFp, first.root));
        lines.push('- 已还原 keep: ' + kf);
      }
    } catch (e) { err = err || ('keep 还原失败: ' + kf + ' ' + e.message); }
    for (const x of xs) {
      const dropFp = path.join(x.root, x.rec.dropFile);
      const dropTo = path.join(x.root, x.rec.dropTo);
      if (!resolveWithinRoot(x.root, dropFp)) continue;
      if (fs.existsSync(dropFp) && !force) { err = err || ('归位冲突: ' + x.rec.dropFile + ' 已存在（--force 覆盖）'); continue; }
      try {
        if (fs.existsSync(dropFp)) fs.unlinkSync(dropFp);
        if (fs.existsSync(dropTo)) {
          fs.mkdirSync(path.dirname(dropFp), { recursive: true });
          fs.renameSync(dropTo, dropFp);
          upsertIndexEntry(x.root, readEntry(dropFp, x.root));
          lines.push('- 已归位 drop: ' + x.rec.dropFile);
        } else {
          err = err || ('drop 归档副本缺失: ' + x.rec.dropFile + '（无法归位）');
        }
      } catch (e2) { err = err || ('drop 归位失败: ' + x.rec.dropFile + ' ' + e2.message); }
    }
  }
  // 3) consolidate 归档原文归位
  for (const x of recs) {
    if (x.rec.action !== 'archive') continue;
    const to = path.join(x.root, x.rec.file);
    const from = path.join(x.root, x.rec.to);
    if (!resolveWithinRoot(x.root, to)) continue;
    if (fs.existsSync(to) && !force) { err = err || ('归位冲突: ' + x.rec.file + ' 已存在（--force 覆盖）'); continue; }
    try {
      if (fs.existsSync(to)) fs.unlinkSync(to);
      if (fs.existsSync(from)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);
        upsertIndexEntry(x.root, readEntry(to, x.root));
        lines.push('- 已归位: ' + x.rec.file);
      } else {
        err = err || ('归档副本缺失: ' + x.rec.to + '（无法归位）');
      }
    } catch (e3) { err = err || ('归位失败: ' + x.rec.file + ' ' + e3.message); }
  }
  // 4) 幂等标记
  const roots = [];
  for (const x of recs) if (roots.indexOf(x.root) === -1) roots.push(x.root);
  for (const r of roots) appendAudit(r, 'audit', { ts: new Date().toISOString(), batch: batch, action: 'undo_done', note: err ? 'partial: ' + err : 'ok' });
  lines.push(err ? '- 结果: 部分失败 —— ' + err : '- 结果: 回滚完成（重复 --undo 会被幂等拒绝）');
  return { error: false, text: lines.join('\n') };
}

function pickSummaryTheme(group) {
  let best = group[0];
  for (const c of group) {
    if (c.e.confidence > best.e.confidence) best = c;
    else if (c.e.confidence === best.e.confidence && String(c.e.updated || '') > String(best.e.updated || '')) best = c;
  }
  let s = String(best.e.subject || '（无主题）').replace(/\s+/g, ' ').trim();
  if (s.length > 30) s = s.slice(0, 29) + '…';
  return s;
}

function sharedTag(a, b) {
  const ta = a.e.tags || [], tb = b.e.tags || [];
  for (const t of ta) if (tb.indexOf(t) !== -1) return true;
  return false;
}

function similarForConsolidate(a, b) {
  if (subjectsSimilar(a.e, b.e)) return true;
  if (jaccardTokens(a.e, b.e) >= 0.35) return true;
  if (sharedTag(a, b)) return true;
  return false;
}

function clusterConsolidateCandidates(cands) {
  const buckets = {};
  for (const c of cands) {
    const key = (c.scope === 'private' ? 'priv:' + c.owner : 'pub') + '|' + c.type;
    (buckets[key] = buckets[key] || []).push(c);
  }
  const groups = [];
  for (const key of Object.keys(buckets)) {
    const arr = buckets[key].slice().sort(function (a, b) { return String(a.e.created || '').localeCompare(String(b.e.created || '')); });
    const clusters = [];
    for (const c of arr) {
      let placed = false;
      for (const cl of clusters) {
        if (similarForConsolidate(c, cl[0])) { cl.push(c); placed = true; break; }
      }
      if (!placed) clusters.push([c]);
    }
    for (const cl of clusters) if (cl.length >= 2) groups.push(cl);
  }
  return groups;
}

function applyConsolidateGroup(root, group, batch, period) {
  const e0 = group[0];
  const type = e0.type;
  const owner = e0.scope === 'private' ? e0.owner : '';
  const theme = pickSummaryTheme(group);
  const subject = '周期摘要 ' + theme + '（' + period + ' 天窗）';
  const absDir = path.join(root, typeSubdir(type, owner));
  fs.mkdirSync(absDir, { recursive: true });
  const enc = isEncrypted(root) && owner ? ENC_SUFFIX : '';
  let fname = today() + '-' + nextSeq(absDir) + '.md' + enc;
  let fp = path.join(absDir, fname);
  let guard = 0;
  while (fs.existsSync(fp) && guard < 100) { guard++; fname = today() + '-' + nextSeq(absDir) + '.md' + enc; fp = path.join(absDir, fname); }
  const confs = group.map(function (c) { return c.e.confidence; });
  const maxConf = Math.max.apply(null, confs);
  const ws = group.map(function (c) { return c.e.weight || 1.0; }).sort(function (a, b) { return a - b; });
  const medW = ws.length % 2 ? ws[(ws.length - 1) / 2] : (ws[ws.length / 2 - 1] + ws[ws.length / 2]) / 2;
  const allTags = [];
  for (const c of group) for (const t of (c.e.tags || [])) if (allTags.indexOf(t) === -1) allTags.push(t);
  const tags = ['consolidate', 'summary'].concat(allTags);
  const createdDates = group.map(function (c) { return c.e.created; }).sort();
  const avgU = round3(group.reduce(function (s, c) { return s + c.utility; }, 0) / group.length);
  const bodyLines = ['# 周期摘要：' + theme, '', '> 生成: yotta-memory consolidate | 类型 ' + type + ' | 范围 ' + createdDates[0] + ' ~ ' + createdDates[createdDates.length - 1] + ' | ' + group.length + ' 条 | 平均效用 ' + avgU, '', '## 主题要点', ''];
  const sorted = group.slice().sort(function (a, b) { return String(b.e.updated || '').localeCompare(String(a.e.updated || '')); });
  for (const c of sorted) bodyLines.push('- [' + c.e.type + '] ' + (c.e.subject || '') + ': ' + (c.e.statement || ''));
  bodyLines.push('', '## 溯源（原文已入 .archive，可 consolidate --undo <batch> 恢复）', '');
  for (const c of group) bodyLines.push('- ' + c.e.file + '（created ' + c.e.created + ' / confidence ' + c.e.confidence + ' / utility ' + round3(c.utility) + '）');
  const body = bodyLines.join('\n');
  const statement = '周期摘要 ' + theme + '：' + group.length + ' 条 ' + type + '（' + createdDates[0] + ' ~ ' + createdDates[createdDates.length - 1] + '，平均效用 ' + avgU + '）。要点与溯源见正文。';
  const meta = { type: type, subject: subject, statement: statement, confidence: round3(maxConf), created: today(), updated: today(), tags: tags, immutable: false, scope: owner ? 'private' : 'public', owner: owner, source: 'consolidate', weight: round3(medW), access_count: 0, last_accessed: '', feedback_net: 0 };
  writeMemoryText(root, fp, frontmatterToText(meta, body), owner);
  const summaryRel = relOf(root, fp);
  upsertIndexEntry(root, readEntry(fp, root));
  appendAudit(root, 'audit', { action: 'summary_create', ts: new Date().toISOString(), batch: batch, file: summaryRel, sourceFiles: group.map(function (c) { return c.e.file; }) });
  let moved = 0;
  for (const c of group) {
    const destDir = archiveDirFor(root, type, owner);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(c.e.file));
    fs.renameSync(path.join(root, c.e.file), dest);
    removeIndexEntry(root, c.e.file);
    appendAudit(root, 'audit', { action: 'archive', ts: new Date().toISOString(), batch: batch, file: c.e.file, to: relOf(root, dest), type: type, owner: owner, utility: round3(c.utility) });
    moved++;
  }
  return { made: 1, moved: moved, summaryRel: summaryRel };
}

function consolidateCore(opts) {
  opts = opts || {};
  if (opts.undo) return consolidateUndoCore(String(opts.undo), opts);
  if (opts.batches) return listBatchesCore(opts);
  const root = userRoot();
  if (!fs.existsSync(root)) return { error: false, text: '记忆库不存在。' };
  const apply = !!opts.apply;
  const selfAgent = resolveIdentity(opts).id;
  const unsafe = !!opts.unsafe;
  const cfg = loadConfig();
  const minAge = (opts.minAge !== undefined && opts.minAge !== null) ? opts.minAge : (parseInt(cfg.consolidate_min_age || '180', 10) || 180);
  const minIdle = (opts.minIdle !== undefined && opts.minIdle !== null) ? opts.minIdle : (parseInt(cfg.consolidate_min_idle || '90', 10) || 90);
  const maxUTmp = (opts.maxUtility !== undefined && opts.maxUtility !== null) ? parseFloat(opts.maxUtility) : parseFloat(cfg.consolidate_max_utility);
  const maxU = (maxUTmp > 0) ? maxUTmp : 0.6;
  const minGroup = (opts.minGroup !== undefined && opts.minGroup !== null) ? opts.minGroup : (parseInt(cfg.consolidate_min_group || '2', 10) || 2);
  const period = (opts.period !== undefined && opts.period !== null) ? opts.period : (parseInt(cfg.consolidate_period || '90', 10) || 90);
  const typeOnly = opts.type ? String(opts.type).toUpperCase() : '';
  const lines = ['## yotta-memory consolidate（周期摘要压缩）'];
  lines.push('- 模式: ' + (apply ? '执行' : '预览（dry-run，未改动；加 --apply 执行）'));
  lines.push('- 候选: 天龄 ≥ ' + minAge + ' 天 ∧ 闲置 ≥ ' + minIdle + ' 天 ∧ utility ≤ ' + maxU + (typeOnly ? ' ∧ 仅类型 ' + typeOnly : '') + '；immutable / BOUND 豁免');
  lines.push('');
  const cands = [];
  const stats = { scan: 0, denied: 0, immutable: 0, bound: 0, typeSkip: 0, noCreated: 0, active: 0 };
  for (const fp of collectEntryFiles(root)) {
    stats.scan++;
    const owner = ownerFromPrivatePath(root, fp);
    const rel = relOf(root, fp);
    if (checkOwnerWritable(root, rel, selfAgent, unsafe)) { stats.denied++; continue; }
    let e;
    try { e = readEntry(fp, root); } catch (err) { stats.denied++; continue; }
    if (e.immutable) { stats.immutable++; continue; }
    if (e.type === 'BOUND') { stats.bound++; continue; }
    if (typeOnly && e.type !== typeOnly) { stats.typeSkip++; continue; }
    if (!e.created) { stats.noCreated++; continue; }
    const age = daysBetween(e.created, today());
    const last = e.last_accessed || e.created || '';
    const idle = last ? daysBetween(last, today()) : age;
    const u = utilityScore(e.meta);
    if (age < minAge || idle < minIdle || u > maxU) { stats.active++; continue; }
    cands.push({ e: e, owner: owner, type: e.type, age: age, idle: idle, utility: u, scope: e.scope === 'private' ? 'private' : 'public' });
  }
  if (!cands.length) {
    lines.push('（无可压缩候选；扫描 ' + stats.scan + ' 条，跳过: 其它 owner/无密钥 ' + stats.denied + ' / immutable ' + stats.immutable + ' / BOUND ' + stats.bound + ' / 类型过滤 ' + stats.typeSkip + ' / 无 created ' + stats.noCreated + ' / 不够老或仍活跃 ' + stats.active + '）');
    return { error: false, text: lines.join('\n') };
  }
  const groups = clusterConsolidateCandidates(cands);
  lines.push('候选 ' + cands.length + ' 条（扫描 ' + stats.scan + '，跳过: 其它 owner/无密钥 ' + stats.denied + ' / immutable ' + stats.immutable + ' / BOUND ' + stats.bound + ' / 类型过滤 ' + stats.typeSkip + ' / 无 created ' + stats.noCreated + ' / 不够老或仍活跃 ' + stats.active + '）');
  if (!groups.length) {
    lines.push('');
    lines.push('（无可归纳组：同主题聚类 ≥ ' + minGroup + ' 条才生成周期摘要；零散单条旧记忆请用 maintain --apply 归档）');
    return { error: false, text: lines.join('\n') };
  }
  lines.push('');
  lines.push('### 周期摘要组（' + groups.length + ' 组，每组将生成摘要 1 条 + 归档原文 N 条）');
  for (const g of groups) {
    const type = g[0].type;
    const scopeLabel = g[0].scope === 'private' ? ('private/' + g[0].owner) : 'public';
    const ages = g.map(function (c) { return c.age; });
    const minA = Math.min.apply(null, ages), maxA = Math.max.apply(null, ages);
    const avgU = round3(g.reduce(function (s, c) { return s + c.utility; }, 0) / g.length);
    lines.push('- [' + type + '] 主题: ' + pickSummaryTheme(g) + '（' + scopeLabel + '，' + g.length + ' 条，' + minA + '~' + maxA + ' 天，平均效用 ' + avgU + '）' + (type === 'COMMIT' ? '  ⚠️ COMMIT 承诺/任务类，请确认' : ''));
    for (const c of g) lines.push('    · ' + c.e.file + ' — ' + String(c.e.subject || '').slice(0, 32) + ': ' + String(c.e.statement || '').slice(0, 60));
  }
  if (!apply) {
    lines.push('');
    lines.push('dry-run 未执行任何变更。确认后加 --apply 执行（写入批次审计，可 consolidate --undo <batch> 回滚）。');
    return { error: false, text: lines.join('\n') };
  }
  const guard = destructiveGuardCore({
    root: root,
    action: 'consolidate --apply',
    snapshotDir: opts.snapshotDir,
    backupDir: opts.backupDir,
    allowSameVolumeForTest: opts.allowSameVolumeForTest,
    sameVolumeFn: opts.sameVolumeFn,
    now: opts.now,
  });
  if (guard.error) return { error: true, text: guard.text };
  const batch = newBatchId();
  appendAudit(root, 'audit', { action: 'manifest', ts: new Date().toISOString(), batch: batch, command: 'consolidate', mode: 'apply', root: root, active_before: collectEntryFiles(root).length, undone: false });
  lines.push('');
  lines.push('- 事务快照: ' + guard.snapshot.id);
  lines.push('- 批次: ' + batch + '（审计 .archive/audit-<日期>.jsonl；回滚: yotta-memory consolidate --undo ' + batch + '）');
  let made = 0, moved = 0;
  for (const g of groups) {
    const res = applyConsolidateGroup(root, g, batch, period);
    made += res.made; moved += res.moved;
    lines.push('- 已生成摘要 ' + res.summaryRel + '（归档原文 ' + res.moved + ' 条）');
  }
  appendAudit(root, 'audit', { action: 'batch_done', ts: new Date().toISOString(), batch: batch, command: 'consolidate', summaries: made, archived: moved, active_after: collectEntryFiles(root).length });
  lines.push('- 完成: 生成摘要 ' + made + ' 条 / 原文归档 ' + moved + ' 条');
  return { error: false, text: lines.join('\n') };
}

function cmdConsolidate(opts) {
  const r = consolidateCore(opts);
  console.log(r.text);
  if (r.error) process.exit(2);
}

// ---- 近重复自动合并：置信度分档 + --apply 批量执行（maintain --dedup 增强）----
function dupScorePair(a, b) {
  const jac = jaccardTokens(a, b);
  const sa = String(a.subject || '').toLowerCase(), sb = String(b.subject || '').toLowerCase();
  let subSim = 0;
  if (sa && sb) { if (sa === sb) subSim = 1; else subSim = Math.max(0, 1 - editDistance(sa, sb) / 3); }
  const typeEq = (a.type === b.type) ? 1 : 0;
  const scopeEq = (String(a.scope || '') === String(b.scope || '') && String(a.owner || '') === String(b.owner || '')) ? 1 : 0;
  let score = 0.45 * jac + 0.25 * subSim + 0.15 * typeEq + 0.15 * scopeEq;
  const la = String(a.statement || '').length, lb = String(b.statement || '').length;
  const mn = Math.min(la, lb), mx = Math.max(la, lb);
  if (mx > 0 && mn / mx < 0.3) score = 0;
  return round3(score);
}

function groupDupScore(g) {
  if (g.length < 2) return 0;
  let mn = 2, sum = 0, n = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    const sc = dupScorePair(g[i], g[j]);
    if (sc < mn) mn = sc;
    sum += sc; n++;
  }
  return round3(n ? (mn + sum / n) / 2 : 0);
}

function dupGroupMergeable(g) {
  if (g.length < 2) return false;
  const t = g[0].type, sc = String(g[0].scope || ''), ow = String(g[0].owner || '');
  for (const e of g) {
    if (e.type !== t || String(e.scope || '') !== sc || String(e.owner || '') !== ow) return false;
    if (e.immutable || e.type === 'BOUND') return false;
  }
  return true;
}

function autoMergePairCore(root, keepE, dropE, batch, selfAgent, unsafe) {
  for (const f of [keepE.file, dropE.file]) {
    const deny = checkOwnerWritable(root, f, selfAgent, unsafe);
    if (deny) return { error: true, text: deny };
  }
  const keepFp = path.join(root, keepE.file);
  const dropFp = path.join(root, dropE.file);
  const keepOwner = ownerFromPrivatePath(root, keepFp);
  const dropOwner = ownerFromPrivatePath(root, dropFp);
  let kMeta, dMeta;
  try {
    kMeta = parseFrontmatter(readMemoryText(root, keepFp, keepOwner)).meta;
    dMeta = parseFrontmatter(readMemoryText(root, dropFp, dropOwner)).meta;
  } catch (e) { return { error: true, text: '读取失败: ' + e.message }; }
  const before = { updated: kMeta.updated || '', tags: parseTags(kMeta.tags), access_count: parseInt(kMeta.access_count || '0', 10) || 0, feedback_net: feedbackNetOf(kMeta) };
  const mergedTags = [];
  for (const t of parseTags(kMeta.tags).concat(parseTags(dMeta.tags))) if (mergedTags.indexOf(t) === -1) mergedTags.push(t);
  const patch = {
    updated: today(),
    tags: JSON.stringify(mergedTags),
    access_count: before.access_count + (parseInt(dMeta.access_count || '0', 10) || 0),
    feedback_net: round3(before.feedback_net + feedbackNetOf(dMeta))
  };
  rewriteFrontmatter(keepFp, patch, root, keepOwner);
  upsertIndexEntry(root, readEntry(keepFp, root));
  const destDir = archiveDirFor(root, String(dMeta.type || 'FACT').toUpperCase(), dropOwner);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(dropFp));
  fs.renameSync(dropFp, dest);
  removeIndexEntry(root, dropE.file);
  appendAudit(root, 'audit', { ts: new Date().toISOString(), batch: batch, action: 'merge', keepFile: keepE.file, dropFile: dropE.file, dropTo: relOf(root, dest), before: before, after: { updated: patch.updated, tags: mergedTags, access_count: patch.access_count, feedback_net: patch.feedback_net } });
  return { error: false, text: '已合并 ' + dropE.file + ' -> ' + keepE.file };
}

function appendDedupBlock(lines, root, opts) {
  const apply = !!opts.apply;
  const selfAgent = resolveIdentity(opts).id;
  const unsafe = !!opts.unsafe;
  lines.push('');
  lines.push('### 重复候选与置信度（--dedup' + (apply ? ' --apply 自动合并' : '') + '）');
  const entries = ensureIndex(root);
  const groups = [];
  const used = new Set();
  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;
    const g = [entries[i]];
    used.add(i);
    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue;
      if (subjectsSimilar(entries[i], entries[j]) && jaccardTokens(entries[i], entries[j]) >= 0.5) {
        g.push(entries[j]); used.add(j);
      }
    }
    if (g.length > 1) groups.push(g);
  }
  if (!groups.length) { lines.push('（无重复候选）'); return; }
  const plans = [];
  for (const g of groups) {
    const score = groupDupScore(g);
    const mergeable = dupGroupMergeable(g) && score >= 0.85;
    plans.push({ g: g, score: score, mergeable: mergeable });
  }
  const high = plans.filter(function (p) { return p.mergeable; });
  const suggest = plans.filter(function (p) { return !p.mergeable && p.score >= 0.65; });
  for (const p of plans) {
    const tag = p.mergeable ? '可自动合并' : (p.score >= 0.65 ? '建议手动合并' : '低置信（忽略）');
    lines.push('- 置信度 ' + p.score + ' [' + tag + '] 组: ' + p.g.map(function (e) { return e.file; }).join(' | '));
    lines.push('  ' + p.g.map(function (e) { return e.subject + ': ' + String(e.statement || '').slice(0, 60); }).join(' / '));
  }
  if (!apply) {
    lines.push('  执行: yotta-memory maintain --dedup --apply（自动合并高置信组，写入批次审计可回滚）；手动: maintain --merge <A>,<B>');
    return;
  }
  if (!high.length) { lines.push('  （无高置信可自动合并组）'); return; }
  const batch = newBatchId();
  appendAudit(root, 'audit', { action: 'manifest', ts: new Date().toISOString(), batch: batch, command: 'dedup-merge', mode: 'apply', root: root, undone: false });
  let merged = 0;
  for (const p of high) {
    const arr = p.g.slice().sort(function (a, b) {
      const ca = a.confidence - b.confidence;
      if (ca !== 0) return b.confidence - a.confidence;
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
    const keep = arr[0];
    for (let k = 1; k < arr.length; k++) {
      const r = autoMergePairCore(root, keep, arr[k], batch, selfAgent, unsafe);
      lines.push('- ' + r.text + (r.error ? '（失败）' : ''));
      if (!r.error) merged++;
    }
  }
  appendAudit(root, 'audit', { action: 'batch_done', ts: new Date().toISOString(), batch: batch, command: 'dedup-merge', merged: merged });
  lines.push('- 批次: ' + batch + '（自动合并 ' + merged + ' 条；回滚: yotta-memory consolidate --undo ' + batch + '）');
}


// ---- usage / main ----
function cmdRuntimeInstall(arg, opts) {
  let result;
  if (opts.fromCurrent) result = runtimeInstallFromCurrent(opts);
  else if (!arg) {
    console.error('runtime install 需要 <tarball|版本>，或使用 --from-current。');
    process.exit(2);
  } else if (/\.tgz$/i.test(arg) || fs.existsSync(path.resolve(arg))) {
    result = runtimeInstallTarball(arg, '', opts);
  } else {
    result = runtimeInstallVersion(arg, opts);
  }
  console.log(result.text);
  if (result.error) process.exit(2);
}
function cmdRuntimeUse(version, opts) {
  const result = runtimeUseCore(version, opts);
  console.log(result.text);
  if (result.error) process.exit(2);
}
function cmdRuntimeRollback(opts) {
  const result = runtimeRollbackCore(opts);
  console.log(result.text);
  if (result.error) process.exit(2);
}
function cmdRuntimeStatus() {
  console.log(runtimeStatusCore().text);
}
function cmdRuntimeList() {
  console.log(runtimeListCore().text);
}
function usage() {
  const banner = 'yotta-memory v' + VERSION + ' — 元忆：有权限边界的文件式智能体记忆';
  const sections = [
    ['核心记忆', [
      ['init', '初始化记忆库（新建默认加密：需主口令 + 恢复钥匙；--attach 接入已有库；--no-encrypt 降级明文；非 TTY 用 --password-stdin；--recovery-key-out <文件> 写恢复钥匙）'],
      ['remember <type> <subject> <statement>', '写入记忆（--source 来源；--weight 权重；--verify 写后回读校验；--no-hint 关启发）'],
      ['recall [关键词]', '检索记忆（--type/--limit/--agent/--owner/--all/--unsafe）'],
      ['forget', '删除一条记忆'],
      ['archive', '归档（--days/--threshold 盖棺分+年龄）'],
      ['backup', '备份记忆库（volumes / setup / status / ensure-daily / schedule / create / list / doctor / restore <id> --to <目录> / drill）'],
      ['doctor', '开工可靠性检查（根目录/密钥库/索引/身份/最近备份；全新空库缺失 index/agents 降为 info；输出 YOTTA_MEMORY_AGENT_HOME 提示；--runtime 加查 CLI/current/MCP/进程/技能副本漂移）'],
      ['maintain', '记忆自组织（归档/遗忘候选/去重/合并；默认 dry-run；--dedup 查重+置信度，--dedup --apply 自动合并高置信组）'],
      ['consolidate', '周期摘要压缩（默认 dry-run；--apply 执行；--undo <batch> 回滚；--batches 查批次；候选=超龄+闲置+低效用，immutable/BOUND 豁免）'],
      ['distill', '心理日志蒸馏（统计摘要/主题画像/知识地图；--model 可选外部模型）'],
      ['feedback', '使用反馈（--useful/--useless/--undo）'],
      ['explain', '查看单条记忆效用分项与归档/遗忘状态判定'],
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
      ['migrate', '把明文库迁移为密文（需主口令；空明文库同样可用；--password-stdin 仅用于纯 ASCII 管道；--recovery-key-out <文件> 写恢复钥匙；首次迁移推荐交互式：yotta-memory migrate --recovery-key-out <文件>；非 ASCII 口令请交互输入，勿用 echo 中文管道；迁移后授权二选一：推荐 yotta-memory view，等价 CLI 为 yotta-memory key bind <id>）'],
      ['view', '启动用户查看平台（--port/--host；复用前校验 memory_home 指纹，跨库或旧版无指纹服务会拒绝复用；空加密库可用恢复钥匙校验主口令）'],
      ['reset-password', '重设主口令（忘口令用恢复钥匙）'],
      ['key', '管理 agent_key binding（list / bind <id> / rotate <id> / claim <id> [--to <AI_HOME> | --plugin-data <PLUGIN_DATA> | --agent-key-file <文件>] / status <id> [--to <AI_HOME> | --plugin-data <PLUGIN_DATA> | --agent-key-file <文件>] / revoke <id>；bind/rotate 需主口令或恢复钥匙；--plugin-data 供 Agent Plugin 一条命令绑定插件身份）'],
      ['config', '查看/设置配置（get；set memory_home <目录> / backup_dir <目录> / embedding_cmd <命令> / embedding_timeout <毫秒> / maintain_* 阈值与半衰 / consolidate_* 参数）']
    ]],
    ['平台与服务', [
      ['serve', '启动 MCP 记忆引擎（streamable HTTP；--stdio 本地零进程；--tools core|full 控制工具分组）'],
      ['runtime', '运行时稳定入口（list / install <tarball|版本> [--from-current] [--force] / use <版本> [--restart] / rollback [--restart] / status）'],
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
  lines.push('环境变量: YOTTA_MEMORY_HOME 临时覆盖用户级位置; 身份不再读取 env；CLI 用 --agent + --agent-key/--agent-key-file，stdio MCP 用 --agent-id + --agent-key-file，HTTP MCP 用请求头');
  lines.push('隔离: 公共 FACT 在 facts/；私密 PREF/BOUND/COMMIT 物理分目录 private/<agent_id>/<type>/，禁止 shell 直读写记忆库，一律走本命令');
  lines.push('远端接入: MCP url http://<主机IP>:8787/mcp；请求头 Authorization: Bearer <token> + X-Agent-Id: <id> + X-Agent-Key: <agent_key>');
  console.log(lines.join('\n'));
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { usage(); return; }
  const opts = {};
  const positional = [];
  const valueOpts = new Set(['--type', '--limit', '--days', '--out', '--owner', '--agent', '--agent-id', '--agent-key', '--agent-key-file', '--plugin-data', '--threshold', '--scope', '--host', '--port', '--dir', '--name', '--user', '--relationship', '--source', '--weight', '--budget', '--password', '--new-password', '--recovery-key', '--recovery-key-out', '--reason', '--merge', '--model', '--subject', '--embedding', '--focus', '--embedding-timeout', '--min-age', '--min-idle', '--max-utility', '--min-group', '--period', '--to', '--id', '--time', '--tools', '--mcp-config', '--skill-dir']);
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
    else if (a === '--from-current') opts.fromCurrent = true;
    else if (a === '--restart') opts.restart = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--attach') opts.attach = true;
    else if (a === '--allow-same-volume') opts.allowSameVolume = true;
    else if (a === '--verify') opts.verify = true;
    else if (a === '--no-hint') opts.noHint = true;
    else if (a === '--encrypt') opts.encrypt = true;
    else if (a === '--no-encrypt') opts.noEncrypt = true;
    else if (a === '--password-stdin') opts.passwordStdin = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--manual') opts.manual = true;
    else if (a === '--skip-schedule') opts.skipSchedule = true;
    else if (a === '--useful') opts.useful = true;
    else if (a === '--useless') opts.useless = true;
    else if (a === '--undo') opts.undo = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--purge') opts.purge = true;
    else if (a === '--dedup') opts.dedup = true;
    else if (a === '--batches') opts.batches = true;
    else if (a === '--explain') opts.explain = true;
    else if (a === '--semantic') opts.semantic = true;
    else if (a === '--runtime') opts.runtime = true;
    else if (valueOpts.has(a)) {
      const v = args[++i];
      if (a === '--type') opts.type = v;
      else if (a === '--limit') opts.limit = parseInt(v, 10) || 50;
      else if (a === '--days') opts.days = parseInt(v, 10) || 180;
      else if (a === '--threshold') opts.threshold = parseFloat(v);
      else if (a === '--out') opts.out = v;
      else if (a === '--owner') opts.owner = v;
      else if (a === '--agent') opts.agent = v;
      else if (a === '--agent-id') opts.agentId = v;
      else if (a === '--agent-key') opts.agentKey = v;
      else if (a === '--agent-key-file') opts.agentKeyFile = v;
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
      else if (a === '--recovery-key-out') opts.recoveryKeyOut = v;
      else if (a === '--reason') opts.reason = v;
      else if (a === '--merge') opts.merge = v;
      else if (a === '--model') opts.model = v;
      else if (a === '--subject') opts.subject = v;
      else if (a === '--embedding') opts.embedding = v;
      else if (a === '--focus') opts.focus = v;
      else if (a === '--embedding-timeout') opts.embeddingTimeout = parseInt(v, 10) || 3000;
      else if (a === '--min-age') opts.minAge = parseInt(v, 10) || 0;
      else if (a === '--min-idle') opts.minIdle = parseInt(v, 10) || 0;
      else if (a === '--max-utility') opts.maxUtility = parseFloat(v);
      else if (a === '--min-group') opts.minGroup = parseInt(v, 10) || 0;
      else if (a === '--period') opts.period = parseInt(v, 10) || 0;
      else if (a === '--to') opts.to = v;
      else if (a === '--plugin-data') opts.pluginData = v;
      else if (a === '--id') opts.id = v;
      else if (a === '--time') opts.time = v;
      else if (a === '--tools') opts.toolProfile = v;
      else if (a === '--mcp-config') opts.mcpConfigPaths = (opts.mcpConfigPaths || []).concat(v);
      else if (a === '--skill-dir') opts.skillDirs = (opts.skillDirs || []).concat(v);
    } else if (a.startsWith('--')) {
      if (a === '--query') {
        console.error('未知选项: --query。recall/search 的关键词是位置参数：yotta-memory recall [关键词]');
        process.exit(2);
      }
      console.error('未知选项: ' + a);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  if (opts.toolProfile !== undefined) {
    opts.toolProfile = String(opts.toolProfile).trim().toLowerCase();
    if (opts.toolProfile !== 'core' && opts.toolProfile !== 'full') {
      console.error('工具分组必须是 core 或 full（例如：yotta-memory serve --stdio --tools core）。');
      process.exit(2);
    }
  }
  const first = positional[0];
  const rest = positional.slice(1);
  if (first === 'remember' && opts.type) {
    console.error('位置参数用法：yotta-memory remember <type> <subject> <statement>。--type 仅用于 recall/maintain/consolidate 等筛选，不是 remember 的类型参数。');
    process.exit(2);
  }
  if (first === 'remember' && rest.length < 3) {
    console.error('位置参数不足：yotta-memory remember <type> <subject> <statement>');
    process.exit(2);
  }
  const runtimeIdentity = resolveIdentity(opts);
  setRuntimeAgent(runtimeIdentity.error ? '' : runtimeIdentity.id, runtimeIdentity.error ? '' : runtimeIdentity.agentKey);
  switch (first) {
    case 'init': await cmdInit(opts); break;
    case 'whoami': cmdWhoami(opts); break;
    case 'iam': cmdIam(rest[0], opts); break;
    case 'config': {
      const sub = rest[0];
      if (sub === 'set') cmdConfigSet(rest[1], rest[2]);
      else if (sub === 'get') cmdConfigGet(opts);
      else { console.error('config 子命令: set <键> <值>（memory_home / embedding_cmd / embedding_timeout / maintain_* / consolidate_*）/ get'); process.exit(2); }
      break;
    }
    case 'remember': cmdRemember(rest[0], rest[1], rest[2], opts); break;
    case 'recall': cmdRecall(rest[0] || null, opts); break;
    case 'search': cmdRecall(rest[0] || null, opts); break;
    case 'feedback': cmdFeedback(rest[0], opts); break;
    case 'explain': cmdExplain(rest[0], opts); break;
    case 'maintain': cmdMaintain(opts); break;
    case 'distill': cmdDistill(opts); break;
    case 'consolidate': if (opts.undo === true && rest.length) opts.undo = rest[0]; cmdConsolidate(opts); break;
    case 'forget': cmdForget(rest[0], opts); break;
    case 'archive': cmdArchive(opts); break;
    case 'backup': {
      const sub = rest[0];
      if (sub === 'volumes') cmdBackupVolumes(opts);
      else if (sub === 'setup') cmdBackupSetup(opts);
      else if (sub === 'status') cmdBackupStatus(opts);
      else if (sub === 'ensure-daily') cmdBackupEnsureDaily(opts);
      else if (sub === 'schedule') cmdBackupSchedule(rest[1], opts);
      else if (sub === 'create') cmdBackupCreate(opts);
      else if (sub === 'list') cmdBackupList(opts);
      else if (sub === 'doctor') cmdBackupDoctor(opts);
      else if (sub === 'restore') cmdBackupRestore(rest[1] || opts.id, opts);
      else if (sub === 'drill') cmdBackupDrill(rest[1] || opts.id, opts);
      else { console.error('backup 子命令: volumes / setup / status / ensure-daily / schedule / create / list / doctor / restore <id> --to <目录> / drill'); process.exit(2); }
      break;
    }
    case 'reindex': cmdReindex(); break;
    case 'doctor': cmdDoctor(opts); break;
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
    case 'view': await cmdView(opts); break;
    case 'reset-password': await cmdResetPassword(opts); break;
    case 'key': {
      const sub = rest[0];
      if (sub === 'list') cmdKeyList();
      else if (sub === 'bind' || sub === 'rotate') await cmdKeyBind(rest[1], opts);
      else if (sub === 'authorize') await cmdKeyAuthorize(rest[1], opts);
      else if (sub === 'claim') cmdKeyClaim(rest[1], opts);
      else if (sub === 'status') cmdKeyStatus(rest[1], opts);
      else if (sub === 'revoke') cmdKeyRevoke(rest[1]);
      else { console.error('key 子命令: list / bind <id> / rotate <id> / claim <id> --to <AI_HOME> / status <id> / revoke <id>'); process.exit(2); }
      break;
    }
    case 'runtime': {
      const sub = rest[0];
      if (sub === 'install') cmdRuntimeInstall(rest[1], opts);
      else if (sub === 'use') cmdRuntimeUse(rest[1], opts);
      else if (sub === 'rollback') cmdRuntimeRollback(opts);
      else if (sub === 'status') cmdRuntimeStatus();
      else if (sub === 'list') cmdRuntimeList();
      else { console.error('runtime 子命令: list / install <tarball|版本> [--from-current] [--force] / use <版本> [--restart] / rollback [--restart] / status'); process.exit(2); }
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

if (require.main === module) { main().catch(function (e) { console.error('错误: ' + (e && e.message ? e.message : String(e))); console.error('修复建议: 若与记忆库/密钥/权限有关，请检查 memory_home 路径、主口令与恢复钥匙，或运行 yotta-memory config get 确认位置；仍无法解决请把上面的错误信息反馈给开发者。'); process.exit(2); }); }
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
  maintainCore: maintainCore,
  consolidateCore: consolidateCore,
  mergeCore: mergeCore,
  utilityScore: utilityScore,
  utilityBreakdown: utilityBreakdown,
  decayRecency: decayRecency,
  decayHalflifeDays: decayHalflifeDays,
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
  runtimeRoot: runtimeRoot,
  runtimeManifestPath: runtimeManifestPath,
  runtimeVersionsDir: runtimeVersionsDir,
  runtimeVersionDir: runtimeVersionDir,
  runtimeCurrentDir: runtimeCurrentDir,
  runtimeCurrentBin: runtimeCurrentBin,
  runtimeExecutionPath: runtimeExecutionPath,
  runtimeManagedScript: runtimeManagedScript,
  runtimeTreeHash: runtimeTreeHash,
  runtimeListVersions: runtimeListVersions,
  runtimeSwitchCurrent: runtimeSwitchCurrent,
  runtimeInstallFromCurrent: runtimeInstallFromCurrent,
  runtimeInstallTarball: runtimeInstallTarball,
  runtimeInstallVersion: runtimeInstallVersion,
  runtimeValidateTarballEntries: runtimeValidateTarballEntries,
  runtimeUseCore: runtimeUseCore,
  runtimeRollbackCore: runtimeRollbackCore,
  runtimeStatusCore: runtimeStatusCore,
  runtimeListCore: runtimeListCore,
  runtimeDoctorCore: runtimeDoctorCore,
  runtimeEnsureForManagedTask: runtimeEnsureForManagedTask,
  runtimeRestartManagedServer: runtimeRestartManagedServer,
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
  runEmbeddingPlugin: runEmbeddingPlugin,
  cosineSimilarity: cosineSimilarity,
  embeddingCandidates: embeddingCandidates,
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
  revokeOwnerKeyCache: revokeOwnerKeyCache,
  getOwnerKeyFor: getOwnerKeyFor,
  keyListCore: keyListCore,
  migrationRequiredInfo: migrationRequiredInfo,
  migrationReminderText: migrationReminderText,
  encryptMemoryText: encryptMemoryText,
  decryptMemoryText: decryptMemoryText,
  readMemoryText: readMemoryText,
  writeMemoryText: writeMemoryText,
  loadOwnerIndex: loadOwnerIndex,
  saveOwnerIndex: saveOwnerIndex,
  viewEntriesCore: viewEntriesCore,
  viewHtml: viewHtml,
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
  keyBindCore: keyBindCore,
  keyRevokeCore: keyRevokeCore,
  keyClaimCore: keyClaimCore,
  keyStatusCore: keyStatusCore,
  writeAgentBinding: writeAgentBinding,
  unwrapAgentBinding: unwrapAgentBinding,
  writePendingAgentKey: writePendingAgentKey,
  removePendingAgentKey: removePendingAgentKey,
  readPendingAgentKey: readPendingAgentKey,
  agentKeyFilePath: agentKeyFilePath,
  setRuntimeAgent: setRuntimeAgent,
  promptPassword: promptPassword,
  initCore: initCore,
  backupCreateCore: backupCreateCore,
  listBackupVolumesCore: listBackupVolumesCore,
  backupSetupCore: backupSetupCore,
  backupStatusCore: backupStatusCore,
  backupEnsureDailyCore: backupEnsureDailyCore,
  backupHealthCore: backupHealthCore,
  doctorCore: doctorCore,
  destructiveGuardCore: destructiveGuardCore,
  backupWindowsTaskXml: backupWindowsTaskXml,
  backupSystemdServiceContent: backupSystemdServiceContent,
  backupSystemdTimerContent: backupSystemdTimerContent,
  backupCronLine: backupCronLine,
  backupLaunchdPlist: backupLaunchdPlist,
  backupScheduleEnableCore: backupScheduleEnableCore,
  backupScheduleDisableCore: backupScheduleDisableCore,
  backupScheduleStatusCore: backupScheduleStatusCore,
  backupFallbackCommand: backupFallbackCommand,
  backupListCore: backupListCore,
  backupDoctorCore: backupDoctorCore,
  backupRestoreCore: backupRestoreCore,
  backupDrillCore: backupDrillCore,
  memoryRootId: memoryRootId,
  viewServerCore: viewServerCore,

};
