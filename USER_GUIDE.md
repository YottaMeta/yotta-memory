# 元忆（yotta-memory）用户使用手册

> 面向最终用户的操作手册：从安装、初始化，到便携记忆盘（局域网多机共享）的部署与接入。AI 智能体的自动引导流程见 `SKILL.md`。

## 目录

1. 这是什么
2. 安装
3. 本机单机使用
3.5 私密区加密（v0.7，推荐）
3.6 自我学习 / 自我进化 / 自我提升（v0.8.0）
3.7 查看平台分页与检索优化（v0.8.1）
4. 便携记忆盘 · 记忆引擎主机篇（Linux / Windows）
5. 智能体接入篇（本机 / 局域网其它主机）
6. CLI 命令速查
7. 故障排查
8. 安全与边界

## 1. 这是什么

元忆（yotta-memory）是一个文件式智能体记忆工具：每条记忆是一个 Markdown 文件，放在你自己的目录里，可以用任何编辑器查看、修改，用 git 做版本管理。FACT 记忆共享给所有智能体，PREF / BOUND / COMMIT 记忆按智能体隔离。

- 零依赖：只需要 Node.js，没有数据库、没有常驻服务（除非你开启便携记忆盘模式）。
- 记忆即文件：数据主权在你手里。

**典型使用场景：**

- **跨会话续接**：AI 开工 `recall` 恢复上次上下文，不丢记忆。
- **多智能体共享**：FACT 进公共区共享，PREF / BOUND / COMMIT 各自私密隔离。
- **交接与团队协作**：项目级 `.yottamemory` 随仓库走，交接即恢复。
- **便携记忆盘**：记忆装在固定主机上，本机与局域网其它主机共享同一份记忆（见第 4 / 5 篇）。
- **越用越懂（v0.6.0）**：AI 按「记忆守则」主动捕获信号，`profile` 聚合画像、`context` 开工注入——用得越久越懂你。
- **自我学习 / 自我进化 / 自我提升（v0.8.0）**：`recall` 语义检索（同义词 / 拼音 / 字段加权 / 模糊）+ `feedback` 使用反馈闭环 + `maintain` 规则层自组织（自动归档 / 遗忘候选 / 去重）+ `distill` 心理日志蒸馏——记忆系统会自己整理、提炼、演化。

## 2. 安装（CLI + 技能）

使用元忆需要两部分：**CLI**（命令行工具，负责读写记忆）与**技能**（SKILL.md，负责教 AI 智能体怎么用）。先装 CLI，再把技能装进要用的智能体。

**CLI：任选一种方式**

| 方式 | 命令 | 适用 |
|---|---|---|
| npm 全局（推荐） | `npm i -g @yottameta/yotta-memory` | 长期使用 |
| npx 临时 | `npx -y @yottameta/yotta-memory` | 临时试用 |
| install.sh | git clone 仓库后 `bash install.sh -g`（或手动下载 install.sh 执行）| 离线 / 国内 / 无 npm |

安装后验证：`yotta-memory --version` 能输出版本号即成功。

**技能（SKILL.md）：装进要用的 AI 智能体**

| 方式 | 命令 | 适用 |
|---|---|---|
| npx skills（生态标准入口） | `npx skills add YottaMeta/yotta-memory` | 自动检测已装智能体 |
| 安装器（npm 全局时） | `yotta-memory-install -g` / `yotta-memory-install --agent codex` | 装进所有 / 指定智能体 |
| 手动 | 把整个 `yotta-memory` 文件夹复制到智能体的 skills 目录 | 离线 |

> CLI 与技能分工不同：CLI 让命令行能读写记忆；技能让 AI 知道「开工 recall 恢复上下文、重要信息 remember 落盘、收工归档」。只装 CLI 不装技能，AI 不会自动使用这套工作流。

**更新：** `npm i -g @yottameta/yotta-memory` 升级 CLI（不带版本号即最新版），再把技能文件夹重新装进智能体（重复执行上面的技能安装命令即可）。

