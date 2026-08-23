#!/usr/bin/env node
// yotta-memory: 文件式跨智能体记忆 CLI（零依赖）
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '0.1.0';
const TYPES = ['FACT', 'PREF', 'BOUND', 'COMMIT'];
const TYPE_DIRS = { FACT: 'facts', PREF: 'prefs', BOUND: 'bounds', COMMIT: 'commits' };
const ARCHIVE_DIR = '.archive';

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
function typeDir(type) {
  const t = String(type).toUpperCase();
  if (!TYPE_DIRS[t]) {
    console.error('未知记忆类型: ' + type + '（可用: ' + TYPES.join(' / ') + '）');
    process.exit(2);
  }
  return TYPE_DIRS[t];
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
function ensureInit(root) {
  fs.mkdirSync(path.join(root, 'facts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'prefs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bounds'), { recursive: true });
  fs.mkdirSync(path.join(root, 'commits'), { recursive: true });
  fs.mkdirSync(path.join(root, ARCHIVE_DIR), { recursive: true });
  const readme = path.join(root, 'README.md');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# yotta-memory 记忆库\n\n文件式跨智能体记忆协议存储目录。结构：facts/ prefs/ bounds/ commits/ .archive/。\n', 'utf8');
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

function cmdInit(opts) {
  const root = opts.project ? projectRoot() : userRoot();
  ensureInit(root);
  console.log('已初始化记忆库: ' + root);
}

function cmdRemember(type, subject, statement) {
  const root = userRoot();
  ensureInit(root);
  const t = String(type).toUpperCase();
  const dir = path.join(root, typeDir(t));
  const stmt = String(statement || '').trim();
  const subj = String(subject || '').trim();
  if (!stmt) { console.error('statement 不能为空'); process.exit(2); }
  if (!subj) { console.error('subject 不能为空'); process.exit(2); }
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const parsed = parseFrontmatter(fs.readFileSync(fp, 'utf8'));
      const meta = parsed.meta;
      if ((meta.type || '').toUpperCase() === t && meta.subject === subj && meta.statement === stmt) {
        const txt = fs.readFileSync(fp, 'utf8');
        fs.writeFileSync(fp, txt.replace(/^updated:.*$/m, 'updated: ' + today()), 'utf8');
        console.log('已更新: ' + fp);
        return;
      }
    }
  }
  const seq = nextSeq(dir);
  const file = path.join(dir, today() + '-' + seq + '.md');
  const content = [
    '---',
    'type: ' + t,
    'subject: "' + escapeYaml(subj) + '"',
    'statement: "' + escapeYaml(stmt) + '"',
    'confidence: 1.0',
    'created: ' + today(),
    'updated: ' + today(),
    'tags: []',
    'immutable: false',
    '---',
    '',
    stmt,
    '',
  ].join('\n');
  fs.writeFileSync(file, content, 'utf8');
  console.log('已记录: ' + file);
}

function cmdRecall(query, opts) {
  const roots = [projectRoot(), userRoot()].filter((r) => fs.existsSync(r));
  if (!roots.length) {
    console.log('记忆库不存在，请先运行: yotta-memory init');
    return;
  }
  const limit = opts.limit || 50;
  const onlyType = opts.type ? String(opts.type).toUpperCase() : null;
  const q = query ? String(query).toLowerCase() : null;
  const hits = [];
  for (const root of roots) {
    for (const t of Object.keys(TYPE_DIRS)) {
      const dir = path.join(root, TYPE_DIRS[t]);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (!fs.statSync(fp).isFile()) continue;
        const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
        if (onlyType && (meta.type || '').toUpperCase() !== onlyType) continue;
        if (q) {
          const hay = ((meta.subject || '') + ' ' + (meta.statement || '') + ' ' + (meta.tags || '')).toLowerCase();
          if (hay.indexOf(q) === -1) continue;
        }
        hits.push({ type: meta.type || t, subject: meta.subject || '', statement: meta.statement || '', file: fp, created: meta.created || '' });
      }
    }
  }
  hits.sort(function (a, b) {
    const pa = a.file.indexOf(projectRoot()) === 0 ? 0 : 1;
    const pb = b.file.indexOf(projectRoot()) === 0 ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(b.created).localeCompare(String(a.created));
  });
  const shown = hits.slice(0, limit);
  if (!shown.length) { console.log('无匹配记忆。'); return; }
  console.log('共 ' + shown.length + ' 条记忆（' + (hits.length > limit ? '前 ' + limit + ' 条' : '全部') + '）：');
  for (const h of shown) {
    console.log('[' + h.type + '] ' + h.subject + ': ' + h.statement);
    console.log('  ' + h.file);
  }
}

function cmdForget(fileRef) {
  const roots = [projectRoot(), userRoot()].filter((r) => fs.existsSync(r));
  let target = null;
  for (const root of roots) {
    for (const t of Object.keys(TYPE_DIRS)) {
      const dir = path.join(root, TYPE_DIRS[t]);
      if (!fs.existsSync(dir)) continue;
      const cand = path.join(dir, fileRef);
      if (fs.existsSync(cand)) { target = cand; break; }
      if (fs.existsSync(path.join(dir, path.basename(fileRef)))) { target = path.join(dir, path.basename(fileRef)); break; }
    }
    if (target) break;
  }
  if (!target) { console.error('未找到记忆文件: ' + fileRef); process.exit(2); }
  fs.unlinkSync(target);
  console.log('已删除: ' + target);
}

function cmdArchive(opts) {
  const days = opts.days || 180;
  const root = userRoot();
  if (!fs.existsSync(root)) { console.log('记忆库不存在。'); return; }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let moved = 0;
  for (const t of Object.keys(TYPE_DIRS)) {
    const dir = path.join(root, TYPE_DIRS[t]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const meta = parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta;
      if (meta.immutable === 'true') continue;
      if (!meta.created) continue;
      const ts = new Date(meta.created).getTime();
      if (isNaN(ts)) continue;
      if (ts < cutoff) {
        const destDir = path.join(root, ARCHIVE_DIR, TYPE_DIRS[t]);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(fp, path.join(destDir, f));
        moved++;
      }
    }
  }
  console.log('已归档 ' + moved + ' 条旧记忆到 ' + path.join(root, ARCHIVE_DIR));
}

function collectAll(root) {
  const out = [];
  for (const t of Object.keys(TYPE_DIRS)) {
    const dir = path.join(root, TYPE_DIRS[t]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (!fs.statSync(fp).isFile()) continue;
      out.push({ file: path.relative(root, fp), meta: parseFrontmatter(fs.readFileSync(fp, 'utf8')).meta });
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
    const content = [
      '---',
      'type: ' + t,
      'subject: "' + escapeYaml(meta.subject || '') + '"',
      'statement: "' + escapeYaml(meta.statement || '') + '"',
      'confidence: ' + (meta.confidence || 1.0),
      'created: ' + (meta.created || today()),
      'updated: ' + (meta.updated || today()),
      'tags: ' + (meta.tags || '[]'),
      'immutable: ' + (meta.immutable || 'false'),
      '---',
      '',
      meta.statement || '',
      '',
    ].join('\n');
    fs.writeFileSync(file, content, 'utf8');
    n++;
  }
  console.log('已导入 ' + n + ' 条记忆 -> ' + root);
}

function usage() {
  console.log([
    'yotta-memory v' + VERSION + ' — 文件式跨智能体记忆',
    '',
    '用法:',
    '  yotta-memory init [--project]             初始化记忆库（默认用户级 ~/.yottamemory）',
    '  yotta-memory remember <type> <subject> <statement>   写入记忆',
    '  yotta-memory recall [关键词] [--type T] [--limit N]  检索记忆（项目级优先）',
    '  yotta-memory forget <文件或文件名>         删除一条记忆',
    '  yotta-memory archive [--days 180]         归档超过 N 天且非 immutable 的旧记忆',
    '  yotta-memory export [--out 文件.json]      导出全部记忆',
    '  yotta-memory import <文件.json>            导入记忆',
    '  yotta-memory --version                    版本',
    '',
    '类型: FACT(公共共享) / PREF(偏好) / BOUND(边界) / COMMIT(承诺)',
    '环境变量: YOTTA_MEMORY_HOME 可覆盖用户级记忆库目录',
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
  const valueOpts = new Set(['--type', '--limit', '--days', '--out']);
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--project') opts.project = true;
    else if (valueOpts.has(a)) {
      const v = args[++i];
      if (a === '--type') opts.type = v;
      else if (a === '--limit') opts.limit = parseInt(v, 10) || 50;
      else if (a === '--days') opts.days = parseInt(v, 10) || 180;
      else if (a === '--out') opts.out = v;
    } else if (a.startsWith('--')) {
      console.error('未知选项: ' + a);
      process.exit(2);
    } else {
      positional.push(a);
    }
  }
  switch (first) {
    case 'init': cmdInit(opts); break;
    case 'remember': cmdRemember(positional[0], positional[1], positional[2]); break;
    case 'recall': cmdRecall(positional[0] || null, opts); break;
    case 'forget': cmdForget(positional[0]); break;
    case 'archive': cmdArchive(opts); break;
    case 'export': cmdExport(opts.out); break;
    case 'import': cmdImport(positional[0]); break;
    default:
      console.error('未知命令: ' + first);
      usage();
      process.exit(2);
  }
}

main();