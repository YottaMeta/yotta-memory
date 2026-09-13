## v0.12.2 (2026-09-12)

**可靠性收口：开工 doctor + 破坏性操作前事务快照**

- 修正 `init --force` 的过期拒绝文案：明确已有记忆库的强制重建必须由完整备份与显式确认保护，当前版本不提供覆盖初始化路径。
- 新增 `yotta-memory doctor [--json]`：只读检查记忆库根目录、加密库密钥文件、公共索引、`agents.json` 与最近备份；严重异常返回非零退出码，并锁定破坏性写入。
- 新增 MCP `doctor` 工具；`context` 的开工可靠性提醒改为直接使用 doctor 结果，critical 时明确提示“破坏性写入已锁定”。
- `maintain --apply`（含 `--dedup --apply`）、`consolidate --apply`、`merge`、`archive` 与 `--purge` 在写入前自动创建新的整库事务快照；未配置独立备份目录、doctor critical 或快照失败时拒绝写入，原记忆保持不变。
- `--allow-same-volume` 仍只用于 `backup create` 的显式临时备份，不会绕过破坏性写入门；不存在 CLI 级跳过快照开关。
- 每次事务快照写入 `.archive/audit-<日期>.jsonl`（transaction / operation / snapshot 记录）；`forget` 继续只进 `.trash/`，不重复做整库快照。
- 新增 `test/reliability-doctor.test.js` 与 `test/reliability-destructive-guard.test.js`；既有 consolidate / maintain 回归补齐临时快照目录。

## v0.12.1 (2026-09-12)

安装与更新文档修复（无功能变更）：

- 明确区分两个 bin：`yotta-memory` 是引擎 CLI，`yotta-memory-install` 是技能安装器；`npx -y @yottameta/yotta-memory` 只临时运行引擎，不安装技能。
- README 中英版、USER_GUIDE、SKILL、FAQ 补全安装 / 更新命令：更新技能统一使用 `npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`（或 `--dir <技能目录>`）；全局安装后可运行 `yotta-memory-install`。
- 修正 `bin/install.js` 头部注释中的错误示例，并新增 `test/docs-install-update.test.js` 防止两个 bin 的文档再次漂移。

## v0.12.0 (2026-09-12)

**可靠性基线（误删事故整改）**：

- `init` 对已有记忆库默认拒绝覆盖；新增 `--attach` 接入现有库；`--force` 也不能覆盖已有记忆库，防止初始化再次清空记忆。
- `forget` 不再物理删除，改为移动到 `.trash/<timestamp>/<原相对路径>`，并写 `audit-<date>.jsonl` 审计记录。
- 新增 `backup create / list / doctor / restore <id> --to <目录>`：备份 `facts/`、`private/`、`keys/`（排除 `keys/cache/` 授权缓存）、`agents.json`、`index.json`、`.archive/`，生成 SHA-256 清单；默认拒绝同卷备份；`restore` 默认只恢复到新目录，不覆盖正在使用的记忆库。
- 新增每日自动备份闭环：`backup volumes` 只枚举当前机器实际存在、可写、与记忆库异卷的路径；用户确认一次位置后 `backup setup` 默认启用每日备份（默认 03:30），Windows Task Scheduler / Linux systemd user timer（cron 降级）/ macOS LaunchAgent 负责无人值守，`serve` 启动与每 6 小时用幂等 `backup ensure-daily` 补跑。
- `context` 增加可靠性提醒：未配置、超过 36 小时或失败时提示；用户明确选择手动备份后不重复打扰。
- 新增 `backup drill`：恢复到隔离副本，校验 manifest、重建索引并解密一条测试私密；默认使用本机 owner 授权缓存，裸恢复可显式传恢复钥匙。
- 新增 `test/reliability-init.test.js`、`test/reliability-forget.test.js`、`test/reliability-backup.test.js`、`reliability-backup-volumes/setup/daily/schedule/context/drill`；`npm test` 覆盖既有与新增可靠性测试。

## v0.11.0 (2026-09-06)

