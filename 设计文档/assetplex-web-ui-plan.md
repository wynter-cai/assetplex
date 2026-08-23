# AgentHub Web UI 实施方案

> **状态：✅ 已完成** | 完成日期：2026-08-09
>
> 本文档是**历史记录**（架构决策记录 ADR），描述已实现的 Web UI 设计。
> **不要**根据本文档重复实现功能，代码已在 `web/` 和 `src/server/` 中。
> Dashboard、Tools、Sync、Identity、Skills、Rules、MCP、Settings 8 个页面已上线。
> 当前正在开发的功能（智能导入向导）请参考 `assetplex-import-wizard-plan.md`。

---

> 为 AgentHub CLI 增加可视化前端，让用户通过浏览器页面管理身份、技能、规则、MCP 服务器及同步流程。

---

## 一、Summary 概要

**目标**：在现有 CLI 工具基础上，新增内嵌 HTTP 服务 + React SPA，用户运行 `agenthub ui` 即可在浏览器中完成可视化管理。

**形态决策**：本地 Web UI（HTTP server + SPA）
**技术栈决策**：React 18 + Vite + TypeScript + TanStack Query + shadcn/ui

**范围（首版 MVP）**：
- ✅ HTTP API 层（Hono 框架，复用现有 SyncEngine）
- ✅ React SPA（8 个核心页面）
- ✅ `agenthub ui` 命令集成（启动服务 + 自动开浏览器）
- ✅ 实时同步状态、文件编辑、配置管理
- ✅ 前后端一体化构建（前端产物嵌入 CLI 包发布）

**明确不做（留到后续版本）**：
- ❌ 用户认证（本地工具，仅本机访问）
- ❌ 多用户协作
- ❌ 在线技能市场（首版只读本地技能）
- ❌ WebSocket 实时推送（首版用轮询 + 手动刷新）
- ❌ 移动端适配（首版桌面优先）

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器（http://localhost:17521）                  │
│  ┌─────────────────────────────────────────────┐    │
│  │  React SPA（web/dist/）                     │    │
│  │  - React Router                            │    │
│  │  - TanStack Query                          │    │
│  │  - shadcn/ui 组件                          │    │
│  └─────────────────┬───────────────────────────┘    │
└────────────────────┼────────────────────────────────┘
                     │ HTTP (fetch)
┌────────────────────┴────────────────────────────────┐
│  Node.js 进程（agenthub ui）                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  Hono HTTP Server（src/server/）            │    │
│  │  - /api/hub        配置读写                 │    │
│  │  - /api/tools      工具检测                 │    │
│  │  - /api/sync       同步操作                 │    │
│  │  - /api/files      Hub 文件 CRUD            │    │
│  └─────────────────┬───────────────────────────┘    │
│                    │ 同进程调用                     │
│  ┌─────────────────┴───────────────────────────┐    │
│  │  现有核心层（src/core/）                     │    │
│  │  - SyncEngine                              │    │
│  │  - loadHubConfig / saveHubConfig           │    │
│  │  - adapters registry                       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 三、实施阶段切片（5 个 Phase）

```
Phase A: 后端基础设施          ── Hono 服务 + 中间件 + 错误处理
   ↓
Phase B: 核心 API 路由          ── 4 个路由模块（hub/tools/sync/files）
   ↓
Phase C: 前端项目脚手架         ── Vite + React + shadcn/ui 初始化
   ↓
Phase D: 8 个核心页面实现       ── Dashboard/Tools/Sync/Identity/...
   ↓
Phase E: CLI 集成 + 构建        ── agenthub ui 命令 + 一体化打包
```

---

## 四、API 路由设计

### 路由 1：`/api/hub`

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/hub/config` | 读取 hub.toml 配置 |
| PUT | `/api/hub/config` | 保存 hub.toml 配置 |
| GET | `/api/hub/health` | Hub 健康度（目录是否存在、文件数量统计） |

### 路由 2：`/api/tools`

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/tools` | 列出所有工具及状态 |
| GET | `/api/tools/:name` | 单个工具详情 |
| POST | `/api/tools/:name/toggle` | 启用/禁用工具 |
| POST | `/api/tools/:name/detect` | 重新检测工具 |

