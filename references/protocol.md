# yotta-memory 协议规范 v0.5.4

> 本文件定义 yotta-memory 记忆标准：存储位置、目录结构、文件格式、类型体系与 CLI 命令参考。
> 目标：任何支持 Agent Skills 开放标准的智能体，装完即可读写同一份记忆。

## 1. 存储位置

| 级别 | 默认路径 | 覆盖方式 | 用途 |
|---|---|---|---|
| 用户级 | `~/.yottamemory/` | 环境变量 `YOTTA_MEMORY_HOME` | 跨项目个人记忆 |
| 项目级 | `<repo>/.yottamemory/` | `yotta-memory init --project` | 随项目提交，团队共享 |

- recall 时项目级优先，其次用户级；写入默认用户级（`remember` 不指定级别）。
- 项目级记忆随 git 提交，适合团队共享的 FACT 与项目级 BOUND。

## 2. 目录结构

```
<root>/
├── facts/                  # FACT 事实（公共可共享）
├── private/                # 私密区（按 owner 物理分目录）
│   └── <owner>/            # 每个智能体一个子目录
│       ├── prefs/          # PREF 偏好（该 owner 私密）
│       ├── bounds/         # BOUND 边界（该 owner 私密）
│       └── commits/        # COMMIT 承诺（该 owner 私密）
├── .archive/               # 归档区（archive 命令移入）
├── index.json              # 反向索引 + TF 打分（见下方说明）
├── agents.json             # 智能体身份登记表（iam 写入，唯一性强制）
└── README.md               # 记忆库说明
```

> **`index.json` 说明**：条目内的 `tokens` 字段是中文分词的「词频表」，供 recall 的 TF 打分使用，**不是**访问令牌。真正的访问令牌由 `token` 命令生成，存放在 `<root>/.server/tokens.json`，仅在局域网 `serve` 模式下用于请求鉴权。

> **目录结构（v0.5.0）**：私密记忆按 `owner` 物理分目录存放于 `private/<owner>/<type>/`。旧版根下平铺的 `prefs/` `bounds/` `commits/` 会在 `reindex`（或首次 recall 建索引）时按 frontmatter `owner` 自动迁移到 `private/<owner>/<type>/`。**AI 读写红线**：记忆读写一律走 `yotta-memory` CLI / MCP 工具；禁止用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读改记忆库目录下的文件——否则会绕过 `scope/owner` 权限边界，读到其它智能体的私密内容。

## 2.5 智能体身份（谁在写 / 谁在读）

- **agent ID 必须全局唯一**：`iam <id>` 写入 `agents.json`（记忆库根目录），唯一性强制——ID 已被其它主机 / 来源（含远端 token 登记）占用则拒绝，确认是同一智能体才 `--force`。
- **当次身份声明**：`whoami` / MCP `agent_info` 读「当次声明身份」——本机 `YOTTA_AGENT_ID`（stdio 由 MCP 配置 `env` 注入，CLI 用 `--agent`/环境变量）；远端 `X-Agent-Id` 请求头（经 token 绑定校验）。不猜不默认。
- **自我档案**：`iam` 自动写一条 PREF `subject=自我接入档案`（owner=自己），statement 为 `; ` 分隔的 key:value——`agent_id / host / memory_home / mcp_mode(stdio|http) / engine_url(仅远端) / token(仅远端；本机不存 token)`。
- **私密记忆必须有 owner**：PREF / BOUND / COMMIT 写入时未声明身份（owner 空）直接拒绝（公共 FACT 不受影响），从机制上防止「抄别人的 ID」。

## 3. 文件格式

每个记忆一条独立 `.md` 文件，文件名 `<YYYY-MM-DD>-<NNNN>.md`（NNNN 为当日序号）：

```markdown
---
type: FACT
subject: "用户"
statement: "用户偏好短回复"
confidence: 1.0
created: 2026-08-23
updated: 2026-08-23
tags: []
immutable: false
---

用户偏好短回复
```

### frontmatter 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `type` | 是 | `FACT` / `PREF` / `BOUND` / `COMMIT` |
| `subject` | 是 | 记忆主体（人 / 项目 / 系统）|
| `statement` | 是 | 记忆内容 |
| `confidence` | 否 | 置信度 0-1，默认 1.0 |
| `created` | 是 | 创建日期 `YYYY-MM-DD` |
| `updated` | 是 | 最近更新日期 |
| `tags` | 否 | 标签数组 |
| `immutable` | 否 | `true` 时 archive 不移动（用户级硬事实）|
| `scope` | 否 | `public` / `private`，默认按类型（FACT=public，其余 private）|
| `owner` | 否 | 归属 agent id，默认空；private+owner 非空默认仅供该 owner agent 读取，其它 agent 越界读需 grant 授权、identity=user 或 `--unsafe` |
| `access_count` | 否 | 命中次数，recall 命中展示集时 +1 |
| `last_accessed` | 否 | 最近访问日期 `YYYY-MM-DD` |

