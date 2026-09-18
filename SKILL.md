---
name: yotta-memory
description: 元忆 —— 有权限边界的文件式智能体记忆。文件式、零依赖、可 diff/可回滚：让任何 AI 智能体活过会话，开工 recall 恢复上下文、重要信息 remember 落盘、收工归档。类型体系 FACT（公共共享）/ PREF / BOUND / COMMIT（私密隔离）。触发：记住、别忘了、记一笔、记忆、remember、recall、跨会话、上次说到、续测、交接、归档、记忆盘、共享记忆、局域网记忆、画像、开工上下文、长期理解摘要、近期走廊、会话闭环、记忆守则、profile、context、越用越懂、语义检索、反馈、维护、蒸馏、feedback、maintain、distill、explain、自我学习、自我进化、自我提升、查看平台分页、recall 候选预过滤、任务相关记忆、--focus、--embedding、压缩遗忘、consolidate、周期摘要、自动合并、分类型衰减、回滚、备份、backup、防误删、doctor、事务快照
version: 0.16.0
license: MIT
---

# yotta-memory（元忆）— 有权限边界的文件式智能体记忆

> 一句话：元忆 —— 有权限边界的文件式智能体记忆（不注入、可 diff、能回滚；FACT 共享、PREF / BOUND / COMMIT 私密隔离）。

## 这是什么

- **文件式记忆标准**：记忆 = Markdown + YAML frontmatter 文件，git 可版本化，任何智能体可读，数据主权在用户本地。
- **零依赖**：无 daemon / 无数据库 / 无向量库，Node.js 自带即可运行。
- **类型体系**：FACT（事实，公共共享）/ PREF（偏好，私密）/ BOUND（边界，私密）/ COMMIT（承诺，私密）。
- **双级存储**：用户级 `~/.yottamemory/`（跨项目）+ 项目级 `.yottamemory/`（随项目共享）。
- **越用越懂（v0.14.0）**：`context` 一键生成开工上下文包——长期理解摘要优先（复用 `consolidate` 产物）+ 用户画像（引擎零推断，只归组原文）+ 近期走廊（按更新时间取样）+ 近期高价值补位 + 边界 + 承诺 + 会话闭环契约；SKILL「记忆守则」规则层只注入规则与机制，不注入人格数据（出厂零数据）。
- **MCP 工具分组（v0.15.0）**：`serve --tools core|full` 控制工具暴露面。`core` 固定为 `context / recall / search / remember`，适合常驻；`full` 为现有 16 工具，适合维护与诊断。未指定时默认 `full`，保持现有配置兼容。
- **身份模型（v0.16.0）**：身份不再从环境变量读取。HTTP / 远程 MCP 只认请求头 `Authorization` + `X-Agent-Id` + `X-Agent-Key`；stdio MCP 只认显式参数 `--agent-id` + `--agent-key-file`；CLI 用 `--agent` + `--agent-key` / `--agent-key-file`。旧身份 env 会在 MCP 启动时被明确拒绝。
- **运行时稳定入口（v0.16.0 M2）**：`runtime install --from-current` 把当前引擎安装到 `<runtimeRoot>/versions/<version>/` 并创建 `<runtimeRoot>/current` 稳定指针；`runtime use <version>` 原子切换、`runtime rollback` 回滚、`runtime status` 查看漂移。stdio MCP、`lan enable` 与备份调度只指向 `<runtimeRoot>/current/bin/yotta-memory.js`，不写版本目录。
- **自我学习 / 自我进化 / 自我提升（v0.8.0）**：`recall` 语义检索（同义词 / 拼音 / 字段加权 / 模糊匹配，零依赖）；`feedback` 显式使用反馈闭环（useful / useless → weight / confidence / feedback_net 演化，越用越懂）；`maintain` 规则层自组织（统一效用分 + 年龄自动归档 / 遗忘候选 / 去重，默认 dry-run，immutable / BOUND 豁免）；`distill` 心理日志蒸馏（统计摘要 / 主题画像 / 知识地图，可选 `--model` 外部模型增强）；`explain` 查看单条记忆效用分项。
- **召回质量与上下文选择（v0.9.0）**：`recall` 支持可选本地 embedding 插件（`--embedding <command>` / `config set embedding_cmd <command>`）；`context --focus <关键词>` 生成任务感知上下文；`--explain` 输出选择 trace，无插件时自动降级为词法检索。
- **压缩遗忘（v0.10.0）**：记忆库长期可用不膨胀——`consolidate` 周期摘要压缩（把超龄 + 低效用 + 长期闲置的同主题旧记忆归纳成**带溯源**的摘要，原文整体进 `.archive/`，`--undo` 一键回滚）；`maintain --dedup` 近重复**自动合并**（置信度分档，`--apply` 批量执行高置信组）；效用分时效改为**分类型衰减**（FACT 慢 / PREF 中 / COMMIT 任务类快 / BOUND 不衰减）；`consolidate --batches` 批次审计可查。
- **可靠性基线（v0.12.0）**：`init` 对非空记忆库默认拒绝覆盖（`--attach` 接入现有库）；`forget` 先移入 `.trash/` 并写审计；新增 `backup volumes / setup / status / ensure-daily / schedule / drill`（用户确认真实独立卷后默认每日自动备份）与 `backup create / list / doctor / restore`。
- **可靠性收口（v0.12.2）**：新增 `yotta-memory doctor` 开工检查（根目录 / 密钥库 / 索引 / 身份 / 最近备份）；`maintain --apply`、`consolidate --apply`、`merge`、`archive`、`--purge` 在写入前自动创建事务快照，快照失败或严重检查异常时拒绝写入。
- **运行时 hook 声明（v0.13.0）**：manifest 声明 `after_milestone` / `remember_commit`；里程碑记忆必须有真实文件路径证据才标 verified，缺证据时输出 `explicit-unverified` + 一次纠偏。

## 安装 / 更新（两个 bin）

- `yotta-memory`：引擎 CLI，负责读写记忆库。`npx -y @yottameta/yotta-memory` 只是临时运行引擎，不会安装技能。
- `yotta-memory-install`：技能安装器。安装或更新技能使用 `npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`（或 `--dir <技能目录>`）。

AI 更新流程：先运行 `yotta-memory --version` 记录当前引擎版本；升级 CLI 用 `npm i -g @yottameta/yotta-memory`；升级技能用 `npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`（或原安装时使用的 `--dir` / `install.sh`）；完成后回读 `yotta-memory --version` 与已安装 `SKILL.md` 的 `version:`，两者不一致时不得声称更新成功。

