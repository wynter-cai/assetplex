# AgentHub 智能导入向导 — 实施计划

> **状态：🚧 开发中（即将开始）** | 最后更新：2026-08-09
>
> 本文档是**当前最优先执行的任务计划**，是 AI Agent 开发时的直接指引。
> 产品需求见 `assetplex-prd-v2-import-wizard.md`，开发准则见 `assetplex-constitution.md`。

---

> 基于 PRD v2.0 (`assetplex-prd-v2-import-wizard.md`) 的详细实施计划，分 5 个 Phase 执行。

---

## 一、当前状态分析

### 1.1 已有能力

| 模块 | 文件 | 能力 |
|---|---|---|
| 工具检测 | `src/core/adapters/*.ts` 的 `detect()` | 5 个工具检测逻辑已完善 |
| 反向导入 | `src/core/adapters/*.ts` 的 `import()` | 每个适配器已实现从工具读取单个文件 |
| 反向导入聚合 | `src/core/sync-engine.ts` 的 `reverseImport()` | 遍历适配器，调 `resolveHubItems()` 获取 (item,target) 映射，再调 `import()` |
| Hub 文件 CRUD | `src/core/hub-files.ts` | `listHubFiles()`, `readHubFile()`, `writeHubFile()`, `createHubFile()`, `deleteHubFile()` |
| API 端点 | `src/server/routes/sync.ts` | `GET /plan`, `POST /run`, `POST /reverse-import`, `GET /history` |
| 前端框架 | `web/` | React 18 + Vite + shadcn/ui + React Router + TanStack Query |
| 前端 API 层 | `web/src/lib/api.ts` | 已有 `reverseImport()`, `getTools()`, `getSyncPlan()` 等 |

### 1.2 现有 reverseImport 的局限

当前 `reverseImport()` 调用 `resolveHubItems()` 来获取文件列表，但 `resolveHubItems()` 的语义是 "Hub → 工具" 的**单向映射**，它只返回 `resolveHubItems()` 中预定义的路径。对于**完整扫描**工具目录的需求（如扫描 TRAE 的 `memory/` 下所有 .md 文件、Codex 的 `config.toml` 中 MCP 配置等），需要一个新方法 `scan()` 来主动发现工具目录下的**所有**可导入内容。

### 1.3 关键文件清单

```
assetplex/
├── src/
│   ├── core/
│   │   ├── types.ts              # 公共类型 → 新增扫描相关类型
│   │   ├── sync-engine.ts        # 同步引擎 → 增强 reverseImport + 新增 scanAll/executeImport
│   │   ├── hub-files.ts          # Hub 文件 CRUD → 复用（无需修改）
│   │   ├── config.ts             # 配置管理 → 复用
│   │   ├── adapters/
│   │   │   ├── base.ts           # 适配器基类 → 新增 scan() 抽象方法
│   │   │   ├── types.ts          # 适配器类型 → 复用
│   │   │   ├── registry.ts       # 适配器注册 → 复用
│   │   │   ├── trae-cn.ts        # → 实现 scan()
│   │   │   ├── claude-code.ts    # → 实现 scan()
│   │   │   ├── codex.ts          # → 实现 scan()
│   │   │   ├── workbuddy.ts      # → 实现 scan()
│   │   │   └── qoder.ts          # → 实现 scan()
│   │   ├── scanner.ts            # [新增] 扫描器核心
│   │   └── merger.ts             # [新增] 智能合并引擎
│   ├── server/
│   │   ├── index.ts              # HTTP 服务入口 → 复用
│   │   ├── lib/hub-context.ts    # Hub 上下文 → 复用
│   │   └── routes/
│   │       └── sync.ts           # 同步路由 → 新增 scan + execute-import 端点
│   └── utils/
│       ├── paths.ts              # 路径工具 → 复用
│       └── fs.ts                 # 文件系统工具 → 复用
├── web/
│   └── src/
│       ├── App.tsx               # 路由 → 添加 /import 路由
│       ├── components/
│       │   └── layout/
│       │       └── Sidebar.tsx   # 导航 → 添加"导入"导航项
│       ├── lib/
│       │   └── api.ts            # API 封装 → 新增 scan() / executeImport()
│       ├── types/
│       │   └── api.ts            # 前端类型 → 新增扫描相关类型
│       ├── pages/
│       │   └── Import.tsx        # [新增] 导入向导页
│       └── components/
│           └── import/           # [新增] 导入向导子组件
│               ├── ToolCard.tsx
│               ├── FileItem.tsx
│               ├── ConflictDialog.tsx
│               └── ProgressBar.tsx
```

