# 元忆（yotta-memory）用户使用手册

> 面向最终用户：从安装、初始化，到日常使用、备份恢复与局域网多机共享。
> AI 智能体的自动引导流程见 `SKILL.md`；完整命令参数见 `references/cli-reference.md`。

## 目录

1. 这是什么
2. 安装与升级
3. 本机使用
4. 加密与权限
5. 备份与恢复
6. 运行时、布局与容量
7. 便携记忆盘（局域网多机共享）
8. 智能体接入
9. 命令速查
10. 故障排查
11. 安全与边界

## 1. 这是什么

元忆是一个文件式智能体记忆引擎：每条记忆是一个 Markdown 文件，放在你自己的目录里，
可以用任何编辑器查看、修改，用 git 做版本管理。FACT 记忆共享给所有智能体，
PREF / BOUND / COMMIT 按智能体隔离并加密。

- 零依赖：只需要 Node.js；没有数据库、没有常驻服务（除非你开启局域网模式）。
- 数据主权在你手里：没有云端、没有账号、没有遥测。
- 记忆即文件：拷走整个目录就等于搬走记忆。

典型场景：

- **跨会话续接**：开工 `context` 恢复身份、长期摘要、画像、近期走廊、边界与承诺。
- **多智能体共享**：FACT 进公共区，PREF / BOUND / COMMIT 各自私密隔离。
- **交接与团队协作**：项目级 `.yottamemory` 随仓库走，交接即恢复。
- **便携记忆盘**：记忆装在一台主机上，本机与局域网其它主机共享（第 7 节）。

## 2. 安装与升级

使用元忆需要两部分：**CLI**（读写记忆）与**技能**（教 AI 怎么用）。

**CLI：任选一种**

| 方式 | 命令 | 适用 |
|---|---|---|
| npm 全局（推荐） | `npm i -g @yottameta/yotta-memory` | 长期使用 |
| npx 临时 | `npx -y @yottameta/yotta-memory` | 临时试用 |
| install.sh | git clone 后 `bash install.sh --agent <name>` | 离线 / 无 npm |

验证：`yotta-memory --version` 能输出版本号即成功。

**技能：装进要用的智能体**

| 方式 | 命令 | 适用 |
|---|---|---|
| npx 一行装（推荐） | `npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>` | 智能体默认用户级目录 |
| 安装器（已全局安装） | `yotta-memory-install --agent <name>` | 同上 |
| `--dir` | `npx -y --package @yottameta/yotta-memory yotta-memory-install --dir <技能目录>` | 不在预置列表的智能体 |

> CLI 让命令行能读写记忆；技能让 AI 知道「开工 recall、进行中 remember、收工归档」。
> 只装 CLI 不装技能，AI 不会自动使用这套工作流。

**升级**

- CLI：`npm i -g @yottameta/yotta-memory`
- 技能：重跑安装命令（`--agent` 或 `--dir` 与安装时一致）
- 升级后回读 `yotta-memory --version` 与已装 `SKILL.md` 的 `version:`，一致才算成功。
- 升级引擎后建议执行一次 `yotta-memory reindex`；旧引擎不识别新布局，重建索引会漏条目。

**卸载**：`npm rm -g @yottameta/yotta-memory`，再从技能目录删除 `yotta-memory` 文件夹。
卸载**不会**删除记忆库。

## 3. 本机使用

```bash
yotta-memory init                                    # 初始化（默认 ~/.yottamemory，新建默认加密）
yotta-memory remember FACT 项目 本周完成发布           # 记一条事实
yotta-memory recall 项目                              # 检索
yotta-memory config get                              # 查看记忆库位置
```

- 换位置：`yotta-memory config set memory_home <目录>`，之后所有命令自动用新位置。
- 项目级记忆：在项目目录里 `yotta-memory init --project`，该项目的智能体优先读项目级记忆。
- 位置解析优先级：`YOTTA_MEMORY_HOME`（临时覆盖）> `config.json#memory_home` > 默认 `~/.yottamemory`。

### 开工上下文与画像

```bash
yotta-memory profile                          # 生成用户画像（写 private/<owner>/profile.md）
yotta-memory context --limit 10 --budget 1800 # 开工上下文包
yotta-memory context --focus 发布             # 任务感知
```

