<p align="center"><b>Language</b>: <a href="./README.md">English</a> · 中文</p>

<p align="center">
  <img src="assets/banner.png" alt="yotta-memory banner" width="100%" />
</p>

<h1 align="center">元忆（yotta-memory）</h1>

<p align="center">元忆 —— 有权限边界的文件式智能体记忆：让任何 AI 智能体活过会话，而不是只活在单次对话里。</p>
<p align="center">开工 <code>recall</code> 恢复上下文、重要信息 <code>remember</code> 落盘、收工归档；记忆是落在用户自己目录里的 Markdown 文件——<b>可读、可改、可审计、可回滚</b>，零依赖、即装即用。</p>
<p align="center">FACT 共享、PREF / BOUND / COMMIT 私密隔离——<b>谁该读、谁不该读，由机制而非 AI 自觉决定</b>；一份记忆可跨智能体共用，记忆库随盘走、局域网可共享。</p>
<p align="center">「越用越懂」：<code>profile</code> 聚合用户画像（零推断）+ <code>context</code> 一键开工上下文包（身份 + 画像 + 近期记忆 + 边界 + 承诺 + 收工纪律），记忆从「存储」成长为「会成长的记忆系统」。</p>
<p align="center"><b>私密区机制级加密</b>：AES-256-GCM 信封加密 + 口令派生主密钥 + 恢复钥匙；<code>yotta-memory view</code> 用户查看平台（口令解锁看全部 AI 记忆）；<code>migrate</code> 明文→密文迁移；<code>--no-encrypt</code> 可降级。跨 AI 私密从「纪律层隔离」升级为「机制层不可解」。</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
  <a href="https://agentskills.io/"><img alt="Standard: agentskills.io" src="https://img.shields.io/badge/standard-agentskills.io-orange" /></a>
  <a href="https://www.npmjs.com/package/@yottameta/yotta-memory"><img alt="npm package" src="https://img.shields.io/npm/v/@yottameta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="GitHub stars" src="https://img.shields.io/github/stars/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" /></a>
</p>

> 📖 面向用户的操作手册见 [USER_GUIDE.md](USER_GUIDE.md)。

> 🆕 **v0.8.2**：发布元数据修复——三次源重发带 `--name 元忆 yotta-memory`，修复 ClawHub 展示名缺失中文（原为裸 `yotta-memory`）；无功能变更。

> 🆕 **v0.8.1**：`view` 用户查看平台改为服务端分页（记忆多了一次只渲染当前页，页码上下页）；`recall` 增加候选预过滤（语义检索前先粗筛候选集，命中集不变，记忆量大时不再逐条全量语义 / 模糊 / 编辑距离）；公共 `index.json` 超过 5000 条时按年份分片（`index-<year>.json`），避免单文件膨胀。

## 核心价值

多数记忆方案把「记住」做成了黑盒：数据进了数据库或云端，用户看得到内容却改不动、难以审计，更控制不了「哪个智能体能看到什么」。元忆换了一条路——把记忆还原成看得见、管得着的文件（公共 FACT 明文可审计，私密区机制级加密、用户可口令解锁）：