---

## 二、新增类型定义

### 2.1 后端类型 (`src/core/types.ts` 新增)

```typescript
/** 扫描发现的文件类别 */
export type DiscoveredCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'preference';

/** 扫描发现的单个条目 */
export interface DiscoveredItem {
  /** 源文件绝对路径 */
  absolutePath: string;
  /** 相对路径（相对于工具配置目录） */
  relativePath: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（ISO 字符串） */
  modified: string;
  /** 文件类别 */
  category: DiscoveredCategory;
  /** 导入到 Hub 的目标路径，如 'identity/profile.md' */
  hubTargetPath: string;
  /** 冲突状态 */
  conflict: 'none' | 'exists' | 'differs';
  /** 若 Hub 已存在同名文件，其内容大小 */
  existingSize?: number;
  /** 所属工具 */
  tool: string;
}

/** 单个工具的扫描结果 */
export interface ToolInventory {
  toolName: string;
  displayName: string;
  installed: boolean;
  configDir: string;
  items: DiscoveredItem[];
}

/** 冲突解决策略 */
export type ConflictStrategy = 'merge' | 'overwrite' | 'skip';

/** 导入请求中的单个条目 */
export interface ImportItem {
  tool: string;
  absolutePath: string;
  hubTargetPath: string;
  category: DiscoveredCategory;
  conflict: 'none' | 'exists' | 'differs';
  /** 冲突解决策略（仅 conflict !== 'none' 时有效） */
  strategy?: ConflictStrategy;
}

/** 导入请求 */
export interface ImportRequest {
  items: ImportItem[];
}

/** 单个条目的导入结果 */
export interface ImportResultItem {
  tool: string;
  hubTargetPath: string;
  status: 'created' | 'merged' | 'overwritten' | 'skipped' | 'error';
  message?: string;
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  created: number;
  merged: number;
  overwritten: number;
  skipped: number;
  errors: number;
  items: ImportResultItem[];
}
```

### 2.2 前端类型 (`web/src/types/api.ts` 新增)

```typescript
export interface DiscoveredItem {
  absolutePath: string;
  relativePath: string;
  size: number;
  modified: string;
  category: 'identity' | 'skill' | 'rule' | 'mcp' | 'preference';
  hubTargetPath: string;
  conflict: 'none' | 'exists' | 'differs';
  existingSize?: number;
  tool: string;
}

export interface ToolInventory {
  toolName: string;
  displayName: string;
  installed: boolean;
  configDir: string;
  items: DiscoveredItem[];
}

export interface ImportItem {
  tool: string;
  absolutePath: string;
  hubTargetPath: string;
  category: string;
  conflict: 'none' | 'exists' | 'differs';
  strategy?: 'merge' | 'overwrite' | 'skip';
}

export interface ImportResult {
  success: boolean;
  created: number;
  merged: number;
  overwritten: number;
  skipped: number;
  errors: number;
  items: Array<{
    tool: string;
    hubTargetPath: string;
    status: 'created' | 'merged' | 'overwritten' | 'skipped' | 'error';
    message?: string;
  }>;
}
```

---

## 三、Phase A：Scanner 基础设施（后端）

### 3.1 修改 `src/core/adapters/base.ts`

**改动**：在 `ToolAdapter` 接口和 `BaseAdapter` 类中新增 `scan()` 方法。

```typescript
// ToolAdapter 接口新增：
scan(): Promise<DiscoveredItem[]>;

// BaseAdapter 默认实现（返回空数组）：
async scan(): Promise<DiscoveredItem[]> {
  return [];
}
```

### 3.2 各适配器实现 `scan()`

各适配器的 `scan()` 方法需要**主动遍历工具配置目录**，发现所有可导入文件，返回 `DiscoveredItem[]`。对于每个文件，需要计算 `hubTargetPath` 和 `conflict` 状态。

