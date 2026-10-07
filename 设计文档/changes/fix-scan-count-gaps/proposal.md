# fix-scan-count-gaps

## Goal

一次打包修复四个体验缺口：

1. **TRAE 自定义智能体纳管**：TRAE 的 Custom Agents 存云端、本地无文件（已实证：磁盘/LevelDB/SQLite 均无数据）。约定本地目录 `~/.trae-cn/agents/*.md`（Claude 子代理格式）作为纳管入口，AssetPlex 扫描该目录进入智能体盘点（kind=custom-subagent, tool=trae）。TRAE 不读该目录，纯资产纳管、不写回。
2. **技能计数 UX bug**：SkillsView 的「去重后共 N 个技能」行恒用全集 total，筛选「我的库/未入库」后与卡片数矛盾；切 tab 时数字闪 0。
3. **官方内置来源标注**：内置技能分不清是 TRAE 官方还是 WorkBuddy 官方。补 `~/.workbuddy/skills` 扫描源（origin=personal, tool=workbuddy），徽章对 builtin 追加工具后缀「官方内置 · TRAE / WorkBuddy」。
4. **Qoder 检测**：detect() 被硬编码为永远未安装。实际存在 Qoder CN（`~/.qoder-cn`）。重写检测：候选 `~/.qoder-cn` → `~/.qoder`，标志文件 argv.json / mcp.json / settings.json。

## Scope

做：上述四项；生成 8 个 TRAE 自定义智能体占位文件（维护者后续从 TRAE 面板粘贴提示词）。
不做：WorkBuddy connectors-marketplace 市场技能扫描（后续议题）；TRAE 云 API 逆向；写回 TRAE；职能九类重构。

## Risks

- `~/.trae-cn/agents/` 为新约定目录，TRAE 理论上不管理它；若日后被宿主清理，再评估迁移到 `~/.assetplex/`。
- SkillSources 加可选字段，7 个测试文件的字面量构造无需改动。
- scanner.ts 移除 qoder 特例后走正常 installed 判定（detect 已修复）。