- `profile` 引擎零推断：只按类型 / 主题 / 标签归组呈现原文。
- `context` 是开工主注入：身份 + 多智能体铁律 + 长期理解摘要 + 画像 + 近期走廊 + 近期高价值补位 + 边界 + 承诺 + 会话闭环契约。
- `--budget` 只限制动态记忆条目；身份 / 铁律 / 长期摘要 / 画像 / 边界 / 闭环契约必保。
- 承诺段默认展示最近 20 条（`config set context_commits_limit <N>`，0=全部）；`weight ≥ 1.5` 或带 `pinned` / `evergreen` 恒显。
- `context --audit [--from <文件|->] [--json] [--gate N]`：核对被宿主压缩掉的内容是否已落盘，只读、不自动补写。

### 写入与验证

- `remember <类型> <主题> <内容> --verify`：写后回读校验。
- `remember --source <来源>` 记录出处；`--weight <0..>` 标重要性；`--no-hint` 关闭「疑似偏好，建议 PREF」提示。
- 手动改过 `.md` 后执行 `yotta-memory reindex`，`recall` 才能按索引检索到。

### 手动添加 / 编辑记忆

记忆就是文件，但**读写一律走 CLI / MCP**，不要用 shell（`Get-Content` / `cat` / `ls` 等）
直接读改记忆库文件——那会绕过 owner 权限边界，可能读到其它智能体的私密内容。
确需手改时，放对目录并在 frontmatter 写全 `type` / `subject` / `statement`：

```markdown
---
type: FACT
subject: 项目
statement: 本周完成发布
---
本周完成发布
```

> `index.json` 是引擎自动维护的检索索引，其 `tokens` 字段是中文分词词频表，**不是**访问令牌，不要手改。

## 4. 加密与权限

私密区（PREF / BOUND / COMMIT）默认落盘为密文（AES-256-GCM 信封加密）：
没有对应 owner 密钥的 AI 即使读到文件也解不开；公共 FACT 保持明文共享。

### 新库

`yotta-memory init` → 设主口令 → **抄下恢复钥匙**（44 位 base64，离线保存）。
不需要加密时用 `--no-encrypt`（会退回明文纪律层模型）。

### 明文库转加密（最短路径）

> 迁移前先完整备份。顺序：迁移 → 授权 → `key claim` → `reindex`。

1. `yotta-memory migrate --recovery-key-out "$env:USERPROFILE\yotta-memory-recovery.key"`
   交互终端按提示输入口令；非 ASCII 口令不要走 Windows 管道，可用 `YOTTA_MEMORY_PASS` 环境变量。
2. 授权 AI（二选一，等价）：`yotta-memory view` 里点「授权 <id>」，或 `yotta-memory key bind <id>`。
3. AI 领取 key：`yotta-memory key status <id>` → `yotta-memory key claim <id> --to "<AI_HOME>"`。
4. 重建加密索引：

```cmd
yotta-memory reindex --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
yotta-memory recall <关键词> --agent <id> --agent-key-file "<AI_HOME>/.yotta-memory-agent-key"
```

5. MCP 配置必须带 `--agent-key-file`；只有 `--agent-id` 时，加密库的私密调用会报缺少 agent_key。

### 用户查看平台

`yotta-memory view` → http://127.0.0.1:8788 → 主口令解锁 → 浏览 / 搜索 / 导出全部记忆，
授权 / 吊销 AI、重设口令、查看恢复钥匙；「高级 / CLI」页提供命令速查与完整帮助。

- 默认只监听 `127.0.0.1`；远程需 `--host` 显式开启。
- 授权弹窗只显示一次 `agent_key`，请立即单独保存；引擎同时写 `keys/pending/<id>.key`，AI 用 `key claim` 领取后删除。
- 已绑定的 agent 需先「吊销」再授权，旧 key 随即失效。

### 权限规则

- 三态：公共 FACT 永远可读；自己的私密可读；其它智能体私密默认拒绝（默认静默跳过，显式跨读才报错）。
- 跨读他人私密需三选一：`grants.json` 显式授权 / `identity=user` / 显式 `--unsafe`；调用方仍需持有匹配的 agent_key。
- `key revoke <id>` 立即吊销；长驻 MCP 进程下次读取也会重新校验。
- 忘口令且丢失恢复钥匙 = 密文私密不可恢复（公共 FACT 仍在）。

## 5. 备份与恢复

```bash
yotta-memory backup volumes                          # 只列真实存在、可写、与库异卷的路径
yotta-memory backup setup --dir <目录> --time 03:30   # 用户确认后默认每日备份
yotta-memory backup status                           # 状态 / 最近失败 / 调度
yotta-memory backup create                           # 手动整库备份（默认拒绝同卷）
yotta-memory backup list
yotta-memory backup doctor --id <备份ID>              # SHA-256 / 缺失 / 大小校验
yotta-memory backup restore <备份ID> --to <新目录>
yotta-memory backup drill [<备份ID>] --recovery-key <钥匙>
```

