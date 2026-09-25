# 元忆 FAQ / 避坑指南

> 常见问题速查：记忆找不到、权限/加密困惑、连不上时先看这里。

## 1. 记忆类型选错了怎么办？
类型只在写入时提示、不阻止（FACT=公共 / PREF、BOUND、COMMIT=私密）。写错不影响已写入内容；想改类型可 `forget` 后按正确类型重写。不需要提示可用 `--no-hint`。

## 2. 私密区加密怎么用？
`init` 默认初始化加密库（需主口令 + 恢复钥匙，请妥善保存）；明文库可用 `migrate` 升级为加密。私密区文件为 `.md.enc`，可 git 版本化。查看/授权用 `yotta-memory view`（口令解锁，浏览/授权/吊销 AI）；授权时一次性展示的 `agent_key` 请立即保存，服务端同时写 `keys/pending/<id>.key` 供该 AI 新会话用 `key claim` 领取。出现 `[YTM_MIGRATION_REQUIRED]` 说明还有 agent 未绑定，请由你在 `view` 平台逐个点「授权」完成重新授权（AI 只提醒、不代执行）。

**明文库第一次转加密**：

```powershell
yotta-memory migrate --recovery-key-out "$env:USERPROFILE\yotta-memory-recovery.key"
```

按提示输入主口令；非 ASCII 口令请交互输入，非 TTY 自动化可使用 `YOTTA_MEMORY_PASS`。不要使用 `echo 中文 | ...`，Windows 管道可能改变实际口令；若迁移后 `view` 报口令错误，用恢复钥匙 `reset-password` 重设。迁移后授权二选一（等价）：推荐 `yotta-memory view` 页面授权；高级用户可 `yotta-memory key bind <id>`。授权并 `key claim` 后，带 `--agent-key-file` 执行 `yotta-memory reindex` 重建每 owner 加密索引，再做 `recall` 验证。

## 2.1 非 TTY / GUI 宿主怎么初始化？
不要依赖交互提示。用 `--password-stdin` 从管道读主口令（不进 argv），或用 `YOTTA_MEMORY_PASS`；恢复钥匙用 `--recovery-key-out <文件>` 写文件，避免 GUI 宿主吞掉 stdout。非 TTY 且未提供口令时会明确提示改用哪种方式，不会静默「已取消」。

## 2.2 空加密库 `view` 打不开？
v0.16.2 起，空加密库（没有 owner key）可用恢复钥匙校验主口令进入 `view`。如果页面显示「无 owner」，先在终端执行 `yotta-memory iam <id>` 登记身份，再回页面授权；也可以由用户在终端执行 `yotta-memory key bind <id>`。

## 2.3 `--agent-key-file` 指向的文件不存在？
文件不存在时不再致命：元忆进入未授权模式，公共 FACT 仍可读；`migrate` / `doctor` / `config` 等公共或维护命令不会再向 `stderr` 打印降级警告。只有私密读写 fail-closed，并提示缺失文件、`view` / `key bind <id>`、`key status` / `key claim`。需要程序化判断时，使用 `whoami --json`、`doctor --json` 或 `config get --json` 的 `identity.mode` / `identity.agentKeyStatus`。文件存在但为空或不可读仍会报错。推荐用 `YOTTA_MEMORY_AGENT_HOME` 指定宿主目录，授权后 key 原地生效。

## 2.4 迁移后必须 `key bind` 吗？
不必。`yotta-memory view` 页面授权和 `yotta-memory key bind <id>` 是两条等价路径：两条都会写 `binding + pending`，随后 AI 都执行 `yotta-memory key status <id>` → `yotta-memory key claim <id>`，再落到 `<AI_HOME>/.yotta-memory-agent-key`。普通用户推荐 `view`，高级用户或无可视化环境再用 `key bind`。

## 2.5 迁移后 `recall` 读不到私密怎么办？
先确认已经完成授权和 `key claim`，再带 agent key 重建加密索引：

```cmd
yotta-memory reindex --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
yotta-memory recall <关键词> --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
```

`migrate` 在没有 agent_key 时无法建立每 owner 加密索引，所以 `reindex` 必须在授权 / claim 之后执行。MCP 场景还要确认宿主配置带 `--agent-key-file`，只有 `--agent-id` 会报缺少 agent_key。

