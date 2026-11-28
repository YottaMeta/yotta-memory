# 元忆 · 局域网与便携记忆盘模式

> 本文件是 `SKILL.md`「便携记忆盘模式」的完整步骤：引擎主机准备、远程 AI 接入、MCP 配置与验证。


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
- 本机若作引擎：🔒 **征得同意后**启动服务——临时运行 `yotta-memory serve`（默认 `0.0.0.0:8787`，Bearer token + X-Agent-Id + X-Agent-Key 鉴权；`--no-auth` 仅限可信内网），或注册开机自启 `yotta-memory lan enable`（Windows：任务计划程序 S4U 后台静默，默认登录自启、`--onstart` 开机即启；非管理员自动降级用户级 Startup 静默自启，免管理员）。
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

> MCP 工具集（full 17 个）：remember / recall / search / context / doctor / forget / archive / reindex / export / import / agent_info / profile / feedback / maintain / distill / explain / consolidate；管理动作（init / config / token / lan / serve）不进 MCP，token 管理不远程暴露；MCP export/import 路径限记忆库内、distill 不支持 `--model`（仅本地 CLI）。v0.18.0 起 MCP 只补只读 / 预演能力（`archive.dryRun`、`maintain.capacity`、`context.audit` + 内联 `auditText`、`consolidate` 只出 propose）；v0.18.1 追加 `maintain.rules`（只读规则晋升建议，不做写规则 / 删记忆 / 改权重）；破坏性覆盖（`archive --force`、`consolidate --apply / --undo`）只在 CLI，MCP 侧忽略或拒绝。

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