- 备份覆盖 `facts/`、`private/`、`keys/`（排除 `keys/cache/`）、`agents.json`、`index.json`、`.archive/`。
- Windows 用 Task Scheduler，Linux 用 systemd user timer（不可用时降级 cron），macOS 用 LaunchAgent；
  `serve` 启动后 10 秒与每 6 小时调用幂等 `backup ensure-daily` 补跑。
- 同卷备份默认拒绝——只能当临时测试，不算可用备份。
- `backup drill` 恢复到隔离副本，校验 manifest / 索引并解密一条测试私密；
  `--probe` 追加六类只读基线探针，`--against <库路径>` 检查备份没有落后于源库。
- 恢复只写新目录，目标非空时拒绝；恢复后先校验，再决定是否替换正式库。
- 恢复钥匙必须离线保存，不要和记忆库或备份放在一起。

### 开工体检与事务快照

- `yotta-memory doctor`：只读检查根目录、密钥库、公共索引、`agents.json`、最近备份与规模
  （条数 / 单目录文件数 / 索引体积 / 冷启动耗时）；严重异常 exit 非零并锁定破坏性写入。
- `doctor --json` 顶层含 `schemaVersion` / `encryption` / `migration_required`；规模明细在 `checks.scale`。
- `doctor --runtime` 检查 CLI / current / `runtime.json` / MCP 配置 / 运行中 server / 技能副本 / 身份模式漂移。
- `doctor --baseline [--against <库路径>]`：恢复 / 迁移后跑六类只读探针，缺失项列清单并 exit 2。
- `maintain --apply`、`consolidate --apply`、`merge`、`archive`、`--purge` 写前自动事务快照；
  未配置独立备份、doctor critical 或快照失败时直接拒绝，原记忆不变。

## 6. 运行时、布局与容量

### 稳定运行时入口

```bash
yotta-memory runtime install --from-current      # 安装当前版本到 <runtimeRoot>/versions/<版本>/
yotta-memory runtime use <版本> [--restart]      # 原子切换
yotta-memory runtime rollback [--restart]
yotta-memory runtime status                      # 查看 current 指针与漂移
```

stdio MCP、`lan enable` 与备份调度只指向 `<runtimeRoot>/current/bin/yotta-memory.js`，不写死版本目录。

### 布局与索引

- 新写入：公共 `facts/<yyyy>/<mm>/<dd>/`，私密 `private/<owner>/<type>/<yyyy>/<mm>/<dd>/`；
  旧平铺与年 / 月桶继续可读，默认不自动迁移。
- 大库索引：逻辑体积 > 4 MB 或条目 > 5000 时写 `index-<year>.json.gz`；`recall --year` /
  `context --year` 只加载命中年份分片。`index --stats` 只读分析索引体积与字段占比。
- 布局迁移：`layout plan`（预演）→ `layout apply --from-plan <文件> --yes` →
  `layout rollback --batch <id> --yes`；apply / rollback 都写 journal。

### 整理与生命周期

- `maintain`（默认 dry-run）：归档候选与遗忘候选（效用 < 0.55 且超 180 天 = 归档；
  效用 < 0.12 且超 365 天 = 遗忘）；immutable / BOUND 豁免。
- `maintain --apply` 执行归档（可恢复）；`--purge` 才真删（不可回滚）。
- `maintain --dedup [--apply]` 近重复查重与高置信自动合并；`--merge A,B` 手动合并。
- `maintain --capacity` 只读容量水位、30 / 90 天活跃度、LRU / LFU 候选与晋升建议。
- `maintain --rules` 只读给出「重复踩坑 → 建议升级为规则」，不自动写 BOUND。
- 分类型衰减：FACT 730 天 / PREF 365 天 / COMMIT 90 天 / BOUND 不衰减；
  `config set maintain_decay_halflife_<TYPE> <天>` 可调。
- `consolidate` 把超龄低效用的同主题旧记忆压成带溯源摘要，原文进 `.archive/`；
  默认只出提案，`--apply` 需确认（非交互加 `--yes`），`--undo <batch>` 回滚，`--batches` 查批次。
- `archive --dry-run` 只预览（不动文件 / 不建快照 / 不写审计）；`--force` 只覆盖冷却期与常青标签，
  immutable 与 BOUND 始终豁免。
- `distill` 生成统计摘要 / 主题画像 / 知识地图 + 分类型提取清单（每条带 `[溯源: 文件#L<a>-L<b>]`）；
  质量指标只报实测值，不承诺语义保真。
- `feedback <文件> --useful|--useless` 调整 weight / confidence（`--undo` 回滚）；
  `explain <文件>` 查看单条效用分项与归档判定。

