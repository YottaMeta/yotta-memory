# 元忆信任卡（yotta-memory）

> 给用户看的一页说明：数据在哪、谁能读、怎么删、怎么备份、坏了怎么办。
> 这份卡片描述的是机制，不是承诺；每条都能用 CLI 自证。

## 一句话

元忆是**你本机上的文件**：记忆是 Markdown + YAML，私密区用 AES-256-GCM 信封加密；
没有云端、没有账号、没有遥测。你能看到、能导出、能删，也能随时把整个目录搬走。

## 数据在哪

默认位置 `~/.yottamemory/`（可在项目里用 `<repo>/.yottamemory/`，或用
`yotta-memory config set memory_home <目录>` 指到任意磁盘）。目录里有什么：

| 路径 | 内容 | 加密 |
|---|---|---|
| `facts/` | 公共 FACT，所有智能体可读 | 明文 |
| `private/<owner>/{prefs,bounds,commits}/` | 该智能体的 PREF / BOUND / COMMIT | 加密库为 `.md.enc` |
| `private/<owner>/profile.md` | 用户画像（聚合原文，引擎零推断） | 加密库为 `.enc` |
| `index.json` + 年分片 | 索引清单 | 明文（只含公共条目） |
| `keys/` | 主密钥包裹、owner key、绑定、恢复钥匙包裹 | 本身是密文 |
| `.archive/` | 归档与合并 / 反馈审计 | 跟随原条目 |
| `.trash/` | `forget` 的回收区 + 审计 | 跟随原条目 |
| `.server/tokens.json` | 远程 MCP 的每智能体 token | 明文（仅本机） |
| `agents.json` | 身份登记表（唯一性） | 明文 |

- 配置在 `~/.yottamemory/config.json`（记忆库位置、备份目录、阈值、开关）。
- `view` 的 Web 服务默认只监听 `127.0.0.1`；`serve` 默认 `0.0.0.0:8787`，必须显式开启才对外。
- 元忆**不写**宿主 AI 自己的 memory / 配置 / 系统目录。
- 命中打点是本地元数据（稀疏日计数 + 查询指纹，不存查询原文），随记忆文件一起加密 / 备份 / 导出。

## 谁能读

| 读取方 | 能读什么 | 靠什么保证 |
|---|---|---|
| 你本人 | 全部（含各 AI 私密明文） | `yotta-memory view` + 主口令 / 恢复钥匙 |
| 智能体 A | 公共 FACT + 自己的私密 | 每 owner 独立密钥 + agent_key |
| 智能体 B | 公共 FACT；A 的私密默认拒绝 | 跨 owner 读取默认拦截；需 `grants.json` / `identity=user` / 显式 `--unsafe` |
| 局域网客户端 | 由它持有的 token + agent_key 决定 | `serve` 的 Bearer token + `X-Agent-Id` + `X-Agent-Key` |
| 同机其它进程 | 理论上能读明文文件 | **不属于本模型承诺范围**（见下） |

- **owner ID 不是身份**：只报 ID 没有 agent_key，私密读写一律 fail-closed。
- `key revoke` 立即吊销：旧 key 校验失败，长驻 MCP 进程下次读取也会重新校验 binding。
- 没有授权密钥时，加密条目连 `scan` 都不会解密；凭证片段一律打码。

## 不承诺什么

- **不承诺对抗同一 OS 用户下的恶意进程**：能读你宿主 key 文件的进程，理论上能冒充该智能体。
  元忆的保护边界是「不同智能体之间机制隔离」+「离开本机后密文不可读」，不是「同机沙箱」。
- **不承诺记住一切**：低效用旧条目会被归档 / 合并；摘要给的是实测指标，不是无损压缩。
- **不承诺云端同步**：跨机共享靠你自己发起的局域网模式或搬目录，元忆不提供账号与云服务。
- **不承诺局域网传输机密性**：`serve` 的 MCP 默认 HTTP 明文，Bearer token 与
  agent_key 会随请求在网络上传输；只在可信局域网 / VPN / SSH 隧道内使用，
  跨网段请加 TLS 反向代理。

