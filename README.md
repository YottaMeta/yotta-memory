<p align="center">
  <img src="assets/banner.png" alt="yotta-memory banner" width="100%" />
</p>

<h1 align="center">元忆（yotta-memory）</h1>

<p align="center">元忆 —— 有权限边界的文件式智能体记忆。让任何 AI 智能体活过会话：开工 <code>recall</code> 恢复上下文、重要信息 <code>remember</code> 落盘、收工归档。文件式、零依赖、可 diff / 回滚；FACT 共享、PREF / BOUND / COMMIT 私密隔离——谁该读、谁不该读，由机制而非 AI 自觉决定。</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" /></a>
  <a href="https://agentskills.io/"><img alt="Standard: agentskills.io" src="https://img.shields.io/badge/standard-agentskills.io-orange" /></a>
  <a href="https://www.npmjs.com/package/@yottameta/yotta-memory"><img alt="npm package" src="https://img.shields.io/npm/v/@yottameta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="GitHub stars" src="https://img.shields.io/github/stars/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/YottaMeta/yotta-memory" /></a>
  <a href="https://github.com/YottaMeta/yotta-memory"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" /></a>
</p>

## 核心价值

多数记忆方案把「记住」做成了黑盒：数据进了数据库或云端，用户既看不到内容、也难以审计，更控制不了「哪个智能体能看到什么」。元忆换了一条路：

- **记忆就是文件**：每条记忆是一个带 YAML frontmatter 的 Markdown 文件，放在用户自己的目录里。用任何编辑器都能查看、修改、删除，用 git 就能做版本管理与回滚。
- **隔离由机制保证**：FACT 进公共区共享，PREF / BOUND / COMMIT 进私密区、按 agent 隔离。读取按 scope/owner 分区过滤，越界内容由 CLI 拦截、永不返回（默认静默跳过；显式跨读无授权才报错拒绝）——不依赖智能体的「自觉」。
- **零依赖、即装即用**：无守护进程、无数据库、无向量库，只需要 Node.js。安装即用，数据留在本机。

## 核心优势

| 优势 | 说明 |
|---|---|
| **数据主权在用户** | 明文文件存储，可读、可改、可审计；git 可版本化，回滚 / 团队同步都走标准工具 |
| **真正的权限边界** | 公共 / 私密分区 + scope/owner 过滤 + 授权机制（grant / identity=user / `--unsafe`），越界内容由 CLI 过滤、永不返回（默认静默；显式跨读 `--all`/`--owner <其它>` 无授权时 exit 3），不靠 AI 自律 |
| **跨智能体标准** | 符合 Agent Skills 开放标准（agentskills.io）；装一次，Claude Code / Codex / Cursor / OpenCode 等 78+ 智能体可共用同一份记忆 |
| **轻量零依赖** | 无 daemon / 无数据库 / 无向量库；Node.js 自带即跑，任何机器可部署 |
| **双级存储** | 用户级 `~/.yottamemory/`（跨项目）+ 项目级 `.yottamemory/`（随项目共享 / 交接）|
| **检索与生命周期** | 索引 + TF 打分（中文分词友好）；质量分 / 盖棺分 / 自动归档，记忆库不会无限膨胀 |
| **生态分发** | GitHub + npm 双源同步发布；npx skills / npm / install.sh 三种方式，覆盖 17+ 类智能体目录 |

## 功能详解

### 记忆模型：四分类 + 双级存储

记忆按内容性质分为四类，类别决定可见范围：

| 类型 | 含义 | 可见范围 |
|---|---|---|
| `FACT` | 事实 / 知识 / 经验（可验证、可共享）| 公共区，所有智能体可读 |
| `PREF` | 偏好 / 习惯 / 喜好 | 私密区，默认仅所属 agent 可读 |
| `BOUND` | 边界 / 规则 / 底线 | 私密区，默认仅所属 agent 可读 |
| `COMMIT` | 承诺 / 锚定 / 约定 | 私密区，默认仅所属 agent 可读 |