## 7. 便携记忆盘（局域网多机共享）

记忆放在一台主机（Linux / Windows 均可）上，本机 CLI 直连，局域网其它主机的 AI 经 MCP 接入。
引擎主机只需装 CLI。完整步骤见 `references/lan-mode.md`，这里是主干。

> 传输边界：MCP 默认 HTTP 明文，Bearer token 与 agent_key 会随请求传输。只在可信局域网 /
> VPN / SSH 隧道内使用；跨网段请加 TLS 反向代理，或把 `serve` 绑到 `127.0.0.1` 后走 SSH 端口转发。

**第 1 步：安装 CLI 并指定位置**

```bash
yotta-memory config set memory_home /srv/yotta-memory
yotta-memory init --dir /srv/yotta-memory     # 已经是记忆库则跳过 init，直接接入
```

**第 2 步：开机自启（可选，推荐）**

```bash
yotta-memory lan enable              # 登录后自启（默认）
yotta-memory lan enable --onstart    # 开机即启（Windows 计划任务需管理员）
yotta-memory lan status              # 查看状态与 profile 漂移
yotta-memory lan disable             # 取消
```

`lan enable` 会为当前用户生成 `serve-profile.json`（memoryHome / runtimeHome / configDir / host / port），
计划任务 / systemd / crontab 都引用该绝对路径；`serve --profile <文件>` 在监听前校验路径与用户，
校验失败直接退出，不会落到空库。改了 `memory_home` 或运行时路径后重新执行 `lan enable`。

**第 3 步：为远程智能体生成 token**

```bash
yotta-memory token new --agent <智能体ID>
```

token 只打印一次（`ytm_...`）；本机 AI 不需要 token。`token list` 查看，`token new --force` 覆盖旧值。

**第 4 步：把连接信息交给远程用户**

- 地址：`http://<引擎IP>:8787/mcp`
- token、智能体 ID（`X-Agent-Id`）与该智能体的 agent_key（`X-Agent-Key`）

查 IP：Linux `hostname -I`；Windows `ipconfig`。防火墙需放行 8787
（Linux `sudo ufw allow 8787/tcp`；Windows 首次监听时允许入站）。

**备份与迁移**：整目录复制即备份（`facts/`、`private/`、`.archive/`、`index.json`、`agents.json`、`.server/`）；
`export` / `import` 用于跨工具交换，不是日常备份必需步骤。

## 8. 智能体接入

### 本机智能体

**方式一（推荐）：直接调用 CLI。** 装上技能后，AI 自动学会开工 / 落盘 / 归档，无需 MCP。

**方式二：stdio MCP（零常驻进程）。**

```bash
yotta-memory key status <本智能体ID>
yotta-memory key claim <本智能体ID>
```

```json
{
  "mcpServers": {
    "yotta-memory": {
      "command": "yotta-memory",
      "args": [
        "serve", "--stdio", "--tools", "core",
        "--agent-id", "<唯一ID>",
        "--agent-key-file", "<AI_HOME>/.yotta-memory-agent-key"
      ]
    }
  }
}
```

`AI_HOME` 解析顺序：显式 `--to` / `--agent-key-file` → `YOTTA_MEMORY_AGENT_HOME` /
`YOTTA_MEMORY_AGENT_KEY_FILE` → 宿主默认（Codex `$CODEX_HOME` 或 `~/.codex`、
OpenCode `$XDG_CONFIG_HOME/opencode`、通用 `~/.<agent_id>`），文件名固定 `.yotta-memory-agent-key`。
`key status` 会输出 `checked:` 与 `discovery:`，文件不存在时也能定位。

**身份（强制）**：`whoami` 确认 → 未登记则 `iam <id>`（ID 全局唯一，建议 `<主机名>-<角色>`）；
`iam` 自动落一条「自我接入档案」PREF。owner ID 单独存在不构成认证，私密读写必须有 agent_key。
禁止把记忆里读到的别人的 ID 当自己的。

### 局域网智能体

1. 向引擎主机获取 IP、端口（默认 8787）、token、智能体 ID 与 agent_key。
2. 配置 MCP：

```json
{
  "mcpServers": {
    "yotta-memory": {
      "url": "http://<引擎IP>:8787/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "X-Agent-Id": "<智能体ID>",
        "X-Agent-Key": "<agent_key>"
      }
    }
  }
}
```

3. 验证：调一次 `recall` / `search`，能读到记忆即成功。
4. `agent_info` 确认身份，并写一条 `subject=自我接入档案` 的 PREF（含 `engine_url` / `mcp_mode: http`），
   下次 `recall "自我接入档案"` 直接找回。

