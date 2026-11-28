<p align="center"><b>Language</b>: <a href="./README.md">English</a> · 中文</p>

<p align="center">
  <img src="assets/banner.png" alt="yotta-memory banner" width="100%" />
</p>

<h1 align="center">元忆（yotta-memory）</h1>

<p align="center"><b>数据永不出你本机的下一代记忆引擎。</b></p>
<p align="center">面向 AI 智能体的文件式记忆：开工 <code>recall</code> 恢复上下文、重要信息 <code>remember</code> 落盘、收工归档。记忆是落在用户指定目录里的 Markdown——可读、可 diff、可回滚；没有云端、没有账号、没有遥测，零依赖，无守护进程、无数据库。</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
  <a href="https://agentskills.io/"><img alt="Standard: agentskills.io" src="https://img.shields.io/badge/standard-agentskills.io-orange" /></a>
  <a href="https://www.npmjs.com/package/@yottameta/yotta-memory"><img alt="npm package" src="https://img.shields.io/npm/v/@yottameta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="GitHub stars" src="https://img.shields.io/github/stars/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/YottaMeta/yotta-memory" /></a>
</p>

## 为什么智能体会忘——元忆改了什么

**1. 不用每个会话重新解释项目。** 智能体跑一次 `yotta-memory context`，拿到身份、长期理解摘要、零推断用户画像、近期走廊、边界、承诺与会话闭环契约。

**2. 决策当场落盘。** `yotta-memory remember PREF "代码风格" "偏好短函数" --verify` 写入并回读；FACT 进公共区，偏好 / 边界 / 承诺留在本智能体私密区。

**3. 收工不留半截状态。** 会话结束前写一条 COMMIT 锚点；`maintain` / `consolidate` 让记忆库长期不膨胀；`context --audit` 核对宿主压缩对话时是否丢了重要决策。

## 你能得到什么

- **记忆就是文件**——Markdown + YAML frontmatter，放在用户指定的目录。任何编辑器能看，git 能版本化，拷走整个目录就等于搬走记忆。
- **四类记忆、双级存储**——FACT 公共共享；PREF / BOUND / COMMIT 按智能体隔离。用户级 `~/.yottamemory/` 跨项目共用，项目级 `.yottamemory/` 随仓库走。
- **权限由机制保证**——私密文件 AES-256-GCM 信封加密（口令派生主密钥 + 每 AI owner key + 离线恢复钥匙）。没有 agent_key 就解不开；owner ID 单独存在不是身份。
- **越用越懂**——语义召回（同义词、拼音、字段加权、模糊匹配，可选本地 embedding 插件）+ `feedback` 显式反馈调权 + `explain` 解释每一条得分。
- **不会膨胀**——统一效用分 + 分类型衰减 + 近重复合并；`consolidate` 把同主题旧记忆压成带溯源的周期摘要，原文归档，`--undo` 可回滚。
- **可恢复**——`init` 防覆盖、`forget` 进回收区、异卷备份 + 校验 + 恢复演练、破坏性写入前事务快照、`doctor` 开工体检、`scan` 扫记忆库里的提示注入与泄漏。
- **多机共享**——记忆库可放在任意主机或硬盘，本机 CLI 直连，其它机器经局域网 MCP 接入（见 `references/lan-mode.md`）。

### 记忆类型

| 类型 | 含义 | 可见性 |
|---|---|---|
| `FACT` | 事实 / 知识 / 经验 | 公共区，所有智能体可读 |
| `PREF` | 偏好 / 习惯 | 私密区，仅归属智能体 |
| `BOUND` | 边界 / 铁律 / 底线 | 私密区，仅归属智能体 |
| `COMMIT` | 承诺 / 锚点 | 私密区，仅归属智能体 |

## 隐私，一页说清

- 公共 `FACT` 是明文、可审计；`PREF` / `BOUND` / `COMMIT` 加密并按 owner 物理分开。
- `yotta-memory view` 用你的主口令解锁，能看到并导出**全部**记忆——数据所有者是你。
- 引擎自身不联网。会联网的只有用户主动执行的 `npm i`，以及用户显式配置的本地 provider 子进程。
- 边界说实话：它保护静态数据、隔离不同智能体；**不承诺**对抗同一 OS 用户下的恶意进程。
- 完整说明：[`references/trust-card.md`](references/trust-card.md)。

新建库默认加密。已有明文库转加密请走交互式迁移（非 ASCII 口令必须在终端输入，不要走管道）：

```bash
yotta-memory migrate --recovery-key-out "<钥匙文件>"
```

之后在 `yotta-memory view` 授权（或 `key bind`）、由 AI `key claim`，再带 `--agent-key-file` 执行 `reindex`。

## 安装

元忆是 **CLI + 技能** 一对：`yotta-memory` 读写记忆库，技能负责教智能体工作流。下面四种方式任选其一；技能文件从 npm 获取（GitHub 无代理时较慢）。

### 方式一：npm 一行装（推荐）