- **双级存储**：用户级 `~/.yottamemory/` 跨项目共享个人记忆；项目级 `.yottamemory/` 随项目一起走，天然适合交接与团队协作。recall 时项目级优先。
- **同 key 自动更新**：同一 subject + statement 重复写入只更新 `updated`，不产生重复记录。
- **元数据丰富**：每条记忆带 `confidence`（置信度）、`tags`（标签）、`immutable`（锁定不可变）、`created/updated`、`access_count` 等，供检索与生命周期管理使用。

### 权限与隔离

- **读取三态**：公共 FACT 始终可读；自身私密始终可读；其它 agent 私密默认拒绝（不返回内容）。
- **三种授权入口（满足任一即可读他人私密）**：
  1. `grants.json` 显式授权：`{"<userAgent>": ["<ownerAgent>", ...]}`；
  2. identity=user：`--agent user` / `--owner user` / 环境变量 `YOTTA_AGENT_ID=user`；
  3. 显式 `--unsafe`（用户显式授权）。
- **默认静默、显式跨读才报错**：默认 recall 遇其它 agent 私密静默跳过（不泄露「存在 N 条私密不可见」）；仅当显式跨智能体读取（`--all` / `--owner <其它>`）且无授权命中时才报错 / 警告。
- **隔离定位**：scope: private 保证的是 AI 之间的语义隔离（正常 recall 不会被搜到、不会主动去读），不是文件系统级机密保护——数据主权在用户，作为所有者有权看到任何记忆文件。

### 检索：索引 + 中文分词打分

- `remember` 时自动构建 `index.json` 索引；recall 用 TF 打分排序，中文按 bigram 分词，不用额外模型。
- 支持关键词、`--type` 过滤、`--limit` 截断、项目级优先。
- 命中展示会累加 `access_count` / `last_accessed`，为生命周期管理提供依据。

### 生命周期管理

- `archive`：按「盖棺分 + 年龄」把低价值旧记忆移入 `.archive/`（`immutable` 除外），记忆库不会无限膨胀。
- `forget`：删除单条记忆（按类型目录路径或文件名）。
- `reindex`：手动改过 `.md` 后重建索引。
- `export` / `import`：整库导出为 JSON / 从 JSON 导入，可作迁移与备份中间格式。
- git：整个记忆库可纳入版本控制，回滚 / 审计 / 团队同步。

### 智能体接入

把技能装进智能体后，SKILL.md 会自动教会智能体一套工作流：**开工 `recall` 恢复上下文 → 重要信息 `remember` 落盘 → 收工归档**。也可在对话中直接说「记住 XXX」「上次说到哪了」「记一笔」触发。

## 与其他方案对比

> 以下按方案类型对比，不涉及具体产品名称。判断标准：数据主权、部署成本、权限边界、可审计性、跨智能体能力。

| 维度 | 元忆（yotta-memory） | 数据库 / 嵌入式存储类 | 向量库 / 语义检索类 | 云端托管记忆服务 |
|---|---|---|---|---|
| 存储形态 | Markdown 明文文件，git 可版本化 | 二进制 / 结构化数据库文件 | 向量索引 + 模型依赖 | 厂商服务器 |
| 数据主权 | 完全在用户本地，可读可改可删 | 本地，但需专用工具读写 | 本地或自托管，模型需额外部署 | 不在用户手中，受服务条款约束 |
| 权限边界 | 内置：公共 / 私密分区 + scope/owner + 授权 | 通常无内置，需自行实现 | 通常无内置，需自行实现 | 通常只有账号级权限，无记忆级细粒度 |
| 可审计 / 回滚 | 明文 + git，天然可审计可回滚 | 需导出工具链，回滚复杂 | 依赖快照 / 导出机制 | 依赖平台导出能力 |
| 部署与依赖 | 零依赖，Node.js 即跑 | 需数据库运行 / 嵌入式依赖 | 需向量库 + 模型，较重 | 联网 + 账号，数据出本地 |
| 跨智能体 | 符合 Agent Skills 标准，一次写入多智能体可读 | 各智能体各自接入，无统一标准 | 需各自接入，成本高 | 取决于平台支持范围 |

