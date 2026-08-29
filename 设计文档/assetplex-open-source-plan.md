# AssetPlex 开源发布与增长计划

> 版本：v1.0 · 2026-08
> 原则：**AI 优先自动化，最大化 ROI，最小化人工维护成本**
> 背景：作者为互联网大厂在职工程师，时间宝贵。本计划所有重复性工作一律交给 AI 代理 + CI/CD 自动化，人工只做关键决策与最终审核。

---

## 0. 目标

1. **发布**：把 AssetPlex 以专业形态开源（GitHub 公开仓库 + npm 发布）。
2. **影响力**：让需要"跨 AI 工具同步技能/MCP/身份"的人能搜到、愿意用、愿意传播。
3. **可持续**：以最低人工成本长期维护（发布、更新、Issue 响应、文档）。

---

## 1. 现状盘点

| 项 | 状态 |
|---|---|
| 命名 | ✅ 已定名 AssetPlex，npm/PyPI/GitHub 全维度无重名 |
| 代码改名 | ✅ 已全部迁移（CLI `assetplex`/`ap`，`~/.assetplex`） |
| 测试 | ✅ 后端 156 + 前端 12 全绿，Windows symlink 兼容 |
| 类型/构建 | ✅ typecheck / tsup build / vite build 全过 |
| 仓库结构 | 🚧 需重构（agent-hub 嵌套 → 根目录，全新干净历史） |
| CI/CD | ⬜ 未配置（GitHub Actions） |
| npm 发布 | ⬜ 未发布 |
| 英文文档 | ⬜ README 为中文，需补英文 |
| 隐私文档 | ⬜ 需明确"数据 100% 本地"卖点 |

---

## 2. 仓库工程化（P0 · 上线前必做）

### 2.1 仓库结构
- 把 `agent-hub/` 内容提升到仓库根目录，`设计文档/` 保留在仓库内。
- 全新干净 git 历史（删除旧 `.git` 重新 init）。
- GitHub 远端仓库名：`assetplex`（`github.com/wynter-cai/assetplex`）。

### 2.2 CI/CD（GitHub Actions，一次性配置，永久自动）
| Workflow | 触发 | 作用 |
|---|---|---|
| `ci.yml` | PR / push main | `pnpm install` → `typecheck` → `test` → `build`；覆盖率门禁（行 80%） |
| `release.yml` | tag `v*` | 自动构建 + `npm publish`（带 provenance）；生成 GitHub Release |
| `codeql.yml` | push / 每周 | 安全扫描（依赖 + 代码） |
| `dependabot.yml` | 每日 | 自动升级依赖，PR 合并即跑 CI |

### 2.3 版本与发布自动化
- 用 **changesets**：开发者改代码时打 changeset，发布时自动聚合生成 changelog + 版本号 + release notes。
- semver 策略：`0.x` 功能迭代随意；`1.0.0` 前不承诺破坏性兼容。
- npm `publishConfig.access=public`；`files` 已限定 `dist/` 等。

### 2.4 npm 发布检查单
- [ ] `npm pack --dry-run` 确认产物干净
- [ ] 注册 npm 账号（若已有则登录），`npm publish`
- [ ] 设置 `npm pkg set publishConfig.access=public`
- [ ] 验证 `npm install -g assetplex && assetplex init` 全流程

---

## 3. 内容与文档（P0-P1）

### 3.1 README（当前中文 → 中英双语）
- 保留中文为主（目标用户含中国开发者），新增 `README.en.md` 或段落切换。
- 首段即卖点：*一个中心，同步你的身份/技能/规则/MCP 到所有 AI 编码工具。数据 100% 本地。*
- 加 build/test/coverage/许可证徽章 + 演示 GIF。

### 3.2 隐私模型（重要卖点）
- 明确文档：所有数据存于本地 `~/.assetplex`，**不上传任何云端**。
- 说明工具读写各 AI 工具配置的权限边界；MCP 配置可能含 API Key，注明"仅本地处理"。

### 3.3 数据迁移
- `assetplex init` 增加提示：检测旧 `~/.agent-hub` 目录 → 询问是否迁移到 `~/.assetplex`。
- 迁移 = 复制目录 + 写日志（不删除源）。

### 3.4 Docs 站（P1）
- VitePress 部署到 GitHub Pages 或 `assetplex.dev`（`assetplex.com` 被倒卖，暂不购买）。
- 内容：快速开始 / 各工具适配器 / 数据与隐私 / FAQ。
- docs 站同时是 SEO 主阵地 + GitHub homepage 链接指向。

---

## 4. 发布与传播（P1-P2 · 90 天启动栈）

### 4.1 渠道矩阵
| 优先级 | 平台 | 动作 |
|---|---|---|
| P0 | GitHub | SEO + Release + Good First Issues + Discussions |
| P0 | 掘金 | 教程"如何用一个工具管理所有 AI 编码助手" |
| P0 | V2EX | 发布帖 + 讨论回复 |
| P0 | Show HN | 发布 + 回复所有评论 |
| P0 | Discord/QQ 群 | 用户社区 |
| P1 | Reddit | r/ClaudeAI、r/OpenClaw、r/selfhosted、r/SideProject |
| P1 | X/Twitter | 更新 + Claude Code/Codex 生态互动 |
| P1 | Product Hunt | Developer Tools 类目（周中发布） |
| P1 | 知乎 | 回答"跨工具同步"类问题 |
| P2 | Awesome 列表 | awesome-claude-code / awesome-mcp / awesome-ai-coding |
| P2 | 目录站 | BetaList、SaaSHub、AlternativeTo、daily.dev |
| P2 | 即刻/小红书/B站 | 演示视频/体验帖 |