**TRAE CN** (`trae-cn.ts`)：
- 扫描 `~/.trae-cn/memory/` 下所有 .md 文件 → category: `identity`/`preference`
- 扫描 `~/.trae-cn/skills/` 子目录 → category: `skill`
- 扫描 `~/.trae-cn/rules/` 下所有文件 → category: `rule`
- 扫描 `~/.trae-cn/mcp.json` → category: `mcp`
- hubTargetPath 映射：`memory/user_profile.md` → `identity/profile.md`，其他文件保持相对路径

**Claude Code** (`claude-code.ts`)：
- 扫描 `~/.claude/CLAUDE.md` → category: `identity`（注意：CLAUDE.md 是聚合文件，扫描时需解析 `@import` 行找到实际源文件）
- 扫描 `~/.claude/skills/` 子目录 → category: `skill`
- 扫描 `~/.claude/rules/` 下所有文件 → category: `rule`
- 扫描 `~/.claude/commands/` 下所有文件 → category: `preference`（commands 类型）
- 扫描 `~/.claude/agents/` 下所有文件 → category: `preference`（agents 类型）
- 扫描 `~/.claude.json` 中 `mcpServers` 字段 → category: `mcp`

**Codex** (`codex.ts`)：
- 扫描 `~/.codex/AGENTS.md` → category: `identity`
- 扫描 `~/.codex/skills/` 子目录 → category: `skill`
- 扫描 `~/.codex/rules/` 下所有文件 → category: `rule`
- 解析 `~/.codex/config.toml` 中 `[mcp_servers.*]` 表 → category: `mcp`

**WorkBuddy** (`workbuddy.ts`)：
- 扫描 `~/.workbuddy/`（或 `~/.codebuddy/`）下 `skills/` 子目录 → category: `skill`
- 扫描 `rules/` 下所有文件 → category: `rule`
- 扫描 `.mcp.json` 和 `mcp.json` → category: `mcp`
- 扫描 `models.json` → category: `preference`

**Qoder** (`qoder.ts`)：
- 扫描项目中 `.qoder/skills/` → category: `skill`
- 扫描 `.qoder/rules/` → category: `rule`
- 扫描项目根 `AGENTS.md` → category: `identity`
- 注意：Qoder 是项目级工具，需从 `hub.toml` 中读取 `projectTargets` 来确定扫描范围

**冲突检测逻辑**（每个适配器共享）：
- 对于每个发现的文件，调用 `hubPath(hubTargetPath)` 检查 Hub 是否已有同名文件
- 若不存在 → `conflict: 'none'`
- 若存在且内容相同（通过 `readFileSync` 对比）→ `conflict: 'exists'`
- 若存在且内容不同 → `conflict: 'differs'`，附带 `existingSize`

**实现要点**：
- 使用 `readdirSync({ recursive: true })` 遍历目录（Node 18+ 支持）
- 对于目录类（skills/、rules/），每个子目录/文件都作为独立条目
- 对于单个文件（MCP 配置），只返回一个条目
- 处理文件不存在的情况（优雅跳过）

### 3.3 新增 `src/core/scanner.ts`

**职责**：协调所有适配器的 `scan()` 方法，返回统一的 `ToolInventory[]`。

```typescript
import type { DiscoveredItem, ToolInventory } from './types.js';
import type { ToolAdapter } from './adapters/base.js';
import { getAllAdapters } from './adapters/registry.js';

export async function scanAll(): Promise<ToolInventory[]> {
  const adapters = getAllAdapters();
  const results: ToolInventory[] = [];

  for (const adapter of adapters) {
    try {
      const status = await adapter.detect();
      const items: DiscoveredItem[] = status.installed || adapter.name === 'qoder'
        ? await adapter.scan()
        : [];

      results.push({
        toolName: adapter.name,
        displayName: adapter.displayName,
        installed: status.installed,
        configDir: status.configDir,
        items,
      });
    } catch (err) {
      results.push({
        toolName: adapter.name,
        displayName: adapter.displayName,
        installed: false,
        configDir: '',
        items: [],
      });
    }
  }

  return results;
}
```

### 3.4 新增 `src/core/merger.ts`

**职责**：实现智能合并策略，按文件类型处理冲突。

```typescript
// 核心函数签名
export function mergeFile(
  hubTargetPath: string,
  newContent: string,
  strategy: 'merge' | 'overwrite' | 'skip'
): { content: string; action: 'merged' | 'overwritten' | 'skipped' };
```