**卸载：** `npm rm -g @yottameta/yotta-memory`，并从智能体的 skills 目录删除整个 `yotta-memory` 文件夹。

## 3. 本机单机使用

```bash
yotta-memory init                                    # 初始化记忆库（默认 ~/.yottamemory）
yotta-memory remember FACT 项目 本周完成发布           # 记一条事实
yotta-memory recall 项目                              # 检索记忆
yotta-memory config get                              # 查看记忆库位置
```

- 想换记忆位置：`yotta-memory config set memory_home <目录>`，之后所有命令自动用新位置。
- 项目级记忆：在项目目录里 `yotta-memory init --project`，该项目的智能体优先读项目级记忆。

### 画像与开工上下文（v0.6.0）

```bash
yotta-memory profile                          # 生成用户画像（写 private/<owner>/profile.md）
yotta-memory context --limit 10 --budget 1800 # 生成开工上下文包（身份+铁律+画像+近期记忆+边界+承诺，预算控 token）
yotta-memory iam <id> --name 元忆 --user 老张 --relationship 伙伴   # 自我档案扩展显示名/用户/关系
```

- `profile` 引擎零推断：只按类型 / 主题 / 标签归组呈现原文，画像结论由 AI 内部形成，不当面贴标签。
- `context` 是每次会话开工的主注入，替代裸 `recall`；无画像时自动生成一次或降级，不报错；`--budget` 控制近期记忆字符预算（token 恒定）。
- `remember --verify` 写后回读校验；`remember --no-hint` 关闭「疑似偏好，建议 PREF」的提示。

### 记忆库位置：本机智能体如何找到记忆

位置解析优先级：`YOTTA_MEMORY_HOME`（环境变量，临时覆盖）> `config.json#memory_home`（`config set memory_home` 持久记住）> 默认 `~/.yottamemory`。

- 本机智能体装好技能后，AI 开工执行 `yotta-memory config get` 即可看到当前生效位置，`recall` 会自动读对位置。
- 记忆库换位置后，执行一次 `yotta-memory config set memory_home <新目录>` 即可，无需改技能。

### 手动添加 / 编辑记忆

记忆就是文件：读写一律走 `yotta-memory` CLI / MCP 工具，**请勿用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读改记忆库目录下的文件**——那会绕过 scope/owner 权限边界，可能读到其它智能体的私密内容。确需手改时，请把文件放对分类目录：公共事实放 `facts/`；私密的偏好 / 边界 / 承诺放 `private/<owner>/<type>/`（`<owner>` 用你登记的智能体 ID），frontmatter 至少包含 `type` / `subject` / `statement`：

> 说明：`index.json` 是引擎自动维护的检索索引，其 `tokens` 字段是中文分词的词频表（供 TF 打分），**不是**访问令牌。手动改过 `.md` 后可用 `yotta-memory reindex` 校正索引，无需手动编辑 `index.json`。

```markdown
---
type: FACT
subject: 项目
statement: 本周完成发布
---
本周完成发布
```

手动改过文件后运行 `yotta-memory reindex` 重建索引，`recall` 才能按索引检索到。整个记忆目录可以用 git 做版本管理与回滚。


## 3.5 私密区加密（v0.7，推荐）

私密区（PREF / BOUND / COMMIT）默认落盘为**密文**（AES-256-GCM 信封加密），任何没有对应密钥的 AI 即使读到文件也解不开；公共 FACT 保持明文共享。用户通过**用户查看平台**持主口令解锁查看全部记忆。

**启用与迁移**

- **新库**：`yotta-memory init`（新建默认加密）→ 输入主口令两次 → **抄下打印的恢复钥匙**（44 位 base64，离线保存；忘口令时用它重设）。不要加密用 `--no-encrypt`。
- **老明文库升级**：`yotta-memory migrate` → 输入主口令 → 私密文件逐个加密、明文删除 → 抄下恢复钥匙。