- **记忆就是文件**：每条记忆是一个带 YAML frontmatter 的 Markdown 文件，放在用户自己的目录里。任何编辑器都能看、能改、能删；git 直接做版本管理与回滚，团队同步与交接走同一条标准工具链。
- **隔离由机制保证**：FACT 进公共区共享，PREF / BOUND / COMMIT 进私密区、按 owner 物理分目录（`private/<owner>/<type>/`）。读取按 scope/owner 分区过滤，越界内容由 CLI 拦截、永不返回（默认静默跳过；显式跨读无授权报错拒绝）；读写一律走 CLI / MCP，禁止 shell 直读写库文件——权限由机制把关，不依赖 AI 的「自觉」。
- **零依赖、即装即用**：无守护进程、无数据库、无向量库，只需 Node.js。安装即用，数据留在本机，任何机器都能部署。
- **越用越懂（v0.6.0）**：`profile` 聚合用户画像（引擎零推断，只归组原文）+ `context` 一键生成开工上下文包（身份 + 画像 + 近期记忆 + 边界 + 承诺）；SKILL「记忆守则」注入规则层（类型红线 / 触发信号 / 了解用户 / 底线 / 宿主隔离），只注入规则与机制、不注入人格数据，出厂零数据。
- **自我学习 / 自我进化 / 自我提升（v0.8.0）**：`recall` 语义检索（同义词 / 拼音全拼+首字母 / 字段加权 / 模糊匹配，零依赖）+ 效用分融合排序；`feedback` 显式使用反馈闭环（useful / useless 调整 weight / confidence / feedback_net，越用越懂）；`maintain` 规则层自组织（统一效用分 + 年龄自动归档 / 遗忘候选 / 去重，默认 dry-run，immutable / BOUND 豁免）；`distill` 心理日志蒸馏（统计摘要 / 主题画像 / 知识地图，可选 `--model` 外部模型增强）。
- **私密区加密（v0.7.0）**：私密区文件 AES-256-GCM 信封加密（口令派生主密钥 + 恢复钥匙 + 每 owner 加密索引）；`yotta-memory view` 用户查看平台（口令解锁看全部 AI 记忆）；`migrate` 明文→密文迁移；`--no-encrypt` 可降级。跨 AI 私密从「纪律层隔离」升级为「机制层不可解」。
- **便携记忆盘**：记忆库本身就是记忆引擎——装在硬盘或主机上随盘走，局域网内其它主机上的智能体可远程读写；本地零进程与局域网常驻两种模式可并存，插上硬盘即恢复全部记忆。

## 核心优势

| 优势 | 说明 |
|---|---|
| **数据主权在用户** | 公共 FACT 明文、可读可改可审计；私密区 AES-256-GCM 加密（用户经 `yotta-memory view` 口令解密查看）；git 可版本化，回滚 / 团队同步都走标准工具 |
| **真正的权限边界** | 公共 / 私密分区 + 按 owner 物理分目录（`private/<owner>/<type>/`）+ scope/owner 过滤 + 授权机制（grant / identity=user / `--unsafe`），越界内容由 CLI 过滤、永不返回（默认静默；显式跨读 `--all`/`--owner <其它>` 无授权时 exit 3）；`--agent <其它>` 仅作身份声明、不授予跨读。读写走 CLI / MCP，禁 shell 直读写，不靠 AI 自律 |
| **私密区机制级加密** | 私密区（PREF/BOUND/COMMIT）文件 AES-256-GCM 信封加密（口令派生主密钥 + 恢复钥匙 + 每 owner 加密索引）；没有对应 owner 密钥的 AI 即使读到密文也解不开；`yotta-memory view` 用户查看平台：口令解锁后浏览 / 搜索 / 导出全部 AI 记忆（含各 AI 私密明文） |
| **跨智能体标准** | 符合 Agent Skills 开放标准（agentskills.io）；装一次，Claude Code / Codex / Cursor / OpenCode 等 78+ 智能体可共用同一份记忆 |
| **轻量零依赖** | 无 daemon / 无数据库 / 无向量库；Node.js 自带即跑，任何机器可部署 |
| **双级存储** | 用户级 `~/.yottamemory/`（跨项目）+ 项目级 `.yottamemory/`（随项目共享 / 交接）|
| **检索与生命周期** | 语义检索（v0.8.0：同义词 / 拼音 / 字段加权 / 模糊，零依赖）+ 效用分融合排序；统一效用分（盖棺分）规则层自动归档 / 遗忘候选 / 去重（`maintain`，默认 dry-run），记忆库越用越精简 |
| **越用越懂（v0.6.0）** | `profile` 画像聚合（零推断）+ `context` 开工上下文包（身份 / 画像 / 近期记忆 / 边界 / 承诺）+ SKILL「记忆守则」规则层，记忆随使用成长 |
| **生态分发** | GitHub + npm 双源同步发布；npx skills / npm / install.sh 三种方式，覆盖 17+ 类智能体目录 |
| **便携记忆盘（随盘走）** | 记忆库即引擎：装在硬盘 / 主机上，插上即恢复全部记忆；引擎主机只需装 CLI 当存放点，无需装任何 AI 智能体 |
| **局域网共享与自启** | 每智能体独立 token（Bearer + X-Agent-Id）鉴权、可吊销；`lan enable` 注册开机自启（Windows：优先计划任务，非管理员自动降级用户级 Startup 静默自启；Linux：systemd 用户单元，不可用时自动降级用户 crontab @reboot）；MCP 工具集与 CLI 一致（8 个工具），管理动作不远程暴露 |
| **本地 / 局域网双模式** | 本地 `serve --stdio` 零进程、按需拉起（无常驻）；局域网 streamable HTTP 常驻——两种模式可并存、按需选用 |