### 路由 3：`/api/sync`

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/sync/plan` | 获取同步计划（不执行） |
| POST | `/api/sync/run` | 执行同步 |
| POST | `/api/sync/reverse-import` | 反向导入 |
| GET | `/api/sync/history` | 历史记录 |

### 路由 4：`/api/files`

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/files` | 列出 Hub 文件（按类别） |
| GET | `/api/files/*` | 读取单个文件内容 |
| PUT | `/api/files/*` | 写入文件内容 |
| DELETE | `/api/files/*` | 删除文件 |
| POST | `/api/files` | 创建新文件 |

---

## 五、前端目录结构

```
web/
├── package.json              # 前端独立 package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json           # shadcn/ui 配置
├── index.html
└── src/
    ├── main.tsx              # React 入口
    ├── App.tsx               # 根组件 + Router
    ├── pages/
    │   ├── Dashboard.tsx
    │   ├── Tools.tsx
    │   ├── Sync.tsx
    │   ├── Identity.tsx
    │   ├── Skills.tsx
    │   ├── Rules.tsx
    │   ├── Mcp.tsx
    │   └── Settings.tsx
    ├── components/
    │   ├── ui/               # shadcn/ui 组件
    │   ├── layout/
    │   │   ├── Sidebar.tsx
    │   │   └── AppLayout.tsx
    │   └── import/           # 导入向导组件（v2.0）
    ├── lib/
    │   ├── api.ts            # fetch 封装
    │   ├── queryClient.ts
    │   └── utils.ts
    └── types/
        └── api.ts            # API 响应类型
```

---

## 六、8 个核心页面

### 1. Dashboard 总览
- 顶部 4 个统计卡片（已安装工具数、Hub 文件总数、最近同步时间、Hub 健康度）
- 左下：工具状态列表
- 右下：最近同步结果摘要

### 2. 工具管理
- 5 个工具卡片网格
- 每张卡片：工具图标、安装状态 Badge、配置目录路径、启用开关

### 3. 同步中心
- 左侧：同步计划列表（工具筛选、dry-run 开关）
- 右侧：执行结果（成功/失败、同步数量、耗时）

### 4. 身份管理
- 左侧：文件列表（profile.md / profile.auto.md / communication-style.md / tech-stack.md）
- 右侧：Markdown 编辑器

### 5. 技能管理
- 技能卡片网格
- 每张卡片：技能名、简介、来源 Badge、编辑/删除操作

### 6. 规则管理
- 3 个 Tab（always / by-glob / by-project）
- 每个 Tab 下规则文件列表 + 编辑器

### 7. MCP 服务器
- 左侧：服务器列表（从 mcp.sources.json 解析）
- 右侧：JSON 编辑器

### 8. Hub 设置
- 表单形式
- 字段：版本、同步策略、备份设置、身份学习设置、技能市场

---

## 七、关键技术决策

1. **HTTP 框架选 Hono**：轻量（10KB）、TypeScript 原生、内置 Node.js 适配器
2. **前端独立 package.json**：避免主项目依赖膨胀
3. **端口默认 17521**：避开常见端口冲突，仅监听 127.0.0.1
4. **不做用户认证**：仅监听 127.0.0.1，本机访问无需认证
5. **首版不做 WebSocket**：用轮询 + 手动刷新
6. **首版不做技能市场**：仅本地技能管理

---

## 八、文件清单总览

### 新增文件

**后端**：
- `src/server/index.ts` — Hono 入口
- `src/server/middleware/error.ts` — 错误中间件
- `src/server/lib/hub-context.ts` — 上下文单例
- `src/server/routes/hub.ts`
- `src/server/routes/tools.ts`
- `src/server/routes/sync.ts`
- `src/server/routes/files.ts`
- `src/cli/commands/ui.ts` — UI 命令
- `src/core/hub-files.ts` — Hub 文件 CRUD 封装

**前端**（`web/` 目录）：
- 完整 Vite + React + shadcn/ui 项目
- 8 个页面 + 布局组件 + API 封装

### 修改文件

- `src/cli/index.ts` — 注册 `ui` 命令
- `src/core/config.ts` — 新增 `saveHubConfig()`
- `package.json` — 新增依赖 + 脚本