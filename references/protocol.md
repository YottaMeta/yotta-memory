# yotta-memory 协议规范 v0.8.1

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
│       ├── commits/        # COMMIT 承诺（该 owner 私密）
│       ├── distills/       # 心理日志蒸馏产物（v0.8.0：distill 命令生成，私密）
│       └── profile.md      # 用户画像（profile 命令生成，零推断，可再生成）
├── .archive/               # 归档区（archive 命令移入）
├── index.json              # 公共 FACT 索引 + TF 打分（加密库只含公共条目）
├── keys/                   # 加密库密钥库（v0.7）：salt / <owner>.key.enc(UMK 包裹) / <owner>.key.recovery(恢复钥匙包裹) / recovery.key.enc / cache/<id>.key(授权缓存 600)
├── agents.json             # 智能体身份登记表（iam 写入，唯一性强制）
└── README.md               # 记忆库说明
```

> **`index.json` 说明**：条目内的 `tokens` 字段是中文分词的「词频表」（v0.8.0 起含字段加权与拼音 token），供 recall 的 TF 打分 / 语义检索使用，**不是**访问令牌。真正的访问令牌由 `token` 命令生成，存放在 `<root>/.server/tokens.json`，仅在局域网 `serve` 模式下用于请求鉴权。v0.8.1 起索引 version=4（公共索引超过 5000 条按年份分片 `index-<year>.json`），旧索引首次 recall 自动重建。

> **目录结构（v0.5.0）**：私密记忆按 `owner` 物理分目录存放于 `private/<owner>/<type>/`。旧版根下平铺的 `prefs/` `bounds/` `commits/` 会在 `reindex`（或首次 recall 建索引）时按 frontmatter `owner` 自动迁移到 `private/<owner>/<type>/`。**AI 读写红线**：记忆读写一律走 `yotta-memory` CLI / MCP 工具；禁止用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读改记忆库目录下的文件——否则会绕过 `scope/owner` 权限边界，读到其它智能体的私密内容。

## 2.5 智能体身份（谁在写 / 谁在读）

- **agent ID 必须全局唯一**：`iam <id>` 写入 `agents.json`（记忆库根目录），唯一性强制——ID 已被其它主机 / 来源（含远端 token 登记）占用则拒绝，确认是同一智能体才 `--force`。
- **当次身份声明**：`whoami` / MCP `agent_info` 读「当次声明身份」——本机 `YOTTA_AGENT_ID`（stdio 由 MCP 配置 `env` 注入，CLI 用 `--agent`/环境变量）；远端 `X-Agent-Id` 请求头（经 token 绑定校验）。不猜不默认。
- **自我档案**：`iam` 自动写一条 PREF `subject=自我接入档案`（owner=自己），statement 为 `; ` 分隔的 key:value——`agent_id / host / memory_home / mcp_mode(stdio|http) / engine_url(仅远端) / token(仅远端；本机不存 token)`，可含 `agent_name / user_name / relationship`（`iam --name/--user/--relationship` 写入）。
- **私密记忆必须有 owner**：PREF / BOUND / COMMIT 写入时未声明身份（owner 空）直接拒绝（公共 FACT 不受影响），从机制上防止「抄别人的 ID」。

## 3. 文件格式

每个记忆一条独立 `.md` 文件，文件名 `<YYYY-MM-DD>-<NNNN>.md`（NNNN 为当日序号）；**加密库（v0.7）私密文件为 `<YYYY-MM-DD>-<NNNN>.md.enc`（头 `YTMENC1`）**，公开 FACT 仍为明文 `.md`：

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
| `source` | 否 | 记录来源（如 `对话` / `推断`），`remember --source` 写入 |
| `weight` | 否 | 重要性权重（默认 1.0，>1 提权 / <1 降权），去重时取 max |
| `access_count` | 否 | 命中次数，recall 命中展示集时 +1 |
| `last_accessed` | 否 | 最近访问日期 `YYYY-MM-DD` |
| `feedback_net` | 否 | v0.8.0 净反馈计数（useful +1 / useless −1），`feedback` 命令写入，参与统一效用分 |

## 3.5 加密格式（v0.7，私密区机制层机密保护）

> 公共 FACT 明文；私密区（prefs/bounds/commits + profile）文件级加密。用户是数据所有者，天然可解全部；不承诺对抗同一 OS 用户下的恶意进程。

### 密钥体系（信封加密，零依赖，Node 内置 crypto）
- **UMK（用户主密钥）**：主口令 PBKDF2-SHA256（600000 次迭代 + 随机 16B 盐，盐存 `keys/salt`）派生，永不落盘明文。
- **Owner Key**：每 owner 随机 32B；被 UMK 包裹存 `keys/<owner>.key.enc`（头 `YTMKEY1`，AAD=`owner:<id>`），被恢复钥匙包裹存 `keys/<owner>.key.recovery`。
- **恢复钥匙（RK）**：随机 32B；被 UMK 包裹存 `keys/recovery.key.enc`（AAD=`recovery`），初始化/迁移时向用户打印一次（base64）。忘口令时用户提供 RK → 解开 `*.key.recovery` → 重设口令。
- **授权缓存**：平台授权后把 owner key 明文写 `keys/cache/<id>.key`（文件权限 0600，仅属主可读写）；AI 侧只持有自己这把缓存 key，UMK 永不接触 AI。`key revoke` = 删除缓存文件。

### 密文记忆文件（`.md.enc`，头 `YTMENC1`）
```
magic "YTMENC1" (7B)
| wkNonce(12B) | wkTag(16B) | wrappedFileKey(32B)   # AES-256-GCM(OwnerKey, FileKey), AAD="filekey"
| dataNonce(12B) | dataTag(16B) | ciphertext           # AES-256-GCM(FileKey, plaintext UTF-8), AAD="file"
```
- FileKey 每文件随机 32B，便于单文件重加密/轮换。

### 加密索引（`private/<owner>/index.enc`，头 `YTMIDX1`）
```
magic "YTMIDX1" (7B) | nonce(12B) | tag(16B) | ciphertext(JSON: {version, updated, entries[]})
```
- 用该 owner 的 Owner Key 加密（AAD=`index:<owner>`）；AI 解自己索引一次 → 内存全文 TF 检索 → 只解命中文件。公共 `index.json` 只含 FACT 条目。

### 命令扩展
- `init [--encrypt|--no-encrypt]`：新建默认加密（需主口令，打印恢复钥匙）；`--no-encrypt` 明文降级。
- `migrate`：明文私密区 → 密文（需主口令；打印恢复钥匙；当前智能体自动授权缓存）。
- `view [--port 8788] [--host 127.0.0.1]`：用户查看平台（本机 Web；口令解锁 → 浏览/搜索/导出全部；授权/吊销 AI；重设口令；显示恢复钥匙）。
- `reset-password [--password <当前> | --recovery-key <钥匙>] [--new-password <新>]`：重设主口令并重新包裹全部 owner 密钥。
- `key list | authorize <id> | revoke <id>`：授权缓存管理（authorize 需主口令）。

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

> 隔离说明：scope: private 保证的是"AI 之间的语义隔离"——其他智能体在正常 recall 会话中不会被搜到、也不会主动去读本条私密记忆。v0.7 起私密区为机制级机密保护：文件经 AES-256-GCM 信封加密，没有对应 owner 密钥的智能体即使读到密文文件也解不开。但密钥与恢复钥匙由用户本机保管，作为所有者你有权用 `yotta-memory view` 口令解锁查看任何记忆文件，数据主权在你；本工具不承诺对抗已取得主口令 / 恢复钥匙的同权限本地进程。

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
| `remember <type> <subject> <statement> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]` | 写入；同 subject+statement 已存在则更新 `updated` 且 `weight` 取 max；`--source` 记录来源；`--weight` 重要性权重；`--verify` 写后回读校验；`--no-hint` 关闭类型启发式提示 |
| `recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 索引+TF 打分匹配；读取分区过滤；越界（读其它智能体私密）默认拒绝，需 grant / identity=user / `--unsafe` 授权；项目级优先；默认 50 条 |
| `forget <文件>` | 删除（按路径或文件名）|
| `archive [--days 180] [--threshold 0.4]` | 按盖棺分+年龄移入 `.archive/`（`vitality < threshold` 且超过 N 天）|
| `reindex` | 全量扫描重建 `index.json`（手动改 .md 后校正）|
| `export [--out f.json]` | 导出全部记忆为 JSON |
| `import <f.json>` | 从 JSON 导入（幂等）|
| `profile [--owner <id>]` | 用户画像聚合（零推断，写 `private/<owner>/profile.md`；跨 owner 默认拒绝）|
| `context [--limit N] [--owner <id>] [--budget N]` | 开工上下文包（stdout：身份 + 多智能体铁律 + 画像 + 近期记忆 + 边界 + 承诺；`--budget` 近期记忆字符预算）|
| `iam <id> [--name] [--user] [--relationship] [--force]` | 登记身份 + 自我档案（可选扩展显示名 / 用户 / 关系）|