## 功能详解

### 记忆模型：四分类 + 双级存储

记忆按内容性质分为四类，类别决定可见范围：

| 类型 | 含义 | 可见范围 |
|---|---|---|
| `FACT` | 事实 / 知识 / 经验（可验证、可共享）| 公共区，所有智能体可读 |
| `PREF` | 偏好 / 习惯 / 喜好 | 私密区，默认仅所属 agent 可读 |
| `BOUND` | 边界 / 规则 / 底线 | 私密区，默认仅所属 agent 可读 |
| `COMMIT` | 承诺 / 锚定 / 约定 | 私密区，默认仅所属 agent 可读 |

- **双级存储**：用户级 `~/.yottamemory/` 跨项目共享个人记忆；项目级 `.yottamemory/` 随项目一起走，天然适合交接与团队协作。recall 时项目级优先。
- **同 key 自动更新**：同一 subject + statement 重复写入只更新 `updated`，不产生重复记录。
- **元数据丰富**：每条记忆带 `confidence`（置信度）、`tags`（标签）、`immutable`（锁定不可变）、`created/updated`、`access_count` 等，供检索与生命周期管理使用。

### 权限与隔离

- **读取三态**：公共 FACT 始终可读；自身私密始终可读；其它 agent 私密默认拒绝（不返回内容）。
- **物理隔离目录**：私密记忆按 owner 存放于 `private/<owner>/<type>/`，不同智能体的私密文件物理分离；旧版根下平铺的 `prefs/` `bounds/` `commits/` 在 `reindex` 时自动迁移。
- **三种授权入口（满足任一即可读他人私密）**：
  1. `grants.json` 显式授权：`{"<userAgent>": ["<ownerAgent>", ...]}`；
  2. identity=user：`--agent user` / `--owner user` / 环境变量 `YOTTA_AGENT_ID=user`；
  3. 显式 `--unsafe`（用户显式授权）。
- **默认静默、显式跨读才报错**：默认 recall 遇其它 agent 私密静默跳过（不泄露「存在 N 条私密不可见」）；仅当显式跨智能体读取（`--all` / `--owner <其它>`）且无授权命中时才报错 / 警告。
- **`--agent <其它>` 不越界**：`--agent <其它agent>` 仅作身份声明 / 展示用，不授予读取他人私密；读其它智能体私密仍需 grant / identity=user / `--unsafe`。
- **隔离定位**：scope: private 保证的是 AI 之间的语义隔离（正常 recall 不会被搜到、不会主动去读）。v0.7 起私密区为机制级机密保护——文件 AES-256-GCM 信封加密，没有对应 owner 密钥的 AI 即使读到密文文件也解不开；数据主权仍在用户，作为所有者可用 `yotta-memory view` 口令解锁查看 / 导出任何记忆文件。
- **禁止 shell 直读写**：记忆读写一律走 CLI / MCP 工具；用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读改库文件会绕过 scope/owner 权限边界，读到其它智能体私密内容。

### 智能体身份（唯一 ID + 自我档案）

每个智能体有一个**全局唯一的 agent ID**：它是私密记忆（PREF / BOUND / COMMIT）的归属键，也是远端接入的身份声明（`X-Agent-Id`）。

- **登记（必须唯一）**：`yotta-memory iam <id>` 写入记忆库根目录 `agents.json`，**强制唯一性**——ID 已被其它主机 / 来源（含远端 token 登记）占用时拒绝，确认是同一智能体才 `--force`。
- **确认身份**：`yotta-memory whoami`（远端 MCP 工具 `agent_info`）读「当次声明身份」（本机 `YOTTA_AGENT_ID` / CLI `--agent`；远端 `X-Agent-Id`），不猜不默认。
- **自我档案（强制落盘）**：`iam` 自动写一条 PREF `subject=自我接入档案`（owner=自己），statement 为 `; ` 分隔的 key:value：`agent_id / host / memory_home / mcp_mode（stdio|http）/ engine_url（仅远端）/ token（仅远端；本机不存 token）`。开工先 `recall "自我接入档案"` 找回身份与接入信息。
- **本机免 token**：本机 CLI / stdio 直连不经网络、不校验 token；身份经该智能体 MCP 配置的 `env.YOTTA_AGENT_ID` 声明。本机多个智能体各自声明唯一 ID，互不撞。
- **私密记忆必须有 owner**：写 PREF / BOUND / COMMIT 时未声明身份会被拒绝（公共 FACT 不受影响），从机制上防止「抄别人的 ID」。

