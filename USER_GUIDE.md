# 元忆（yotta-memory）用户使用手册

> 面向最终用户的操作手册：从安装、初始化，到便携记忆盘（局域网多机共享）的部署与接入。AI 智能体的自动引导流程见 `SKILL.md`。

## 目录

1. 这是什么
2. 安装
3. 本机单机使用
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

## 2. 安装（CLI + 技能）

使用元忆需要两部分：**CLI**（命令行工具，负责读写记忆）与**技能**（SKILL.md，负责教 AI 智能体怎么用）。先装 CLI，再把技能装进要用的智能体。

**CLI：任选一种方式**

| 方式 | 命令 | 适用 |
|---|---|---|
| npm 全局（推荐） | `npm i -g @yottameta/yotta-memory` | 长期使用 |
| npx 临时 | `npx -y @yottameta/yotta-memory` | 临时试用 |
| install.sh | `bash <(curl -s https://raw.githubusercontent.com/YottaMeta/yotta-memory/main/install.sh)` | 离线 / 无 npm |

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
# Windows：内置命令（优先计划任务；非管理员自动降级用户级 Startup 静默自启）
yotta-memory lan enable              # 登录后自动启动（默认）
yotta-memory lan enable --onstart    # 开机即启（需管理员）
yotta-memory lan status              # 查看状态
yotta-memory lan disable             # 取消

# Linux：用 systemd 开机自启（lan 命令当前仅支持 Windows）
# 先查 yotta-memory 实际路径：which yotta-memory（npm 全局默认 /usr/local/bin/yotta-memory）
sudo tee /etc/systemd/system/yotta-memory.service > /dev/null <<'EOF'
[Unit]
Description=yotta-memory memory engine
After=network.target

[Service]
ExecStart=/usr/local/bin/yotta-memory serve --host 0.0.0.0 --port 8787
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now yotta-memory
systemctl status yotta-memory        # 查看状态
```

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
| `yotta-memory remember <类型> <主题> <内容> [--owner <id>]` | 写入记忆 |
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 检索记忆（读取分区过滤；`--agent <其它>` 仅作身份声明、不授予跨读；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`）|
| `yotta-memory forget <文件>` | 删除一条记忆 |
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆 |
| `yotta-memory reindex` | 重建索引 |
| `yotta-memory export [--out 文件.json]` / `import <文件.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config get` | 记忆库位置 |
| `yotta-memory whoami` | 查看当前智能体身份与登记状态（读 `YOTTA_AGENT_ID` / `X-Agent-Id`，不猜不默认）|
| `yotta-memory iam <id> [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 访问 token（同 ID 已被其它来源占用需 `--force` 覆盖）|
| `yotta-memory serve [--port 8787] [--stdio] [--no-auth]` | 启动记忆引擎（--no-auth 关闭鉴权，仅限可信内网）|
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows：计划任务；非管理员自动降级用户级 Startup 静默自启）|

类型：`FACT`（事实，共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺），后三类按智能体物理分目录隔离（`private/<owner>/<type>/`）。

## 7. 故障排查

**远程连不上时，按顺序检查：**

1. 引擎在运行吗？Windows：`yotta-memory lan status`；Linux（systemd 自启时）：`systemctl status yotta-memory`，或 `ps aux | grep yotta-memory`；也可直接 `yotta-memory --version`。
2. IP 对吗？引擎主机执行 `hostname -I`（Linux）或 `ipconfig`（Windows）确认。
3. 端口对吗？默认 8787，两端要一致。
4. 防火墙放行了吗？Linux：`sudo ufw status`，未放行则 `sudo ufw allow 8787/tcp`；Windows：允许首次监听的入站请求。
5. token 有效吗？记忆盘主机执行 `yotta-memory token list` 看该智能体是否登记；无效就 `token new --agent <id>` 重新生成。
6. 网络通吗？任意一台主机执行 `curl http://<引擎IP>:8787/mcp`：
   - 返回 401：服务在运行，是鉴权问题（token / 请求头不对）。
   - 连接被拒 / 超时：服务没启动，或防火墙拦截。

**`lan enable` 计划任务被拒（Access denied 等）：** 无需担心——会自动降级为**用户级 Startup 静默自启**（免管理员，重新登录后生效，启动脚本位于用户 Startup 目录）；如确需计划任务，请用管理员终端重新执行；`--onstart` 模式必须管理员。

**启动引擎报端口被占用（EADDRINUSE）：** 用 `--port <其它端口>` 换端口启动，两端保持一致；或先查占用：Linux `ss -tlnp | grep 8787`，Windows `netstat -ano | findstr 8787`。

**recall 没有结果：** 关键词太细或确实没有这条记忆；先 `recall`（不带关键词）看库里的全部记忆核对。

**systemd 自启的引擎看日志：** `journalctl -u yotta-memory -n 50`。

**记错位置了？** `yotta-memory config get` 查看当前生效位置；`config set memory_home <正确目录>` 改正。

## 8. 安全与边界

- token 等同密码：只给需要接入的智能体，别外传。
- 元忆不做加密：PREF / BOUND / COMMIT 私密记忆的隔离是「权限边界」机制（谁该读由 scope/owner 决定），属于纪律层保护，不是机密数据保护层。
- 记忆读写一律走 CLI / MCP；禁止用 shell（`Get-ChildItem` / `cat` / `ls` / `type` 等）直接读改记忆库目录下的文件——否则会绕过 scope/owner 权限边界。
- 管理动作（init / config / token / lan / serve）不通过 MCP 暴露，远程只能读写记忆，不能改配置、不能管 token。
- `--no-auth` 会关闭鉴权，仅限可信内网使用。
- 数据主权在用户：所有数据都是本地明文文件，随时可看、可改、可删。

**确实需要读取其它智能体的私密记忆时（三种授权方式，满足任一即可）：**

1. 显式授权 `grants.json`：在记忆库根目录写 `{"<你的agentID>": ["<对方agentID>"]}`；
2. identity=user：以 `--agent user` / `--owner user` / 环境变量 `YOTTA_AGENT_ID=user` 读取；
3. 显式放行 `--unsafe`：用户明确同意时使用。

**协作纪律**：FACT 写入公共区共享；PREF / BOUND / COMMIT 只写自己的私密区；不主动读取其它智能体的私密记忆。
