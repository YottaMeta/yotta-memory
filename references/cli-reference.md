# 元忆 CLI 参考（完整命令与选项）

> 本文件是 `SKILL.md` 的展开参考：SKILL 只保留常用命令，完整参数、风险选项与迁移步骤在这里。
> 所有命令都可用 `yotta-memory <命令> --help` 查看当前版本的实际帮助文本。

## 常用命令全表

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>] [--attach] [--encrypt|--no-encrypt] [--password-stdin] [--recovery-key-out <文件>]` | 初始化（**新建默认加密**：设主口令 + 抄下恢复钥匙；已有库必须用 `--attach`，默认拒绝覆盖；`--no-encrypt` 降级明文；老明文库用 `migrate`；非 TTY 用 `--password-stdin`；恢复钥匙可写文件）|
| `yotta-memory migrate [--password-stdin] [--recovery-key-out <文件>]` | 明文库 → 密文迁移（**由用户执行**；首次迁移推荐交互式，非 ASCII 口令勿用 Windows 管道；`view` 授权与 `key bind` 等价关系见《明文库转加密（第一次最短路径）》）|
| `yotta-memory view [--port 8788] [--host 127.0.0.1]` | 用户查看平台（本机 Web：口令解锁浏览 / 搜索 / 导出全部 AI 记忆 + 授权 / 吊销 AI + 重设口令 + 显示恢复钥匙；「高级 / CLI」页 = 全量命令速查（33 命令 / 31 子命令）+ 完整帮助，只展示与复制；已在运行则复用 URL，端口占用给明确提示）|
| `yotta-memory reset-password [--password <当前> | --recovery-key <钥匙>] [--new-password <新>]` | 重设主口令（忘口令用恢复钥匙）|
| `yotta-memory key list / bind <id> / rotate <id> / claim <id> [--to <AI_HOME> | --agent-key-file <文件>] / status <id> [--to <AI_HOME> | --agent-key-file <文件>] / revoke <id>` | 管理 agent_key binding（**bind/rotate 由用户执行**，需主口令或恢复钥匙；claim/status 由 AI 读取 pending 并落到宿主目录，按同一 AI_HOME 发现规则；revoke 立即吊销该 AI 解密能力，旧 key 随即校验失败；`key list` 合并 `keys/*.key.enc`，显示仅有钥、尚未写记忆的 owner；输出 `[YTM_MIGRATION_REQUIRED]` 时提醒用户走 `view` 重新授权）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]` | 写入（同 subject+statement 自动更新；--owner 标注归属；--source 记录来源；--weight 重要性权重默认 1.0、去重取 max；--verify 写后回读校验；--no-hint 关闭类型启发式提示）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--year <yyyy>] [--agent <id>] [--owner <id>] [--all] [--unsafe] [--explain] [--semantic] [--embedding <command>] [--embedding-timeout N]` | 检索（v0.8.0 默认语义检索：同义词 / 拼音全拼+首字母 / 字段加权 / 模糊匹配 + 效用分融合排序；v0.9.0 支持可选本地 embedding 插件，失败自动降级；v0.17.0 起 `--year` 只检索指定年份，分片索引只读取对应分片、可重复传多次、不传即全量；`--explain` 显示命中理由与效用分项；`--semantic` 显式开启；读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；`--agent <其它>` 只作身份声明/展示，不授予跨读——读他人私密同样要授权；项目级优先）|
| `yotta-memory profile [--owner <id>]` | 生成用户画像（聚合 `private/<owner>/` 原文，零推断，写 `profile.md`；跨 owner 默认拒绝）|
| `yotta-memory context [--limit N] [--owner <id>] [--budget N] [--focus <关键词>] [--year <yyyy>] [--explain] [--embedding <command>]` | 生成开工上下文包（身份 + 多智能体铁律 + 画像 + 长期摘要 + 任务相关记忆 + 近期走廊 + 近期高价值 + 边界 + 承诺 + 会话闭环契约；--budget 控制动态记忆字符预算，0=不限；v0.17.0 起 `--year` 只装载指定年份，口径同 recall；v0.23.0 起 COMMIT 段默认只展示最近 20 条（`context_commits_limit`，0=全部；weight≥1.5 / pinned / evergreen 恒显）；--explain 输出 included / dropped 选择 trace）|
| `yotta-memory forget <文件>` | 移入 `.trash/<时间>/` 回收区并写审计（v0.12.0；不再物理删除）|
| `yotta-memory backup volumes / setup --dir <目录> / status / ensure-daily / schedule enable|disable|status` | 每日自动备份（v0.12.0；只展示实际枚举的异卷、用户确认一次位置后默认每日执行，Windows Task Scheduler / systemd timer / launchd 调度，`serve` 补跑）|
| `yotta-memory backup create / list / doctor / restore <ID> --to <目录> / drill [<ID>] [--probe] [--against <库路径>]` | 备份、恢复与恢复演练（v0.12.0；独立盘校验、SHA-256 清单、排除 `keys/cache`、恢复默认只写新目录；drill 验证 manifest / 索引 / 测试私密解密；v0.17.0 起 `--probe` 在恢复副本上追加六类基线探针，`--against` 校验备份没有落后于源库）|
| `yotta-memory doctor [--json] [--runtime] [--mcp-config <文件>] [--skill-dir <目录>] [--baseline [--against <库路径>] [--template <文件>]]` | 开工可靠性检查（v0.12.2；根目录 / 密钥库 / 索引 / 身份 / 最近备份；严重异常时锁定破坏性写入）；全新空库的缺失 index / agents 降为 info；输出 agent home 发现规则与 `YOTTA_MEMORY_AGENT_HOME` 提示；加 `--runtime` 检查 CLI / current / MCP 配置 / 运行中 server / 技能副本漂移；v0.16.4 起 `--json` 含身份 / agent-key 状态；v0.16.5 起顶层含 `schemaVersion` / `encryption` / `migration_required`；v0.17.0 起 `checks.scale` 给规模体检（条数 / 单目录文件数 / 索引体积 / 冷启动耗时，阈值 `scale_*`），`--baseline` 追加恢复 / 迁移基线探针（结果进 `checks.baseline`，失败 exit 2）|
| `yotta-memory archive [--days 180] [--threshold 0.55] [--dry-run] [--force] [--json]` | 归档旧记忆（v0.8.0 统一效用分 + v0.10.0 分类型衰减；immutable / BOUND 豁免；v0.18.0 起默认豁免冷却期与 `evergreen` / `pinned`，`--force` 显式覆盖；私密归档入 `.archive/private/<owner>/<type>/`；阈值默认读 config `maintain_archived_utility`，v0.23.0 起默认 0.55）。`--dry-run` 只预览、零写入（不动文件 / 不建快照 / 不写审计），无候选时不建整库快照，`--json` 输出结构化报告 |
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config set backup_dir <目录>` / `config get [--json]` | 持久记住 / 查看记忆库位置与备份目录（`~/.yottamemory/config.json`；`get --json` 同时返回身份状态）；数值类键含 `maintain_*` / `consolidate_*` / `scale_*` / `backup_max_age_hours` |
| `yotta-memory whoami --agent <id> [--agent-key <key>] [--json]` | 查看当前显式身份与登记状态；身份不从环境变量读取；`--json` 返回 `identity` 结构化状态 |
| `yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一；可选扩展显示名 / 用户 / 关系）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 每智能体访问 token：生成 / 列出 / 吊销（登记 `<记忆库>/.server/tokens.json`；同 ID 已被其它来源占用需 `--force` 覆盖，防不同智能体合流）|
| `yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio] [--tools core|full]` | 启动 MCP 记忆引擎（streamable HTTP 局域网 / --stdio 本地零进程模式；Bearer token + X-Agent-Id + X-Agent-Key 鉴权；工具分组默认 full）|
| `yotta-memory runtime list / install <tarball|版本> [--from-current] [--force] / use <版本> [--restart] / rollback [--restart] / status` | 运行时稳定入口（runtime.json + versions + current；安装 / 切换 / 回滚 / 查看漂移；`--restart` 尝试重启受管 server，失败自动切回旧版本）；漂移诊断用 `doctor --runtime` |
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows：任务计划程序，S4U 主体后台静默——v0.22.4 起不弹窗口，`--onstart` 无登录会话也可启动；任务 XML 注册，去电池限制与 72h 时限；非管理员自动降级用户级 Startup 静默自启，v0.6.3 起 VBS 自愈不弹 80070002；v0.22.5 起 Electron 宿主（如 YottaWeave）自动注入 ELECTRON_RUN_AS_NODE，不再拉起 GUI；Linux：systemd 用户单元，不可用时自动降级用户 crontab @reboot）|
| `yotta-memory feedback <文件|主题> --useful|--useless [--reason <原因>] [--undo]` | 显式使用反馈（v0.8.0 自我学习闭环：useful → weight×1.2 / useless → weight×0.8，confidence / feedback_net 同步演化；`--undo` 回滚最近一次；审计写 `.archive/feedback-<日期>.jsonl`）|
| `yotta-memory maintain [--dry-run] [--apply] [--purge] [--threshold N] [--age N] [--dedup] [--dedup --apply] [--merge A,B] [--rules]` | 记忆自组织（v0.8.0 自我进化 + v0.10.0 自动合并）：默认 dry-run 预览；`--apply` 执行归档（immutable / BOUND 豁免；私密归档入 `.archive/private/<owner>/<type>/`），`--purge` 才真删遗忘候选；`--dedup` 查重并给**置信度分档**（≥0.85 高置信 / 0.65–0.85 建议手动 / 其余忽略），`--dedup --apply` 自动合并同归属高置信组（写批次审计可回滚；与归档互斥，不误归档）；`--merge A,B` 手动合并两条；`--rules` 只读输出重复踩坑 → 建议升级为规则的清单（阈值 `maintain_rule_min_hits`，默认 3；只给建议不写 BOUND）；审计写 `.archive/audit-<日期>.jsonl`）|
| `yotta-memory consolidate [--min-age N] [--min-idle N] [--max-utility N] [--min-group N] [--period N] [--type T] [--model <cmd>] [--apply] [--undo <batch>] [--batches]` | 周期摘要压缩（v0.10.0 压缩遗忘 + v0.18.0 提案闸门 + v0.18.1 日期 / 标记：把超龄 + 长期闲置 + 低效用的同主题旧记忆归纳成**带溯源**的周期摘要并留在活跃区，原文整体进 `.archive/`；摘要正文按条目 `created` 把「昨天 / 上周 / 本月 / 今年」等绝对化，归档副本追加一行巩固标记；默认 dry-run；immutable / BOUND 豁免，活跃 / 高效用记忆不动；`--apply` 执行并写批次审计，`--undo <batch>` 剥离标记并回滚（幂等），`--batches` 查近期批次；`--model` 仅本地 CLI）|
| `yotta-memory distill [--owner <id>] [--subject <主题>] [--model <cmd>] [--out <路径>] [--json]` | 心理日志蒸馏（v0.8.0 自我提升 + v0.18.1 溯源链）：统计摘要 / **分类型提取清单（事件 / 教训 / 待办 / 成长 / 规则边界 / 其他，逐条带 `[溯源: 文件#L<a>-L<b>]`）** / 质量指标（实测压缩比 / 条目覆盖 / 溯源覆盖 / 要素提取率）/ 主题画像 / 知识地图 / 跳过与边界；启发式零依赖，`--model` 可选外部模型 stdin→stdout 提炼（MCP 不暴露）；私密产物入 `private/<owner>/distills/`，公共入 `facts/distills/`；`--json` 输出结构化报告）|
| `yotta-memory explain <文件|主题>` | 查看单条记忆效用分项与归档 / 遗忘状态判定（v0.8.0）|
| `yotta-memory bench [--evalset <文件>] [--k N] [--seed N] [--bootstrap N] [--ablate] [--gate <指标>=<数值>] [--timing] [--year <yyyy>] [--json] [--out <文件>]` | 可复算检索基准评测（v0.17.0：默认按库内条目做确定性抽样生成基线评测集，`--evalset` 可指定评测集 v1；指标 Recall@k / MRR / nDCG@k / HitRate + 固定种子 bootstrap 95% 置信区间；报告带库指纹与评测集指纹、默认不含墙钟时间，同输入必须同输出；`--ablate` 输出关键词 / 语义 × 融合 / 纯分消融；`--gate <指标>=<数值>` 供 CI，不达标 exit 1；`--timing` 显式附带 p50 / p95，带上后报告不再逐字节可复算。**全程只读**：不重建索引、不写访问计数、不调用外部 embedding 插件；索引缺失或过旧时先 `reindex`）|
| `yotta-memory scan [--path <目录>] [--gate <安全级别>] [--quarantine --yes] [--restore] [--id <批次>] [--json]` | 记忆库安全扫描（v0.17.0：七类 = 恶意指令 / Prompt 注入 / 凭证泄漏 / 数据外泄 / 护栏绕过 / 行为操纵 / 权限提升；五级 `safe → low → medium → high → critical` + `file:line` 证据与规则出处；**默认只报告**、零网络零依赖，`--gate` 命中该级别及以上 exit 1；`--quarantine` 必须先备份到 `.memory-scan/quarantine/` 再替换命中行、需 `--yes` 或交互确认，`--restore` 还原；加密条目无授权密钥时只计入 `summary.encrypted`，`.md.enc` 后缀但内容是平文的文件按文本扫描并计入 `summary.mislabelled`；每条命中给命中片段与命中原文，凭证片段一律打码不回显）|
| `yotta-memory identity remove <id> [--dry-run] [--yes] [--keep-memories] [--keep-identity] [--password <口令> \| --recovery-key <钥匙>]` | 彻底删除一个 AI 身份与私密记忆（v0.17.0：真删九项 = 身份登记 / owner 密钥 / 授权绑定 / 待领取 key / 明文缓存 / `private/<id>/` 全部私密记忆 / token / grants 引用 / 重建索引 + 审计；**公共明文 FACT 保留**、其它 owner 零影响；只能由用户本人执行——加密库要主口令或恢复钥匙、明文库要显式 `--agent user`、`view` 解锁会话等同用户；破坏性闸门 = doctor + 独立备份 + 事务快照；`--dry-run` 只列清单）|

## 首启（非 TTY / GUI 宿主）


- **非 TTY 初始化 / 迁移**：完整步骤见下一节《明文库转加密（第一次最短路径）》。
- **恢复钥匙写文件**：`--recovery-key-out <文件>`（`init` / `migrate`）把恢复钥匙写入文件，适配 Windows GUI 宿主 stdout 不可捕获；不要把钥匙粘贴到对话。
- **缺 `--agent-key-file`**：文件不存在时进入未授权模式（公共 FACT 可读）；公共 / 维护命令不再输出全局 `stderr` 告警。只有私密操作 fail-closed，并提示缺失文件、`view` / `key bind <id>`、`key status` / `key claim`；文件存在但为空 / 不可读仍报错。
- **空加密库授权**：`yotta-memory view` 在无 owner key 时可用恢复钥匙校验主口令进入平台；无 owner 时先 `yotta-memory iam <id>`，再回页面授权。
- **view 端口**：启动前做健康检查；已在运行则打印 URL 复用，端口被占用给明确提示，不再抛未处理的 `EADDRINUSE`。

## 明文库转加密（第一次最短路径）


> 适用于 `yotta-memory 0.16.2+`。迁移前先完整备份。

1. **迁移**（推荐交互式；非 ASCII 口令不要走 Windows 管道）：

```powershell
yotta-memory migrate --recovery-key-out "$env:USERPROFILE\yotta-memory-recovery.key"
```

按提示输入主口令。自动化场景按终端选择一种；不要直接把中文占位符粘贴到命令里，也不要把口令写进 `--password` 参数：

| 场景 | 命令 |
|---|---|
| 交互终端（推荐，支持非 ASCII） | `yotta-memory migrate --recovery-key-out "<钥匙文件>"`，按提示输入口令 |
| PowerShell 环境变量（自动化） | `$env:YOTTA_MEMORY_PASS='<ASCII-PASSWORD>'; yotta-memory migrate --recovery-key-out "<钥匙文件>"; Remove-Item Env:\YOTTA_MEMORY_PASS` |
| cmd 环境变量（自动化） | `set "YOTTA_MEMORY_PASS=<ASCII-PASSWORD>"`，执行 `yotta-memory migrate --recovery-key-out "<钥匙文件>"`，最后 `set "YOTTA_MEMORY_PASS="` |
| 纯 ASCII 管道（非 ASCII 不要用） | `"<ASCII-PASSWORD>" \| yotta-memory migrate --password-stdin --recovery-key-out "<钥匙文件>"` |

常见报错：`当前为非交互环境` = 没有 stdin 也没有 `YOTTA_MEMORY_PASS`；`'"..."' is not recognized` = 在 `cmd.exe` 里用了 PowerShell 的管道写法。Windows 管道可能按控制台代码页编码非 ASCII 字符，导致实际入库口令与输入口令不一致；因此非 ASCII 口令请使用交互终端或环境变量，不要使用 `echo 中文 | ...`。若迁移后 `view` 报 `口令错误`，优先用恢复钥匙执行 `yotta-memory reset-password --recovery-key "<钥匙文件>"` 重设，不要继续猜口令。

恢复钥匙文件必须离线保存，不要和记忆库或备份放在一起。

2. **授权 AI（二选一，完全等价）**：

推荐：网页授权

```cmd
yotta-memory view
```

浏览器输入主口令，点击 `授权 <id>`，保存只显示一次的 `agent_key`。

高级：CLI 等价方式

```cmd
yotta-memory key bind <id>
```

两种方式都会写 binding + pending，效果相同。

3. **AI 领取 key**：

```cmd
yotta-memory key status <id>
yotta-memory key claim <id> --to "<AI_HOME>"
```

默认写入 `<AI_HOME>/.yotta-memory-agent-key`。

4. **重建加密索引并验证**：

```cmd
yotta-memory reindex --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
yotta-memory recall <关键词> --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
```

必须在授权并领取 agent_key 后执行 `reindex`。`migrate` 在没有 agent_key 时无法建立每 owner 加密索引；跳过这步会让私密 `recall` 看起来像“无匹配记忆”。

5. **MCP 自检**：宿主 MCP 配置必须带 `--agent-key-file <AI_HOME>/.yotta-memory-agent-key`；只有 `--agent-id` 时，加密库的私密 MCP 调用会报缺少 agent_key，而 CLI 可能仍正常。补参后重启 MCP / 会话并回读验证。

> 加密范围：`private/` 下的 PREF / BOUND / COMMIT 与画像索引；公共 `facts/` 仍为明文。