## 怎么删

| 想删什么 | 怎么做 | 结果 |
|---|---|---|
| 一条记忆 | `yotta-memory forget <文件>` | 移入 `.trash/<时间>/` + 写审计，不物理删除 |
| 一条记忆彻底消失 | `maintain --purge`（先 dry-run 看候选） | 真删遗忘候选；BOUND / immutable 豁免 |
| 某个 AI 的全部私密 + 身份 | 用户本人执行 `yotta-memory identity remove <id> [--dry-run]` | 九项一起清（身份、owner key、绑定、pending、明文缓存、`private/<id>/`、token、grants、索引重建 + 审计）；公共 FACT 保留 |
| 整个记忆库 | 删目录前先备份；确认后再删 `memory_home` | 不可恢复，必须由你本人执行 |
| 卸载技能 | 卸载只删技能文件 | **不会删记忆库**；要删数据得自己删 `memory_home` |

- `identity remove` 有破坏性闸门：`doctor` + 独立备份 + 事务快照，任一失败即拒绝。
- `forget` 之后的物理清理属于单独的管理动作，不会自动发生。

## 备份与恢复

```bash
yotta-memory backup volumes                    # 只列真实存在、可写、与库异卷的路径
yotta-memory backup setup --dir <目录> --time 03:30   # 用户确认位置后默认每日备份
yotta-memory backup status                     # 查看状态（超过 36 小时会提醒）
yotta-memory backup create                     # 手动整库备份（默认拒绝同卷）
yotta-memory backup doctor --id <备份ID>        # SHA-256 / 文件缺失 / 大小校验
yotta-memory backup list
yotta-memory backup restore <备份ID> --to <新目录>
yotta-memory backup drill [<备份ID>] --recovery-key <钥匙>   # 恢复演练
```

- 备份覆盖 `facts/`、`private/`、`keys/`（排除 `keys/cache/`）、`agents.json`、`index.json`、`.archive/`；
  pending key 与宿主 key 文件不进入备份 / 导出。
- 同卷备份默认拒绝——同卷只能当临时测试，不算可用备份。
- 恢复只写新目录，目标非空时拒绝；恢复后先校验，再决定是否替换正式库。
- **恢复钥匙必须离线保存**，不要和记忆库或备份放在一起；泄露等同主口令泄露。

## 坏了怎么办

| 现象 | 先做什么 | 说明 |
|---|---|---|
| 不确定库是否健康 | `yotta-memory doctor` | 只读；检查根目录 / 密钥 / 索引 / 身份 / 最近备份 / 规模；严重异常 exit 非零并锁定破坏性写入 |
| 怀疑读到空库 / 错库 | `yotta-memory config get` → 核对 `memory_home` | 位置错了先用 `config set` 改回来 |
| 记忆搜不到 | `reindex` 后 `recall` / `search` | 手动改过 `.md` 时必须重建索引 |
| 加密库私密 recall 像「无记忆」 | 确认已授权并领取 agent_key，再 `reindex --agent <id> --agent-key-file <文件>` | 没 key 时每 owner 加密索引建不起来 |
| `view` 报「口令错误」 | `reset-password --recovery-key <钥匙文件>` | 不要继续猜口令 |
| 升级后首次调用出现 `[YTM_MIGRATION_REQUIRED]` | 把 marker、受影响 agent 和处理步骤转告用户 | 迁移 / `key bind` 必须用户本人执行 |
| 备份超过 36 小时没跑 | `backup ensure-daily` 或 `backup schedule status` | 备份失败会记录状态，不会伪造成功 |
| 担心记忆库被投毒 | `yotta-memory scan` | 默认只报告；`--quarantine --yes` 才隔离，且先逐字节备份 |

边界：以上都是本机命令的实测口径；如果 `doctor` 报根目录缺失或密钥库缺文件，
先停止一切写入，从独立备份恢复，再排查磁盘与备份卷。
