#!/usr/bin/env node
/**
 * yotta-memory 跨平台安装器（YottaSkills）
 * 用法:
 *   npx -y @yottameta/yotta-memory --agent <name>  # 按智能体默认用户级目录安装（推荐）
 *   npx -y @yottameta/yotta-memory --dir PATH      # 装到指定目录（用户改了目录的智能体）
 *   npx -y @yottameta/yotta-memory -g              # 安装到全部已知智能体用户级目录
 *   npx -y @yottameta/yotta-memory                 # 安装到检测到的项目级目录
 *   npx -y @yottameta/yotta-memory --list          # 列出智能体 -> 默认目录
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_NAME = 'yotta-memory';
const PKG_ROOT = path.join(__dirname, '..');

// 智能体 -> 用户级默认技能目录（dirs 按优先级排列；--agent 装到第一个）
// 依据官方文档：.agents/skills 并非通用目录，被 OpenCode / Cursor / Cline / Amp /
// Kimi / Gemini CLI / GitHub Copilot 等读取；Claude Code 与 Codex 默认不读 .agents。
const AGENT_DIRS = {
  claude:    { label: 'Claude Code',      dirs: ['.claude/skills'] },
  cursor:    { label: 'Cursor',           dirs: ['.cursor/skills', '.agents/skills'] },
  codex:     { label: 'Codex',            dirs: ['.codex/skills'] }, // 特判：$CODEX_HOME/skills
  gemini:    { label: 'Gemini CLI',       dirs: ['.gemini/skills', '.agents/skills'] },
  goose:     { label: 'Goose',            dirs: ['.config/goose/skills', '.agents/skills'] },
  amp:       { label: 'Amp',              dirs: ['.config/agents/skills', '.agents/skills'] },
  opencode:  { label: 'OpenCode',         dirs: ['.config/opencode/skills'] }, // 特判：$XDG_CONFIG_HOME
  windsurf:  { label: 'Windsurf',         dirs: ['.codeium/windsurf/skills'] },
  workbuddy: { label: 'WorkBuddy',        dirs: ['.workbuddy/skills'] },
  kiro:      { label: 'Kiro',             dirs: ['.kiro/skills'] },
  trae:      { label: 'Trae Code CLI',    dirs: ['.traecli/skills'] },
  'trae-cn': { label: 'Trae IDE（国内）',  dirs: ['.trae-cn/skills'] },
  qwen:      { label: 'Qwen Code',        dirs: ['.qwen/skills'] },
  comate:    { label: 'Comate 文心快码',   dirs: ['.comate/skills'] },
  codebuddy: { label: 'CodeBuddy Code',   dirs: ['.codebuddy/skills'] },
  kimi:      { label: 'Kimi Code CLI',    dirs: ['.kimi/skills'] },
  agents:    { label: '通用 AGENTS.md',    dirs: ['.agents/skills'] },
};

// Codex 用户级目录特判：优先 $CODEX_HOME/skills，否则 ~/.codex/skills
function codexUserDir() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(base, 'skills');
}

// OpenCode 用户级目录特判：优先 $XDG_CONFIG_HOME/opencode/skills，否则 ~/.config/opencode/skills
function opencodeUserDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'opencode', 'skills');
}

function resolveUserDir(rel) {
  if (rel === '.codex/skills') return codexUserDir();
  if (rel === '.config/opencode/skills') return opencodeUserDir();
  return path.join(os.homedir(), rel);
}

function installTo(dest) {
  const target = path.join(dest, SKILL_NAME);
  fs.mkdirSync(target, { recursive: true });
  copyDir(PKG_ROOT, target, new Set(['package.json', 'bin', 'node_modules', '.git']));
  console.log('installed -> ' + target);
}

function copyDir(src, dst, skip) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d, skip);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function displayDir(rel) {
  if (process.platform === 'win32') return '%USERPROFILE%\\' + rel.replace(/\//g, '\\');
  return '~/' + rel;
}

function main() {
  const args = process.argv.slice(2);
  const isGlobal = args.includes('-g') || args.includes('--global');
  const list = args.includes('--list') || args.includes('-l');
  let explicitDir = null;
  const di = args.indexOf('--dir');
  if (di !== -1 && args[di + 1]) explicitDir = args[di + 1];
  let agent = null;
  const ai = args.indexOf('--agent');
  if (ai !== -1 && args[ai + 1]) agent = String(args[ai + 1]).toLowerCase();

  if (list) {
    console.log('智能体 -> 默认技能目录（--agent <name> 装到第一个，用户级）:');
    for (const [key, v] of Object.entries(AGENT_DIRS)) {
      const resolved = v.dirs.map(displayDir);
      console.log('  ' + key.padEnd(10) + v.label.padEnd(18) + resolved.join('、'));
    }
    console.log('\n说明：Windows 用 %USERPROFILE%，Linux/macOS 用 ~；仅收录有官方默认目录的智能体。');
    console.log('改了目录的请用 --dir <路径>，不要依赖默认位置；若设置了 CODEX_HOME / XDG_CONFIG_HOME，安装自动以该变量为准。');
    return;
  }

  if (explicitDir) { installTo(explicitDir); return; }

  if (agent) {
    const info = AGENT_DIRS[agent];
    if (!info) {
      console.log('未收录智能体: ' + agent + '。请用 --dir <路径> 指定技能目录。');
      console.log('可用: ' + Object.keys(AGENT_DIRS).join(', '));
      return;
    }
    installTo(resolveUserDir(info.dirs[0]));
    console.log('完成。');
    return;
  }

  if (isGlobal) {
    const seen = new Set();
    for (const v of Object.values(AGENT_DIRS)) {
      for (const d of v.dirs) {
        if (seen.has(d)) continue;
        seen.add(d);
        installTo(resolveUserDir(d));
      }
    }
    console.log('完成。');
    return;
  }

  const PROJECT_DIRS = [
    '.claude/skills',
    '.cursor/skills',
    '.codex/skills',
    '.config/goose/skills',
    '.config/agents/skills',
    '.opencode/skills',
    '.codeium/windsurf/skills',
    '.workbuddy/skills',
    '.kiro/skills',
    '.traecli/skills',
    '.gemini/skills',
    '.trae-cn/skills',
    '.qwen/skills',
    '.comate/skills',
    '.codebuddy/skills',
    '.kimi/skills',
    '.agents/skills',
  ];
  let installedAny = false;
  for (const d of PROJECT_DIRS) {
    if (fs.existsSync(d)) { installTo(d); installedAny = true; }
  }
  if (!installedAny) {
    console.log('未检测到项目级智能体目录。可手动复制，或用 --agent <name> / -g 装到用户级。');
  }
}

main();