## 3. 多智能体权限怎么隔离？
公共 FACT 所有智能体可读；PREF / BOUND / COMMIT 按 owner 物理隔离，调用方必须持有匹配的 `agent_key`（用户执行 `key bind <id>`，或在 `view` 平台授权获得）。owner ID 单独存在不构成认证，不授权 / 无 key 读不到。私密操作缺 key 时会输出 `[YTM_MIGRATION_REQUIRED]`；授权完成后该标记消失。AI 新会话用 `key status <id>` 检查，pending 存在则 `key claim <id>` 落到 `<AI_HOME>/.yotta-memory-agent-key`；`AI_HOME` 默认规则由 claim / status 共用（显式 `--to` / `--agent-key-file` > `YOTTA_MEMORY_AGENT_HOME` / `YOTTA_MEMORY_AGENT_KEY_FILE` > Codex / OpenCode / 通用宿主默认），status 会显示 `checked` 与 `discovery`。吊销后旧 key 立即校验失败，需重新授权。

## 4. 记忆找不到了？
先 `config get` 确认 `memory_home` 指向的库；再 `reindex` 重建索引（升级后索引版本变化会自动重建）；最后 `recall <关键词>` / `search <词>` 语义检索。跨项目记忆在项目级 `.yottamemory`。

## 5. 忘记主口令了？
用初始化时保存的**恢复钥匙**：`yotta-memory reset-password`。没有恢复钥匙则私密区无法解锁（这是加密的预期行为），公共 FACT 不受影响。

## 6. 局域网（便携记忆盘）怎么连？
引擎主机 `lan enable` 注册开机自启（Windows 计划任务 / Linux systemd）→ `token new --agent <id>` 生成 token；客户端配 `url: http://<主机IP>:8787/mcp` + `Authorization: Bearer <token>` + `X-Agent-Id: <id>` + `X-Agent-Key: <agent_key>`。同机 / 共享文件系统由 AI 用 `key status` / `key claim` 领取宿主 key；跨机不共享文件系统由用户通过密码管理器或安全文件传输放置，不走聊天明文。`lan status` 查状态。

## 6.1 全局 CLI、MCP 或常驻服务版本不一致？
先跑 `yotta-memory doctor --runtime`：它会列出 CLI、current、`runtime.json`、MCP 配置、运行中 server、技能副本与身份模式的漂移，并给出实际版本、期望版本、修复命令和是否阻断。用 `yotta-memory runtime install --from-current` 建立 `<runtimeRoot>/current` 稳定入口；升级用 `runtime install <tarball|版本>` + `runtime use <版本> --restart`，回滚用 `runtime rollback --restart`。`lan enable` 与备份调度只登记 `current/bin/yotta-memory.js`，不再写死版本目录。

## 7. MCP 工具没加载？
检查客户端 `mcpServers` 已配置 yotta-memory（url + token + agent_key）；agent_key 应来自 `<AI_HOME>/.yotta-memory-agent-key` 或 MCP secret 注入，不把明文 key 写进对话。改配置后重启/重载会话。本机直连可不配 MCP，直接用 CLI。

## 7.1 MCP 工具太多，想减少常驻工具？
用 `serve --tools core` 启动，工具列表只保留 `context / recall / search / remember`；需要 `doctor`、`forget`、`maintain`、`distill` 等完整能力时改用 `--tools full`。未指定 `--tools` 时默认仍为 `full`，不会影响已有配置。

## 8. 记忆库在哪个目录？
`yotta-memory config get` 查看；`config set memory_home <目录>` 改位置。项目级记忆用 `init --project`（存 `.yottamemory/` 随项目共享）。

## 9. 跨会话恢复上下文？
开工运行 `yotta-memory context`（身份 + 铁律 + 画像 + 长期摘要 + 近期走廊 + 近期高价值 + 边界 + 承诺 + 会话闭环契约），需要细节再 `recall <关键词>`；摘要优先来自 `consolidate` 产物，收工前按闭环契约复盘并检查关键结论是否落盘。

## 10. 备份与迁移？
优先使用 `backup create --dir <独立盘目录>` 创建整库备份；`backup list` 查看，`backup doctor` 校验 SHA-256，`backup restore <id> --to <新目录>` 恢复到新目录。备份默认拒绝与记忆库同卷。`export --out 文件.json` 仍可用于跨工具迁移；公共 FACT 是明文文件也可直接 git 备份。v0.12.2 起，破坏性操作也会在写入前自动创建事务快照。

## 13. init 会不会覆盖已有记忆？
不会。v0.12.0 起 `init` 遇到已有记忆库默认拒绝；接入现有库用 `init --attach`。`--force` 也不能覆盖已有记忆库；强制重建需要完整备份与显式确认保护，当前版本不提供覆盖初始化路径。

## 11. 记忆太多 / 越来越膨胀怎么办？
两步走：`yotta-memory maintain --apply` 归档单条低效用旧记忆；同主题积累了很多「又老又不常用」的旧条目时，用 `yotta-memory consolidate`（先预览）→ `consolidate --apply` 把它们归纳成 1 条带溯源的周期摘要并归档原文。v0.12.2 起这些写操作要求先通过 doctor，并会自动创建事务快照；没有独立备份目录时会拒绝执行。也可以先 `config set maintain_decay_halflife_COMMIT 90` 等让任务类承诺更快让位。

