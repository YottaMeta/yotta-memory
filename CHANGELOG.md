## v0.8.7 (2026-09-01)

评测反馈优化（文档 + 错误提示，功能不变）。

- 新增 `references/faq.md`：10 条常见问题 / 避坑（类型选错、私密区加密、多智能体权限、记忆找不到、忘记主口令、局域网连接、MCP 加载、记忆库位置、跨会话恢复、备份迁移）。
- 错误提示友好化：顶层错误附「修复建议」人话（检查 memory_home、主口令与恢复钥匙等）。
- README 中英：新增「命令输出样例」（init / remember / recall / context 屏幕输出示意）+「常见问题 FAQ 速查」。
- SKILL.md：新增「常见问题 FAQ（速查）」小节，指向 references/faq.md。
- 版本四件对齐 0.8.7（package.json / SKILL.md / CHANGELOG / 引擎 VERSION）。

# 更新日志

## v0.8.5 (2026-08-29)

安全修复（安全扫描发现高危，修复后三源同步升版）：

- **MCP 命令执行入口封死**：MCP `distill` 不再接受 `--model`（`callTool` 在工具边界直接拒绝），远端智能体无法再借 MCP 在引擎主机执行任意命令。
- **MCP 任意路径读写封死**：MCP `export` / `import` 的 `out` / `src` 必须落在记忆库根内（新增 `resolveWithinRoot` 校验，防 `..` 穿越），库外路径直接拒绝，与「远程只能读写记忆」承诺对齐。
- **CLI 参数解析修复**：`--model` / `--subject` / `--reason` / `--merge` 此前被 valueOpts 消费但未写入 opts，导致 `distill --model` / `--subject` 实际不生效；本版补齐映射，CLI `distill --model` 现已真正走 `runDistillModel` 安全路径（`shell:false` + 允许清单）。
- **CLI distill 去 shell 注入**：`distill --model` 改走 `runDistillModel` —— `spawnSync(argv[0], argv.slice(1), { shell:false, windowsHide:true })` + `splitCommandArgv` 拆分 argv，彻底移除 shell 注入面；新增 `distillModelAllowlist`（环境变量 `YOTTA_DISTILL_MODELS` 或 `config.distill_models`，未配置时放行本地 CLI，但已无 shell 注入；MCP 层已直接禁 `--model`，不达此处）。
- 版本对齐：package.json / SKILL.md / CHANGELOG / 引擎 VERSION / 文档边界说明 = 0.8.5。
- 新增回归测试：`test/security-boundary.test.js`（MCP 禁 --model / export-import 限库内 / 合法操作仍可用，6 项断言）。
## v0.8.4 (2026-08-29)

- 安装方式统一为四方式（对齐发布规范 §3.3.1）：方式一 `npx -y @yottameta/yotta-memory --agent <name>` / `--dir <dir>`（推荐，走 npm 源）；方式二 `git clone https://github.com/YottaMeta/yotta-memory.git`；方式三 GitHub Download ZIP；方式四 `bash install.sh --agent/--dir/--list`。移除 `npx skills` 与 `-g` 推荐；中英双 README 安装节同步。
- 版本对齐：package.json / SKILL.md / CHANGELOG / 引擎 VERSION / 测试断言 / README 锚点 = 0.8.4。
- 修复：SKILL.md / USER_GUIDE.md 安装命令改 `--agent <name>` 合规形式（`npx -y --package @yottameta/yotta-memory yotta-memory-install --agent <name>`），移除 `-g` 与 `npx skills` 推荐。
- 无功能变更（仅文档与版本同步）。

## v0.8.3 (2026-08-28)

中英双语 README 对齐（确定「英文门面 + 中文全档」）：

- **README.md 改为英文**：作为 GitHub / npm / ClawHub 首页的英文门面（翻译 + 精简，覆盖定位 / 核心价值 / 四类型 / 权限隔离 / 身份 / 语义检索 / 生命周期 / 对比 / 安装（CLI+技能双装）/ 升级 / CLI 用法 / 局域网共享 / 开发校验全流程）。
- **新增 README.zh-CN.md**：原中文完整主文档整体平移，顶部加语言切换链接。
- **新增 NOTICE + .npmignore + CHANGELOG.md**：对齐 YottaMeta 技能家族标准（品牌声明 + npm 打包排除 + 更新日志）。
- **package.json**：description 改英文；files 加 README.zh-CN.md / NOTICE / CHANGELOG.md；版本 0.8.2 → 0.8.3。
- 版本四处对齐：package.json / SKILL frontmatter / 引擎 VERSION / 文档。
- 边界（B 方案）：references / USER_GUIDE / 测试注释不翻译；SKILL 触发描述保持中文。

## 历史版本

- **v0.8.2 (2026-08-27)**：发布元数据修复——ClawHub 重发带 `--name 元忆 yotta-memory`，修复展示名缺失中文；无功能变更。
- **v0.8.1 (2026-08-27)**：view 用户查看平台服务端分页 + recall 候选预过滤 + 公共 index.json 超 5000 条按年份分片。
- **v0.8.0 (2026-08-27)**：自我学习/自我进化/自我提升——语义检索（同义词/拼音/字段加权/模糊）+ 效用分融合排序 + feedback 反馈闭环 + maintain 规则层自组织 + distill 心理日志蒸馏 + explain；索引 version 3 旧库自动重建。
- **v0.7.0 (2026-08-27)**：私密区机制级加密（AES-256-GCM 信封加密 + 口令派生主密钥 + 恢复钥匙 + 每 owner 加密索引）+ view 用户查看平台 + migrate + reset-password + key 授权 + context 收工纪律。
- **v0.6.5**：recall/context 根位置去重。
- **v0.6.4**：lan enable Linux 开机自启（systemd 用户单元 / 用户 crontab @reboot 降级）。
- **v0.6.3**：开机自启 VBS 自愈（内联启动命令，根治 80070002）。
- **v0.6.2**：remember --verify 写后回读确定性判定。
- **v0.6.1**：context --budget 字符预算 + 多智能体接入铁律 + remember --source/--weight + 近期记忆排序融合。
- **v0.6.0**：灵魂盘核心——profile 用户画像 + context 开工上下文包 + iam 扩展 + remember --verify + SKILL 记忆守则。
- **v0.5.4**：lan enable 非管理员自动降级用户级 Startup 静默自启。
- **v0.5.3**：CLI 选项可前置。
- **v0.5.2**：schtasks /tr 引号写法修复。
