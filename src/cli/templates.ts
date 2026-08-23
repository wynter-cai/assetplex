/**
 * 初始化模板字符串
 *
 * 所有模板以字符串形式存于此，避免文件系统读取，
 * 使 assetplex init 命令自包含
 */

export const PROFILE_TEMPLATE = `# User Profile

> 此文件由用户手写。AssetPlex 会自动同步到所有启用的工具
> (Claude Code 的 CLAUDE.md、Codex 的 AGENTS.md、TRAE CN 的 memory/user_profile.md 等)

## 沟通偏好
- 语言：中文
- 风格：实用、干货、可收藏

## 技术栈
- 主要：TypeScript, React, Node.js
- 辅助：Python, SQL

## 背景
- (填写你的职业背景)
- (填写你的认证或专业身份)

## 工作习惯
- 操作系统：(Windows / macOS / Linux)
- 编辑器：(Trae / VS Code / Cursor / 其他)
- 终端：(PowerShell / zsh / bash)
`;

export const COMMUNICATION_STYLE_TEMPLATE = `# Communication Style

## 输出格式
- 优先使用 Markdown
- 代码块必须有语言标签
- 文件路径用反引号包裹：\`src/index.ts\`

## 风格
- 直接、简洁，不绕弯
- 中文回答，代码注释也用中文
- 复杂问题分步骤说明
- 优先给可执行方案，再补充背景

## 禁止
- 不要用 emoji（除非明确要求）
- 不要在每段话开头说"好的"、"明白了"
- 不要重复用户的问题
`;

export const TECH_STACK_TEMPLATE = `# Tech Stack

## 主语言
- TypeScript (Node.js 18+)
- Python 3.11+

## 前端
- React 18+
- Vite
- Tailwind CSS

## 后端
- Node.js + Express / Fastify
- Python + FastAPI

## 数据库
- PostgreSQL
- Redis

## DevOps
- Docker
- GitHub Actions

## AI / LLM
- OpenAI API
- Anthropic Claude API
- Volcano Engine (火山引擎)
`;

export const CODING_STYLE_TEMPLATE = `# Coding Style

## TypeScript
- 严格模式：\`strict: true\`
- 优先用 \`const\` 而非 \`let\`
- 禁止 \`any\`，必要时用 \`unknown\` + 类型守卫
- 用 interface 而非 type 描述对象形状
- 函数优先用箭头函数

## 命名约定
- 变量：camelCase
- 类型/接口：PascalCase
- 常量：UPPER_SNAKE_CASE
- 文件名：kebab-case

## 注释
- 只在"为什么"非显然时写注释
- 不写"做什么"注释（代码应自解释）
- 复杂逻辑用块注释，简单技巧用行注释

## 测试
- 测试文件与源文件同目录：\`foo.ts\` → \`foo.test.ts\`
- 用 Vitest
- 一个测试只测一件事
`;

export const GIT_WORKFLOW_TEMPLATE = `# Git Workflow

## 提交规范
- 用 Conventional Commits: \`feat: ...\`, \`fix: ...\`, \`docs: ...\`, \`refactor: ...\`
- 提交消息用英文，正文可中文
- 单次提交不要超过 200 行 diff

## 分支
- main / master：受保护，不直接 push
- feature/<name>：新功能
- fix/<name>：bug 修复
- chore/<name>：杂项

## PR
- 标题用英文，描述可中文
- 必须包含 "What" 和 "Why"
- 不超过 500 行 diff（除非重构）
`;

export const ENV_TEMPLATE = `# Environment

## 系统
- OS: ${process.platform}
- Shell: ${process.env.SHELL ?? process.env.COMSPEC ?? 'unknown'}
- Home: ${process.env.HOME ?? process.env.USERPROFILE ?? 'unknown'}

## 运行时
- Node.js: ${process.version}
- AssetPlex 版本: 0.1.0
`;

export const HUB_README_TEMPLATE = `# AssetPlex — 个人 AI 工具配置中心

此目录由 [AssetPlex](https://github.com/nicecai/assetplex) 管理。
修改任意文件后，运行 \`assetplex sync\` 同步到所有启用的工具。

## 目录结构
- \`identity/\` — 你的个人身份画像（手写 + AI 自动维护）
- \`skills/\` — 跨工具 Skills 库
- \`rules/\` — 通用规则
- \`preferences/\` — 个人偏好（编码风格、Git 工作流等）
- \`mcp/\` — MCP 服务器集中配置
- \`commands/\` — 自定义 slash commands
- \`agents/\` — 子代理定义
- \`hub.toml\` — Hub 主配置

## 常用命令
\`\`\`bash
assetplex sync              # 同步到所有工具
assetplex sync --dry-run    # 预览变更
assetplex doctor            # 体检
assetplex profile learn     # 让 AI 学习最近行为
assetplex skill search <q>  # 搜索社区 skills
\`\`\`
`;