### 4.2 内容弹药（发布前备齐）
- [ ] 3 分钟演示视频 / GIF（换工具不丢资产的 wow 时刻）
- [ ] 一图流对比表（vs agentsync/agentsmesh 等）
- [ ] 发布长文：痛点故事 + 解决方案
- [ ] 各平台文案模板（标题/正文，避免重复劳动）

---

## 5. SEO 与可搜索性

### 5.1 GitHub 设置（最高 ROI）
- **Description**（≤300 字符，前置关键词）：
  `Sync your identity, skills, rules & MCP servers across Claude Code, Codex, TRAE, WorkBuddy and Qoder. One hub, every AI agent.`
- **Topics**（6-15 个，复用社区规范标签）：`ai` `ai-agent` `claude-code` `codex` `mcp` `trae` `workbuddy` `qoder` `agents` `skills` `sync` `cli` `typescript` `developer-tools` `windows`
- **Homepage URL** → docs 站
- **Profile README**（`wynter-cai/wynter-cai`）
- **Gitee 镜像**（国内访问）

### 5.2 关键词（写进 README/docs/文章）
- 中文：`AI 技能同步`、`MCP 统一管理`、`跨工具同步 Claude Code 配置`、`AI 身份管理`、`换 AI 工具不丢配置`
- 英文：`sync skills between AI coding tools`、`share MCP servers across tools`、`claude code skills sync`、`centralize AI agent config`

### 5.3 GEO（AI 引用优化）
- README 用结构化 H1/H2、显式功能列表、可引用代码示例——ChatGPT/Perplexity 更容易引用并推荐。

---

## 6. 自动化维护体系（核心 · 降低人工成本）

### 6.1 项目已具备的 AI 基础
- `AGENTS.md`：任何 AI 代理（TRAE/Cursor/Claude Code…）进入仓库即获得完整上下文与工作铁律（SDD + TDD + 类型安全）。
- `设计文档/changes/`：变更规格化，AI 可直接按 spec 实现。
- **结论：这个仓库天生就是"AI 可自主维护"的**，这正是低维护成本的最大杠杆。

### 6.2 自动化清单
| 类别 | 手段 | 人工介入 |
|---|---|---|
| 依赖更新 | Dependabot | 仅合并 PR |
| 测试/类型/构建 | GitHub Actions CI | 0 |
| 发布 | changesets + release.yml | 只打 tag |
| Changelog | changesets 自动生成 | 0 |
| 安全 | CodeQL + npm audit | 仅处理高危告警 |
| Issue 响应 | Issue 模板 + 自动标签（AI bot） | 每周集中处理 |
| 文档 | 用 AI 代理按 spec 生成/更新 | 审核 |
| 备份 | GitHub（分布式）+ 本地定时 | 0 |

### 6.3 每周维护 SOP（预计 <30 分钟）
1. 合并 Dependabot 安全更新 PR（自动跑 CI）。
2. 用 AI 代理处理本周 Issue：分类 → 标注 good first issue → 重大 bug 写 spec。
3. 有功能更新 → 让 AI 写 changeset → 合并 → 打 tag 自动发布。
4. 每月：让 AI 生成月度 release notes 并发布到社区。

---

## 7. 里程碑与 KPI

| 阶段 | 内容 | 完成标志 / KPI |
|---|---|---|
| P0 上线前 | 仓库重构、CI/CD、npm 发布、隐私文档、迁移提示 | 私有 CI 全绿；`npm install -g assetplex` 可用 |
| P1 软启动 | 种子用户 10-20 人试用 → 修痛点 | 核心场景验证 |
| P2 正式发布 | 切 public + 90 天多渠道 | 首月 star 100+；发布文 3-5 篇 |
| P3 增长运营 | 社区 + 内容节奏 + KOL 联动 | star 500+；月活跃贡献者 2+ |

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 时间不足（主业忙） | 一切可自动化；AI 代理兜底；明确"人工只做审核" |
| 维护倦怠 | changesets/CI/发布全自动；社区活跃后引入 co-maintainer |
| 竞品同质化 | 坚持"中国工具栈 + Windows + 数据本地"差异化 |
| 名称被抢注 | 已核查干净；域名暂用 `.dev`，不追高价 `.com` |

---

## 9. 进度

### ✅ 已完成
- [x] 重构仓库：agent-hub 内容提升到根目录，全新 git 历史（root commit `a13f791`）
- [x] 设计文档（assetplex-*.md）纳入仓库；README/AGENTS.md 与文档内部链接适配新结构
- [x] 根 .gitignore 排除 .trae/、node_modules、dist 及旧目录残留

### ⏳ 待办（可交给 AI 代理逐项执行）
- [ ] 配 GitHub Actions 三个 workflow（ci / release / codeql）+ Dependabot
- [ ] 写英文 README + 隐私模型文档 + 旧 `~/.agent-hub` 数据迁移提示
- [ ] `npm publish` 并验证 `npm install -g assetplex` 全流程
- [ ] 建 GitHub 公开仓库 `assetplex` + Gitee 镜像
- [ ] 用 AI 代理统一批量修正设计文档中的历史品牌名（AgentHub→AssetPlex、agenthub→assetplex）
- [x] 本地 `web/` 依赖安装：已用 `npm ci` 完成，web 构建 + 12 测试全绿（node_modules 未随重构迁移）
