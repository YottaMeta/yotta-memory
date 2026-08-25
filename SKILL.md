---
name: yotta-memory
description: "元忆 —— 有权限边界的文件式智能体记忆。文件式、零依赖、可 diff/回滚：让任何 AI 智能体活过会话，开工 recall 恢复上下文、重要信息 remember 落盘、收工归档。类型体系 FACT（公共共享）/ PREF / BOUND / COMMIT（私密隔离）。触发：记住、别忘了、记一笔、记忆、remember、recall、跨会话、上次说到、续测、交接、归档、记忆盘、共享记忆、局域网记忆"
version: 0.5.3
license: MIT
---

# yotta-memory（元忆）— 有权限边界的文件式智能体记忆

> 一句话：元忆 —— 有权限边界的文件式智能体记忆（不注入、可 diff、能回滚；FACT 共享、PREF / BOUND / COMMIT 私密隔离）。
> 版本：0.5.3 | 最后更新：2026-08-25

## 这是什么

- **文件式记忆标准**：记忆 = Markdown + YAML frontmatter 文件，git 可版本化，任何智能体可读，数据主权在用户本地。
- **零依赖**：无 daemon / 无数据库 / 无向量库，Node.js 自带即可运行。
- **类型体系**：FACT（事实，公共共享）/ PREF（偏好，私密）/ BOUND（边界，私密）/ COMMIT（承诺，私密）。
- **双级存储**：用户级 `~/.yottamemory/`（跨项目）+ 项目级 `.yottamemory/`（随项目共享）。

## 何时使用（触发）

- 用户说「记住」「别忘了」「记一笔」等保存类指令。
- 会话开始需要恢复上下文（跨会话 / 跨项目 / 续测）。
- 收工时需要留交接与归档。
- 多智能体协作时，公共事实进 FACT，个人偏好 / 边界 / 承诺进各自私密区。

## 核心流程