**合并策略**：

| 文件类型 | 策略 | 实现 |
|---|---|---|
| `.md` | merge | Hub 内容在前 + `---` 分隔线 + 注释标注来源 + 工具内容在后 |
| `.json`（MCP 配置） | merge | 深度合并 `mcpServers` 对象，同 key 以 Hub 为准 |
| `.toml` | merge | 先转 JSON，按 JSON 逻辑合并，再转回 TOML |
| 目录内文件 | merge | 文件级合并：Hub 已有文件跳过，新文件复制 |

**Markdown 合并实现**：

```typescript
export function mergeMarkdown(existingContent: string, newContent: string): string {
  const sourceLabel = `<!-- 以下内容从工具导入，来源: ${source} -->`;
  return [
    existingContent.trimEnd(),
    '',
    '---',
    '',
    sourceLabel,
    '',
    newContent.trimStart(),
  ].join('\n');
}
```

**JSON 合并实现**：

```typescript
export function mergeMcpJson(existingContent: string, newContent: string): string {
  const existing = JSON.parse(existingContent);
  const incoming = JSON.parse(newContent);
  
  // 深度合并 mcpServers
  if (existing.mcpServers && incoming.mcpServers) {
    existing.mcpServers = { ...incoming.mcpServers, ...existing.mcpServers };
  } else if (incoming.mcpServers) {
    existing.mcpServers = incoming.mcpServers;
  }
  
  return JSON.stringify(existing, null, 2);
}
```

**TOML 合并**：复用 `src/transforms/json-toml.ts` 中的 `mcpTomlToJson()` 和 `mcpJsonToToml()`。

---

## 四、Phase B：增强 reverseImport + API

### 4.1 修改 `src/core/sync-engine.ts`

**新增方法**：

```typescript
/**
 * 扫描所有工具的可导入内容（替代旧 reverseImport 的用户可见部分）
 */
async scanAll(): Promise<ToolInventory[]> {
  return scanAll(); // 委托给 scanner.ts
}

/**
 * 执行导入：接收用户选择的条目列表，写入 Hub
 */
async executeImport(request: ImportRequest): Promise<ImportResult> {
  const result: ImportResult = {
    success: true,
    created: 0,
    merged: 0,
    overwritten: 0,
    skipped: 0,
    errors: 0,
    items: [],
  };

  for (const item of request.items) {
    try {
      const newContent = readFileSync(item.absolutePath, 'utf-8');
      const hubFullPath = hubPath(item.hubTargetPath);

      if (item.conflict === 'none' || item.strategy === 'overwrite') {
        // 新文件或覆盖：直接写入
        writeHubFile(item.hubTargetPath, newContent);
        result.items.push({
          tool: item.tool,
          hubTargetPath: item.hubTargetPath,
          status: item.conflict === 'none' ? 'created' : 'overwritten',
        });
        if (item.conflict === 'none') result.created++;
        else result.overwritten++;
      } else if (item.strategy === 'merge') {
        // 智能合并
        const existingContent = readFileSync(hubFullPath, 'utf-8');
        const merged = mergeFile(hubFullPath, newContent, 'merge');
        writeHubFile(item.hubTargetPath, merged.content);
        result.items.push({
          tool: item.tool,
          hubTargetPath: item.hubTargetPath,
          status: 'merged',
        });
        result.merged++;
      } else {
        // 跳过
        result.items.push({
          tool: item.tool,
          hubTargetPath: item.hubTargetPath,
          status: 'skipped',
        });
        result.skipped++;
      }
    } catch (err) {
      result.items.push({
        tool: item.tool,
        hubTargetPath: item.hubTargetPath,
        status: 'error',
        message: (err as Error).message,
      });
      result.errors++;
      result.success = false;
    }
  }

  return result;
}
```

### 4.2 修改 `src/server/routes/sync.ts`

**新增端点**：

```typescript
/** 扫描所有工具的可导入内容 */
syncRoutes.get('/scan', async (c) => {
  const engine = hubContext.getEngine();
  const inventories = await engine.scanAll();
  return c.json({ inventories });
});

/** 执行导入 */
syncRoutes.post('/execute-import', async (c) => {
  const body = await c.req.json<ImportRequest>();
  if (!body.items || !Array.isArray(body.items)) {
    return c.json({ error: '缺少 items 字段' }, 400);
  }
  const engine = hubContext.getEngine();
  const result = await engine.executeImport(body);
  return c.json(result);
});
```