### 画像与开工上下文（v0.6.0）

- **profile**：聚合 `private/<owner>/` 下 PREF / BOUND / COMMIT 原文，按 type + subject + tags 归组，写 `profile.md`；引擎零推断，画像结论由 AI 依据「记忆守则」内部形成，不当面贴标签。
- **context**：一键生成开工上下文包——多智能体接入铁律 + 身份 + 用户画像摘要 + 近期记忆（按 importance 排序）+ 边界提醒 + 承诺 / 锚点；支持 `--budget` 字符预算（token 恒定，不随记忆膨胀）。
- **记忆守则**：SKILL.md 内置规则层（类型红线 / 主动捕获触发信号 / 了解用户三阶段四手法 / 心理学底座与对齐 / 底线与边界 / 宿主隔离 / 反模式），让 AI「越用越懂」有章法。

### 检索：语义检索（v0.8.0）+ 中文分词打分

- `remember` 时自动构建 `index.json` 索引（v0.8.1 起 version=4，含字段加权与拼音 token；公共索引超过 5000 条按年份分片 `index-<year>.json`；旧索引首次 recall 自动重建）；recall 默认语义检索——精确（字段加权：subject×3 / tags×2 / statement×1）+ 同义词（内置词表，可扩展）+ 拼音（全拼 / 首字母，内置 3755 常用字表）+ 模糊（编辑距离 ≤ 2）+ 子串兜底，并与效用分融合排序（0.65 × 语义 + 0.35 × 效用），零依赖。
- `recall --explain`：展示每条命中理由（精确 / 同义 / 拼音 / 模糊 + 字段）与效用分项。
- **recall 候选预过滤（v0.8.1）**：语义打分前先用索引 token 粗筛候选集（精确 / 同义 / 拼音 / 子串 / 模糊长度门槛），命中集与 v0.8.0 完全一致；`view` 查看平台按偏移分页返回，一次只取当前页。
- 可选 embedding 插件：协议预留（v0.9 实装），无插件自动零依赖降级。
- `index.json` 的 `tokens` 字段是中文分词的词频表（TF 打分用），**不是**访问凭证；鉴权令牌在记忆目录下 `.server/tokens.json`。
- 支持关键词、`--type` 过滤、`--limit` 截断、项目级优先。
- **根位置去重（v0.6.5）**：当项目级与用户级记忆库指向同一目录（如 cwd = home 或其父）时，`recall` / `context` 自动唯一化根，同一文件只展示一次。
- 命中展示会累加 `access_count` / `last_accessed`，为生命周期管理提供依据。

### 生命周期管理（v0.8.0 规则层自组织）

- `maintain`（v0.8.0）：规则层自组织——统一效用分（盖棺分 = confidence + 使用 + 时效 + 类型 + 结构）× weight，低效用 + 超龄自动归档；极端低价值列为遗忘候选（默认不真删，`--purge` 才删）；`--dedup` 去重候选；`--merge A,B` 手动合并。默认 dry-run 预览，`--apply` 才执行；immutable / BOUND 豁免；审计写 `.archive/audit-<日期>.jsonl`。
- `archive`：按「统一效用分 + 年龄」把低价值旧记忆移入 `.archive/`（`immutable` 除外），记忆库不会无限膨胀（v0.8.0 起底层用统一效用分）。
- `feedback`（v0.8.0）：显式使用反馈闭环——useful → weight ×1.2（上限 3.0）+ confidence +0.05 + feedback_net +1；useless → weight ×0.8（下限 0.2）+ confidence −0.05 + feedback_net −1；`--undo` 回滚；审计写 `.archive/feedback-<日期>.jsonl`。
- `distill`（v0.8.0）：心理日志蒸馏——统计摘要（类型 / 年龄 / 热度 / 反馈）+ 主题画像（按 subject 聚类合并）+ 知识地图（type → tags）；可选 `--model <cmd>` 外部模型 stdin→stdout 提炼；产物入 `private/<owner>/distills/` 或 `facts/distills/`。
- `explain`（v0.8.0）：查看单条记忆效用分项与归档 / 遗忘状态判定。
- `forget`：删除单条记忆（按类型目录路径或文件名）。
- `reindex`：手动改过 `.md` 后重建索引。
- `export` / `import`：整库导出为 JSON / 从 JSON 导入，可作迁移与备份中间格式。
- git：整个记忆库可纳入版本控制，回滚 / 审计 / 团队同步。