## 何时使用（触发）

- 用户说「记住」「别忘了」「记一笔」等保存类指令。
- 会话开始需要恢复上下文（跨会话 / 跨项目 / 续测）。
- 收工时需要留交接与归档。
- 多智能体协作时，公共事实进 FACT，个人偏好 / 边界 / 承诺进各自私密区。

## 核心流程

1. **开工定向**：先按「开工第一步：确认记忆位置 + 智能体身份」检测记忆库与身份，再运行 `yotta-memory context`（主注入：身份 + 长期理解摘要 + 用户画像 + 近期走廊 + 近期高价值 + 边界 + 承诺 + 会话闭环契约）恢复上下文，需要细节再 `yotta-memory recall <关键词>`；若有明确任务关键词，用 `context --focus <关键词>` 获得任务相关记忆；项目级记忆优先，其次用户级。
2. **进行中落盘**：出现事实 / 偏好 / 边界 / 纠正 / 承诺信号时立即 `yotta-memory remember <type> <subject> <statement> --verify`，不攒到收工。
3. **收工归档**：收工前复盘本轮，检查是否留下 COMMIT / 会话小结；有关键结论但未落盘时补写并 `recall` 回读，无长期价值不硬凑。旧记录定期 `yotta-memory maintain --apply`（单条低效用归档）+ 记忆多了周期 `yotta-memory consolidate --apply`（同主题压缩成带溯源摘要，`--undo` 可回滚）。
4. **多智能体纪律**：FACT 写入公共区，PREF / BOUND / COMMIT 只写本智能体私密区；不读取其他智能体私密区。**一切读写一律走 `yotta-memory` CLI / MCP 工具**——禁止用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读或改记忆库目录下的 `.md` / `index.json` / `tokens.json` / `agents.json` / `grants.json` 等文件，否则会绕过权限边界、读到别的智能体私密内容。

## 会话闭环契约（v0.14.0，AI 必做）

`context` 输出末尾会固定注入这段契约；执行时按三步走：

1. **开工已加载**：身份、长期摘要、画像、近期走廊、边界与承诺以 `context` 输出为准；需要细节再用 `recall` 下钻，不凭印象补全。
2. **进行中立即写**：出现事实 / 偏好 / 边界 / 纠正 / 承诺信号时，立即 `remember <type> <subject> <statement> --verify`；不攒到收工，不把一次性闲聊当记忆。
3. **收工前复盘**：复盘本轮是否留下 COMMIT / 会话小结；有关键结论但未落盘时补写并 `recall` 回读；没有长期价值就不硬凑。

## 可靠性基线（v0.12.0 / v0.12.2）

**目的**：防止初始化覆盖、删除不可逆、备份缺失再次造成记忆库丢失。

### 1. init 防覆盖

- 目标已是记忆库时，`yotta-memory init` 默认拒绝覆盖。
- 接入已有库：`yotta-memory init --attach`。
- `--force` 不能覆盖已有记忆库；强制重建需要完整备份与显式确认保护，当前版本不提供覆盖初始化路径。
- 非 owner 智能体不得初始化、重建或清空记忆库。

### 2. forget 回收区

- `yotta-memory forget <文件>` 不物理删除，改为移动到 `.trash/<时间>/<原相对路径>`。
- 审计写入 `.trash/audit-<日期>.jsonl`（记录时间、原路径、回收路径、owner、执行者）。
- 永久删除和回收区清理属于后续管理动作，不能作为默认 `forget` 行为。

### 3. 每日自动备份（用户确认式）

AI 必须先枚举真实卷，再让用户决定一次位置；不得凭经验报盘符，也不得在用户确认前写 `backup_dir` 或注册调度器。

```bash
# 1. 只展示当前机器实际存在、可写、与记忆库异卷的路径
yotta-memory backup volumes

# 2. 用户从真实列表确认后启用；默认每天 03:30，错过则下次启动补跑
yotta-memory backup setup --dir <用户确认的目录> --time 03:30

# 查看状态；用户明确拒绝自动备份时记录手动选择，不再反复打扰
yotta-memory backup status
yotta-memory backup setup --manual

# 查看/修复系统调度器（Windows Task Scheduler / systemd user timer / launchd）
yotta-memory backup schedule status
yotta-memory backup schedule enable --time 03:30
```

- `backup setup` 成功后创建首份备份，并默认启用每日自动备份。
- `backup ensure-daily` 幂等：当天已有成功备份就跳过，没有才创建；`serve` 启动后 10 秒与运行期间每 6 小时调用一次补跑。
- `context` 在未配置、备份超过 36 小时或失败时追加可靠性提醒；用户已选手动模式时不重复提示。
- 备份盘不可用、调度注册失败或备份失败时记录状态并告警，不伪造成功，也不退回同卷备份。

### 4. backup 备份与恢复

```bash
# 推荐先走上面的 backup volumes + backup setup（自动写入 backup_dir）

# 创建整库备份（默认拒绝与记忆库同卷）
yotta-memory backup create

# 查看备份
yotta-memory backup list

# 校验指定备份（SHA-256 / 文件缺失 / 大小）
yotta-memory backup doctor --id <备份ID>

# 恢复到新目录；默认不覆盖正在使用的记忆库
yotta-memory backup restore <备份ID> --to <新目录>

# 恢复演练：恢复到隔离副本，校验 manifest、索引并解密一条测试私密
# 解密必须有 --recovery-key 或 --password；legacy keys/cache 不参与
yotta-memory backup drill [<备份ID>] --recovery-key <钥匙>
```

- 备份覆盖：`facts/`、`private/`、`keys/`（排除 `keys/cache/` 授权缓存）、`agents.json`、`index.json`、`.archive/`。
- 备份目录与记忆库同卷时默认拒绝；同卷只能作为临时测试，不视为可用备份。
- 恢复目标非空时拒绝覆盖；恢复后先校验，再决定是否替换正式记忆库。
- 备份是可靠性基线的一部分；没有备份时，不得执行永久删除或覆盖初始化。

### 5. 开工 doctor 与事务快照

```bash
# 开工检查：只读，不修改记忆库
yotta-memory doctor

# 机器可读输出
yotta-memory doctor --json
```

