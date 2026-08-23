# AgentHub 产品 PRD v2.0 — 从工具到 Hub 的智能导入

> **状态：🚧 开发中** | 最后更新：2026-08-09
>
> 本文档是**当前活跃开发功能**的产品需求文档。
> 具体实施任务分解见 `assetplex-import-wizard-plan.md`。
> 开发准则见 `assetplex-constitution.md`。

---

> 方向调整：从"单向同步 Hub → 工具"扩展为"双向打通"，核心价值变为"把所有 AI 编码工具的身份、技能、规则、MCP 自动汇聚到一处统一管理"。

---

## 一、可行性分析

### 1.1 Windows 平台

| 因素 | 结论 |
|---|---|
| 文件系统访问 | ✅ Node.js `fs` 模块可直接读写 `~/.trae-cn/`、`~/.claude/` 等目录 |
| 工具检测 | ✅ 5 个适配器已有 `detect()` 方法，通过检查标志性文件（`argv.json`、`settings.json`、`config.toml` 等）判断安装状态 |
| 符号链接 | ⚠️ 需 junction fallback，但**现有代码已完美处理**（`src/transforms/symlink.ts` 三级降级 + `src/utils/fs.ts` Windows 专项兼容） |
| 文件锁 | ⚠️ 工具运行时可能占用配置文件，需在导入时处理 EACCES/EBUSY |

### 1.2 macOS 平台

| 因素 | 结论 |
|---|---|
| 文件系统访问 | ✅ 同 Linux，路径结构一致（`~/.trae-cn/`、`~/.claude/` 等） |
| 工具检测 | ✅ 与 Windows 逻辑相同，且 macOS 上 `claude --version` 等 CLI 命令更可靠 |
| 符号链接 | ✅ 原生支持，无权限问题 |
| 权限 | ✅ 用户目录下文件均为 user 所有，无需 sudo |

### 1.3 总体结论

**完全可行，且 macOS 体验会优于 Windows（原生 symlink 零降级）。** 现有代码已解决了所有 Windows 特有痛点（symlink 假成功、junction 识别、文件系统删除延迟），不需要为跨平台额外开发。

---

## 二、产品愿景

### 2.1 一句话描述

**打开 AgentHub → 自动发现你电脑上所有 AI 编码工具的身份/技能/规则/MCP → 勾选 → 一键汇聚到 Hub 统一管理。**

### 2.2 用户故事

> 我平时在 TRAE 里写代码，TRAE 慢慢学会了我的编码风格（`memory/user_profile.md`）。周末我想用 Claude Code 做个 Side Project，但它不认识我 —— 我得重新配置一遍。能不能让我的 AI 身份跟着我走？

> 我在 Claude Code 里配了 5 个 MCP 服务器，在 Codex 里又配了 3 个，有些是重复的。能不能自动检测出我到底配了哪些 MCP，去重后统一管理？

### 2.3 核心价值

| 之前（Stage 1-2） | 之后（v2.0） |
|---|---|
| Hub → 工具单向同步 | Hub ↔ 工具双向打通 |
| 用户需手动填充 Hub 内容 | 自动从工具发现并导入 |
| "先有 Hub 才能用" | "先有工具，Hub 帮你汇聚" |
| 冷启动体验差（Hub 是空的） | 零配置上手（自动发现已有内容） |

---

## 三、系统架构

### 3.1 新增模块：Scanner（扫描器）

```
┌──────────────────────────────────────────────────────┐
│                     Scanner                          │
│  src/core/scanner.ts                                │
│                                                     │
│  scanAll(): Promise<ToolInventory[]>                 │
│    ├── 遍历所有适配器                                │
│    ├── 调用 adapter.detect() 判断安装               │
│    ├── 调用 adapter.scan() 扫描工具内容              │
│    └── 返回结构化清单                               │
│                                                     │
│  ToolInventory {                                    │
│    toolName: string                                 │
│    installed: boolean                               │
│    identityFiles: DiscoveredFile[]                  │
│    skillDirs: DiscoveredDir[]                       │
│    ruleFiles: DiscoveredFile[]                      │
│    mcpConfigs: DiscoveredMcp[]                      │
│    preferenceFiles: DiscoveredFile[]                │
│  }                                                  │
│                                                     │
│  DiscoveredFile {                                   │
│    absolutePath: string                             │
│    relativePath: string  // 如 "memory/user_profile"│
│    size: number                                     │
│    modified: string                                 │
│    category: HubFileCategory                        │
│    hubTargetPath: string  // 导入到 Hub 的路径       │
│    conflict: 'none' | 'exists' | 'differs'          │
│  }                                                  │
└──────────────────────────────────────────────────────┘
```