### 智能体接入

把技能装进智能体后，SKILL.md 会自动教会智能体一套工作流：**开工 `context` 主注入（身份 + 画像 + 近期记忆 + 边界 + 承诺）→ 重要信息 `remember` 落盘 → 收工归档**，并遵循「记忆守则」（类型红线 / 触发信号 / 底线 / 宿主隔离）。也可在对话中直接说「记住 XXX」「上次说到哪了」「记一笔」触发。

### 便携记忆盘（记忆库即引擎）

- **记忆库即引擎**：`serve` 把记忆目录挂成 MCP 服务，目录随盘走；引擎主机只需装 CLI 当存放点，无需装任何 AI 智能体。
- **双模式可并存**：本地 `serve --stdio` 零进程（客户端按需拉起）；局域网 streamable HTTP（默认 `0.0.0.0:8787`）+ 每智能体 token 鉴权。
- **开机自启**：`lan enable` 注册开机自启——Windows 优先计划任务（默认登录自启，`--onstart` 开机即启需管理员），非管理员自动降级为**用户级 Startup 静默自启**（免管理员，启动脚本内联启动命令、被清理也会在开机时自动重建，v0.6.3 起不再弹 80070002）；Linux 优先 **systemd 用户单元**（`systemctl --user`，登录自启；`--onstart` 附加 `loginctl enable-linger` 开机即启），systemd 不可用时自动降级**用户 crontab @reboot**（v0.6.4）；`lan disable` 移除，`lan status` 查询。
- **安全边界**：管理动作（init / config / token / lan / serve）不进 MCP，token 不远程暴露；远程智能体只能读写记忆，不能改配置、不能管 token。
- 完整操作步骤见上文「局域网多机共享」章节与 [USER_GUIDE.md](USER_GUIDE.md)。

## 与其他方案对比

> 以下按方案类型对比，不涉及具体产品名称。判断标准：数据主权、部署成本、权限边界、可审计性、跨智能体能力。

| 维度 | 元忆（yotta-memory） | 数据库 / 嵌入式存储类 | 向量库 / 语义检索类 | 云端托管记忆服务 |
|---|---|---|---|---|
| 存储形态 | 公共 FACT 明文文件；私密区加密（.md.enc），git 可版本化 | 二进制 / 结构化数据库文件 | 向量索引 + 模型依赖 | 厂商服务器 |
| 数据主权 | 完全在用户本地，可读可改可删（私密区经 view 平台口令解锁） | 本地，但需专用工具读写 | 本地或自托管，模型需额外部署 | 不在用户手中，受服务条款约束 |
| 权限边界 | 内置：公共 / 私密分区 + scope/owner + 授权 | 通常无内置，需自行实现 | 通常无内置，需自行实现 | 通常只有账号级权限，无记忆级细粒度 |
| 可审计 / 回滚 | 公共 FACT 明文可审计；私密区加密但用户可用 view 平台解密，git 可回滚 | 需导出工具链，回滚复杂 | 依赖快照 / 导出机制 | 依赖平台导出能力 |
| 部署与依赖 | 零依赖，Node.js 即跑 | 需数据库运行 / 嵌入式依赖 | 需向量库 + 模型，较重 | 联网 + 账号，数据出本地 |
| 跨智能体 | 符合 Agent Skills 标准，一次写入多智能体可读 | 各智能体各自接入，无统一标准 | 需各自接入，成本高 | 取决于平台支持范围 |

**结论**：元忆的核心差异点在于把「数据主权 + 权限边界 + 零依赖」三者合一——既是可审计的文件，又有机制级的读取隔离，还不引入任何重型依赖。对「本地优先、多智能体协作、长期沉淀」的场景，这是最轻的一条路。