**MCP 协议对齐最新版 2026-07-28（无状态时代）**：yotta-memory MCP（stdio + serve streamable HTTP）升级 dual-era——modern 直连（server/discover 免握手、逐请求 _meta 版本声明、resultType、-32022 版本错误、HTTP header 校验 HeaderMismatch -32020）服务新客户端；legacy（initialize 握手，protocolVersion 2025-11-25）兼容旧客户端，旧形状响应零惊扰；HTTP+SSE GET 保留为 deprecated 兼容入口。SKILL 标注「基于 MCP 最新协议 2026-07-28（向后兼容 2025-11-25 及更早握手）」。新增 test/mcp-dualera.test.js（26/26：A 层 + HTTP 层），存量测试全绿。

## v0.10.1 (2026-09-05)

发布件修复：SKILL.md frontmatter `description` 曾以 ASCII 双引号开头但未闭合
（v0.10.0 引入），严格 YAML 解析器会报 MISSING_CHAR，导致技能在 ClawHub/OpenClaw 等
平台注册被跳过。已改为无引号裸标量（内容不变）；validate-skill 新增 frontmatter 引号
闭合检查（防再犯）。版本 0.10.0 → 0.10.1。

## v0.10.0 (2026-09-02)

压缩遗忘（S1）——consolidate 周期摘要 + 近重复自动合并 + 分类型衰减 + 批次回滚。

- **新增 `consolidate`（周期摘要压缩）**：把超龄（默认 ≥180 天）+ 长期闲置（默认 ≥90 天）+ 低效用（默认 ≤0.6）的同主题旧记忆聚类成**带溯源**的周期摘要并留在活跃区，原文整体移入 `.archive/`。默认 dry-run；`--apply` 执行；`--undo <batch>` 一键回滚（幂等拒绝重复）；`--batches` 只读查批次审计。immutable / BOUND 豁免；活跃 / 高效用记忆不动；参数可调（--min-age / --min-idle / --max-utility / --min-group / --period / --type）；`--model <cmd>` 可选本地模型提炼（仅 CLI，协议同 distill）。
- **近重复自动合并（maintain --dedup 增强）**：重复组带置信度分档（≥0.85 高置信 / 0.65–0.85 建议手动 / 其余忽略）；`maintain --dedup --apply` 自动合并同归属高置信组（写批次审计可回滚）。**`--dedup` 与归档/遗忘互斥**：`--dedup [--apply]` 只查重 / 自动合并，不执行归档。
- **分类型衰减曲线**：效用分「时效」从全类型同一线性（365 天归零）改为**指数半衰** `0.5^(d/半衰)`——FACT 慢（默认 730 天）/ PREF 中（默认 365 天）/ COMMIT 任务类快（默认 90 天）/ BOUND 不衰减；半衰可用 `config set maintain_decay_halflife_<TYPE> <天>` 调整。
- **BOUND 归档豁免口径收口**：BOUND 永不归档 / 遗忘（行为对齐文档「immutable / BOUND 豁免」；此前代码只豁免遗忘）。
- **`.archive/` 路径带 owner**：公共 `.archive/facts/`；私密 `.archive/private/<owner>/<type>/`（archive / maintain / merge / consolidate 统一，修复跨 owner 同名撞名隐患；既有存量不迁移）。
- **`config set/get` 支持 maintain_* / consolidate_* 键**（此前文档写了但 CLI 写端只支持 3 个键）。
- **审计升级**：consolidate / 自动合并写批次审计（batch manifest + before/after 影像）；`consolidate --batches` 可查、`--undo <batch>` 可回滚；`--purge` 硬删除维持不可回滚。
- **安全边界不变**：consolidate / undo / batches 属管理动作**不进 MCP**；maintain / archive 维持既有 MCP 暴露；自动合并全程受 owner 写权限约束，跨智能体只预览不执行。
- 测试：新增 `test/consolidate.test.js`（30 断言：dry-run / 公共与私密压缩 / immutable·BOUND 豁免 / 活跃与高效用保护 / min-group / undo 幂等 / 自动合并置信度 / 跨 owner 预览 / 归档互斥 / 衰减单元）+ `test/security-boundary.test.js` 扩至 9 断言（MCP 不暴露 consolidate / undo / batches）；兼容回归 recall-context 4 断言全绿。
- 版本对齐：package.json / SKILL.md frontmatter / CHANGELOG / 引擎 VERSION / 插件 package.json = 0.10.0。

