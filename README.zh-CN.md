<div align="center">

# AssetPlex

**一个身份，所有 AI 助手。**

把你的**身份、技能、规则、MCP 服务器**在 Claude Code、Codex、TRAE、WorkBuddy、Qoder 之间一键同步 —— **数据 100% 本地，绝不上云**。

[English](README.md) · [Docs](https://wynter-cai.github.io/assetplex/) · [隐私模型](PRIVACY.md) · [Discussions](https://github.com/wynter-cai/assetplex/discussions)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/wynter-cai/assetplex/actions/workflows/ci.yml/badge.svg)](https://github.com/wynter-cai/assetplex/actions/workflows/ci.yml)
[![Docs](https://github.com/wynter-cai/assetplex/actions/workflows/docs.yml/badge.svg)](https://github.com/wynter-cai/assetplex/actions/workflows/docs.yml)
[![npm version](https://img.shields.io/npm/v/assetplex)](https://www.npmjs.com/package/assetplex)
[![npm downloads](https://img.shields.io/npm/dm/assetplex)](https://www.npmjs.com/package/assetplex)
[![GitHub stars](https://img.shields.io/github/stars/wynter-cai/assetplex?style=social)](https://github.com/wynter-cai/assetplex/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/wynter-cai/assetplex/pulls)

</div>

---

## 为什么需要 AssetPlex？

你的身份、技能、规则和 MCP 服务器是**你的资产**，AI 编码工具只是消费端。而现状是：

- 你在 TRAE 里写了详细的个人画像，Claude Code 不认识你
- 你在 Claude Code 配了 5 个 MCP 服务器，Codex 里又要重新配一遍
- 你写了 10 个技能，每个工具都要手动复制一份
- 换工具像搬家 —— 每次都从头开始

**AssetPlex 把这些资产集中管理在 `~/.assetplex/`，一条命令同步到你所有的 AI 编码工具。**

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

## 核心功能

- **一个中心 Hub** —— 身份、技能、规则、MCP 全部集中在 `~/.assetplex/`
- **一键同步** —— `assetplex sync` 把资产推到所有启用的工具
- **反向导入** —— 从已安装工具把现有配置拉回 Hub
- **可视化 Web UI** —— `assetplex ui` 仪表盘管理一切
- **格式转换** —— Codex 的 JSON↔TOML、WorkBuddy 的 `${VAR}` 插值
- **跨平台 symlink** —— Windows（junction 回退）、macOS、Linux
- **插件化适配器** —— 新增工具无需改核心代码
- **100% 本地、绝对隐私** —— 数据永不离开你的电脑。[查看隐私模型](PRIVACY.md)

## 支持的 AI 工具

| 工具 | 同步内容 | 策略 |
|---|---|---|
| **TRAE 中国版** | 身份画像、技能、规则、MCP | symlink |
| **Claude Code** | CLAUDE.md（@import 聚合）、技能、MCP | native-import |
| **Codex CLI** | AGENTS.md、技能、MCP（JSON→TOML） | copy |
| **WorkBuddy / CodeBuddy** | 技能、规则、MCP（${VAR} 插值） | symlink + copy |
| **Qoder** | 项目级 .qoder/rules、skills、AGENTS.md | per-project |

## 快速开始

```bash
# 安装
npm install -g assetplex

# 初始化 Hub（~/.assetplex/）
assetplex init

# 检测已安装的 AI 工具
assetplex doctor

# 同步 Hub 到所有工具
assetplex sync

# 打开可视化界面
assetplex ui
```

**要求**：Node.js >= 18

### 从已有工具反向导入

```bash
assetplex ui
# → 导入页：检测已装工具 → 扫描可导入内容 → 勾选 → 一键汇聚
```

## 与同类工具对比

| 能力 | agentsync | agentsmesh | sync-rules | **AssetPlex** |
|---|---|---|---|---|
| 中国工具栈（TRAE/WorkBuddy/Qoder） | ❌ | ❌ | ❌ | ✅ |
| Web UI 可视化管理 | ❌ | ❌ | ❌ | ✅ |
| 从工具反向导入 | ❌ | ❌ | ❌ | ✅ |
| Claude @import 原生利用 | ❌ | ❌ | ✅ | ✅ |
| Windows symlink 兼容 | ✅ | ✅ | ❌ | ✅ |
| 插件架构 | ❌ | ✅ | ❌ | ✅ |
| MCP JSON↔TOML 转换 | ❌ | ❌ | ❌ | ✅ |

## Web UI 预览

运行 `assetplex ui` 后，浏览器打开 `http://127.0.0.1:17521`：

```
┌──────────────────────────────────────────────────────────┐
│  🏠 AssetPlex                                    v0.1.0   │
├──────────┬───────────────────────────────────────────────┤
│  📊 总览  │  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  🔧 工具  │  │ 已安装   │ │ Hub 文件 │ │ 最近同步 │       │
│  🔄 同步  │  └─────────┘ └─────────┘ └─────────┘       │
│  📥 导入  │                                               │
│  👤 身份  │  ┌─ 工具状态 ──────────────────────────┐     │
│  📦 技能  │  │ TRAE CN  ✅ 已安装  ~/.trae-cn/     │     │
│  📋 规则  │  │ Claude Code  ❌ 未安装               │     │
│  🔌 MCP  │  └──────────────────────────────────────┘     │
│  ⚙️ 设置  │                                               │
└──────────┴───────────────────────────────────────────────┘
```

## Hub 目录结构

```
~/.assetplex/
├── identity/                  # 你的身份画像
│   ├── profile.md
│   ├── communication-style.md
│   ├── tech-stack.md
│   └── env.md
├── skills/                    # 跨工具技能库
│   └── <skill-name>/SKILL.md
├── rules/                     # 规则
│   ├── always/global.md
│   ├── by-glob/*.md
│   └── by-project/*.md
├── preferences/               # 个人偏好
├── mcp/mcp.sources.json       # MCP 服务器配置
├── commands/                  # 自定义 slash commands
├── agents/                    # 子代理定义
├── hub.toml                   # Hub 主配置
└── .backups/                  # 自动备份
```

## 路线图

**开发中** 🚧
- 智能导入向导（4 步：检测 → 扫描 → 解决冲突 → 导入）
- 智能合并（Markdown / JSON / TOML 冲突处理）

**规划中** 📋
- 从编码行为自动学习个人画像（`profile.auto.md`）
- 技能市场（聚合 claudeskills.info / agentskills.io）
- 漂移检测与自动修复
- `--watch` 文件变化自动同步

## 参与贡献

欢迎提交 PR！可以看看 [open issues](https://github.com/wynter-cai/assetplex/issues) 和 [good first issues](https://github.com/wynter-cai/assetplex/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)，或加入 [Discussions](https://github.com/wynter-cai/assetplex/discussions)。

## 开发

```bash
git clone https://github.com/wynter-cai/assetplex.git
cd assetplex

npm install          # 安装后端依赖
npm run dev          # watch 模式（tsup）
npm run typecheck    # TypeScript 检查
npm test             # 后端测试（Vitest）
npm run build        # 构建 dist/

# 前端（web/）
cd web
npm install
npm test             # 前端测试
npm run build        # tsc -b && vite build
```

### 项目结构

```
assetplex/
├── src/
│   ├── cli/              # CLI 命令（init/doctor/sync/ui）
│   ├── core/             # 核心引擎
│   │   ├── adapters/     # 工具适配器（base 接口）
│   │   ├── sync-engine.ts
│   │   ├── config.ts
│   │   └── types.ts
│   ├── server/           # Web UI 后端 HTTP 服务
│   ├── transforms/       # 格式转换（symlink/json-toml/env）
│   └── utils/            # 工具函数（fs/paths/logger）
├── web/                  # React 前端（Vite + shadcn/ui）
├── tests/                # 后端测试
└── 设计文档/              # 产品设计文档
```

### 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript 5.6 |
| 运行时 | Node.js 18+ |
| CLI | Commander.js |
| HTTP | Hono |
| 前端 | React 18 + Vite + shadcn/ui + Tailwind |
| 数据获取 | TanStack Query |
| 构建 | tsup |
| 测试 | Vitest |

## 设计文档

- [项目总体架构设计](设计文档/assetplex-design-plan.md)
- [同步引擎 MVP 方案](设计文档/assetplex-stage2-sync-mvp.md)
- [Web UI 实施方案](设计文档/assetplex-web-ui-plan.md)
- [产品 PRD v2.0](设计文档/assetplex-prd-v2-import-wizard.md)

## 开源协议

MIT © [Wynter-Cai](https://github.com/wynter-cai)

---

<div align="center">

如果你觉得有用，请给个 ⭐ Star 支持一下～

</div>