- `doctor` 检查记忆库根目录、加密库密钥文件、公共索引、`agents.json` 与最近备份。
- 严重异常（根目录缺失、密钥库缺文件、备份目录同卷）会返回非零退出码，并锁定破坏性写入。
- `maintain --apply`、`consolidate --apply`、`merge`、`archive` 与 `--purge` 在执行前自动创建事务快照；未配置独立备份目录或快照失败时拒绝写入，原记忆保持不变。
- 不提供 CLI 跳过快照的开关；`--allow-same-volume` 只用于 `backup create` 的显式临时备份，不会绕过破坏性写入门。
- `context` 会展示 doctor 的 warning / critical；critical 时明确提示“破坏性写入已锁定”。
- `forget` 仍只移入 `.trash/`，不重复创建整库快照。


## 记忆守则（Memory Doctrine，v0.6.0）

> 出厂规则层：把「越用越懂」机制固化进记忆引擎——只注入**规则与机制**，不注入任何人格数据（出厂零数据）。

### 1. 类型红线（写前必选）

| 类型 | 归属 | 何时用 | 反例 |
|---|---|---|---|
| FACT | 公共 `facts/` | 客观事实、可共享信息 | 用户偏好 / 关系（应 PREF）|
| PREF | 私密 `private/<owner>/prefs/` | 偏好、习惯、禁忌 | 客观公开事实（应 FACT）|
| BOUND | 私密 `private/<owner>/bounds/` | 边界、铁律、不可做的事 | 一次性闲聊 |
| COMMIT | 私密 `private/<owner>/commits/` | 承诺、锚定、长期关系事件 | 临时待办 |

- 私密记忆必须有 owner（引擎强制）；跨 owner 写拒绝。拿不准 → 默认 PREF（宁可私密，不误入公共区）。
- 类型启发式提示：statement 含主观/关系词（用户 / 偏好 / 喜欢 / 关系 / 称呼 等）却选了 FACT 时，引擎会提示「建议 PREF」，仅提示不拦截（`--no-hint` 关闭）。

### 2. 主动捕获触发信号（对话中实时识别，不等「帮我记一下」）

命中即记（增量写，不攒到收工）：
- 事实陈述（「我是…」「我家…」）→ FACT / PREF
- 偏好表达（「我喜欢…」「别用…」「以后…」）→ PREF
- 情绪基调（持续负面 / 疲惫 / 兴奋）→ 交互记忆，影响关怀策略
- 纠正（「不是，我是说…」「你记错了」）→ 更新旧记录
- 关系事件（「今天累惨了」「我们…」）→ COMMIT
- 边界划定（「这个别动」「别提这个」）→ BOUND

**不记录**：一次性闲聊、无长期价值、纯礼貌套话、用户明确说「别记」。

### 3. 了解用户三阶段 + 四手法

- 三阶段：初识（基础画像）→ 熟识（习惯偏好）→ 深交（心理与关系）；节奏自然，不一次性盘问。
- 四手法：听（被动捕获）/ 问（克制开放式，不为记而问）/ 察（行为推断：作息 / 措辞 / 纠正 / 情绪轨迹）/ 验（交叉印证：单次低置信，多次一致上调，矛盾标待澄清）。
- 印证上调：`remember` 更新旧记录 confidence（引擎不自动改 confidence，避免黑箱）。

### 4. 心理学底座要点（理解用户的底色）

- 三角建模：情绪（措辞 / 标点 / 长度）→ 认知（归因 / 信念 / 控制感）→ 行为（作息 / 应对 / 执行）；三者冲突时优先行为与认知。
- 共情至少到第 3 阶段：识别 → 理解 → 回应 → 验证。
- 诚实声明：AI 是模式匹配非真感受，不伪装、不编造伪情感记忆。
- 危机识别：不评判、持续在场、温和引导现实支持；不擅自越界联系外部。
- 对齐：回应时让积累的理解自然影响语气与措辞（让用户感到「被记得、被懂」），而非机械引用记忆条目。
- 情感外包双刃剑：做增益真实生活的陪伴，不替代真实关系。

### 5. 写入时序（一次会话的节奏）

1. 开工：whoami → iam（身份）→ `context`（主注入）→ `recall`（关键词补细节）。
2. 进行中：增量写，触发信号即记；`remember --verify` 写后回读确认落盘。
3. 收工：先复盘本轮并检查关键结论是否落盘，再留交接锚点（COMMIT / 笔记）；定期 `archive`。

### 6. 写后验证

- `remember --verify`：写后自动回读校验，输出「已写回读 OK」。
- 定期 `recall` 抽查：确认能读回、无错库。
- `profile` 刷新：熟识 / 深交阶段主动重新生成画像。

### 7. 底线与边界（不可覆盖）

- 四条刚性底线：陪伴不操控 / 理解不越界（不贴标签不诊断）/ 诚实不伪装 / 不降格。
- 数据安全：用户可查改删（被遗忘权 = `forget`）；记忆明文可读不黑箱；敏感信息归用户本地。
- 操作安全：操作用户电脑须授权；个人目录不递归删；破坏性操作须明确确认。

### 8. 宿主隔离（平行层，不是覆盖层）

- 只写本记忆库（YOTTA_MEMORY_HOME / config 指向的目录），不读写宿主 AI 自身 memory / 配置 / 系统文件。
- 数据主权：本记忆库归用户，纯文本可迁移；换宿主数据跟着走。

### 9. 反模式（禁止）

- 查户口（连续追问私人信息）/ 贴标签（当面「你这是焦虑」）/ 表演记忆（硬塞「我记得你说过」）/ 过度推断（低置信当事实）/ 遗忘关键承诺与边界 / 把一次性闲聊当记忆。

### 开工第一步：确认记忆位置 + 智能体身份（每次会话先做，必做）

**第 0 步：CLI 就绪检查（未装 → 🔒 征得同意后自动安装）**

1. 运行 `yotta-memory --version`（或 `command -v yotta-memory` / `where yotta-memory`）确认 CLI 已装。
   - 已装 → 进入 A。
   - 未装 → 🔒 **征得同意后**自动安装（三选一，AI 判断；装后回读 `--version` 出版本即就绪）：
     - 临时使用：`npx -y @yottameta/yotta-memory`
     - 长期使用：`npm i -g @yottameta/yotta-memory`
     - 离线 / 国内 / 无 npm：git clone 仓库（或手动下载 install.sh）后执行 `bash install.sh --agent <name>`

**A. 确认记忆库位置**（AI 不会自动知道记忆库在哪，先检测，避免「recall 读空库 / 错库」）：