## 12. consolidate 和 distill 有什么区别？
`distill` 是全库当前快照的统计报告（不淘汰任何记忆，产物是报告）；`consolidate` 是生命周期压缩——只针对超龄 + 长期闲置 + 低效用的旧记忆，生成可检索的周期摘要、把原文归档，让记忆库变小且主题不丢。两者互补：想「看看我记了什么」用 distill；想「给记忆库瘦身」用 consolidate。

## 13. consolidate 误压缩了怎么回滚？
每次 `consolidate --apply` 都会写一个批次（manifest），`yotta-memory consolidate --batches` 可查 batch id，然后 `yotta-memory consolidate --undo <batch>` 一键回滚：删除生成的摘要、把原文从 `.archive/` 归位、还原被合并记忆的原始状态。重复 `--undo` 同一批次会被幂等拒绝。注意 `maintain --purge` 的硬删除不可回滚。

## 14. 半衰期 / 归档阈值怎么调？
`yotta-memory config set maintain_decay_halflife_FACT 1000`（FACT 慢衰减，单位天）、`maintain_decay_halflife_PREF` / `maintain_decay_halflife_COMMIT` 同理；BOUND 固定不衰减。归档阈值：`config set maintain_archived_utility 0.3`、`maintain_archived_age 180`；consolidate 参数 `consolidate_min_age` / `consolidate_min_idle` / `consolidate_max_utility` / `consolidate_min_group` / `consolidate_period`。改完 `config get` 可复查；单次运行也可用 CLI 参数（如 `consolidate --min-age 90`）临时覆盖。

## 15. 两个命令有什么区别？怎么更新？

- `yotta-memory` 是引擎 CLI，负责读写记忆库；`npx -y @yottameta/yotta-memory` 只是临时运行引擎，**不会安装技能**。
- `yotta-memory-install` 是技能安装器。安装或更新技能用 `npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`；用 `--dir` 安装时传入同一个技能目录。
- 更新 CLI：`npm i -g @yottameta/yotta-memory`。更新技能：重跑上面的 `--package ... yotta-memory-install` 命令，或全局安装后运行 `yotta-memory-install --agent <name>`。
- 为什么在 `npx -y @yottameta/yotta-memory` 后面加 `--agent <name>` 没有安装技能？因为 npm 默认运行的是包内同名的 `yotta-memory` 引擎 bin，而不是 `yotta-memory-install`；必须用 `--package` 显式指定安装器 bin。

## 16. 开工时怎么知道记忆库是否可靠？
运行 `yotta-memory doctor`。它只读检查记忆库根目录、加密库密钥文件、公共索引、`agents.json` 与最近备份；`--json` 可输出机器可读结果。严重异常时会锁定 `maintain --apply`、`consolidate --apply`、`merge`、`archive` 与 `--purge` 等破坏性写入，`context` 也会在开工提醒中显示“破坏性写入已锁定”。先按 doctor 提示修复，再继续写操作。

## 17. 记忆库很大，检索能快一点吗？
公共索引超过 5000 条会按年份分片（`index-<year>.json`）。只关心某一年时用 `yotta-memory recall <关键词> --year 2026`（可重复传多次）或 `yotta-memory context --year 2026`：引擎只读取命中年份的分片文件，不再把所有年份载入内存。不传 `--year` 时行为与旧版完全一致（全量读取）。规模体检看 `yotta-memory doctor` 的「规模」段（条数 / 单目录最大文件数 / 索引总体积），阈值用 `config set scale_warn_entries` 等键调整。

## 18. 怎么证明改了检索 / 索引之后「没变差」？
用 `yotta-memory bench`。默认按库内条目做确定性抽样生成基线评测集，也可以用 `--evalset <文件>` 固定一组查询（评测集 v1：`{"version":1,"queries":[{"query":"...","expect":["<记忆 id>"]}]}`，记忆 id 写相对路径或文件名都可以）。报告给 Recall@k / MRR / nDCG@k / HitRate + 固定种子 bootstrap 95% 置信区间，并写明库指纹与评测集指纹——同库、同评测集、同参数必须同输出，所以改前跑一次、改后再跑一次就能直接对比。接 CI 用 `--gate mrr=0.6`（不达标 exit 1）；`--ablate` 对比关键词 / 语义 × 融合 / 纯分四组；想要耗时再加 `--timing`（带上后报告标记为不可逐字节复算）。`bench` 全程只读：不重建索引、不写访问计数、不调用外部 embedding 插件；索引缺失或版本过旧时会提示先 `reindex`。