### 4.3 修改 `web/src/lib/api.ts`

**新增方法**：

```typescript
scan: () =>
  request<{ inventories: ToolInventory[] }>('/sync/scan'),

executeImport: (items: ImportItem[]) =>
  request<ImportResult>('/sync/execute-import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }),
```

---

## 五、Phase C：导入向导前端

### 5.1 修改 `web/src/App.tsx`

添加 `/import` 路由：

```tsx
import Import from './pages/Import';

// 在 Routes 内添加：
<Route path="/import" element={<Import />} />
```

### 5.2 修改 `web/src/components/layout/Sidebar.tsx`

在导航项数组中添加（放在"同步"之后）：

```tsx
import { Download } from 'lucide-react';

{ to: '/import', label: '导入', icon: Download },
```

### 5.3 新增 `web/src/pages/Import.tsx`

**页面结构**：4 步向导，每步一个独立区域。

**状态管理**（使用 React useState）：

```typescript
interface ImportState {
  step: 1 | 2 | 3 | 4;
  inventories: ToolInventory[];        // Step 1 结果
  selectedItems: Set<string>;          // Step 2 用户勾选（key: "tool:absolutePath"）
  conflictResolutions: Map<string, ConflictStrategy>; // Step 3 冲突处理
  importResult: ImportResult | null;   // Step 4 结果
  loading: boolean;
}
```

**Step 1 — 检测工具**：
- 进入页面自动调用 `api.scan()`（也可点"重新检测"）
- 展示已安装/未安装的工具列表
- 每行显示工具图标、名称、安装状态、配置目录
- "下一步"按钮

**Step 2 — 发现内容**：
- 按工具分组展示发现的文件
- 每个文件显示：图标（按类别）、路径、大小、冲突状态标签
- 支持全选/按分类选/按工具选
- 冲突项用黄色/橙色标签标注
- "上一步" / "下一步"按钮

**Step 3 — 确认导入**：
- 仅展示有冲突的项（`conflict: 'differs'`）
- 每个冲突项显示：Hub 已有大小 vs 工具文件大小
- 提供三个选项：智能合并 / 覆盖 / 跳过
- 默认选中"智能合并"
- 无冲突项时自动跳过此步骤
- "上一步" / "开始导入"按钮

**Step 4 — 导入完成**：
- 调用 `api.executeImport(items)`
- 实时显示进度（通过 `ProgressBar` 组件）
- 完成后展示汇总：新增 X 个 / 合并 X 个 / 跳过 X 个 / 错误 X 个
- 引导用户："运行 agenthub sync 同步到其他工具"
- 链接按钮："前往同步中心" / "返回首页"

### 5.4 新增子组件

**`web/src/components/import/ToolCard.tsx`**：
- 展示单个工具的扫描状态
- Props: `tool: ToolInventory`, `selected: boolean`, `onToggle: () => void`
- 显示：工具名、安装状态、发现文件数、勾选框

**`web/src/components/import/FileItem.tsx`**：
- 展示单个发现文件
- Props: `item: DiscoveredItem`, `selected: boolean`, `onToggle: () => void`
- 显示：类别图标、路径、大小、冲突状态标签（绿色"新" / 黄色"冲突" / 灰色"已存在"）

**`web/src/components/import/ConflictDialog.tsx`**：
- 冲突处理行组件（非弹窗，内联展示）
- Props: `item: DiscoveredItem`, `strategy: ConflictStrategy`, `onChange: (s: ConflictStrategy) => void`
- 显示：Hub 路径、Hub 已有大小、工具文件大小
- 三个圆角按钮切换：智能合并 / 覆盖 / 跳过

**`web/src/components/import/ProgressBar.tsx`**：
- 导入进度条
- Props: `current: number`, `total: number`
- 显示：百分比 + 进度条 + 当前/总数

---

## 六、Phase D：智能合并实现

### 6.1 完善 `src/core/merger.ts`

按优先级实现：