**用户查看平台（看所有 AI 的记忆）**

`yotta-memory view` → 浏览器打开 http://127.0.0.1:8788 → 输入主口令解锁 → 浏览 / 搜索 / 导出全部记忆（含各 AI 私密）；也可在此**授权 / 吊销**某 AI 读取其私密、**重设口令**、**查看恢复钥匙**。口令只在本地内存派生，不落盘、不发远端；默认仅本机，远程需 `--host` 显式开启。

**AI 接入加密库**

1. 该 AI 声明身份（`iam` / MCP 配置 `YOTTA_AGENT_ID`）。
2. 用户在平台对其点一次「授权」→ 平台把该 AI 的 owner key 写入授权缓存（`keys/cache/<id>.key`，600 权限）。
3. 之后该 AI 正常 `remember / recall / profile / context`，读写自动加解密；未授权时写私密会提示「需在用户平台授权」，公共 FACT 不受影响。

**口令管理**

- 重设口令：`yotta-memory reset-password`（输入当前口令），或忘口令时 `--recovery-key <恢复钥匙>`。
- 吊销某 AI：`yotta-memory key revoke <id>`（立即失效）。
- 注意：**口令即主密钥**，忘口令且丢失恢复钥匙 = 密文私密不可恢复（公共 FACT 仍在）。

## 3.6 自我学习 / 自我进化 / 自我提升（v0.8.0）

元忆 v0.8.0 让记忆系统「越用越懂」：语义检索、使用反馈闭环、规则层自组织、心理日志蒸馏，全部零依赖内置。

**语义检索（recall）**

- `recall <关键词>` 默认语义检索：同义词（内置词表）、拼音（全拼 / 首字母，内置 3755 常用字表）、字段加权（subject 优先）、模糊匹配（编辑距离 ≤ 2）、子串兜底。
- 例：记过「越用越懂」，用 `recall yyyd`（首字母）或 `recall yueyong yuedong`（拼音）都能找回。
- `recall --explain`：显示每条命中理由与效用分项。
- 旧索引首次 recall 自动重建（version 4），无需手动 reindex。

**使用反馈闭环（feedback）**

- `feedback <文件> --useful`：这条记忆有用 → weight ×1.2（上限 3.0）、confidence +0.05、feedback_net +1。
- `feedback <文件> --useless`：没用 → weight ×0.8（下限 0.2）、confidence −0.05、feedback_net −1。
- `--reason <原因>` 记录原因；`--undo` 回滚最近一次。反馈记录在 `.archive/feedback-<日期>.jsonl`。
- 反馈会改变记忆的效用分 → 高频「没用」的记忆会被自动归档 / 遗忘候选（自我学习）。

**规则层自组织（maintain）**

- `maintain`（默认 dry-run 预览）：列出归档候选（统一效用分 < 0.35 且超 180 天）与遗忘候选（< 0.12 且超 365 天），immutable / BOUND 豁免。
- `maintain --apply`：执行归档（移入 `.archive/`，可恢复）。
- `maintain --apply --purge`：真删遗忘候选（谨慎，先确认）。
- `maintain --dedup`：列出重复候选；`maintain --merge A,B` 合并两条相似记忆。
- 阈值可用 `config set maintain_archived_utility 0.3` 等调整；审计在 `.archive/audit-<日期>.jsonl`。

**心理日志蒸馏（distill）**

- `distill`：生成统计摘要（类型 / 年龄 / 热度 / 反馈）+ 主题画像（按 subject 聚类）+ 知识地图（type → tags）。
- 可选 `--model <cmd>`：外部模型 stdin 收结构化摘要 → stdout 输出提炼文本（无模型走启发式）。
- 产物：私密蒸馏入 `private/<owner>/distills/`（受 owner key 保护），公共入 `facts/distills/`；`--out <路径>` 可指定导出。

**查看效用（explain）**