### profile（用户画像聚合，v0.6.0）

- `profile [--owner <id>]`：扫描 `private/<owner>/{prefs,bounds,commits}`，按 type + subject + tags 归组，输出各条 statement 原文 + confidence + 最近访问，写 `private/<owner>/profile.md`。
- 零推断：引擎只做结构化归组与原文呈现，不做语义推断；画像结论由承载 AI 依据 SKILL「记忆守则」内部形成。
- 权限：profile.md 属私密区（按 owner）；跨 owner 生成默认拒绝（exit 3），需 `--owner user` / `--unsafe` / grant 授权。
- profile.md 为生成物，可随时重新生成；不进入 index.json。

### context（开工上下文包，v0.6.0）

- `context [--limit N] [--owner <id>] [--budget N]`：stdout 输出开工上下文包（不落盘），含多智能体接入铁律段（可读 A/B/C、可写范围、违规红线）与五段：
  1. 身份：agent_id / agent_name / user_name / relationship / host / memory_home（读自我档案）
  2. 用户画像摘要：profile.md（不存在则自动生成一次或降级跳过）
  3. 近期记忆：按 importance（confidence × recency + updated + weight + immutable）排序前 N 条（默认 10），读取分区过滤；`--budget` 时按剩余字符预算逐条放行（身份/铁律/画像/边界/承诺 必保）
  4. 边界提醒：BOUND 全列（可读范围内）
  5. 承诺 / 锚点：COMMIT 全列（可读范围内）

