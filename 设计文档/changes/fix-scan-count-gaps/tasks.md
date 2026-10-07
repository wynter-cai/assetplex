# Tasks: fix-scan-count-gaps

| # | 任务 | 级别 | 验证方式 |
|---|------|------|---------|
| T1 | Qoder detect 重写：configDirCandidates（~/.qoder-cn → ~/.qoder）+ 标志文件 argv.json/mcp.json/settings.json；移除 scanner.ts qoder 特例 | C | tests/unit/adapters/qoder.test.ts 全绿；`node node_modules/vitest/vitest.mjs run` |
| T2 | skills-inventory 增 workbuddySkillsDir 可选源（origin=personal, tool=workbuddy）+ classifyOrigin 前缀判定 + routes/skills.ts 默认源 | M | tests/unit/core/skills-inventory.test.ts 新增用例全绿 |
| T3 | agent-inventory 增 parseTraeCustomAgents（~/.trae-cn/agents/*.md）+ routes/agents.ts 默认源；抽 parseAgentMdDir 复用 Claude 分支 | M | tests/unit/core/agent-inventory.test.ts 新增用例全绿 |
| T4 | 生成 8 个 TRAE 自定义智能体占位文件到 ~/.trae-cn/agents/ | X | 文件存在、frontmatter 合法、盘点可见 |
| T5 | SkillsView：统计行随筛选联动 + keepPreviousData | C | web 组件测试 + 浏览器实测 tab 切换 |
| T6 | skill-labels TOOL_LABELS + SkillCard/SkillDetail builtin 徽章工具后缀 | C | web 组件测试 |
| T7 | 收尾：后端/前端全测试、tsc、tsup build、vite build、重启服务、API+浏览器验收 | — | 全绿 + 验收记录 |

优先级：T1→T3 后端先行，T4 可并行，T5/T6 前端，T7 收尾。