- `explain <文件>`：显示单条记忆的效用分项（confidence / 使用 / 时效 / 类型 / 结构 × weight）与归档 / 遗忘状态判定，帮助理解为什么某条记忆靠前 / 被归档。

## 3.7 查看平台分页与检索优化（v0.8.1）

- **用户查看平台分页**：yotta-memory view 启动的网页端记忆卡片改为服务端分页——记忆多时不再一次性加载渲染全部，页面显示「共 N 条」「第 x / y 页」，支持上一页 / 下一页。
- **recall 候选预过滤**：语义检索前先用索引 token 粗筛候选集（精确 / 同义 / 拼音 / 子串 / 模糊长度门槛），命中集与 v0.8.0 一致，记忆量大时显著减少逐条语义 / 模糊 / 编辑距离开销。

## 4. 便携记忆盘 · 记忆引擎主机篇

场景：记忆放在一台主机上（Linux / Windows 均可），本机直接 CLI 读写；局域网内其它主机上的 AI 智能体经 MCP 远程接入。引擎主机只需装 CLI，不需要装任何 AI 智能体。

**本机与局域网可同时用同一个记忆库**：引擎 `serve` 运行期间，本机智能体照常用 CLI（或 stdio MCP）读写（不经网络、不需要 token），局域网其它主机的智能体同时经 MCP + token 接入——两条通道并存、互不干扰。

**第 1 步：安装 CLI**（见第 2 节）。

**第 2 步：指定记忆位置并初始化（或接入现有记忆库）**

```bash
yotta-memory config set memory_home /srv/yotta-memory   # 改成你的实际目录
yotta-memory init --dir /srv/yotta-memory               # 新库：初始化（自动建 facts/private/.archive）
```

如果目标目录**已经是记忆库**（里面有 `facts/` 等子目录或 `index.json`，例如从旧机复制或 git 克隆来的），直接 `config set memory_home <目录>` 接入即可，**不要重复 init**。

**第 3 步：注册开机自启（可选，推荐）**

```bash
# Windows：内置命令（优先计划任务；非管理员自动降级用户级 Startup 静默自启；
# v0.6.3 起启动脚本自愈——启动文件被清理也会在开机时自动重建，无需手动处理）
yotta-memory lan enable              # 登录后自动启动（默认）
yotta-memory lan enable --onstart    # 开机即启（需管理员）
yotta-memory lan status              # 查看状态
yotta-memory lan disable             # 取消

# Linux：内置命令（v0.6.4 起）——优先 systemd 用户单元（登录自启）；
# systemd 不可用时自动降级用户 crontab @reboot（开机自启，免管理员）
yotta-memory lan enable              # 登录后自动启动（默认）
yotta-memory lan enable --onstart    # 开机即启（无需登录，需系统支持 loginctl）
yotta-memory lan status              # 查看状态
yotta-memory lan disable             # 取消
```

**说明**：`lan enable` 默认「登录后自启」；如需系统级（整机、开机即启）服务，可手动创建 systemd 单元 `/etc/systemd/system/yotta-memory.service`（ExecStart 指向 `which yotta-memory` 实际路径），再以管理员执行 systemd 的 enable --now 启用；桌面环境也可在 `~/.config/autostart/` 放置 `yotta-memory.desktop` 实现图形登录自启。

**第 4 步：为局域网其它主机的智能体生成访问 token**

```bash
yotta-memory token new --agent 我的智能体ID
```

命令会打印一次 `ytm_...`，请妥善保管（它就是访问凭证）。多个智能体就重复执行、用不同 ID。**本机上的 AI 智能体不需要 token**（见第 5 篇）。

> token 丢失或要更换：重新执行 `token new --agent <id> --force` 会生成新 token 并覆盖旧的，旧 token 立即失效；不加 `--force` 时若该 ID 已被其它来源占用会被拒绝（每个 AI 的 ID 必须唯一）；`token list` 可查看已登记哪些智能体。