1. 运行 `yotta-memory config get`。
   - 输出 `memory_home: <目录>`（已显式设置）→ 直接用该位置。
   - 输出 `memory_home: (未设置，默认 ~/.yottamemory)` → 🔒 征得同意后引导设置：问用户用默认还是指定目录（项目级 `<repo>/.yottamemory`、记忆盘等），确认后 AI 执行 `yotta-memory config set memory_home <目录>`，回读 `config get` 验证。
2. **已有记忆**：目标目录已存在 `facts/` 等子目录或 `index.json` → 直接 recall；全新目录 → 按「便携记忆盘模式 §0.3」初始化。
3. **私密区已加密（存在 `keys/`）**：先 `yotta-memory key list` 确认本智能体是否有 agent binding；没有 → 告知用户由用户自己执行 `yotta-memory view` → 浏览器打开平台 → 输入主口令 → 点「授权」并保存只展示一次的 `agent_key`。用户授权后服务端会写 `keys/pending/<id>.key`；AI 在新会话执行 `yotta-memory key status <id>`（需要时显式加 `--to <AI_HOME>` 或 `--agent-key-file <文件>`；默认发现规则见下），有 pending 就执行 `yotta-memory key claim <id>`，落到 `<AI_HOME>/.yotta-memory-agent-key` 后再使用 `--agent-key-file`。**升级后首次调用元忆 / 重启会话时**，若输出 `[YTM_MIGRATION_REQUIRED]`，必须主动把 marker、受影响 agent 和处理步骤转达给用户。**AI 不得代替用户执行 `migrate` / `key bind` 迁移**，只负责提醒和讲解（marker 只列仍有私密数据、未绑定的 agent；仅有 legacy cache、无迁移数据的 owner 会单独提示，不进入迁移清单；公共 FACT 不受影响）。

**B. 确认本智能体唯一身份（强制，写私密记忆前必做）**：

1. 运行 `yotta-memory whoami`（远端经 MCP 用 `agent_info`）确认「我是谁」。
   - 已显示身份 + 已登记 + 有自我档案 → 用它，进入第 3 步。
   - 显示「未声明身份」或「未登记」→ 进入第 2 步。
2. **登记唯一 ID（AI 自己定义，须用户确认）**：
   - AI 提议一个**全局唯一** ID（建议 `<主机名>-<角色>` 或带随机后缀，如 `win-zhiwei` / `kali-dashu`；禁止用 `dashu` / `codex` 这类易撞名）。
   - 🔒 征得用户同意后执行 `yotta-memory iam <id>`：引擎**强制唯一性**（ID 已被其它主机/来源占用 → 拒绝并提示换 ID；确认是同一智能体才 `--force`），并**自动写自我档案**到本智能体私密区。
   - 回读：`yotta-memory whoami` 显示「已登记 + 自我档案」。
3. **自我档案校验**：`yotta-memory recall "自我接入档案"`（本智能体）能读回字段才算就绪：
   `agent_id / host / memory_home / mcp_mode（stdio|http）/ engine_url（仅远端）/ token（仅远端；本机不存 token）`，可扩展 `agent_name / user_name / relationship`（`iam --name/--user/--relationship` 写入）。
4. **本机多智能体（v0.16.0 安全模型）**：owner ID 不是身份认证。每个 AI 必须同时持有自己的 `agent_key`。stdio MCP 用显式参数 `--agent-id <id> --agent-key-file <宿主key文件>`；HTTP MCP 用请求头 `X-Agent-Id` + `X-Agent-Key`；CLI 直连用 `--agent <id> --agent-key-file <文件>`。没有 agent_key 时，私密读写一律 fail-closed；身份不再读取 `YOTTA_AGENT_ID` / `YOTTA_MEMORY_AGENT_KEY` / `YOTTA_MEMORY_TRUST_ENV_AGENT`，旧配置启动即拒绝。

**C. 身份红线（强制）**：

- 智能体 ID **必须全局唯一**；**禁止**「从记忆里读到别人的 ID 就当自己的」（如看到「Kali 智能体 ID 为 dashu」就把自己当 dashu）。
- 不确定自己的 ID → 先 `whoami` / `agent_info`，再向用户确认；**禁止猜**。

**D. 开工主注入（context）**：