**结论**：元忆的核心差异点在于把「数据主权 + 权限边界 + 零依赖」三者合一——既是可审计的文件，又有机制级的读取隔离，还不引入任何重型依赖。对「本地优先、多智能体协作、长期沉淀」的场景，这是最轻的一条路。

## 安装

三种方式任选其一，技能文件统一从 **npm** 获取（GitHub 无代理时较慢，npm 可配国内镜像加速）。

### 方式一：npx skills（推荐，生态标准入口）
```bash
npx skills add YottaMeta/yotta-memory
```
> 自动把技能文件装到已检测到的智能体（Claude Code / Codex / Cursor / OpenCode 等 78+ 智能体）。此方式只装「技能指令」（SKILL.md 等）；要使用 `yotta-memory` 读写命令，需另装 CLI：`npm install -g @yottameta/yotta-memory`（见方式二）。

### 方式二：npm 直接安装（CLI + 技能）
```bash
# 国内加速（可选）：npm config set registry https://registry.npmmirror.com
npm install -g @yottameta/yotta-memory
yotta-memory init            # 初始化记忆库
yotta-memory-install -g                  # 装进所有已识别智能体（用户级）
yotta-memory-install --agent codex       # 只装进指定智能体
```

> 全局安装后 `yotta-memory`（读写下）与 `yotta-memory-install`（安装器）两个命令均已加入 PATH。若不想全局安装，可一行运行安装器：`npx -y --package @yottameta/yotta-memory yotta-memory-install -g`。

### 方式三：install.sh / 手动复制
获取技能文件夹后（`npm pack` 解包或 `git clone`），进入技能文件夹：
```bash
bash install.sh -g                 # 用户级；bash install.sh --list 查看全部目录
bash install.sh --agent codex      # 指定智能体
bash install.sh --dir /path/to/skills
```
也可把整个 `yotta-memory` 文件夹复制到目标智能体的 skills 目录（常见位置见 install.sh --list）。

## CLI 用法

| 命令 | 作用 |
|---|---|
| `yotta-memory init [--project]` | 初始化记忆库（默认用户级 `~/.yottamemory/`）|
| `yotta-memory remember <type> <subject> <statement> [--owner <id>]` | 写入记忆（同 subject+statement 自动更新；--owner 标注归属）|
| `yotta-memory recall [关键词] [--type T] [--limit N] [--agent <id>] [--owner <id>] [--all] [--unsafe]` | 检索记忆（索引+TF 打分，读取分区过滤；越界读其它智能体私密默认拒绝，需 grant / identity=user / `--unsafe`；项目级优先）|
| `yotta-memory forget <文件>` | 删除一条记忆（按类型目录路径或文件名）|
| `yotta-memory archive [--days 180] [--threshold 0.4]` | 归档旧记忆（盖棺分+年龄，immutable 除外）|
| `yotta-memory reindex` | 重建索引（手动改 .md 后校正）|
| `yotta-memory export [--out f.json]` / `import <f.json>` | 导出 / 导入 |

类型：`FACT`（事实，公共共享）/ `PREF`（偏好）/ `BOUND`（边界）/ `COMMIT`（承诺）。

示例：
```bash
yotta-memory init
yotta-memory remember PREF 用户 偏好短回复，不要用表情
yotta-memory recall 偏好
yotta-memory recall --type FACT --limit 10
```

环境变量：
- `YOTTA_MEMORY_HOME`：覆盖用户级记忆库目录（默认 `~/.yottamemory/`）。
- `YOTTA_AGENT_ID` / `AGENT_ID`：当前 agent 标识，参与读取分区判定。

## 智能体接入后怎么用

把技能装进智能体后，SKILL.md 会自动教会智能体：开工 `recall` 恢复上下文 → 重要信息 `remember` 落盘 → 收工归档。也可在对话中直接说「记住 XXX」「上次说到哪了」。

## 开发与校验

本项目内运行：`python tools/validate-skill.py yotta-memory`。

## 许可证

MIT © YottaMeta —— 详见 [LICENSE](./LICENSE)。