### remember / iam 扩展（v0.6.0）

- `remember ... --verify`：写后自动回读校验（recall 命中刚写入条目），输出「已写回读 OK」。
- `remember ... --no-hint`：关闭类型启发式提示。默认开启：statement 含主观/关系词（用户 / 偏好 / 喜欢 / 关系 / 称呼 等）且 type=FACT 时 stdout 提示「疑似用户偏好 / 关系，建议 PREF」，仅提示不拦截。
- `remember ... --source <来源>`：记录来源（如 `对话` / `推断` / `交接`）。
- `remember ... --weight <0..>`：重要性权重（默认 1.0，>1 提权 / <1 降权）；去重更新时 `weight` 取 max（多次印证自动提权）。
- `iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]`：自我档案 PREF 扩展 `agent_name / user_name / relationship`；不带新参数行为与 0.4.2 一致。
### 去重与更新

- remember 时若同 `type + subject + statement` 已存在，仅刷新 `updated`，不产生重复文件。
- 修改内容：先 `recall` 定位文件，再 `forget` + 重新 `remember`，或直接编辑文件。

### v0.8.0：自我学习 / 自我进化 / 自我提升（语义检索 + 反馈闭环 + 自组织 + 蒸馏）

- **语义检索（recall）**：默认开启——精确（字段加权：subject×3 / tags×2 / statement×1）+ 同义词（内置 `SYNONYM_GROUPS`，可扩展）+ 拼音（全拼 `py:` / 首字母 `pyi:` token，内置 3755 常用字表 `references/pinyin-common.json`）+ 模糊（编辑距离 ≤ 2）+ 子串兜底；排序融合 0.65×语义 + 0.35×效用；`--explain` 输出命中理由与效用分项；`--semantic` 显式开启（默认开），旧索引（version<3）首次 recall 自动重建。
- **feedback（使用反馈闭环）**：`feedback <文件> --useful|--useless [--reason] [--undo]`——useful → weight×1.2（上限 3.0）+ confidence +0.05 + feedback_net +1；useless → weight×0.8（下限 0.2）+ confidence −0.05 + feedback_net −1；审计写 `.archive/feedback-<日期>.jsonl`（含 before/after）；`--undo` 按最近一条回滚。
- **maintain（规则层自组织）**：统一效用分 `utility = (0.30×confidence + 0.25×usage + 0.20×recency + 0.15×type + 0.10×structure) × weight`（typeScore：BOUND 1.0 / COMMIT 0.9 / PREF 0.8 / FACT 0.6）；归档条件 utility<0.35 且年龄>180 天，遗忘候选 utility<0.12 且年龄>365 天；默认 dry-run，`--apply` 归档（移入 `.archive/`），`--purge` 才真删；immutable / BOUND 豁免；`--dedup` 相似候选（subject 编辑距离 ≤3 且 token Jaccard ≥0.7），`--merge A,B` 手动合并；审计写 `.archive/audit-<日期>.jsonl`。
- **distill（心理日志蒸馏）**：统计摘要（类型 / 年龄 / 热度 / 反馈）+ 主题画像（按 subject 聚类合并）+ 知识地图（type → tags）；`--model <cmd>` 外部模型协议（stdin JSON → stdout 提炼文本）；私密产物 `private/<owner>/distills/<日期>-<slug>.md`（加密库随 owner key 加密），公共 `facts/distills/`。
- **explain（效用解释）**：`explain <文件>` 输出效用分项明细与归档 / 遗忘状态判定。

## 6. 与其他系统互操作

- **git**：整个记忆库可纳入版本控制，回滚 / 审计 / 团队同步。
- **Agent Skills 标准**：本技能 SKILL.md 符合 agentskills.io 开放标准，支持 npx skills 安装。