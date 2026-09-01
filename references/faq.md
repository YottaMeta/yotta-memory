# 元忆 FAQ / 避坑指南

> 常见问题速查：记忆找不到、权限/加密困惑、连不上时先看这里。

## 1. 记忆类型选错了怎么办？
类型只在写入时提示、不阻止（FACT=公共 / PREF、BOUND、COMMIT=私密）。写错不影响已写入内容；想改类型可 `forget` 后按正确类型重写。不需要提示可用 `--no-hint`。

## 2. 私密区加密怎么用？
`init` 默认初始化加密库（需主口令 + 恢复钥匙，请妥善保存）；明文库可用 `migrate` 升级为加密。私密区文件为 `.md.enc`，可 git 版本化。查看/授权用 `yotta-memory view`（口令解锁，浏览/授权/吊销 AI）。

## 3. 多智能体权限怎么隔离？
公共 FACT 所有智能体可读；PREF / BOUND / COMMIT 按 owner 物理隔离，其他智能体需显式授权（`key authorize <id>` 或 `view` 平台授权）。不授权读不到，也不会被别的智能体读到。

## 4. 记忆找不到了？
先 `config get` 确认 `memory_home` 指向的库；再 `reindex` 重建索引（升级后索引版本变化会自动重建）；最后 `recall <关键词>` / `search <词>` 语义检索。跨项目记忆在项目级 `.yottamemory`。

## 5. 忘记主口令了？
用初始化时保存的**恢复钥匙**：`yotta-memory reset-password`。没有恢复钥匙则私密区无法解锁（这是加密的预期行为），公共 FACT 不受影响。

## 6. 局域网（便携记忆盘）怎么连？
引擎主机 `lan enable` 注册开机自启（Windows 计划任务 / Linux systemd）→ `token new --agent <id>` 生成 token；客户端配 `url: http://<主机IP>:8787/mcp` + `Authorization: Bearer <token>` + `X-Agent-Id: <id>`。`lan status` 查状态。

## 7. MCP 工具没加载？
检查客户端 `mcpServers` 已配置 yotta-memory（url + token）；改配置后重启/重载会话。本机直连可不配 MCP，直接用 CLI。

## 8. 记忆库在哪个目录？
`yotta-memory config get` 查看；`config set memory_home <目录>` 改位置。项目级记忆用 `init --project`（存 `.yottamemory/` 随项目共享）。

## 9. 跨会话恢复上下文？
开工运行 `yotta-memory context`（身份 + 画像 + 近期记忆 + 边界 + 承诺），需要细节再 `recall <关键词>`。

## 10. 备份与迁移？
`export --out 文件.json` 导出全部记忆；`import <文件.json>` 恢复。公共 FACT 是明文文件可直接 git 备份；私密区用 export（需解锁）。
