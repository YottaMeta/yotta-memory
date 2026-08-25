# 元忆（yotta-memory）用户使用手册

> 面向最终用户的操作手册：从安装、初始化，到便携记忆盘（局域网多机共享）的部署与接入。AI 智能体的自动引导流程见 `SKILL.md`。

## 目录

1. 这是什么
2. 安装
3. 本机单机使用
4. 便携记忆盘 · 记忆引擎主机篇（Linux / Windows）
5. 便携记忆盘 · 智能体接入篇
6. CLI 命令速查
7. 故障排查
8. 安全与边界

## 1. 这是什么

元忆（yotta-memory）是一个文件式智能体记忆工具：每条记忆是一个 Markdown 文件，放在你自己的目录里，可以用任何编辑器查看、修改，用 git 做版本管理。FACT 记忆共享给所有智能体，PREF / BOUND / COMMIT 记忆按智能体隔离。

- 零依赖：只需要 Node.js，没有数据库、没有常驻服务（除非你开启便携记忆盘模式）。
- 记忆即文件：数据主权在你手里。

## 2. 安装

任选一种方式：

| 方式 | 命令 | 适用 |
|---|---|---|
| npm 全局（推荐） | `npm i -g @yottameta/yotta-memory` | 长期使用 |
| npx 临时 | `npx -y @yottameta/yotta-memory` | 临时试用 |
| install.sh | `bash <(curl -s https://raw.githubusercontent.com/YottaMeta/yotta-memory/main/install.sh)` | 离线 / 无 npm |

安装后验证：`yotta-memory --version` 能输出版本号即成功。

## 3. 本机单机使用

```bash
yotta-memory init                                    # 初始化记忆库（默认 ~/.yottamemory）
yotta-memory remember FACT 项目 本周完成发布           # 记一条事实
yotta-memory recall 项目                              # 检索记忆
yotta-memory config get                              # 查看记忆库位置
```

- 想换记忆位置：`yotta-memory config set memory_home <目录>`，之后所有命令自动用新位置。
- 项目级记忆：在项目目录里 `yotta-memory init --project`，该项目的智能体优先读项目级记忆。

## 4. 便携记忆盘 · 记忆引擎主机篇

场景：记忆放在一台主机上（Linux / Windows 均可），本机直接 CLI 读写；局域网内其它主机上的 AI 智能体经 MCP 远程接入。引擎主机只需装 CLI，不需要装任何 AI 智能体。

**第 1 步：安装 CLI**（见第 2 节）。

**第 2 步：指定记忆位置并初始化**

```bash
yotta-memory config set memory_home /srv/yotta-memory   # 改成你的实际目录
yotta-memory init --dir /srv/yotta-memory               # 初始化（自动建 facts/prefs/bounds/commits/.archive）
```

**第 3 步：注册开机自启（可选，推荐）**

```bash
# Windows：内置命令（计划任务）
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

**第 4 步：为每个智能体生成访问 token**

```bash
yotta-memory token new --agent 我的智能体ID
```

命令会打印一次 `ytm_...`，请妥善保管（它就是访问凭证）。多个智能体就重复执行、用不同 ID。

**第 5 步：把连接信息交给远程智能体的用户**

- 引擎地址：`http://<本机IP>:8787/mcp`
- 该智能体的 token：`ytm_...`
- 智能体 ID（对应 X-Agent-Id 请求头）

查本机 IP：Linux 运行 `hostname -I`（或 `ip a`）；Windows 运行 `ipconfig` 找「IPv4 地址」。防火墙：Linux 若启用了 ufw，执行 `sudo ufw allow 8787/tcp`；Windows 首次监听时允许放行。否则局域网其它主机连不进来。

## 5. 便携记忆盘 · 智能体接入篇

场景：你的智能体在其它主机上，需要读写远程记忆引擎上的记忆。若智能体就在引擎主机本机，直接用 CLI（`yotta-memory recall` 等），不需要 MCP、不需要 token。

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

## 6. CLI 命令速查

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project] [--dir <目录>]` | 初始化记忆库 |
| `yotta-memory remember <类型> <主题> <内容> [--owner <id>]` | 写入记忆 |
| `yotta-memory recall [关键词] [--type T] [--limit N]` | 检索记忆 |
| `yotta-memory forget <文件>` | 删除一条记忆 |
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆 |
| `yotta-memory reindex` | 重建索引 |
| `yotta-memory export [--out 文件.json]` / `import <文件.json>` | 导出 / 导入 |
| `yotta-memory config set memory_home <目录>` / `config get` | 记忆库位置 |
| `yotta-memory token new --agent <id>` / `token list` / `token revoke --agent <id>` | 访问 token |
| `yotta-memory serve [--port 8787] [--stdio]` | 启动记忆引擎 |
| `yotta-memory lan enable [--onstart] / disable / status` | 开机自启管理 |

类型：`FACT`（事实，共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺），后三类按智能体隔离。

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

**`lan enable` 失败提示 Access denied：** 需要管理员权限，请用管理员终端重新执行；`--onstart` 模式必须管理员。

**记错位置了？** `yotta-memory config get` 查看当前生效位置；`config set memory_home <正确目录>` 改正。

## 8. 安全与边界

- token 等同密码：只给需要接入的智能体，别外传。
- 元忆不做加密：PREF / BOUND / COMMIT 私密记忆的隔离是「权限边界」机制（谁该读由 scope/owner 决定），属于纪律层保护，不是机密数据保护层。
- 管理动作（init / config / token / lan / serve）不通过 MCP 暴露，远程只能读写记忆，不能改配置、不能管 token。
- 数据主权在用户：所有数据都是本地明文文件，随时可看、可改、可删。
