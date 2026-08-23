---
name: yotta-memory
description: "元忆 —— 有权限边界的文件式智能体记忆。文件式、零依赖、可 diff/回滚：让任何 AI 智能体活过会话，开工 recall 恢复上下文、重要信息 remember 落盘、收工归档。类型体系 FACT（公共共享）/ PREF / BOUND / COMMIT（私密隔离）。触发：记住、别忘了、记一笔、记忆、remember、recall、跨会话、上次说到、续测、交接、归档"
version: 0.2.11
license: MIT
---

# yotta-memory（元忆）— 有权限边界的文件式智能体记忆

> 一句话：元忆 —— 有权限边界的文件式智能体记忆（不注入、可 diff、能回滚；FACT 共享、PREF / BOUND / COMMIT 私密隔离）。
> 版本：0.2.11 | 最后更新：2026-08-23

## 这是什么

- **文件式记忆标准**：记忆 = Markdown + YAML frontmatter 文件，git 可版本化，任何智能体可读，数据主权在用户本地。
- **零依赖**：无 daemon / 无数据库 / 无向量库，Node.js 自带即可运行。
- **类型体系**：FACT（事实，公共共享）/ PREF（偏好，私密）/ BOUND（边界，私密）/ COMMIT（承诺，私密）。
- **双级存储**：用户级 `~/.yottamemory/`（跨项目）+ 项目级 `.yottamemory/`（随项目共享）。

## 何时使用（触发）

- 用户说「记住」「别忘了」「记一笔」等保存类指令。
- 会话开始需要恢复上下文（跨会话 / 跨项目 / 续测）。
- 收工时需要留交接与归档。
- 多智能体协作时，公共事实进 FACT，个人偏好 / 边界 / 承诺进各自私密区。

## 核心流程

1. **开工定向**：运行 `yotta-memory recall`（可带关键词）恢复上下文；项目级记忆优先，其次用户级。
2. **进行中落盘**：重要信息立即 `yotta-memory remember <type> <subject> <statement>`，不攒到收工。
3. **收工归档**：写会话小结（COMMIT / 笔记），旧记录定期 `yotta-memory archive`。
4. **多智能体纪律**：FACT 写入公共区，PREF / BOUND / COMMIT 只写本智能体私密区；不读取其他智能体私密区。

## CLI 速查

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project]` | 初始化记忆库（默认用户级）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>]` | 写入（同 subject+statement 自动更新；--owner 标注归属，默认取 agent id）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 检索（索引+TF 打分，读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；项目级优先）|
| `yotta-memory forget <文件>` | 删除（按类型目录路径或文件名）|
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆（盖棺分+年龄，immutable 除外）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |

## 存储格式（摘要）

`<YYYY-MM-DD>-<NNNN>.md`，frontmatter 含 `type / subject / statement / confidence / created / updated / tags / immutable / scope / owner / access_count / last_accessed`；正文为记忆内容。顶层另有 `index.json`（反向索引 + TF 打分）。

## 渐进披露

- 协议细节、目录结构与类型规则见 `references/protocol.md`，需要时读取，不要每次全读。