## v0.9.2 (2026-09-02)

发布日期修正。

- 修复 v0.9.1 SKILL.md 正文「最后更新」误写为 2026-09-03（实际发布日为 2026-09-02）的问题；校验工具同步新增「未来日期」拦截。
- 无功能变更。

## v0.9.1 (2026-09-02)

文档版本一致性修复。

- 修复 SKILL.md 正文头部版本行（v0.8.5 / 2026-08-29 残留未随 0.9.0 更新）；正文行改为 0.9.1 / 2026-09-03。
- 版本对齐范围从「四件」扩为「五件」：package.json / SKILL.md frontmatter / SKILL.md 正文版本行 / CHANGELOG / CLI VERSION。
- 无功能变更。

## v0.9.0 (2026-09-01)

召回质量与上下文选择升级。

- **两阶段召回**：词法候选 + 可选本地 embedding 插件候选，统一按语义分与效用分融合排序。
- **可选 embedding 插件**：`--embedding <command>` 或 `config set embedding_cmd <command>`；本地子进程、`stdin/stdout` JSON 协议、超时默认 3000ms、失败自动降级为词法召回。
- **任务感知上下文**：`context --focus <关键词>` 新增任务相关记忆段，按身份 / 边界 / 承诺 / 画像 / 任务记忆 / 近期记忆优先级组装。
- **选择解释**：`context --explain` 输出 included / dropped 与原因；`recall --explain` 继续显示命中理由并补充 embedding 分。
- **MCP 同步**：`recall` / `search` 新增 `embedding` / `embeddingTimeout` / `explain` 参数；新增 `context` 工具。
- **版本四件对齐**：package.json / SKILL.md / CHANGELOG.md / 引擎 VERSION = 0.9.0。

## v0.8.7 (2026-09-01)

评测反馈优化（文档 + 错误提示，功能不变）。

- 新增 `references/faq.md`：10 条常见问题 / 避坑（类型选错、私密区加密、多智能体权限、记忆找不到、忘记主口令、局域网连接、MCP 加载、记忆库位置、跨会话恢复、备份迁移）。
- 错误提示友好化：顶层错误附「修复建议」人话（检查 memory_home、主口令与恢复钥匙等）。
- README 中英：新增「命令输出样例」（init / remember / recall / context 屏幕输出示意）+「常见问题 FAQ 速查」。
- SKILL.md：新增「常见问题 FAQ（速查）」小节，指向 references/faq.md。
- 版本四件对齐 0.8.7（package.json / SKILL.md / CHANGELOG / 引擎 VERSION）。

# 更新日志

## v0.8.5 (2026-08-29)

安全修复（安全扫描发现高危，修复后三源同步升版）：

- **MCP 命令执行入口封死**：MCP `distill` 不再接受 `--model`（`callTool` 在工具边界直接拒绝），远端智能体无法再借 MCP 在引擎主机执行任意命令。
- **MCP 任意路径读写封死**：MCP `export` / `import` 的 `out` / `src` 必须落在记忆库根内（新增 `resolveWithinRoot` 校验，防 `..` 穿越），库外路径直接拒绝，与「远程只能读写记忆」承诺对齐。
- **CLI 参数解析修复**：`--model` / `--subject` / `--reason` / `--merge` 此前被 valueOpts 消费但未写入 opts，导致 `distill --model` / `--subject` 实际不生效；本版补齐映射，CLI `distill --model` 现已真正走 `runDistillModel` 安全路径（`shell:false` + 允许清单）。
- **CLI distill 去 shell 注入**：`distill --model` 改走 `runDistillModel` —— `spawnSync(argv[0], argv.slice(1), { shell:false, windowsHide:true })` + `splitCommandArgv` 拆分 argv，彻底移除 shell 注入面；新增 `distillModelAllowlist`（环境变量 `YOTTA_DISTILL_MODELS` 或 `config.distill_models`，未配置时放行本地 CLI，但已无 shell 注入；MCP 层已直接禁 `--model`，不达此处）。
- 版本对齐：package.json / SKILL.md / CHANGELOG / 引擎 VERSION / 文档边界说明 = 0.8.5。
- 新增回归测试：`test/security-boundary.test.js`（MCP 禁 --model / export-import 限库内 / 合法操作仍可用，6 项断言）。
## v0.8.4 (2026-08-29)