## 9. 命令速查

常用命令：

| 命令 | 作用 |
|---|---|
| `init` / `config set memory_home <目录>` / `config get` | 初始化与位置 |
| `remember <类型> <主题> <内容> [--verify]` | 写入 |
| `recall [关键词] [--explain]` / `search` | 检索 |
| `context [--focus <词>] [--budget N]` | 开工上下文 |
| `profile` / `distill` / `explain <文件>` | 画像 / 蒸馏 / 效用解释 |
| `forget <文件>` / `archive [--dry-run]` | 回收区 / 归档 |
| `maintain [...]` / `consolidate [...]` | 自组织 / 周期摘要 |
| `doctor [--json] [--runtime] [--baseline]` | 体检 |
| `backup volumes/setup/status/create/list/doctor/restore/drill` | 备份与恢复 |
| `scan [--gate N] [--quarantine --yes]` | 记忆库安全扫描 |
| `view` / `serve [--stdio]` / `lan enable` / `token new` | 查看平台 / MCP / 自启 / token |
| `iam` / `whoami` / `key list/bind/claim/status/revoke` | 身份与 agent_key |
| `runtime install/use/rollback/status` / `index --stats` / `layout plan/apply/rollback` | 运行时 / 索引 / 布局 |
| `export` / `import` / `reindex` / `bench` | 导入导出 / 重建索引 / 基准评测 |

类型：`FACT`（事实，共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺）；
后三类按 owner 物理隔离在 `private/<owner>/<type>/`。

完整参数、风险选项与迁移步骤：`references/cli-reference.md`，或 `yotta-memory <命令> --help`。

## 10. 故障排查

**远程连不上**

1. 引擎在跑吗？`yotta-memory lan status`；Linux 也可 `systemctl --user status yotta-memory-serve.service`。
2. IP / 端口对吗？默认 8787，两端一致。
3. 防火墙放行了吗？Linux `sudo ufw status`；Windows 允许首次监听的入站请求。
4. token 有效吗？`yotta-memory token list`；无效就 `token new --agent <id>` 重新生成。
5. 访问 `http://<引擎IP>:8787/mcp`：返回 401 = 服务在跑、鉴权不对；连接被拒 / 超时 = 服务没起或防火墙拦截。

**`lan enable` 计划任务被拒（Access denied）**：会自动降级为用户级 Startup 静默自启（免管理员，重新登录后生效）；
`--onstart` 模式必须管理员。

**端口被占用（EADDRINUSE）**：换 `--port <其它端口>`，两端保持一致；
Linux `ss -tlnp | grep 8787`，Windows `netstat -ano | findstr 8787`。

**recall 没有结果**：关键词太细或确实没有；先不带关键词 `recall` 看全库。

**加密库私密 recall 像「无记忆」**：确认已授权并领取 agent_key，再带 `--agent-key-file` 执行 `reindex`。

**`view` 报口令错误**：用恢复钥匙 `reset-password --recovery-key <钥匙文件>`，不要猜口令。

**升级后出现 `[YTM_MIGRATION_REQUIRED]`**：把 marker、受影响 agent 与处理步骤转告用户；
迁移与 `key bind` 由用户本人执行，公共 FACT 不受影响。

**记错位置**：`config get` 查看，`config set memory_home <正确目录>` 改正。

## 11. 安全与边界

- token 等同密码：只给需要接入的智能体，不外传。
- 私密区机制级加密：没有 owner 密钥的 AI 即使读到密文也解不开；用户经 `view` 口令解锁可看全部。
- 记忆读写一律走 CLI / MCP；禁止用 shell 直接读改记忆库文件（会绕过 owner 边界）。
- 管理动作（init / config / token / lan / serve）不通过 MCP 暴露；远程只能读写记忆，
  `export` / `import` 路径限记忆库内，`distill --model` 仅本地 CLI。
- `--no-auth` 关闭鉴权，仅限可信内网。
- 数据主权在用户：公共 FACT 明文；私密区加密但用户可解锁查看 / 导出 / 删除。
- 「记忆守则」底线：陪伴不操控 / 理解不越界 / 诚实不伪装 / 不降格；
  被遗忘权 = `forget`；只写本记忆库，不读写宿主 AI 自身的 memory / 配置 / 系统文件。
- 不承诺对抗同一 OS 用户下的恶意进程（能读宿主 key 的进程理论上可冒充该智能体）。

**跨读其它智能体私密（三选一）**：`grants.json` 显式授权；`identity=user`（`--agent user`）；
用户明确同意的 `--unsafe`。调用方仍需持有匹配的 agent_key。