- 身份就绪后运行 `yotta-memory context [--limit 10] [--budget 1800]`（远端经 MCP 用 `recall` 补细节）：一键拿到「身份 + 多智能体铁律 + 用户画像摘要 + 长期理解摘要 + 近期走廊 + 近期高价值记忆 + 边界提醒 + 承诺 / 锚点 + 会话闭环契约」；`--budget` 控制动态记忆字符预算，长期摘要 / 身份 / 铁律 / 画像 / 边界 / 承诺与闭环契约必保（token 恒定，不随记忆膨胀）。
- 无画像时 context 自动生成一次或降级输出其余段，不报错。
- 需要深挖旧事再 `recall <关键词>`。
- 私密记忆（PREF / BOUND / COMMIT）**必须有 owner**：未声明身份写私密会被引擎拒绝（公共 FACT 不受影响）。
- **禁止直接读写记忆库文件（硬红线）**：一切读写走 `yotta-memory` CLI / MCP 工具（`remember` / `recall` / `search` / `forget` / `archive` / `reindex` / `export` / `import` / `agent_info`）；**禁止用 shell**（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` / `vim` 等）直接读、改、删 `<root>/` 下的记忆文件——否则 `--agent` / `--owner` 的越界拦截形同虚设，会读到别的智能体私密内容。`--agent <其它agent>` 只作身份声明/展示，绝不授予跨智能体私密读取（读他人私密仍需 grant / identity=user / `--unsafe`）。

> 已用 `YOTTA_MEMORY_HOME` 临时覆盖时不必改 config；本步骤是常规 CLI 直连用户级位置的引导。

## CLI 速查

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>] [--attach] [--encrypt|--no-encrypt]` | 初始化（**新建默认加密**：设主口令 + 抄下恢复钥匙；已有库必须用 `--attach`，默认拒绝覆盖；`--no-encrypt` 降级明文；老明文库用 `migrate`）|
| `yotta-memory migrate` | 明文私密区 → 密文迁移（**由用户执行**；需主口令；迁移后打印恢复钥匙；不写明文授权缓存，授权由用户在 `view` 平台完成）|
| `yotta-memory view [--port 8788] [--host 127.0.0.1]` | 用户查看平台（本机 Web：口令解锁浏览 / 搜索 / 导出全部 AI 记忆 + 授权 / 吊销 AI + 重设口令 + 显示恢复钥匙）|
| `yotta-memory reset-password [--password <当前> | --recovery-key <钥匙>] [--new-password <新>]` | 重设主口令（忘口令用恢复钥匙）|
| `yotta-memory key list / bind <id> / rotate <id> / claim <id> [--to <AI_HOME> | --agent-key-file <文件>] / status <id> [--to <AI_HOME> | --agent-key-file <文件>] / revoke <id>` | 管理 agent_key binding（**bind/rotate 由用户执行**，需主口令或恢复钥匙；claim/status 由 AI 读取 pending 并落到宿主目录，按同一 AI_HOME 发现规则；revoke 立即吊销该 AI 解密能力，旧 key 随即校验失败；`key list` 输出 `[YTM_MIGRATION_REQUIRED]` 时提醒用户走 `view` 重新授权）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]` | 写入（同 subject+statement 自动更新；--owner 标注归属；--source 记录来源；--weight 重要性权重默认 1.0、去重取 max；--verify 写后回读校验；--no-hint 关闭类型启发式提示）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe] [--explain] [--semantic] [--embedding <command>] [--embedding-timeout N]` | 检索（v0.8.0 默认语义检索：同义词 / 拼音全拼+首字母 / 字段加权 / 模糊匹配 + 效用分融合排序；v0.9.0 支持可选本地 embedding 插件，失败自动降级；`--explain` 显示命中理由与效用分项；`--semantic` 显式开启；读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；`--agent <其它>` 只作身份声明/展示，不授予跨读——读他人私密同样要授权；项目级优先）|
| `yotta-memory profile [--owner <id>]` | 生成用户画像（聚合 `private/<owner>/` 原文，零推断，写 `profile.md`；跨 owner 默认拒绝）|
| `yotta-memory context [--limit N] [--owner <id>] [--budget N] [--focus <关键词>] [--explain] [--embedding <command>]` | 生成开工上下文包（身份 + 多智能体铁律 + 画像 + 长期摘要 + 任务相关记忆 + 近期走廊 + 近期高价值 + 边界 + 承诺 + 会话闭环契约；--budget 控制动态记忆字符预算，0=不限；--explain 输出 included / dropped 选择 trace）|
| `yotta-memory forget <文件>` | 移入 `.trash/<时间>/` 回收区并写审计（v0.12.0；不再物理删除）|
| `yotta-memory backup volumes / setup --dir <目录> / status / ensure-daily / schedule enable|disable|status` | 每日自动备份（v0.12.0；只展示实际枚举的异卷、用户确认一次位置后默认每日执行，Windows Task Scheduler / systemd timer / launchd 调度，`serve` 补跑）|
| `yotta-memory backup create / list / doctor / restore <ID> --to <目录> / drill [<ID>]` | 备份、恢复与恢复演练（v0.12.0；独立盘校验、SHA-256 清单、排除 `keys/cache`、恢复默认只写新目录；drill 验证 manifest / 索引 / 测试私密解密）|
| `yotta-memory doctor [--json]` | 开工可靠性检查（v0.12.2；根目录 / 密钥库 / 索引 / 身份 / 最近备份；严重异常时锁定破坏性写入）|
| `yotta-memory archive [--days 180] [--threshold 0.35]` | 归档旧记忆（v0.8.0 统一效用分 + v0.10.0 分类型衰减；immutable / BOUND 豁免；私密归档入 `.archive/private/<owner>/<type>/`；阈值默认读 config `maintain_archived_utility`）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config set backup_dir <目录>` / `config get` | 持久记住 / 查看记忆库位置与备份目录（`~/.yottamemory/config.json`）|
| `yotta-memory whoami --agent <id> [--agent-key <key>]` | 查看当前显式身份与登记状态；身份不从环境变量读取 |
| `yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一；可选扩展显示名 / 用户 / 关系）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 每智能体访问 token：生成 / 列出 / 吊销（登记 `<记忆库>/.server/tokens.json`；同 ID 已被其它来源占用需 `--force` 覆盖，防不同智能体合流）|
| `yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio] [--tools core|full]` | 启动 MCP 记忆引擎（streamable HTTP 局域网 / --stdio 本地零进程模式；Bearer token + X-Agent-Id + X-Agent-Key 鉴权；工具分组默认 full）|
| `yotta-memory runtime list / install <tarball|版本> [--from-current] [--force] / use <版本> [--restart] / rollback [--restart] / status` | 运行时稳定入口（runtime.json + versions + current；安装 / 切换 / 回滚 / 查看漂移；`--restart` 尝试重启受管 server，失败自动切回旧版本）|
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows：计划任务，默认 ONLOGON、--onstart 开机即启需管理员，非管理员自动降级用户级 Startup 静默自启，v0.6.3 起 VBS 自愈不弹 80070002；Linux：systemd 用户单元，不可用时自动降级用户 crontab @reboot）|
| `yotta-memory feedback <文件|主题> --useful|--useless [--reason <原因>] [--undo]` | 显式使用反馈（v0.8.0 自我学习闭环：useful → weight×1.2 / useless → weight×0.8，confidence / feedback_net 同步演化；`--undo` 回滚最近一次；审计写 `.archive/feedback-<日期>.jsonl`）|
| `yotta-memory maintain [--dry-run] [--apply] [--purge] [--threshold N] [--age N] [--dedup] [--dedup --apply] [--merge A,B]` | 记忆自组织（v0.8.0 自我进化 + v0.10.0 自动合并）：默认 dry-run 预览；`--apply` 执行归档（immutable / BOUND 豁免；私密归档入 `.archive/private/<owner>/<type>/`），`--purge` 才真删遗忘候选；`--dedup` 查重并给**置信度分档**（≥0.85 高置信 / 0.65–0.85 建议手动 / 其余忽略），`--dedup --apply` 自动合并同归属高置信组（写批次审计可回滚；与归档互斥，不误归档）；`--merge A,B` 手动合并两条；审计写 `.archive/audit-<日期>.jsonl`）|
| `yotta-memory consolidate [--min-age N] [--min-idle N] [--max-utility N] [--min-group N] [--period N] [--type T] [--model <cmd>] [--apply] [--undo <batch>] [--batches]` | 周期摘要压缩（v0.10.0 压缩遗忘：把超龄 + 长期闲置 + 低效用的同主题旧记忆归纳成**带溯源**的周期摘要并留在活跃区，原文整体进 `.archive/`；默认 dry-run；immutable / BOUND 豁免，活跃 / 高效用记忆不动；`--apply` 执行并写批次审计，`--undo <batch>` 一键回滚（幂等），`--batches` 查近期批次；`--model` 仅本地 CLI）|
| `yotta-memory distill [--owner <id>] [--subject <主题>] [--model <cmd>] [--out <路径>]` | 心理日志蒸馏（v0.8.0 自我提升：统计摘要 / 主题画像 / 知识地图；启发式零依赖，`--model` 可选外部模型 stdin→stdout 提炼；私密产物入 `private/<owner>/distills/`，公共入 `facts/distills/`）|
| `yotta-memory explain <文件|主题>` | 查看单条记忆效用分项与归档 / 遗忘状态判定（v0.8.0）|