- 安装方式统一为四方式（对齐发布规范 §3.3.1）：方式一 `npx -y @yottameta/yotta-memory --agent <name>` / `--dir <dir>`（推荐，走 npm 源）；方式二 `git clone https://github.com/YottaMeta/yotta-memory.git`；方式三 GitHub Download ZIP；方式四 `bash install.sh --agent/--dir/--list`。移除 `npx skills` 与 `-g` 推荐；中英双 README 安装节同步。
- 版本对齐：package.json / SKILL.md / CHANGELOG / 引擎 VERSION / 测试断言 / README 锚点 = 0.8.4。
- 修复：SKILL.md / USER_GUIDE.md 安装命令改 `--agent <name>` 合规形式（`npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`），移除 `-g` 与 `npx skills` 推荐。
- 无功能变更（仅文档与版本同步）。

## v0.8.3 (2026-08-28)

中英双语 README 对齐（确定「英文门面 + 中文全档」）：

- **README.md 改为英文**：作为 GitHub / npm / ClawHub 首页的英文门面（翻译 + 精简，覆盖定位 / 核心价值 / 四类型 / 权限隔离 / 身份 / 语义检索 / 生命周期 / 对比 / 安装（CLI+技能双装）/ 升级 / CLI 用法 / 局域网共享 / 开发校验全流程）。
- **新增 README.zh-CN.md**：原中文完整主文档整体平移，顶部加语言切换链接。
- **新增 NOTICE + .npmignore + CHANGELOG.md**：对齐 YottaMeta 技能家族标准（品牌声明 + npm 打包排除 + 更新日志）。
- **package.json**：description 改英文；files 加 README.zh-CN.md / NOTICE / CHANGELOG.md；版本 0.8.2 → 0.8.3。
- 版本四处对齐：package.json / SKILL frontmatter / 引擎 VERSION / 文档。
- 边界（B 方案）：references / USER_GUIDE / 测试注释不翻译；SKILL 触发描述保持中文。

## 历史版本

- **v0.8.2 (2026-08-27)**：发布元数据修复——ClawHub 重发带 `--name 元忆 yotta-memory`，修复展示名缺失中文；无功能变更。
- **v0.8.1 (2026-08-27)**：view 用户查看平台服务端分页 + recall 候选预过滤 + 公共 index.json 超 5000 条按年份分片。
- **v0.8.0 (2026-08-27)**：自我学习/自我进化/自我提升——语义检索（同义词/拼音/字段加权/模糊）+ 效用分融合排序 + feedback 反馈闭环 + maintain 规则层自组织 + distill 心理日志蒸馏 + explain；索引 version 3 旧库自动重建。
- **v0.7.0 (2026-08-27)**：私密区机制级加密（AES-256-GCM 信封加密 + 口令派生主密钥 + 恢复钥匙 + 每 owner 加密索引）+ view 用户查看平台 + migrate + reset-password + key 授权 + context 收工纪律。
- **v0.6.5**：recall/context 根位置去重。
- **v0.6.4**：lan enable Linux 开机自启（systemd 用户单元 / 用户 crontab @reboot 降级）。
- **v0.6.3**：开机自启 VBS 自愈（内联启动命令，根治 80070002）。
- **v0.6.2**：remember --verify 写后回读确定性判定。
- **v0.6.1**：context --budget 字符预算 + 多智能体接入铁律 + remember --source/--weight + 近期记忆排序融合。
- **v0.6.0**：灵魂盘核心——profile 用户画像 + context 开工上下文包 + iam 扩展 + remember --verify + SKILL 记忆守则。
- **v0.5.4**：lan enable 非管理员自动降级用户级 Startup 静默自启。
- **v0.5.3**：CLI 选项可前置。
- **v0.5.2**：schtasks /tr 引号写法修复。
