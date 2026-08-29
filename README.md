# AssetPlex

<p align="center">
  <b>一个身份，所有 AI 助手</b><br>
  <em>One identity, every AI agent — built for the China stack and beyond.</em>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.6-blue" alt="TypeScript"></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey" alt="Platform"></a>
</p>

---

## 这是什么？

**AssetPlex** 是一个开源 CLI 工具，帮你把**个人身份、技能、规则、MCP 服务器**集中管理在 `~/.assetplex/` 目录下，然后一键同步到你所有的 AI 编码工具。

```
换了 AI 工具写代码？不用重新配置。AssetPlex 让你的 AI 身份跟着你走。
```

### 支持的 AI 工具

| 工具 | 同步内容 | 策略 |
|---|---|---|
| **TRAE 中国版** | 身份画像、技能、规则、MCP | symlink |
| **Claude Code** | CLAUDE.md（@import 聚合）、技能、MCP | native-import |
| **Codex CLI** | AGENTS.md、技能、MCP（JSON→TOML） | copy |
| **WorkBuddy / CodeBuddy** | 技能、规则、MCP（${VAR} 插值） | symlink + copy |
| **Qoder** | 项目级 .qoder/rules、skills、AGENTS.md | per-project |

---

## 快速开始

```bash
# 初始化（在 ~/.assetplex/ 创建你的身份和配置）
assetplex init

# 看看电脑上装了哪些 AI 工具
assetplex doctor

# 把 Hub 内容同步到所有工具
assetplex sync

# 打开可视化界面管理一切
assetplex ui
```

### 从已有工具反向导入

```bash
# 打开 Web UI，进入"导入"页面
assetplex ui

# 自动检测已安装工具 → 扫描可导入内容 → 勾选 → 一键汇聚
```

---

## 为什么需要 AssetPlex？

### 痛点

- 你在 TRAE 里写了详细的个人画像，Claude Code 不认识你
- 你在 Claude Code 配了 5 个 MCP 服务器，Codex 里又要重新配一遍
- 你写了 10 个技能，每个工具都要手动复制一份
- 换工具像搬家 —— 每次都从头开始

### AssetPlex 的解法

```
         ┌──────────────────────────────┐
         │      ~/.assetplex/           │
         │                              │
         │  identity/  你的身份画像      │
         │  skills/    技能库            │
         │  rules/     通用规则          │
         │  mcp/       MCP 配置          │
         │  preferences/ 个人偏好        │
         │                              │
         └──────────┬───────────────────┘
                    │  assetplex sync
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐  ┌──────────┐
   │ TRAE CN │ │ Claude  │ │  Codex  │  │WorkBuddy │
   └─────────┘ └─────────┘ └─────────┘  └──────────┘
```

### 与同类工具对比

| 能力 | agentsync | agentsmesh | sync-rules | **AssetPlex** |
|---|---|---|---|---|
| 中国工具栈（TRAE/WorkBuddy/Qoder） | ❌ | ❌ | ❌ | ✅ |
| Web UI 可视化管理 | ❌ | ❌ | ❌ | ✅ |
| 从工具反向导入 | ❌ | ❌ | ❌ | ✅ |
| AI 自动维护个人画像 | ❌ | 项目级 | ❌ | ✅ |
| Claude @import 原生利用 | ❌ | ❌ | ✅ | ✅ |
| Windows symlink 兼容 | ✅ | ✅ | ❌ | ✅ |
| 插件架构 | ❌ | ✅ | ❌ | ✅ |
| MCP JSON↔TOML 转换 | ❌ | ❌ | ❌ | ✅ |

---

## 功能一览

### 已实现 ✅

| 功能 | 说明 |
|---|---|
| **`assetplex init`** | 一键初始化 Hub 目录和模板文件 |
| **`assetplex doctor`** | 检测所有工具安装状态、Hub 完整性 |
| **`assetplex sync`** | 同步 Hub 内容到所有启用的工具（支持 --dry-run / --json） |
| **`assetplex ui`** | Web UI 可视化管理（Dashboard / 工具 / 同步 / 身份 / 技能 / 规则 / MCP / 设置） |
| **跨平台 symlink** | Windows（junction fallback）、macOS、Linux 全兼容 |
| **JSON↔TOML 转换** | Codex 的 config.toml 自动转换 |
| **${VAR} 环境变量插值** | WorkBuddy 的 MCP 配置变量处理 |
| **5 个适配器** | TRAE CN / Claude Code / Codex / WorkBuddy / Qoder |
| **反向导入** | 从工具读取配置回 Hub |

### 开发中 🚧

| 功能 | 说明 |
|---|---|
| **智能导入向导** | Web UI 4 步向导：检测工具 → 扫描内容 → 确认冲突 → 一键导入 |
| **智能合并** | Markdown / JSON / TOML 多种合并策略，冲突自动处理 |

### 规划中 📋

| 功能 | 说明 |
|---|---|
| **身份自动学习** | AI 从你的编码行为中自动生成 `profile.auto.md` |
| **技能市场** | 聚合 claudeskills.info / agentskills.io 等平台的技能发现 |
| **漂移检测** | 检测工具配置是否与 Hub 不一致，自动修复 |
| **监听模式** | `--watch` 文件变化自动同步 |

---

## Hub 目录结构

