# 扩展提供方协议 v1（元忆 · capability `memory.hook`）

元忆可以可选地调用一个由用户显式配置的**本地扩展提供方（provider）**，由它参与「哪些记忆进上下文」。
未配置提供方时，`context` 的行为与输出与之前完全一致；任何失败都回落到普通记忆，不阻断命令。

## 1. 配置

配置文件：`<YOTTA_PROVIDER_HOME>/provider.json`，默认 `~/.yottameta/provider.json`。
环境变量 `YOTTA_PROVIDER_HOME` 可覆盖根目录（测试与隔离环境用）。

```json
{
  "schema": 1,
  "providers": [
    {
      "id": "local-provider",
      "version": "0.1.0",
      "capabilities": ["memory.hook"],
      "command": ["node", "C:/path/to/provider.js"],
      "timeout_ms": 600
    }
  ]
}
```

- `command` 必须是**数组**（argv 语义），以 `shell: false` 执行；不接受字符串命令。
- `timeout_ms` 默认 600，最小 50，最大 5000；超时即回落。
- 配置文件缺失、解析失败、`command` 非数组、capability 未知：**只记录状态，不阻断命令**；缺失等同「未安装」。

## 2. 调用

- 只在用户显式执行 `context`（或 `context --json` / `--explain`）时触发；`init` / `install` / `doctor` / `scan` 等路径不触发。
- 元忆把**一个 JSON 请求**写入 provider 的 stdin（随后关闭），从 stdout 读**一个 JSON 响应**；stderr 只作诊断。
- stdout 上限 256 KB；超过按错误处理并回落。
- 请求与环境：

```json
{
  "schema": 1,
  "capability": "memory.hook",
  "request_id": "<uuid>",
  "payload": {
    "agent": "codex",
    "budget": 0,
    "focus": "",
    "truncated": false,
    "candidates": [
      {
        "file": "facts/2026/09/2026-09-27-0001.md",
        "type": "FACT",
        "subject": "示例主题",
        "statement": "示例内容（最多 2000 字）",
        "created": "2026-09-27",
        "updated": "2026-09-27"
      }
    ]
  }
}
```

- `candidates` 只包含**调用者有权读取**、且**可驱逐**的条目（已过滤私密越权项；BOUND / COMMIT 不在其中）。
- 候选最多 500 条；超过时 `truncated = true`，此时白名单模式不生效（见 §3），驱逐模式仍安全。

## 3. 响应

```json
{ "ok": true, "capability": "memory.hook", "data": { "evict": ["facts/2026/09/2026-09-27-0001.md"] } }
```

- **`evict`（推荐）**：要从上下文里驱逐的条目清单。每个 `file` 必须出现在本次 `candidates` 中；候选集外的 file 会被丢弃并记入 `dropped`。未见过的条目默认保留 —— 候选很多时也安全。
- **`selected`（可选白名单）**：仅在 `complete: true` 且本次未 `truncated` 时接受。每个 `file` 必须 ∈ `candidates`；未列入的候选会被驱逐。
- 元忆侧仍强制执行：BOUND / COMMIT 与身份画像不可驱逐；预算、去重、宽限、章节顺序由引擎决定。

需要授权或不可用时：

```json
{ "ok": false, "code": "license_required", "message": "该能力需要授权后使用" }
```

## 4. 状态与回落

| 状态 | 触发 | 元忆行为 |
| --- | --- | --- |
| `not_installed` | 无配置 / 无匹配 capability | 普通记忆，输出与历史一致 |
| `active` | 调用成功且响应合法 | 在约束内应用 `evict` / `selected` |
| `license_required` | provider 明确返回该 code | 普通记忆 + 一行状态提示 |
| `timeout` | 超过 `timeout_ms` | 普通记忆 + 一行状态提示 |
| `invalid_output` | 非 JSON / 缺 `ok` | 普通记忆 + 一行状态提示 |
| `error` | 启动失败 / 退出码非 0 / 输出超限 / 配置非法 | 普通记忆 + 一行状态提示 |

`context --json` 的 `hook` 块给出 `status` / `provider_id` / `applied` / `evicted` / `dropped` / `note`；
`context --explain` 的 trace 里追加一行 `[hook] ...`。

## 5. 审计与边界

- 每次实际调用写一行 `<YOTTA_PROVIDER_HOME>/provider-audit.jsonl`：`ts` / `capability` / `provider_id` / `status` / `duration_ms` / `bytes_out`。
- 审计**不记录**记忆正文、查询原文或任何 payload 内容。
- 元忆不替 provider 联网；provider 自身行为由它自己的包声明。
- 删除 `provider.json` 即回到普通记忆，无残留依赖。
- provider 输出只当数据使用：候选集外的条目、非白名单内容一律丢弃，不作为指令执行。