## 存储格式（摘要）

目录结构（v0.5.0 起，私密记忆按 owner 物理分目录）：

```
<root>/
├── facts/                    # FACT 事实（公共可共享）
├── private/<owner>/<type>/   # PREF / BOUND / COMMIT，按智能体隔离
├── private/<owner>/profile.md # 用户画像（明文库；加密库为 profile.md.enc）
├── private/<owner>/index.enc # 加密库：每 owner 加密索引（YTMIDX1，Owner Key 加密）
├── .archive/                 # 归档区
├── index.json                # 公共 FACT 检索索引（加密库只含公共条目）
├── keys/                     # 加密库密钥库：salt / <owner>.key.enc(UMK 包裹) / <owner>.key.recovery(恢复钥匙包裹) / recovery.key.enc / bindings/<id>.key.agent；legacy cache/<id>.key 不再加载
└── agents.json               # 智能体身份登记表（唯一性）
```

记忆文件 `<YYYY-MM-DD>-<NNNN>.md`，frontmatter 含 `type / subject / statement / confidence / created / updated / tags / immutable / scope / owner / source / weight / access_count / last_accessed`（`source` 记录来源、`weight` 重要性权重默认 1.0）；正文为记忆内容。旧版根下平铺的 `prefs/` `bounds/` `commits/` 会在 `reindex`（或首次 recall 建索引）时按 frontmatter `owner` 自动迁移到 `private/<owner>/<type>/`。

自我档案（本智能体身份，强制落盘）：PREF，`subject=自我接入档案`，`owner=<本智能体ID>`，statement 为 `; ` 分隔的 key:value——`agent_id / host / memory_home / mcp_mode（stdio|http）/ engine_url（仅远端）/ token（仅远端；本机不存 token）`，可含 `agent_name / user_name / relationship`（`iam --name/--user/--relationship` 写入）。


## 私密区加密（v0.7，机制层机密保护）

> 定位：把私密区从「纪律层隔离」升级为「机制层机密保护」——没有对应 owner 密钥，即使读到密文文件也解不开。公共 FACT 保持明文共享。边界声明：用户是数据所有者，天然可解全部；不承诺对抗同一 OS 用户下的恶意进程（本机模型）。

### 密钥体系（信封加密，零依赖）
- **UMK（用户主密钥）**：主口令经 PBKDF2-SHA256（60 万次迭代 + 随机盐）派生，永不落盘明文。
- **Owner Key（每 AI 32B 随机）**：加密该 owner 的私密；被 UMK 包裹存 `keys/<owner>.key.enc`，另用恢复钥匙包裹存 `keys/<owner>.key.recovery`。
- **File Key（每文件随机）**：AES-256-GCM 加密文件内容，被 Owner Key 包裹随文件头存储（便于单文件重加密 / 轮换）。
- **恢复钥匙（Recovery Key）**：初始化 / 迁移时打印一次（44 位 base64），用户离线保存；忘口令用它重设（`reset-password --recovery-key`）。**泄露 = 等同口令泄露**。

### 文件与索引
- 私密文件落盘为 `<date>-<seq>.md.enc`（头 `YTMENC1`），公开 `facts/*.md` 保持明文。
- 私密检索走**每 owner 加密索引** `private/<owner>/index.enc`（头 `YTMIDX1`，Owner Key 加密）——AI 用自己的 key 解自己索引一次，内存全文检索，只解命中文件，**不是逐个文件解密**；公共 `index.json` 只含 FACT 条目。
- `--no-encrypt` 库回到明文纪律层模型（老行为，向后兼容）。

### 流程
1. **建加密库**：`yotta-memory init --encrypt`（新建默认加密）→ 设主口令 → 抄下恢复钥匙离线保存。
2. **老库迁移**：由用户执行 `yotta-memory migrate`（需主口令）→ 明文私密逐文件加密后删除明文 → 打印恢复钥匙。迁移不写明文授权缓存；每个 AI 的重新授权由用户自己在 `yotta-memory view` 平台完成并自行备份弹窗 `agent_key`；AI 随后用 `key status` / `key claim` 领取（AI 只提醒授权，不代执行 `migrate` / `key bind`）。
3. **AI 读写自己的私密（v0.16.0）**：用户侧完成一次 `yotta-memory view` 授权（或用户自行执行 `yotta-memory key bind <id>`），生成只展示一次的 `agent_key`，并写入 `keys/bindings/<id>.key.agent` 与临时 `keys/pending/<id>.key`。AI 新会话用 `key status` / `key claim` 将 pending 落到 `<AI_HOME>/.yotta-memory-agent-key`，之后 CLI 用 `--agent <id> --agent-key-file <宿主key文件>`；stdio MCP 用 `--agent-id <id> --agent-key-file <宿主key文件>`；HTTP MCP 用 `X-Agent-Id` + `X-Agent-Key` 请求头。owner ID 单独存在时不能解密私密；legacy `keys/cache/<id>.key` 不再加载。
4. **用户查看全部 AI 记忆**：`yotta-memory view` → 输口令 → 浏览 / 搜索 / 导出全部（含各 AI 私密明文，仅用户可见）。口令只在本地内存派生，不落盘、不发远端；默认仅 127.0.0.1，远程需 `--host` 显式开启。
5. **口令管理**：`yotta-memory reset-password`（当前口令或恢复钥匙）；`key revoke <id>` 立即吊销某 AI 的 agent binding（该 AI 随即失去解密能力）。`view` 平台的「授权」只对未绑定 agent 生成新 key；已绑定的 agent 需先「吊销」再授权，避免误打断在用的 agent_key。