## 4. 类型体系

| 类型 | 含义 | 可见性 |
|---|---|---|
| `FACT` | 客观事实 / 知识 / 经验 | 公共，可共享给所有智能体 |
| `PREF` | 用户偏好 / 习惯 | 私密，per-agent 隔离 |
| `BOUND` | 边界 / 规则 / 底线 | 私密，不可违反 |
| `COMMIT` | 承诺 / 约定 | 私密 |

- 写入纪律：公共事实用 FACT；涉及用户偏好 / 边界 / 承诺一律用私密类型，避免公共区泄露。
- 多智能体协作：每个智能体只读自己的私密区（如 `private/<owner>/<type>/` 可自行约定），公共 FACT 共享。

## 隔离说明

> 隔离说明：scope: private 保证的是"AI 之间的语义隔离"——其他智能体在正常 recall 会话中不会被搜到、也不会主动去读本条私密记忆。但它不是文件系统级机密保护：在你自己的机器上，作为所有者你有权看到任何记忆文件，数据主权在你。本工具不承诺对抗同权限的本地进程主动读取。

> **`--agent` 语义**：`--agent <其它agent>` 仅作身份声明 / 展示用（以该身份检索或模拟），并不授予跨智能体私密读取——读取其它智能体私密仍需满足 grant / identity=user / `--unsafe` 任一授权。

读分区边界（recall 三态）：

| 目标 | 行为 |
|---|---|
| 公共 FACT | 始终可读 |
| 当前 agent 自己的 private | 始终可读 |
| 其它 agent 的 private | 默认拒绝（不返回内容）；需满足任一授权：① `grants.json` 显式授权记录 ② identity=user（`--agent user` / `--owner user` / `YOTTA_AGENT_ID=user`）③ 显式 `--unsafe` |

> **默认隔离行为（recall）**：不带 `--all` / `--owner <其它agent>` 时（即默认 recall），遇其它 agent 私密记忆**静默跳过**，不输出任何「有私密被拒」提示、也不报错（exit 0），不泄露私密存在性；仅当**显式跨智能体读取**（`--all` 或 `--owner <其它agent>`，且非 user/自身）且无授权命中时，才报错/警告：无可读命中 → 「检测到 N 条越界访问已被拒绝」+ exit 3；有可读命中 → 正常展示 + 追加警告。

授权记录格式（`<root>/grants.json`）：`{ "<userAgent>": ["<ownerAgent>", ...] }`，表示 userAgent 可读 ownerAgent 的私密记忆。

## 5. CLI 命令参考

| 命令 | 行为 |
|---|---|
| `init [--project]` | 创建目录结构；默认用户级，`--project` 建项目级 |
| `remember <type> <subject> <statement> [--owner <id>]` | 写入；同 subject+statement 已存在则只更新 `updated`；`--owner` 标注归属 |
| `recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 索引+TF 打分匹配；读取分区过滤；越界（读其它智能体私密）默认拒绝，需 grant / identity=user / `--unsafe` 授权；项目级优先；默认 50 条 |
| `forget <文件>` | 删除（按路径或文件名）|
| `archive [--days 180] [--threshold 0.4]` | 按盖棺分+年龄移入 `.archive/`（`vitality < threshold` 且超过 N 天）|
| `reindex` | 全量扫描重建 `index.json`（手动改 .md 后校正）|
| `export [--out f.json]` | 导出全部记忆为 JSON |
| `import <f.json>` | 从 JSON 导入（幂等）|

### 去重与更新

- remember 时若同 `type + subject + statement` 已存在，仅刷新 `updated`，不产生重复文件。
- 修改内容：先 `recall` 定位文件，再 `forget` + 重新 `remember`，或直接编辑文件。

## 6. 与其他系统互操作

- **git**：整个记忆库可纳入版本控制，回滚 / 审计 / 团队同步。
- **灵魂盘（Soul Framework）**：类型体系同源（FACT/PREF/BOUND/COMMIT）；`export` 出的 JSON 可作迁移中间格式。
- **Agent Skills 标准**：本技能 SKILL.md 符合 agentskills.io 开放标准，支持 npx skills 安装。