### 3.2 新增 Adapter 方法：scan()

每个适配器需新增 `scan()` 方法，**主动发现工具目录下有哪些可导入内容**（区别于现有的 `resolveHubItems()` 是 Hub→工具的单向映射）：

```typescript
interface ToolAdapter {
  // 现有方法（不变）
  detect(): Promise<ToolStatus>;
  resolveHubItems(hubConfig, hubRoot): Array<{item, target}>;
  import(targetPath): Promise<HubItem>;
  
  // 新增方法
  scan(): Promise<DiscoveredItem[]>;
}
```

**各工具扫描范围：**

| 工具 | 身份 | 技能 | 规则 | MCP | 偏好 |
|---|---|---|---|---|---|
| **TRAE CN** | `memory/user_profile.md` | `skills/` 目录 | `rules/` 目录 | `mcp.json` | `memory/` 下其他文件 |
| **Claude Code** | `CLAUDE.md`（解析 @import） | `skills/` 目录 | `rules/` 目录 | `~/.claude.json` + `settings.json` 中的 MCP | `settings.json` |
| **Codex** | `AGENTS.md` | `skills/` 目录 | `rules/` 目录 | `config.toml` 中 `[mcp_servers]` | `config.toml` 中非 MCP 字段 |
| **WorkBuddy** | 无独立身份文件 | `skills/` 目录 | `rules/` 目录 | `.mcp.json` + `mcp.json` | `models.json` |
| **Qoder** | 项目根 `AGENTS.md` | `.qoder/skills/` | `.qoder/rules/` | 无全局 MCP | 无全局偏好 |

### 3.3 导入流程

```
用户打开 AgentHub Web UI
        │
        ▼
  ┌─────────────────────┐
  │ Step 1: 自动检测     │  ← 调用 adapter.detect() 判断安装状态
  │ 展示已安装工具列表   │     显示 TRAE CN ✅ / Claude Code ❌ 等
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │ Step 2: 扫描内容     │  ← 调用 adapter.scan() 发现各工具内容
  │ 按工具 + 分类展示    │     展示每个工具下的身份/技能/规则/MCP
  │ 标注冲突状态         │     绿色=新文件 黄色=冲突 灰色=已存在相同
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │ Step 3: 勾选确认     │  ← 用户选择要导入哪些文件
  │ 预览导入结果         │     支持全选/按分类选/按工具选
  │ 冲突项逐个处理       │     智能合并 / 覆盖 / 跳过
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │ Step 4: 执行导入     │  ← 调用 hub-files.ts 写入 Hub
  │ 实时进度条           │     显示导入进度 + 结果汇总
  │ 完成引导             │     "导入完成！运行 agenthub sync 同步到其他工具"
  └─────────────────────┘
```

### 3.4 智能合并策略

当 Hub 已有同名文件且内容不同时：

| 文件类型 | 合并策略 |
|---|---|
| **Markdown**（`.md`） | Hub 内容在前，工具内容追加在后，用 `---` 分隔线 + 注释标注来源 |
| **JSON**（`mcp.json`） | 深度合并：Hub 的 `mcpServers` 和工具的 `mcpServers` 做 key 级合并，重复 key 以 Hub 为准 |
| **TOML**（`config.toml`） | 先转 JSON，按 JSON 逻辑合并，再转回 TOML |
| **目录**（`skills/`、`rules/`） | 文件级合并：Hub 已有文件跳过，新文件复制进 Hub |

---

## 四、现有代码复用分析

### 4.1 可直接复用的模块（无需修改）