## 安装

三种方式任选其一，技能文件统一从 **npm** 获取（GitHub 无代理时较慢，npm 可配国内镜像加速）。

### 方式一：npx skills（推荐，生态标准入口）
```bash
npx skills add YottaMeta/yotta-memory
```
> 自动把技能文件装到已检测到的智能体（Claude Code / Codex / Cursor / OpenCode 等 78+ 智能体）。此方式只装「技能指令」（SKILL.md 等）；要使用 `yotta-memory` 读写命令，需另装 CLI：`npm install -g @yottameta/yotta-memory`（见方式二）。

### 方式二：npm 直接安装（CLI + 技能）
```bash
# 国内加速（可选）：npm config set registry https://registry.npmmirror.com
npm install -g @yottameta/yotta-memory
yotta-memory init            # 初始化记忆库
yotta-memory-install -g                  # 装进所有已识别智能体（用户级）
yotta-memory-install --agent codex       # 只装进指定智能体
```

> 全局安装后 `yotta-memory`（读写下）与 `yotta-memory-install`（安装器）两个命令均已加入 PATH。若不想全局安装，可一行运行安装器：`npx -y --package @yottameta/yotta-memory yotta-memory-install -g`。

### 方式三：install.sh / 手动复制
获取技能文件夹后（`npm pack` 解包或 `git clone`），进入技能文件夹：
```bash
bash install.sh -g                 # 用户级；bash install.sh --list 查看全部目录
bash install.sh --agent codex      # 指定智能体
bash install.sh --dir /path/to/skills
```
也可把整个 `yotta-memory` 文件夹复制到目标智能体的 skills 目录（常见位置见 install.sh --list）。

## 升级

两种升级方式对应两种安装方式：

**升级 CLI**（重新执行一次安装命令即可，不带版本号默认装最新）：
```bash
npm i -g @yottameta/yotta-memory
```

**升级技能**：重新执行你当初的安装命令即可（`npx skills add YottaMeta/yotta-memory` 或 `yotta-memory-install -g`），覆盖旧版本技能文件夹。

> 升级只影响命令与技能文件，**不会动你已存的记忆**（记忆是独立于安装的文件，保留在原目录）。

## CLI 用法


| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>]` | 初始化记忆库（默认用户级 `~/.yottamemory/`；--dir 显式指定位置）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]` | 写入记忆（同 subject+statement 自动更新；--owner 标注归属；--source 记录来源；--weight 重要性权重、去重取 max；--verify 写后回读；--no-hint 关闭类型提示）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 检索记忆（索引+TF 打分，读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；`--agent <其它>` 仅作身份声明、不授予跨读；项目级优先）|
| `yotta-memory profile [--owner <id>]` | 生成用户画像（聚合 `private/<owner>/` 原文，零推断，写 `profile.md`；跨 owner 默认拒绝）|
| `yotta-memory context [--limit N] [--owner <id>] [--budget N]` | 生成开工上下文包（身份 + 多智能体铁律 + 画像 + 近期记忆 + 边界 + 承诺；--budget 近期记忆字符预算，token 恒定）|
| `yotta-memory forget <文件>` | 删除一条记忆（按类型目录路径或文件名）|
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆（盖棺分+年龄，immutable 除外）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config get` | 持久记住 / 查看记忆库位置（`~/.yottamemory/config.json`）|
| `yotta-memory whoami` | 查看当前智能体身份与登记状态（读 `YOTTA_AGENT_ID` / `X-Agent-Id`，不猜不默认）|
| `yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一；可选扩展显示名 / 用户 / 关系）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 为智能体生成 / 列出 / 吊销访问 token（登记于记忆库 `.server/tokens.json`；同 ID 已被其它来源占用需 `--force` 覆盖，防不同智能体合流）|
| `yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio]` | 启动 MCP 记忆引擎（streamable HTTP 局域网 / --stdio 本地零进程模式；Bearer token + X-Agent-Id 鉴权）|
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows：计划任务，默认 ONLOGON、--onstart 开机即启需管理员，非管理员自动降级用户级 Startup 静默自启；Linux：systemd 用户单元，不可用时自动降级用户 crontab @reboot）|

类型：`FACT`（事实，公共共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺）。

