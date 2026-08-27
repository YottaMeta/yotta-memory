# 更新日志

## v0.8.3 (2026-08-28)

中英双语 README 对齐（老张拍板「英文门面 + 中文全档」）：

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