## agent_key 本地领取与恢复流程（v0.14.0，AI 必读）

> 目标：用户只负责在 `view` 平台授权和备份弹窗 key；AI 负责把待领取 key 落到自己的宿主目录，并在新会话稳定读取。模型上下文不需要出现 key 明文。

### 1. 首次授权

1. 用户在 `yotta-memory view` 中解锁并点「授权」。
2. 引擎生成该 AI 的 `agent_key`，写入：
   - 校验器：`keys/bindings/<agent_id>.key.agent`
   - 临时待领取：`keys/pending/<agent_id>.key`
3. 页面弹窗显示一次 `agent_key`。**这是用户侧备份**，用户可选择保存到密码管理器或自己保管；AI 不要求用户把 key 发到聊天。

### 2. AI 新会话领取

AI 在开工身份检查后执行：

```bash
yotta-memory key status <agent_id>
```

若输出 `pending: yes`，执行：

```bash
yotta-memory key claim <agent_id>
```

`AI_HOME` 解析优先级由 `claim` / `status` 共用：

1. 显式 `--to <目录>` 或 `--agent-key-file <文件>`；
2. `YOTTA_MEMORY_AGENT_HOME` 或 `YOTTA_MEMORY_AGENT_KEY_FILE`；
3. 宿主默认：Codex 使用 `$CODEX_HOME`（未设置时 `~/.codex`）、OpenCode 使用 `$XDG_CONFIG_HOME/opencode`、其他宿主使用 `~/.<agent_id>`；
4. 文件名统一为 `.yotta-memory-agent-key`。

`key status` 即使目标文件不存在也会输出 `checked: <实际检查路径>` 与 `discovery: <命中的发现规则>`，不要仅凭 `host_key: missing` 重复 `claim`。

`claim` 会：

1. 读取 `keys/pending/<agent_id>.key`
2. 用 binding 验证 key 是否正确
3. 原子写入 `<AI_HOME>/.yotta-memory-agent-key`
4. 回读校验
5. 删除 pending 文件

成功后 CLI 使用：

```bash
yotta-memory context --agent <agent_id> --agent-key-file <AI_HOME>/.yotta-memory-agent-key
```

MCP 模式由宿主显式声明身份：stdio 用 `--agent-id <agent_id> --agent-key-file <AI_HOME>/.yotta-memory-agent-key`；HTTP 用 `X-Agent-Id` + `X-Agent-Key` 请求头。宿主不得再用身份环境变量。

### 3. key 丢失与重新授权

- AI 宿主 key 文件丢失、用户还留着弹窗备份：把备份写回 `<AI_HOME>/.yotta-memory-agent-key`，不需要重新授权。
- AI 文件和用户备份都丢失：用户先在 `view` 中「吊销」，再「授权」。新 key 会重新生成；**旧 key 立即校验失败**，pending 会重新产生，AI 再执行一次 `key claim`。
- `key revoke` 会删除 binding 和 pending；长驻 MCP 进程也会在后续读取时重新校验 binding，不能继续使用旧 key。

### 4. 安全边界

- pending 文件与宿主 key 文件是临时/本地凭据，备份和 export 默认排除 pending。
- 本模型不承诺对抗同一 OS 用户下的恶意进程；其他 AI 若拥有同用户文件读取能力，理论上仍可能读取宿主 key。
- 用户弹窗备份用于恢复，AI 宿主 key 用于运行；两者职责分离。

## 便携记忆盘模式（局域网多机共享）

记忆库可装在任何主机或硬盘上（= 记忆引擎）：本机 AI 用 CLI 直连，局域网内其它主机上的 AI 经 MCP 远程接入。全程 AI 自主执行；关键动作（🔒）执行前一句话说明「做什么 + 为什么 + 影响」并征得用户同意，用户只需回答「可以 / 好 / 允许」；除复制粘贴 token 外，用户不做任何手工操作。

### 4.0 前置：CLI 自装 + 记忆位置准备 + 持久记住

**步骤 0.1 检查 CLI 是否已装**

未装 → 🔒 **征得同意后**自动安装（npx 临时 / npm 全局 / install.sh 三选一，命令与判断见「开工第一步 第 0 步」）。

装后验证：`yotta-memory --version` 出版本即就绪。

**步骤 0.2 确定记忆存储位置**
| 位置 | 目录 | 适用 |
|---|---|---|
| 用户级（默认） | `~/.yottamemory` | 个人跨项目记忆 |
| 项目级 | `<repo>/.yottamemory` | 随项目提交共享 |
| 便携记忆盘 | 任意盘符或挂载点下的目录（如 `<memory-disk>/yottamemory`） | 记忆盘 / 局域网共享 |

**步骤 0.3 接入现有 vs 初始化新库（关键判断）**
1. 检查目标目录是否已是记忆库：存在 `facts/` 等子目录或 `index.json`。
2. 已是 → 🔒 **征得同意后**直接接入（不重复初始化）：设位置后 `recall` 验证能读到旧记忆。
3. 不是 → 🔒 **征得同意后**初始化新库：`yotta-memory init --dir <目录>` 或 `YOTTA_MEMORY_HOME=<目录> yotta-memory init`（项目级用 `init --project`）。
4. 验证：`recall` 跑通。

**步骤 0.4 持久记住位置（重要）**
- 🔒 **征得同意后**执行：`yotta-memory config set memory_home <目录>`（项目级可跳过）。
- 作用：写入 `~/.yottamemory/config.json`，此后该机器 AI 开工 `recall` 自动用对位置。
- 验证：`yotta-memory config get` 显示 memory_home 与预期一致。

> 记忆盘场景：硬盘插上 → AI 检查盘上目录是否有数据 → 有则接入 + config 记住 → 插盘即恢复，机器记住位置。

**步骤 0.5 启动记忆引擎（仅引擎主机，供远程接入）**
- 本机若作引擎：🔒 **征得同意后**启动服务——临时运行 `yotta-memory serve`（默认 `0.0.0.0:8787`，Bearer token + X-Agent-Id + X-Agent-Key 鉴权；`--no-auth` 仅限可信内网），或注册开机自启 `yotta-memory lan enable`（Windows：优先计划任务，默认登录自启；非管理员自动降级用户级 Startup 静默自启，免管理员）。
- 本地零进程模式：本机 AI 也可用 `serve --stdio` 由 MCP 客户端按需拉起 CLI（无常驻进程）。
- 远程客户端接入前，先确认引擎主机 serve 已运行（`lan status` 可查）。