示例：
```bash
yotta-memory init
yotta-memory remember PREF 用户 偏好短回复，不要用表情
yotta-memory recall 偏好
yotta-memory profile
yotta-memory context --limit 10
yotta-memory recall --type FACT --limit 10
```

环境变量：
- `YOTTA_MEMORY_HOME`：覆盖用户级记忆库目录（默认 `~/.yottamemory/`）。
- `YOTTA_AGENT_ID` / `AGENT_ID`：当前 agent 标识（本机声明身份用，参与读取分区判定；私密记忆必须有 owner，未声明会被拒绝）。

## 智能体接入后怎么用

把技能装进智能体后，SKILL.md 会自动教会智能体：开工 `recall` 恢复上下文 → 重要信息 `remember` 落盘 → 收工归档。也可在对话中直接说「记住 XXX」「上次说到哪了」。

## 局域网多机共享（便携记忆盘模式）

记忆库可以装在任何主机或硬盘上（= 记忆引擎），供局域网内其它主机上的智能体远程接入：

- **本机直连**：CLI 直接读写，无需 token；
- **远程接入**：引擎主机运行 `yotta-memory serve` 常驻（或 `lan enable` 注册开机自启），远程智能体通过 MCP 以 `url + token` 连接。
- **本地零进程**：本机 MCP 客户端可用 `serve --stdio` 按需拉起 CLI（无常驻进程）。

### 引擎侧（记忆所在主机）

1. 初始化或接入记忆库（见 CLI 用法）。
2. 为需要访问的每个智能体生成独立 token：
   ```bash
   yotta-memory token new --agent <智能体ID>     # 打印一次，如 ytm_...（同 ID 已被其它来源占用需加 --force）
   yotta-memory token list                        # 查看已登记智能体
   yotta-memory token revoke --agent <智能体ID>   # 吊销
   ```
   > 新生成的 token 即时生效，无需重启服务。
3. 启动服务（默认监听 0.0.0.0:8787，Bearer token + X-Agent-Id 鉴权）——临时运行或注册开机自启二选一：
   ```bash
   yotta-memory serve                          # 临时前台运行
   yotta-memory lan enable                     # 注册开机自启（Windows：计划任务/用户级 Startup；Linux：systemd 用户单元/用户 crontab）
   yotta-memory lan status                     # 查看自启状态
   ```
   > `lan enable --onstart` 改为开机即启（需管理员）；非管理员时 `lan enable` 自动改用用户级 Startup 静默自启（无需管理员）；`lan disable` 移除自启。

> 首次监听 0.0.0.0 时，Windows / 系统防火墙可能询问是否放行，需允许放行，否则局域网内其它主机无法访问；`--no-auth` 会关闭鉴权，仅限可信内网使用。

### 客户端侧（远程智能体）

在智能体 MCP 配置中登记连接（`url` + 两个请求头）：

```json
{
  "mcpServers": {
    "yotta-memory": {
      "url": "http://<引擎主机IP>:8787/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "X-Agent-Id": "<本智能体ID>"
      }
    }
  }
}
```

连接后可通过 MCP tools（remember / recall / search / forget / archive / reindex / export / import / agent_info）读写记忆与确认身份；管理动作（init / config / token / lan / serve）不进 MCP，token 管理不远程暴露。`X-Agent-Id` 必须与 token 登记的智能体一致；读取分区规则与 CLI 相同（FACT 公共可读，PREF / BOUND / COMMIT 私密隔离）。

### 位置持久化

CLI 会持久记住记忆库位置（`~/.yottamemory/config.json`），同一主机上的智能体此后开工 `recall` 自动使用正确位置，无需每次指定：

```bash
yotta-memory config set memory_home <记忆库目录>
yotta-memory config get
```

位置解析优先级：`YOTTA_MEMORY_HOME`（临时覆盖）> `config.json#memory_home`（持久）> 默认 `~/.yottamemory`。把记忆库放在硬盘上、插到任意主机后执行一次 `config set memory_home`（或用 `yotta-memory init --dir <目录>` 一步初始化到指定位置），即可在该主机恢复全部记忆。

## 开发与校验

本项目内运行：`python tools/validate-skill.py yotta-memory`。

## 许可证

MIT © YottaMeta —— 详见 [LICENSE](./LICENSE)。