**第 5 步：把连接信息交给远程智能体的用户**

- 引擎地址：`http://<本机IP>:8787/mcp`
- 该智能体的 token：`ytm_...`
- 智能体 ID（对应 X-Agent-Id 请求头）

查本机 IP：Linux 运行 `hostname -I`（或 `ip a`）；Windows 运行 `ipconfig` 找「IPv4 地址」。防火墙：Linux 若启用了 ufw，执行 `sudo ufw allow 8787/tcp`；Windows 首次监听时允许放行。否则局域网其它主机连不进来。

**第 6 步：备份与迁移**

- 备份 = 复制整个记忆目录（`facts/` `private/` `.archive/` + `index.json` + `agents.json` + `.server/`），复制到哪、哪就是记忆库；迁移同理，整个目录拷走即可。
- `export` / `import` 是把记忆导出成单个 JSON 或从 JSON 导入，适合跨工具交换或归档，不是日常备份的必需步骤。

## 5. 智能体接入篇（本机 / 局域网其它主机）

接入智能体分两类：引擎主机本机的智能体、局域网其它主机上的智能体。本机不需要 token、不依赖远程服务；其它主机经 MCP + token 接入。

### 5.1 本机 AI 智能体（引擎主机本机）

**方式一（推荐，最简单）：让智能体直接调用 CLI。**

```bash
yotta-memory recall <关键词>            # 智能体开工恢复上下文
yotta-memory remember FACT 主题 内容    # 智能体落盘
```

智能体装上技能后（`SKILL.md`）会自动学会这套工作流，无需任何 MCP 配置。

**方式二：stdio MCP（零常驻进程，智能体按需拉起 CLI）。** 在智能体 MCP 配置里加：

```json
{
  "mcpServers": {
    "yotta-memory": {
      "command": "yotta-memory",
      "args": ["serve", "--stdio"],
      "env": { "YOTTA_AGENT_ID": "<该智能体唯一ID>" }
    }
  }
}
```

本机接入不需要 token，也不需要启动 HTTP 服务；但**必须在配置里声明唯一的 `YOTTA_AGENT_ID`**（见下），否则写私密记忆会被拒。

**本机智能体装好技能后如何获取记忆存放位置？** 按优先级：`YOTTA_MEMORY_HOME` 环境变量 > `config set memory_home` 持久化的 `~/.yottamemory/config.json` > 默认 `~/.yottamemory`。AI 开工执行 `yotta-memory config get` 查看当前生效位置；记忆库移动后执行一次 `config set memory_home <新目录>` 即可。

**给本机智能体设置唯一身份（强制）**：私密记忆（PREF / BOUND / COMMIT）按 owner 物理分目录隔离（存于 `private/<owner>/<type>/`），owner 取当前智能体的 agent ID。流程如下：

1. 开工先 `yotta-memory whoami` 确认「我是谁」。
2. 未登记 → 向用户确认一个**全局唯一** ID（建议 `<主机名>-<角色>`，别用 `dashu` / `codex` 这类易撞名），执行 `yotta-memory iam <id>`：引擎**强制唯一性**（被其它主机 / 来源占用会拒绝），并自动落一条「自我接入档案」PREF（owner=自己）。
3. 本机多个 AI 智能体共用引擎时，**每个都要在它自己的 MCP 配置里声明唯一 `YOTTA_AGENT_ID`**（CLI 直连则每次带 `--agent <id>`），各自 `whoami` 各回各的、互不撞。
4. **禁止**从记忆里读到别人的 ID 就当自己的（比如看到「Kali 智能体 ID 为 dashu」就把自己当 dashu）；不确定先 `whoami` 再问用户，**禁止猜**。
5. **不设则 owner 为空**：写私密记忆会被引擎拒绝（公共 FACT 不受影响），避免私密隔离退化。

### 5.2 局域网其它主机的 AI 智能体