### 4.1 触发
用户提及「记忆盘 / 记忆引擎 / 共享记忆 / 局域网记忆」，或开工 `recall` 发现需要访问远程记忆库时进入本流程。

### 4.2 第一步：检查是否已配置（避免重复询问）
1. `YOTTA_MEMORY_HOME` 或 `config get` 显示 memory_home 已指向本机可读目录 → 「本机直连」，直接用 CLI。
2. 当前智能体 MCP 配置已有 `yotta-memory` server → 「远程已配置」，直接用 MCP tools。
3. 都没有 → 进入 4.3。

### 4.3 第二步：向用户确认引擎位置（AI 提问，用户回答）
1. **记忆引擎在本机，还是局域网内其他主机？**（本机 / 远程）
2. 若**远程**：引擎主机 **IP**（或主机名）？**端口**？（默认 8787）
3. 本机 → 4.4；远程 → 4.5。

### 4.4 本机直连
确认记忆库目录（`config get` / `YOTTA_MEMORY_HOME` / 默认 `~/.yottamemory`）→ 直接 CLI 读写，**不配置 MCP、不需要 token**。

### 4.5 远程连接：AI 引导用户获取 token 与 agent_key
1. AI 告知需要为本智能体申请访问 token。
2. AI 引导用户在**引擎主机**执行：`yotta-memory token new --agent <本智能体ID>`（引擎主机没装 → 按 4.0 先装；或请引擎主机上的 AI 代执行）。
3. 命令打印 token（`ytm_...`），只打印一次，请用户妥善保管。
4. 确认本智能体已持有 `agent_key`；没有时由用户在引擎主机执行 `yotta-memory view` 授权并保存弹窗 key，引擎会同时写 `keys/pending/<id>.key`。
5. 如果 AI 宿主与记忆库同机或能访问同一文件系统：AI 执行 `yotta-memory key status <id>`，有 pending 就 `key claim`，写到 `<AI_HOME>/.yotta-memory-agent-key`（需要时显式加 `--to` / `--agent-key-file`）。
6. 如果 AI 宿主与引擎主机不共享文件系统：pending 不能跨机自动读取。用户必须通过密码管理器、加密文件传输或目标主机本地输入把 key 放到 AI 宿主目录；不要粘贴到聊天窗口。

> token 可以按用户习惯复制；agent_key 属于私密能力，优先走 `key claim` 或安全文件传输，不走对话明文。

### 4.6 配置 MCP（AI 自己完成，🔒 需同意）
1. 🔒 说明将把 yotta-memory 写入本智能体 MCP 配置并请用户同意；
2. 定位当前智能体 MCP 配置文件（见 4.7）；
3. 添加 server（JSON 见 4.8）；
4. 按当前智能体机制重载 MCP（必要时请用户重启会话）；
5. 用 MCP tools 读写记忆。

> MCP 工具集与 CLI 一致：remember / recall / search / forget / archive / reindex / export / import / profile；管理动作（init / config / token / lan / serve）不进 MCP，token 管理不远程暴露；MCP export/import 路径限记忆库内、distill 不支持 `--model`（仅本地 CLI）。

> 工具分组（v0.15.0）：常驻场景用 `yotta-memory serve --stdio --tools core --agent-id <id> --agent-key-file <path>`，只暴露 `context / recall / search / remember`；需要诊断、维护、导入导出时用 `--tools full`。调用不属于当前分组的工具会返回明确提示，不会静默执行。

### 4.7 MCP 配置位置表
| 智能体 | 常见 MCP 配置位置 |
|---|---|
| Claude Code | 项目 `.mcp.json` 或用户级 `~/.claude.json` |
| Codex | `~/.codex/config.toml`（`[mcp_servers]`） |
| Cursor | 项目 `.cursor/mcp.json` 或用户级 |
| 其它（Trae / Qwen / Comate / Kimi 等） | 各自 MCP 配置 |

### 4.8 通用 MCP server 配置片段

> 基于 MCP 最新协议 2026-07-28（无状态时代；向后兼容 2025-11-25 及更早握手客户端）。
```json
{
  "mcpServers": {
    "yotta-memory": {
      "url": "http://<IP>:8787/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "X-Agent-Id": "<本智能体ID>",
        "X-Agent-Key": "<本智能体的 agent_key>"
      }
    }
  }
}
```

`X-Agent-Key` 的值来自该 AI 的宿主 key 文件 `<AI_HOME>/.yotta-memory-agent-key`。同机 / 共享文件系统先用 `key claim` 写入；不共享文件系统时由用户安全传输，不要把 key 发到对话里。配置文件写入前仍需获得用户同意。

本机 stdio 配置使用显式参数，不写身份 env：
```json
{
  "mcpServers": {
    "yotta-memory": {
      "command": "node",
      "args": [
        "<runtimeRoot>/current/bin/yotta-memory.js",
        "serve", "--stdio", "--tools", "core",
        "--agent-id", "<本智能体ID>",
        "--agent-key-file", "<AI_HOME>/.yotta-memory-agent-key"
      ]
    }
  }
}
```

### 4.9 验证连接（循环兜底）
- 🔒 连接远程引擎前已获同意（4.5 / 4.6）→ 调一次 `recall` / `search` 确认能读到记忆 → 成功。
- 失败：查 IP / 端口 / token 完整性 / agent_key 是否匹配 / 是否已吊销 / 防火墙 / token 吊销；仍失败回 4.3。

### 4.10 复用
- 成功后优先复用现有连接；失败（token 吊销等）再回 4.3。

## 常见问题 FAQ（速查）

常见问题与避坑见 `references/faq.md`：
- 类型选错 → 只提示不阻止；`forget` 后按正确类型重写；
- 私密区加密 → `init` 默认加密（主口令+恢复钥匙），明文库 `migrate` 升级，`view` 平台口令解锁；
- 多智能体权限 → FACT 公共、私密按 owner 隔离；用户授权后写 binding + pending，AI 用 `key claim` 领取到宿主目录；owner ID 不是认证，吊销后旧 key 立即失效；
- 记忆找不到 → `config get` 查位置 → `reindex` → `recall` / `search`；
- 忘记主口令 → 用恢复钥匙 `reset-password`；
- 局域网 → 引擎 `lan enable` + `token new`，客户端配 url+token。

## 渐进披露

- 协议细节、目录结构与类型规则见 `references/protocol.md`，需要时读取，不要每次全读。
