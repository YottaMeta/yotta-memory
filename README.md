# 元忆（yotta-memory）

> 元忆 —— 有权限边界的文件式智能体记忆。文件式、零依赖、可 diff / 回滚；FACT 共享、PREF / BOUND / COMMIT 私密隔离——谁该读、谁不该读，由机制而非 AI 自觉决定。

## 这是什么

- **文件式记忆标准**：记忆 = Markdown + YAML frontmatter 文件，git 可版本化，任何智能体可读，数据主权在用户本地。
- **零依赖**：无 daemon / 无数据库 / 无向量库，Node.js 自带即可运行。
- **类型体系**：FACT（事实，公共共享）/ PREF（偏好）/ BOUND（边界）/ COMMIT（承诺）——后三者私密、per-agent 隔离。
- **双级存储**：用户级 ~/.yottamemory/ + 项目级 .yottamemory/。
- **有权限边界**：FACT 进公共区共享；PREF / BOUND / COMMIT 进私密区、按 agent 隔离；读取按 scope/owner 分区，默认只返当前 agent 可读项。

适用场景：跨会话续测、个人偏好与边界沉淀、多智能体协作、项目交接、收工归档。

## 安装

三种方式任选其一，技能文件统一从 **npm** 获取（GitHub 无代理时较慢，npm 可配国内镜像加速）。

### 方式一：npx skills（推荐，生态标准入口）
```bash
npx skills add YottaMeta/yotta-memory
```
> 自动安装到已检测到的智能体（Claude Code / Codex / Cursor / OpenCode 等 78+ 智能体）。

### 方式二：npm 直接安装（CLI + 技能）
```bash
# 国内加速（可选）：npm config set registry https://registry.npmmirror.com
npm install -g @yottameta/yotta-memory
yotta-memory init            # 初始化记忆库
# 若要把技能文件装进某个智能体的 skills 目录：
npx -y @yottameta/yotta-memory-install -g
npx -y @yottameta/yotta-memory-install --agent codex
```

### 方式三：install.sh / 手动复制
获取技能文件夹后（`npm pack` 解包或 `git clone`），进入技能文件夹：
```bash
bash install.sh -g                 # 用户级；bash install.sh --list 查看全部目录
bash install.sh --agent codex      # 指定智能体
bash install.sh --dir /path/to/skills
```
也可把整个 `yotta-memory` 文件夹复制到目标智能体的 skills 目录（常见位置见 install.sh --list）。

## CLI 用法

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project]` | 初始化记忆库（默认用户级 `~/.yottamemory/`）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>]` | 写入记忆（同 subject+statement 自动更新；--owner 标注归属）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all]` | 检索记忆（索引+TF 打分，读取分区过滤；项目级优先）|
| `yotta-memory forget <文件>` | 删除一条记忆（按类型目录路径或文件名）|
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆（盖棺分+年龄，immutable 除外）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |

类型：`FACT`（事实，公共共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺）。

示例：
```bash
yotta-memory init
yotta-memory remember PREF 用户 偏好短回复，不要用表情
yotta-memory recall 偏好
yotta-memory recall --type FACT --limit 10
```

## 智能体接入后怎么用

把技能装进智能体后，SKILL.md 会自动教会智能体：开工 `recall` 恢复上下文 → 重要信息 `remember` 落盘 → 收工归档。也可在对话中直接说「记住 XXX」「上次说到哪了」。

## 开发与校验

本项目内运行：`python tools/validate-skill.py yotta-memory`。

## 许可证

MIT © YottaMeta —— 详见 [LICENSE](./LICENSE)。