**第 1 步：向记忆引擎主机获取**：引擎 IP、端口（默认 8787）、本智能体的 token、智能体 ID。

**第 2 步：配置 MCP**（可以让 AI 按 `SKILL.md` 引导自动完成；也可以手动在你的智能体 MCP 配置里加这段）：

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

**第 3 步：验证**：让 AI 调一次 `recall` / `search`，能读到记忆即连接成功。

**第 4 步：复用**：连接成功后就一直复用；token 失效（被吊销）时回到第 1 步重新获取。

**身份确认与自我档案（强制）**：先调一次 MCP 工具 `agent_info` 确认「我是谁」（读 X-Agent-Id 声明 + 登记状态）。随后用 `remember` 写一条 `subject=自我接入档案` 的 PREF（owner=自己），body 为 `; ` 分隔的 key:value——`agent_id / host / memory_home / mcp_mode: http / engine_url / token`，把接入信息存进自己的永久记忆；下次会话 `recall "自我接入档案"` 直接找回。

## 6. CLI 命令速查

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>]` | 初始化记忆库 |
| `yotta-memory remember <类型> <主题> <内容> [--owner <id>] [--source <来源>] [--weight <0..>] [--verify] [--no-hint]` | 写入记忆（--source 来源；--weight 重要性权重；--verify 写后回读；--no-hint 关闭类型提示）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe] [--explain]` | 检索记忆（v0.8.0 默认语义检索：同义词 / 拼音 / 字段加权 / 模糊 + 效用分排序；`--explain` 显示命中理由；读取分区过滤；`--agent <其它>` 仅作身份声明、不授予跨读；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`）|
| `yotta-memory profile [--owner <id>]` | 生成用户画像（零推断，写 `profile.md`）|
| `yotta-memory context [--limit N] [--owner <id>] [--budget N]` | 开工上下文包（身份+铁律+画像+近期记忆+边界+承诺；--budget 近期记忆字符预算）|
| `yotta-memory forget <文件>` | 删除一条记忆 |
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆 |
| `yotta-memory reindex` | 重建索引 |
| `yotta-memory export [--out 文件.json]` / `import <文件.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config get` | 记忆库位置 |
| `yotta-memory whoami` | 查看当前智能体身份与登记状态（读 `YOTTA_AGENT_ID` / `X-Agent-Id`，不猜不默认）|
| `yotta-memory iam <id> [--name <显示名>] [--user <用户名>] [--relationship <关系>] [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一；可选扩展显示名 / 用户 / 关系）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 访问 token（同 ID 已被其它来源占用需 `--force` 覆盖）|
| `yotta-memory serve [--port 8787] [--stdio] [--no-auth]` | 启动记忆引擎（--no-auth 关闭鉴权，仅限可信内网）|
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows：计划任务/用户级 Startup 静默自启；Linux：systemd 用户单元/用户 crontab @reboot）|
| `yotta-memory feedback <文件|主题> --useful|--useless [--reason <原因>] [--undo]` | 使用反馈（v0.8.0：useful/useless 调 weight/confidence/feedback_net；--undo 回滚）|
| `yotta-memory maintain [--dry-run] [--apply] [--purge] [--threshold N] [--age N] [--dedup] [--merge A,B]` | 记忆自组织（v0.8.0：归档 / 遗忘候选 / 去重；默认 dry-run，--apply 执行，--purge 才真删）|
| `yotta-memory distill [--owner <id>] [--subject <主题>] [--model <cmd>] [--out <路径>]` | 心理日志蒸馏（v0.8.0：统计摘要 / 主题画像 / 知识地图）|
| `yotta-memory explain <文件|主题>` | 查看单条记忆效用分项（v0.8.0）|

类型：`FACT`（事实，共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺），后三类按智能体物理分目录隔离（`private/<owner>/<type>/`）。

## 7. 故障排查

**远程连不上时，按顺序检查：**

1. 引擎在运行吗？`yotta-memory lan status`（Windows / Linux 通用）；Linux 也可 `systemctl --user status yotta-memory-serve.service`（systemd 自启时）或 `ps aux | grep yotta-memory`；也可直接 `yotta-memory --version`。
2. IP 对吗？引擎主机执行 `hostname -I`（Linux）或 `ipconfig`（Windows）确认。
3. 端口对吗？默认 8787，两端要一致。
4. 防火墙放行了吗？Linux：`sudo ufw status`，未放行则 `sudo ufw allow 8787/tcp`；Windows：允许首次监听的入站请求。
5. token 有效吗？记忆盘主机执行 `yotta-memory token list` 看该智能体是否登记；无效就 `token new --agent <id>` 重新生成。
6. 网络通吗？任意一台主机用浏览器或命令行访问 `http://<引擎IP>:8787/mcp`：
   - 返回 401：服务在运行，是鉴权问题（token / 请求头不对）。
   - 连接被拒 / 超时：服务没启动，或防火墙拦截。

**`lan enable` 计划任务被拒（Access denied 等）：** 无需担心——会自动降级为**用户级 Startup 静默自启**（免管理员，重新登录后生效，启动脚本位于用户 Startup 目录）；如确需计划任务，请用管理员终端重新执行；`--onstart` 模式必须管理员。

**启动引擎报端口被占用（EADDRINUSE）：** 用 `--port <其它端口>` 换端口启动，两端保持一致；或先查占用：Linux `ss -tlnp | grep 8787`，Windows `netstat -ano | findstr 8787`。

**recall 没有结果：** 关键词太细或确实没有这条记忆；先 `recall`（不带关键词）看库里的全部记忆核对。

**systemd 自启的引擎看日志：** `journalctl --user -u yotta-memory-serve.service -n 50`（系统级手动服务为 `journalctl -u yotta-memory -n 50`）。

**记错位置了？** `yotta-memory config get` 查看当前生效位置；`config set memory_home <正确目录>` 改正。

## 8. 安全与边界

- token 等同密码：只给需要接入的智能体，别外传。
- 私密区机制级加密（v0.7 起）：PREF / BOUND / COMMIT 私密记忆默认落盘为密文（AES-256-GCM 信封加密），任何没有对应 owner 密钥的 AI 即使读到密文文件也解不开；隔离 = 权限边界（scope/owner）+ 机制层机密保护。用户是数据所有者，经 `yotta-memory view` 口令解锁可看全部。
- 记忆读写一律走 CLI / MCP；禁止用 shell（`Get-ChildItem` / `cat` / `ls` / `type` 等）直接读改记忆库目录下的文件——否则会绕过 scope/owner 权限边界。
- 管理动作（init / config / token / lan / serve）不通过 MCP 暴露，远程只能读写记忆，不能改配置、不能管 token。
- `--no-auth` 会关闭鉴权，仅限可信内网使用。
- 数据主权在用户：公共 FACT 明文、随时可看可改可删；私密区加密，用户经 `yotta-memory view` 口令解锁后同样可看、可改、可删、可导出。
- 「记忆守则」内置底线：陪伴不操控 / 理解不越界（不贴标签）/ 诚实不伪装 / 不降格；数据安全（被遗忘权 = `forget`）；宿主隔离（只写本记忆库，不读写宿主 AI 自身 memory / 配置 / 系统文件）。

**确实需要读取其它智能体的私密记忆时（三种授权方式，满足任一即可）：**

1. 显式授权 `grants.json`：在记忆库根目录写 `{"<你的agentID>": ["<对方agentID>"]}`；
2. identity=user：以 `--agent user` / `--owner user` / 环境变量 `YOTTA_AGENT_ID=user` 读取；
3. 显式放行 `--unsafe`：用户明确同意时使用。

**协作纪律**：FACT 写入公共区共享；PREF / BOUND / COMMIT 只写自己的私密区；不主动读取其它智能体的私密记忆。