```
~/.assetplex/
├── identity/                  # 你的身份画像
│   ├── profile.md             # 手写个人画像
│   ├── profile.auto.md        # AI 自动学习的画像（规划中）
│   ├── communication-style.md # 沟通偏好
│   ├── tech-stack.md          # 技术栈
│   └── env.md                 # 环境信息
├── skills/                    # 跨工具技能库
│   └── <skill-name>/
│       └── SKILL.md
├── rules/                     # 规则
│   ├── always/                # 始终生效
│   │   └── global.md
│   ├── by-glob/               # 按文件类型
│   │   ├── typescript.md
│   │   └── python.md
│   └── by-project/            # 按项目类型
├── preferences/               # 个人偏好
│   ├── coding-style.md
│   └── git-workflow.md
├── mcp/                       # MCP 服务器配置
│   └── mcp.sources.json
├── commands/                  # 自定义 slash commands
├── agents/                    # 子代理定义
├── hub.toml                   # Hub 主配置
└── .backups/                  # 自动备份
```

---

## Web UI 预览

运行 `assetplex ui` 后，浏览器打开 `http://127.0.0.1:17521`：

```
┌──────────────────────────────────────────────────────────┐
│  🏠 AssetPlex                                    v0.1.0   │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  📊 总览  │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  🔧 工具  │  │ 已安装   │ │ Hub 文件 │ │ 最近同步 │       │
│  🔄 同步  │  │ 1 个工具 │ │ 12 个    │ │ 2 小时前 │       │
│  📥 导入  │  └─────────┘ └─────────┘ └─────────┘       │
│  👤 身份  │                                               │
│  📦 技能  │  ┌─ 工具状态 ──────────────────────────┐     │
│  📋 规则  │  │ TRAE CN  ✅ 已安装  ~/.trae-cn/     │     │
│  🔌 MCP  │  │ Claude Code  ❌ 未安装               │     │
│  ⚙️ 设置  │  │ Codex  ❌ 未安装                     │     │
│          │  └──────────────────────────────────────┘     │
│          │                                               │
└──────────┴───────────────────────────────────────────────┘
```

---

## 安装

```bash
# npm
npm install -g assetplex

# pnpm
pnpm add -g assetplex

# 或直接试用
npx assetplex init
```

**要求**：Node.js >= 18

---

## 开发

```bash
# 克隆仓库
git clone https://github.com/wynter-cai/assetplex.git
cd assetplex

# 安装依赖
pnpm install

# 开发模式（热更新）
pnpm dev

# 前端开发
cd web && pnpm dev

# 构建
pnpm build

# 测试
pnpm test

# 类型检查
pnpm typecheck
```

### 项目结构

```
assetplex/
├── src/
│   ├── cli/              # CLI 命令（init/doctor/sync/ui）
│   ├── core/             # 核心引擎
│   │   ├── adapters/     # 5 个工具适配器
│   │   ├── sync-engine.ts
│   │   ├── config.ts     # hub.toml 解析
│   │   └── types.ts
│   ├── server/           # Hono HTTP 服务（Web UI 后端）
│   ├── transforms/       # 格式转换（symlink/json-toml/env）
│   └── utils/            # 工具函数（fs/paths/logger）
├── web/                  # React 前端（Vite + shadcn/ui）
│   └── src/
│       ├── pages/        # 8 个核心页面
│       ├── components/   # UI 组件
│       └── lib/          # API 封装
├── tests/                # 测试
└── 设计文档/              # 产品设计文档
```

### 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript 5.6 |
| 运行时 | Node.js 18+ |
| CLI 框架 | Commander.js |
| HTTP 框架 | Hono |
| 前端 | React 18 + Vite + shadcn/ui + Tailwind |
| 数据获取 | TanStack Query |
| 构建 | tsup |
| 测试 | Vitest |
| 配置格式 | TOML |

---

## 适配器架构

AssetPlex 采用插件化适配器架构，新增工具支持无需改核心代码：

```typescript
interface ToolAdapter {
  name: string;                    // 适配器名称
  displayName: string;             // 显示名称
  detect(): Promise<ToolStatus>;  // 检测工具是否安装
  resolveHubItems(config, root): Array<{item, target}>;  // Hub ↔ 工具映射
  apply(item, target): Promise<void>;   // Hub → 工具
  import(targetPath): Promise<HubItem>; // 工具 → Hub
  scan(): Promise<DiscoveredItem[]>;    // 扫描工具内容
  transform(content, format): Buffer;   // 格式转换
}
```

---

## 设计文档

- [项目总体架构设计](设计文档/assetplex-design-plan.md) — 竞品调研、技术选型、架构决策
- [同步引擎 MVP 方案](设计文档/assetplex-stage2-sync-mvp.md) — symlink、格式转换、适配器实现
- [Web UI 实施方案](设计文档/assetplex-web-ui-plan.md) — 前端架构、页面设计、API 路由
- [产品 PRD v2.0](设计文档/assetplex-prd-v2-import-wizard.md) — 智能导入需求、用户旅程
- [智能导入实施计划](设计文档/assetplex-import-wizard-plan.md) — 当前开发计划

---

## 开源协议

MIT © [caiwe](https://github.com/wynter-cai)

---

<p align="center">
  <sub>如果你觉得有用，请给个 ⭐ Star 支持一下～</sub>
</p>