```text
# 可选国内加速：npm config set registry https://registry.npmmirror.com
npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <智能体名>
npx -y --package @yottameta/yotta-memory yotta-memory-install --dir <技能目录>
```

- `--agent <名称>` 装到该智能体的默认用户级目录；`--list` 查看预置列表。
- `--dir <路径>` 装到任意技能目录，适合不在预置列表里的智能体。
- 镜像尚未同步新包（404）时，加 `--registry=https://registry.npmjs.org/` 或等缓存。
- 要读写记忆，还要装 CLI：`npm install -g @yottameta/yotta-memory`。

### 方式二：git clone（开发者 / 有 git 环境）

```text
git clone https://github.com/YottaMeta/yotta-memory.git <技能目录>/yotta-memory
```

### 方式三：GitHub 下载压缩包（手动 / 无 git）

打开 `YottaMeta/yotta-memory`，点 **Code → Download ZIP**，解压后把 `yotta-memory` 目录放进智能体的技能目录。

### 方式四：install.sh（多智能体一键脚本）

```text
bash install.sh --agent <名称>   # 默认用户级目录
bash install.sh --dir <路径>     # 指定目录
bash install.sh --list           # 列出智能体 -> 默认目录
```

### 两个命令，各管一件事

- `yotta-memory`——引擎 CLI。`npx -y @yottameta/yotta-memory` 只临时运行引擎，不安装技能。
- `yotta-memory-install`——技能安装器。目标目录是符号链接（含 Windows junction）时 fail-closed 拒绝，不写穿链接。

## 快速开始

```bash
yotta-memory init                  # 新建默认加密
yotta-memory config get            # 确认记忆库位置
yotta-memory context               # 开工上下文包
yotta-memory remember FACT "项目" "使用 npm workspaces" --verify
yotta-memory recall "workspaces"
```

输出示例（示意）：

```text
Recorded: ~/.yottamemory/facts/2026-11-28-0001.md
[verify] read-back OK: facts/2026-11-28-0001.md

# 开工上下文包（yotta-memory context）
## 1. 身份
## 2. 用户画像摘要
## 3. 长期理解摘要
## 4. 近期走廊（按时间）
## 5. 近期高价值记忆（补位）
## 6. 边界提醒（BOUND）
## 7. 承诺 / 锚点（COMMIT）
## 8. 本会话闭环契约
```

### 命令地图

| 要做的事 | 命令 |
|---|---|
| 开工 | `context [--focus <关键词>] [--budget N]` |
| 写 / 读 | `remember <类型> <主题> <内容> --verify` · `recall <关键词>` |
| 日常维护 | `maintain [--apply]` · `consolidate [--apply]` · `archive --dry-run` |
| 健康 | `doctor` · `backup create / doctor / drill` · `scan` |
| 身份 | `iam <id>` · `whoami` · `key claim <id>` |
| 共享 | `serve --stdio --tools core` · `lan enable` · `token new --agent <id>` |
| 查看 | `view`（本机 Web 平台） |

完整参数见 [`references/cli-reference.md`](references/cli-reference.md)；单个命令用 `yotta-memory <命令> --help`。

## 升级

```bash
npm i -g @yottameta/yotta-memory        # 升级引擎
npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <智能体名>   # 刷新技能
```

升级后回读 `yotta-memory --version` 与已装 `SKILL.md` 的 `version:`，两者一致才算成功。

## 局域网多机共享

记忆库可以放在台式机、NAS 或移动硬盘。本机智能体用 CLI 直连；其它机器经 MCP 接入，每个智能体一份 token 与 agent_key。配置、开机自启与故障恢复：[`references/lan-mode.md`](references/lan-mode.md)。

> 传输边界：MCP 默认走 HTTP 明文，Bearer token 与 agent_key 会在网络上明文传输。只在可信局域网 / VPN / SSH 隧道内使用；跨网段请加 TLS 反向代理。

## 文档

| 文档 | 内容 |
|---|---|
| [`USER_GUIDE.md`](USER_GUIDE.md) | 面向用户的操作手册（安装 → 日常 → 局域网 → 排障） |
| [`references/trust-card.md`](references/trust-card.md) | 信任卡：数据在哪、谁能读、怎么删、备份与故障口径 |
| [`references/cli-reference.md`](references/cli-reference.md) | 完整命令表、首启、明文库转加密 |
| [`references/lan-mode.md`](references/lan-mode.md) | 便携记忆盘 / 局域网模式全流程 |
| [`references/faq.md`](references/faq.md) | 常见问题与避坑 |
| [`references/protocol.md`](references/protocol.md) | 存储布局、索引、加密格式、类型规则 |
| [`CHANGELOG.md`](CHANGELOG.md) | 每个版本改了什么 |

## 开发与校验

```bash
npm test                            # node --test
node --test --test-concurrency=2    # 本机硬件不稳时
```

发布门禁（在 YottaSkills 工作区执行）：`python tools/validate-skill.py yotta-memory`、`python tools/preflight-publish.py yotta-memory`、`python tools/check_delivery_integrity.py`。

## 许可证

MIT——见 [LICENSE](LICENSE)。