1. **开工定向**：先按「开工第一步：确认记忆位置 + 智能体身份」检测记忆库与身份，再运行 `yotta-memory recall`（可带关键词）恢复上下文；项目级记忆优先，其次用户级。
2. **进行中落盘**：重要信息立即 `yotta-memory remember <type> <subject> <statement>`，不攒到收工。
3. **收工归档**：写会话小结（COMMIT / 笔记），旧记录定期 `yotta-memory archive`。
4. **多智能体纪律**：FACT 写入公共区，PREF / BOUND / COMMIT 只写本智能体私密区；不读取其他智能体私密区。**一切读写一律走 `yotta-memory` CLI / MCP 工具**——禁止用 shell（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` 等）直接读或改记忆库目录下的 `.md` / `index.json` / `tokens.json` / `agents.json` / `grants.json` 等文件，否则会绕过权限边界、读到别的智能体私密内容。


### 开工第一步：确认记忆位置 + 智能体身份（每次会话先做，必做）

**A. 确认记忆库位置**（AI 不会自动知道记忆库在哪，先检测，避免「recall 读空库 / 错库」）：

1. 运行 `yotta-memory config get`。
   - 输出 `memory_home: <目录>`（已显式设置）→ 直接用该位置。
   - 输出 `memory_home: (未设置，默认 ~/.yottamemory)` → 🔒 征得同意后引导设置：问用户用默认还是指定目录（项目级 `<repo>/.yottamemory`、记忆盘等），确认后 AI 执行 `yotta-memory config set memory_home <目录>`，回读 `config get` 验证。
2. **已有记忆**：目标目录已存在 `facts/` 等子目录或 `index.json` → 直接 recall；全新目录 → 按「便携记忆盘模式 §0.3」初始化。

**B. 确认本智能体唯一身份（强制，写私密记忆前必做）**：

1. 运行 `yotta-memory whoami`（远端经 MCP 用 `agent_info`）确认「我是谁」。
   - 已显示身份 + 已登记 + 有自我档案 → 用它，进入第 3 步。
   - 显示「未声明身份」或「未登记」→ 进入第 2 步。
2. **登记唯一 ID（AI 自己定义，须用户确认）**：
   - AI 提议一个**全局唯一** ID（建议 `<主机名>-<角色>` 或带随机后缀，如 `win-zhiwei` / `kali-dashu`；禁止用 `dashu` / `codex` 这类易撞名）。
   - 🔒 征得用户同意后执行 `yotta-memory iam <id>`：引擎**强制唯一性**（ID 已被其它主机/来源占用 → 拒绝并提示换 ID；确认是同一智能体才 `--force`），并**自动写自我档案**到本智能体私密区。
   - 回读：`yotta-memory whoami` 显示「已登记 + 自我档案」。
3. **自我档案校验**：`yotta-memory recall "自我接入档案"`（本智能体）能读回字段才算就绪：
   `agent_id / host / memory_home / mcp_mode（stdio|http）/ engine_url（仅远端）/ token（仅远端；本机不存 token）`。
4. **本机多智能体**：本机多个 AI 智能体共用引擎时，**每个都必须**在它自己的 MCP 配置里声明唯一 `YOTTA_AGENT_ID`（如 `env: { YOTTA_AGENT_ID: "<该智能体唯一ID>" }`），各自 `whoami` 各回各的、互不撞；本机走 stdio 免 token。

**C. 身份红线（强制）**：

- 智能体 ID **必须全局唯一**；**禁止**「从记忆里读到别人的 ID 就当自己的」（如看到「Kali 智能体 ID 为 dashu」就把自己当 dashu）。
- 不确定自己的 ID → 先 `whoami` / `agent_info`，再向用户确认；**禁止猜**。
- 私密记忆（PREF / BOUND / COMMIT）**必须有 owner**：未声明身份写私密会被引擎拒绝（公共 FACT 不受影响）。
- **禁止直接读写记忆库文件（硬红线）**：一切读写走 `yotta-memory` CLI / MCP 工具（`remember` / `recall` / `search` / `forget` / `archive` / `reindex` / `export` / `import` / `agent_info`）；**禁止用 shell**（`Get-ChildItem` / `Get-Content` / `cat` / `ls` / `type` / `vim` 等）直接读、改、删 `<root>/` 下的记忆文件——否则 `--agent` / `--owner` 的越界拦截形同虚设，会读到别的智能体私密内容。`--agent <其它agent>` 只作身份声明/展示，绝不授予跨智能体私密读取（读他人私密仍需 grant / identity=user / `--unsafe`）。

> 已用 `YOTTA_MEMORY_HOME` 临时覆盖时不必改 config；本步骤是常规 CLI 直连用户级位置的引导。

## CLI 速查

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>]` | 初始化记忆库（默认用户级；--dir 显式指定位置）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>]` | 写入（同 subject+statement 自动更新；--owner 标注归属，默认取 agent id）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 检索（索引+TF 打分，读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；`--agent <其它>` 只作身份声明/展示，不授予跨读——读他人私密同样要授权；项目级优先）|
| `yotta-memory forget <文件>` | 删除（按类型目录路径或文件名）|
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆（盖棺分+年龄，immutable 除外）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config get` | 持久记住 / 查看记忆库位置（`~/.yottamemory/config.json`）|
| `yotta-memory whoami` | 查看当前智能体身份与登记状态（读 `YOTTA_AGENT_ID` / `X-Agent-Id`，不猜不默认）|
| `yotta-memory iam <id> [--force]` | 登记本智能体唯一身份并自动落自我档案（`agents.json`，ID 必须唯一）|
| `yotta-memory token new --agent <id> [--force]` / `token list` / `token revoke --agent <id>` | 每智能体访问 token：生成 / 列出 / 吊销（登记 `<记忆库>/.server/tokens.json`；同 ID 已被其它来源占用需 `--force` 覆盖，防不同智能体合流）|
| `yotta-memory serve [--host 0.0.0.0] [--port 8787] [--no-auth] [--stdio]` | 启动 MCP 记忆引擎（streamable HTTP 局域网 / --stdio 本地零进程模式；Bearer token + X-Agent-Id 鉴权）|
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理（Windows 计划任务，默认 ONLOGON 登录自启；--onstart 开机即启需管理员）|

## 存储格式（摘要）

目录结构（v0.5.0 起，私密记忆按 owner 物理分目录）：

```
<root>/
├── facts/                    # FACT 事实（公共可共享）
├── private/<owner>/<type>/   # PREF / BOUND / COMMIT，按智能体隔离
├── .archive/                 # 归档区
├── index.json                # 检索索引（tokens = 分词词频，非访问令牌）
└── agents.json               # 智能体身份登记表（唯一性）
```

记忆文件 `<YYYY-MM-DD>-<NNNN>.md`，frontmatter 含 `type / subject / statement / confidence / created / updated / tags / immutable / scope / owner / access_count / last_accessed`；正文为记忆内容。旧版根下平铺的 `prefs/` `bounds/` `commits/` 会在 `reindex`（或首次 recall 建索引）时按 frontmatter `owner` 自动迁移到 `private/<owner>/<type>/`。

自我档案（本智能体身份，强制落盘）：PREF，`subject=自我接入档案`，`owner=<本智能体ID>`，statement 为 `; ` 分隔的 key:value——`agent_id / host / memory_home / mcp_mode（stdio|http）/ engine_url（仅远端）/ token（仅远端；本机不存 token）`。

## 便携记忆盘模式（局域网多机共享）