| 模块 | 文件 | 复用方式 |
|---|---|---|
| 工具检测 | `src/core/adapters/*.ts` 的 `detect()` | 直接调用，5 个工具检测逻辑已完善 |
| 文件读取 | `src/core/adapters/*.ts` 的 `import()` | 直接调用，每个适配器已实现从工具读取文件 |
| 文件写入 | `src/core/hub-files.ts` | 直接调用 `writeHubFile()` / `createHubFile()` |
| 配置管理 | `src/core/config.ts` | 复用 `HubConfigSchema`、`loadHubConfig` |
| 类型定义 | `src/core/types.ts` | 复用 `HubItem`、`ToolStatus`、`SyncTarget` |
| 适配器注册 | `src/core/adapters/registry.ts` | 现有注册机制不变 |
| 路径工具 | `src/utils/paths.ts` | 复用 `getHubRoot()`、`hubPath()` |
| 文件系统工具 | `src/utils/fs.ts` | 复用 `ensureDir()`、`isSymlink()` 等 |
| 格式转换 | `src/transforms/json-toml.ts` | 复用 `mcpJsonToToml()`、`tomlToJsonObj()` |
| 环境变量 | `src/transforms/env-interpolation.ts` | 复用 `extractEnvVars()`、`buildEnvMap()` |
| 对称链接 | `src/transforms/symlink.ts` | 无需改动 |
| HTTP 服务 | `src/server/index.ts` | 复用现有 Hono 框架 |
| API 路由 | `src/server/routes/*.ts` | 已有 `/api/sync/reverse-import` 端点 |
| 前端框架 | `web/` 全部 | 复用 React + Vite + shadcn/ui |
| 前端 API  | `web/src/lib/api.ts` | 已有 `reverseImport()` 方法 |

### 4.2 需要修改的模块

| 模块 | 文件 | 改动内容 |
|---|---|---|
| Adapter 接口 | `src/core/adapters/base.ts` | 新增 `scan()` 抽象方法（默认返回空数组） |
| TRAE CN | `src/core/adapters/trae-cn.ts` | 新增 `scan()`：扫描 `memory/`、`skills/`、`rules/`、`mcp.json` |
| Claude Code | `src/core/adapters/claude-code.ts` | 新增 `scan()`：扫描 `CLAUDE.md`、`skills/`、`rules/`、`~/.claude.json` |
| Codex | `src/core/adapters/codex.ts` | 新增 `scan()`：扫描 `AGENTS.md`、`skills/`、`rules/`、`config.toml` 中 MCP |
| WorkBuddy | `src/core/adapters/workbuddy.ts` | 新增 `scan()`：扫描 `skills/`、`rules/`、`.mcp.json`、`mcp.json`、`models.json` |
| Qoder | `src/core/adapters/qoder.ts` | 新增 `scan()`：扫描项目 `.qoder/` 目录 |
| SyncEngine | `src/core/sync-engine.ts` | 增强 `reverseImport()`：调用 `scan()` 发现 + 写入 Hub |
| 同步路由 | `src/server/routes/sync.ts` | 新增 `POST /api/sync/scan` 端点 |

### 4.3 需要新增的模块

| 模块 | 文件 | 说明 |
|---|---|---|
| 扫描器 | `src/core/scanner.ts` | 协调所有适配器的 scan()，返回统一清单 |
| 智能合并 | `src/core/merger.ts` | 按文件类型执行合并策略（MD/JSON/TOML/目录） |
| 导入向导页 | `web/src/pages/Import.tsx` | 4 步全屏导入向导 |
| 导入相关组件 | `web/src/components/import/` | ToolCard、FileItem、ConflictDialog、ProgressBar 等 |

---

## 五、实施计划（5 个 Phase）

### Phase A：Scanner 基础设施（后端）

**新增文件：**
- `src/core/scanner.ts` — 扫描器核心
- `src/core/merger.ts` — 智能合并引擎

**修改文件：**
- `src/core/adapters/base.ts` — 新增 `scan()` 抽象方法
- 5 个适配器 — 各新增 `scan()` 实现

**验证：** 单元测试 `scanner.test.ts`，验证各工具扫描结果正确

### Phase B：增强 reverseImport + API

**修改文件：**
- `src/core/sync-engine.ts` — 增强 `reverseImport()` 支持写入 Hub
- `src/server/routes/sync.ts` — 新增 `POST /api/sync/scan` + 增强 `POST /api/sync/reverse-import`

**验证：** `curl` 测试 API 返回正确的扫描结果

### Phase C：导入向导前端

**新增文件：**
- `web/src/pages/Import.tsx` — 全屏导入向导
- `web/src/components/import/*.tsx` — 子组件

**修改文件：**
- `web/src/App.tsx` — 添加 `/import` 路由
- `web/src/components/layout/Sidebar.tsx` — 添加"导入"导航项
- `web/src/lib/api.ts` — 添加 `scan()` / `executeImport()` API

**验证：** 前端开发模式 `pnpm dev` 测试完整流程

### Phase D：智能合并实现

**修改文件：**
- `src/core/merger.ts` — 实现 MD/JSON/TOML/目录 4 种合并策略

