#!/usr/bin/env bash
# yotta-memory 多智能体安装脚本（YottaSkills 模板）
# 用法:
#   bash install.sh --agent <name>  # 按智能体默认用户级目录安装
#   bash install.sh --dir <path>    # 装到指定目录（用户改过目录的智能体）
#   bash install.sh -g              # 装到全部已知智能体用户级目录
#   bash install.sh                  # 检测并安装到已存在的项目级目录
#   bash install.sh --list          # 列出智能体 -> 默认目录
set -euo pipefail

SKILL_NAME="yotta-memory"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$(uname -s)" in
  MINGW*|MSYS*)
    SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
    ;;
esac

# 智能体 -> 用户级默认目录（--agent 装到第一个）
# .agents/skills 并非通用目录：OpenCode / Cursor / Cline / Amp / Kimi / Gemini CLI / GitHub Copilot 读取。
# 判断当前环境：Windows Git Bash 用 %USERPROFILE%，Unix 用 ~
_IS_WINDOWS=0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) _IS_WINDOWS=1 ;;
esac
dirs_for() {
  case "$1" in
    claude)     echo ".claude/skills" ;;
    cursor)     echo ".cursor/skills .agents/skills" ;;
    codex)      echo "__CODEX__" ;;
    gemini)     echo ".gemini/skills .agents/skills" ;;
    goose)      echo ".config/goose/skills .agents/skills" ;;
    amp)        echo ".config/agents/skills .agents/skills" ;;
    opencode)   echo "__OPENCODE__" ;;
    windsurf)   echo ".codeium/windsurf/skills" ;;
    workbuddy)  echo ".workbuddy/skills" ;;
    kiro)       echo ".kiro/skills" ;;
    trae)       echo ".traecli/skills" ;;
    trae-cn)    echo ".trae-cn/skills" ;;
    qwen)       echo ".qwen/skills" ;;
    comate)     echo ".comate/skills" ;;
    codebuddy)  echo ".codebuddy/skills" ;;
    kimi)       echo ".kimi/skills" ;;
    agents)     echo ".agents/skills" ;;
    *)          return 1 ;;
  esac
}

codex_dir() {
  if [ -n "${CODEX_HOME:-}" ]; then printf '%s' "$CODEX_HOME/skills"; else printf '%s' "$HOME/.codex/skills"; fi
}
opencode_dir() {
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then printf '%s' "$XDG_CONFIG_HOME/opencode/skills"; else printf '%s' "$HOME/.config/opencode/skills"; fi
}
resolve_user() {
  case "$1" in
    __CODEX__)    codex_dir ;;
    __OPENCODE__) opencode_dir ;;
    *)            printf '%s' "$HOME/$1" ;;
  esac
}

install_to() {
  mkdir -p "$1/$SKILL_NAME"
  cp -r "$SOURCE_DIR/." "$1/$SKILL_NAME/"
  rm -rf "$1/$SKILL_NAME/.git"
  echo "installed -> $1/$SKILL_NAME"
}

list() {
  echo "智能体 -> 默认技能目录（--agent <name> 装到第一个，用户级）:"
  for a in claude cursor codex gemini goose amp opencode windsurf workbuddy kiro trae trae-cn qwen comate codebuddy kimi agents; do
    local dirs first
    dirs="$(dirs_for "$a")"
    first="${dirs%% *}"
    case "$first" in
      __CODEX__)    first=".codex/skills" ;;
      __OPENCODE__) first=".config/opencode/skills" ;;
    esac
    if [ "$_IS_WINDOWS" = "1" ]; then
      first="%USERPROFILE%\\${first//\//\\}"
    else
      first="~/$first"
    fi
    printf '  %-10s %s\n' "$a" "$first"
  done
  echo '说明：Windows 用 %USERPROFILE%，Linux/macOS 用 ~；仅收录有官方默认目录的智能体。'
  echo '改了目录的请用 --dir <路径>，不要依赖默认位置；若设置了 CODEX_HOME / XDG_CONFIG_HOME，安装自动以该变量为准。'
}

main() {
  local agent="" dir="" global=0 show_list=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --agent) shift; agent="${1:-}" ;;
      --dir)   shift; dir="${1:-}" ;;
      -g|--global) global=1 ;;
      --list|-l) show_list=1 ;;
      *) echo "未知参数: $1" >&2; exit 2 ;;
    esac
    shift
  done

  if [ "$show_list" = "1" ]; then list; return; fi
  if [ -n "$dir" ]; then install_to "$dir"; echo "完成。"; return; fi
  if [ -n "$agent" ]; then
    local dirs first
    if ! dirs="$(dirs_for "$agent")"; then
      echo "未收录智能体: $agent。请用 --dir <路径> 指定技能目录。" >&2; exit 2
    fi
    first="${dirs%% *}"
    install_to "$(resolve_user "$first")"; echo "完成。"; return
  fi
  if [ "$global" = "1" ]; then
    echo "安装到全部已知智能体用户级目录..."
    local dirs rel
    for a in claude cursor codex gemini goose amp opencode windsurf workbuddy kiro trae trae-cn qwen comate codebuddy kimi agents; do
      dirs="$(dirs_for "$a")"
      for rel in $dirs; do install_to "$(resolve_user "$rel")"; done
    done
    echo "完成。"; return
  fi
  local installed=0 d
  for d in .claude/skills .cursor/skills .codex/skills .config/goose/skills .config/agents/skills .opencode/skills .codeium/windsurf/skills .workbuddy/skills .kiro/skills .traecli/skills .gemini/skills .trae-cn/skills .qwen/skills .comate/skills .codebuddy/skills .kimi/skills .agents/skills; do
    if [ -d "$d" ]; then install_to "$d"; installed=1; fi
  done
  if [ "$installed" = "0" ]; then
    echo "未检测到项目级智能体目录。可用 --agent <name> / -g 装到用户级，或 --dir 指定。"
  fi
}

main "$@"