1. **Markdown 合并** — 最常用场景（identity/*.md, rules/*.md, preferences/*.md）
2. **JSON 合并** — MCP 配置合并（mcp.json, .claude.json）
3. **TOML 合并** — Codex 的 config.toml
4. **目录文件合并** — skills/、rules/ 子文件

**辅助函数**：

```typescript
/** 判断文件类型 */
function getFileType(filepath: string): 'md' | 'json' | 'toml' | 'other' {
  if (filepath.endsWith('.md')) return 'md';
  if (filepath.endsWith('.json')) return 'json';
  if (filepath.endsWith('.toml')) return 'toml';
  return 'other';
}

/** 按类型分发合并 */
export function mergeFile(
  hubTargetPath: string,
  newContent: string,
  existingContent: string,
  source: string,
): { content: string; action: 'merged' } {
  const type = getFileType(hubTargetPath);
  
  switch (type) {
    case 'md':
      return { content: mergeMarkdown(existingContent, newContent, source), action: 'merged' };
    case 'json':
      return { content: mergeMcpJson(existingContent, newContent), action: 'merged' };
    case 'toml':
      return { content: mergeToml(existingContent, newContent), action: 'merged' };
    default:
      // 未知类型：Hub 内容在前，工具内容在后
      return { content: mergeMarkdown(existingContent, newContent, source), action: 'merged' };
  }
}
```

---

## 七、Phase E：集成测试 + 端到端验证

### 7.1 后端测试

- 手动测试 `GET /api/sync/scan` 返回正确结果
- 手动测试 `POST /api/sync/execute-import` 写入 Hub 正确
- 验证冲突检测逻辑正确

### 7.2 前端测试

- 构建前端：`cd web && pnpm build`
- 启动服务：`node dist/index.js ui`
- 浏览器访问 `http://127.0.0.1:17521/import`
- 走完完整导入流程：
  1. 检测工具 → TRAE CN 显示已安装
  2. 扫描内容 → 显示 memory/、skills/、rules/、mcp.json 等
  3. 勾选文件 → 确认冲突处理策略
  4. 执行导入 → 查看结果
- 验证导入后 Hub 文件内容正确

### 7.3 回归测试

- 确保现有 Dashboard、Tools、Sync 等页面功能不受影响
- 确保 `agenthub sync` CLI 命令仍正常工作

---

## 八、风险与注意事项

| 风险 | 缓解措施 |
|---|---|
| 扫描大目录（如 skills/ 有大量文件）可能较慢 | 扫描是同步操作，前端显示 loading 状态即可 |
| 工具运行时文件被占用（Windows EACCES/EBUSY） | `readFileSync` 异常时 catch 并跳过该文件，记录警告 |
| Qoder 项目扫描需要 projectTargets 配置 | scan() 中读取 hub.toml 配置，无配置时返回空数组 |
| 前端构建产物与后端 API 不同步 | 同时修改 `web/src/types/api.ts` 和后端 `types.ts` 保持类型一致 |

---

## 九、文件变更总览

### 新增文件（7 个）
- `src/core/scanner.ts`
- `src/core/merger.ts`
- `web/src/pages/Import.tsx`
- `web/src/components/import/ToolCard.tsx`
- `web/src/components/import/FileItem.tsx`
- `web/src/components/import/ConflictDialog.tsx`
- `web/src/components/import/ProgressBar.tsx`

### 修改文件（13 个）
- `src/core/types.ts` — 新增 DiscoveredItem、ToolInventory、ImportRequest/Result 等类型
- `src/core/adapters/base.ts` — 新增 `scan()` 抽象方法
- `src/core/adapters/trae-cn.ts` — 实现 `scan()`
- `src/core/adapters/claude-code.ts` — 实现 `scan()`
- `src/core/adapters/codex.ts` — 实现 `scan()`
- `src/core/adapters/workbuddy.ts` — 实现 `scan()`
- `src/core/adapters/qoder.ts` — 实现 `scan()`
- `src/core/sync-engine.ts` — 新增 `scanAll()` + `executeImport()`
- `src/server/routes/sync.ts` — 新增 `GET /scan` + `POST /execute-import`
- `web/src/App.tsx` — 添加 `/import` 路由
- `web/src/components/layout/Sidebar.tsx` — 添加"导入"导航项
- `web/src/lib/api.ts` — 新增 `scan()` + `executeImport()`
- `web/src/types/api.ts` — 新增扫描相关前端类型