记忆库可装在任何主机或硬盘上（= 记忆引擎）：本机 AI 用 CLI 直连，局域网内其它主机上的 AI 经 MCP 远程接入。全程 AI 自主执行；关键动作（🔒）执行前一句话说明「做什么 + 为什么 + 影响」并征得用户同意，用户只需回答「可以 / 好 / 允许」；除复制粘贴 token 外，用户不做任何手工操作。

### 4.0 前置：CLI 自装 + 记忆位置准备 + 持久记住

**步骤 0.1 检查 CLI 是否已装**
```bash
yotta-memory --version    # 或 command -v yotta-memory / where yotta-memory
```
已装 → 跳过。未装 → 🔒 **征得同意后**自行安装（三选一，AI 判断）：
| 方式 | 命令 | 适用 |
|---|---|---|
| npx 临时 | `npx -y @yottameta/yotta-memory` | 任何有 Node 的机器 |
| npm 全局 | `npm i -g @yottameta/yotta-memory` | 长期使用 |
| install.sh | `bash <(curl -s https://raw.githubusercontent.com/YottaMeta/yotta-memory/main/install.sh)` | 离线 / 国内 / 无 npm |
装后验证：`yotta-memory --version` 出版本即就绪。

**步骤 0.2 确定记忆存储位置**
| 位置 | 目录 | 适用 |
|---|---|---|
| 用户级（默认） | `~/.yottamemory` | 个人跨项目记忆 |
| 项目级 | `<repo>/.yottamemory` | 随项目提交共享 |
| 便携记忆盘 | 硬盘上目录（如 `D:\memory` / 挂载点） | 记忆盘 / 局域网共享 |

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
- 本机若作引擎：🔒 **征得同意后**启动服务——临时运行 `yotta-memory serve`（默认 `0.0.0.0:8787`，Bearer token + X-Agent-Id 鉴权；`--no-auth` 仅限可信内网），或注册开机自启 `yotta-memory lan enable`（Windows 计划任务，默认登录自启；`--onstart` 开机即启需管理员）。
- 本地零进程模式：本机 AI 也可用 `serve --stdio` 由 MCP 客户端按需拉起 CLI（无常驻进程，照灵魂盘）。
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

### 4.5 远程连接：AI 引导用户获取 token（用户只做复制粘贴）
1. AI 告知需要为本智能体申请访问 token。
2. AI 引导用户在**引擎主机**执行：`yotta-memory token new --agent <本智能体ID>`（引擎主机没装 → 按 4.0 先装；或请引擎主机上的 AI 代执行）。
3. 命令打印 token（`ytm_...`），只打印一次，请用户妥善保管。
4. AI 请用户复制 token 发给 AI。
5. 用户发来 → AI 继续 4.6。

> 用户不会操作时：AI 逐步引导（开终端 → 粘贴命令 → 回车 → 复制输出），直到成功。**除复制粘贴外用户不做别的**。

### 4.6 配置 MCP（AI 自己完成，🔒 需同意）
1. 🔒 说明将把 yotta-memory 写入本智能体 MCP 配置并请用户同意；
2. 定位当前智能体 MCP 配置文件（见 4.7）；
3. 添加 server（JSON 见 4.8）；
4. 按当前智能体机制重载 MCP（必要时请用户重启会话）；
5. 用 MCP tools 读写记忆。

> MCP 工具集与 CLI 一致：remember / recall / search / forget / archive / reindex / export / import；管理动作（init / config / token / lan / serve）不进 MCP，token 管理不远程暴露。

### 4.7 MCP 配置位置表
| 智能体 | 常见 MCP 配置位置 |
|---|---|
| Claude Code | 项目 `.mcp.json` 或用户级 `~/.claude.json` |
| Codex | `~/.codex/config.toml`（`[mcp_servers]`） |
| Cursor | 项目 `.cursor/mcp.json` 或用户级 |
| 其它（Trae / Qwen / Comate / Kimi 等） | 各自 MCP 配置 |

### 4.8 通用 MCP server 配置片段
```json
{
  "mcpServers": {
    "yotta-memory": {
      "url": "http://<IP>:8787/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "X-Agent-Id": "<本智能体ID>"
      }
    }
  }
}
```

### 4.9 验证连接（循环兜底）
- 🔒 连接远程引擎前已获同意（4.5 / 4.6）→ 调一次 `recall` / `search` 确认能读到记忆 → 成功。
- 失败：查 IP / 端口 / token 完整性 / 防火墙 / token 吊销；仍失败回 4.3。

### 4.10 复用
- 成功后优先复用现有连接；失败（token 吊销等）再回 4.3。

## 渐进披露

- 协议细节、目录结构与类型规则见 `references/protocol.md`，需要时读取，不要每次全读。