**验证：** 单元测试 `merger.test.ts`，覆盖各种冲突场景

### Phase E：集成测试 + 端到端验证

**验证：**
- 本机真实运行：`node dist/index.js ui`，走完导入向导
- 测试 TRAE CN 导入（用户已安装的唯一工具）
- 确认导入后 Hub 文件内容正确

---

## 六、文件清单总览

### 新增文件（~10 个）
- `src/core/scanner.ts`
- `src/core/merger.ts`
- `web/src/pages/Import.tsx`
- `web/src/components/import/ToolCard.tsx`
- `web/src/components/import/FileItem.tsx`
- `web/src/components/import/ConflictDialog.tsx`
- `web/src/components/import/ProgressBar.tsx`
- `tests/unit/core/scanner.test.ts`
- `tests/unit/core/merger.test.ts`

### 修改文件（~10 个）
- `src/core/adapters/base.ts` — 新增 `scan()` 方法
- `src/core/adapters/trae-cn.ts` — 实现 `scan()`
- `src/core/adapters/claude-code.ts` — 实现 `scan()`
- `src/core/adapters/codex.ts` — 实现 `scan()`
- `src/core/adapters/workbuddy.ts` — 实现 `scan()`
- `src/core/adapters/qoder.ts` — 实现 `scan()`
- `src/core/sync-engine.ts` — 增强 `reverseImport()`
- `src/server/routes/sync.ts` — 新增 scan 端点
- `web/src/App.tsx` — 添加路由
- `web/src/components/layout/Sidebar.tsx` — 添加导航项
- `web/src/lib/api.ts` — 添加 API 方法

---

## 七、用户旅程

```
1. 用户打开 AgentHub Web UI（http://127.0.0.1:17521）

2. 首页 Dashboard 提示："发现 2 个已安装工具，可导入内容"
   点击"开始导入"或左侧导航"导入"

3. 进入全屏导入向导：

   Step 1/4 — 检测工具
   ┌────────────────────────────────────┐
   │  TRAE 中国版           ✅ 已安装   │
   │  Claude Code           ❌ 未安装   │
   │  Codex                 ❌ 未安装   │
   │  WorkBuddy             ❌ 未安装   │
   │  Qoder                 ⚠️ 项目级   │
   │                                    │
   │  [重新检测]  [下一步]              │
   └────────────────────────────────────┘

   Step 2/4 — 发现内容
   ┌────────────────────────────────────┐
   │  TRAE 中国版 发现以下内容：        │
   │                                    │
   │  📝 身份 (1)                       │
   │  ├─ memory/user_profile.md  (2KB)  │
   │  📦 技能 (3)                       │
   │  ├─ skills/pdf/              [新]  │
   │  ├─ skills/xlsx/             [新]  │
   │  └─ skills/docx/             [新]  │
   │  📋 规则 (2)                       │
   │  ├─ rules/always/global.md   [冲突]│
   │  └─ rules/by-glob/python.md  [新]  │
   │  🔌 MCP (1)                        │
   │  └─ mcp.json                 [冲突]│
   │                                    │
   │  [全选]  [按分类选]  [下一步]     │
   └────────────────────────────────────┘

   Step 3/4 — 确认导入
   ┌────────────────────────────────────┐
   │  将导入 5 个文件到 Hub             │
   │                                    │
   │  ⚠️ 2 个冲突需处理：               │
   │  ┌─────────────────────────────┐   │
   │  │ rules/always/global.md       │   │
   │  │ Hub 已有 1.2KB，TRAE 有 0.8KB│   │
   │  │ [智能合并] [覆盖] [跳过]     │   │
   │  └─────────────────────────────┘   │
   │  ┌─────────────────────────────┐   │
   │  │ mcp.json                     │   │
   │  │ Hub 有 3 服务器，TRAE 有 5  │   │
   │  │ [智能合并] [覆盖] [跳过]     │   │
   │  └─────────────────────────────┘   │
   │                                    │
   │  [开始导入]                        │
   └────────────────────────────────────┘

   Step 4/4 — 导入完成
   ┌────────────────────────────────────┐
   │  ✅ 导入完成！                     │
   │                                    │
   │  新增 3 个文件                     │
   │  合并 2 个文件                     │
   │  跳过 0 个文件                     │
   │                                    │
   │  💡 下一步：运行 agenthub sync     │
   │  将 Hub 内容同步到其他工具         │
   │                                    │
   │  [前往同步中心]  [返回首页]        │
   └────────────────────────────────────┘
```