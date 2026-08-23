# AgentHub Stage 2 — 同步引擎 MVP 实施方案

> **状态：✅ 已完成** | 完成日期：2026-08-09
>
> 本文档是**历史记录**（架构决策记录 ADR），描述已实现的同步引擎设计。
> **不要**根据本文档重复实现功能，代码已在 `src/core/` 和 `src/transforms/` 中。
> 后续开发请参考 `assetplex-constitution.md` 和当前活跃的实施计划。

---

> 在 Stage 1（init/doctor/5 适配器骨架）基础上，实现核心同步引擎，让 Hub 内容真正流向 5 个工具。

---

## 一、Summary 概要

**目标**：实现 AgentHub 的核心价值闭环 ——「Hub 一处编辑，5 个工具同步生效」。

**范围（核心 sync MVP）**：
- ✅ Stage 1 runtime 验证（前置必做，确认 init/doctor 真的能跑）
- ✅ 跨平台 symlink 工具（Windows junction 优先 + fallback 到 copy）
- ✅ JSON↔TOML 转换器（Codex 专用）
- ✅ `${VAR}` 环境变量插值（WorkBuddy 专用）
- ✅ 5 个适配器的 `apply` + `import` 实现
- ✅ `agenthub sync` 命令（含 `--tool` / `--dry-run` / `--json`）
- ✅ 基础单元测试 + 集成测试（80%+ 覆盖率）

**明确不做（留到 Stage 2.5+）**：
- ❌ `agenthub backup` / `agenthub restore`
- ❌ `agenthub diff`（漂移检测）
- ❌ `agenthub doctor --fix`（自动修复）
- ❌ Two-phase 同步（先删旧链接再建新链接）
- ❌ `--watch` 监听模式（chokidar）

---

## 二、实施阶段切片（6 个 Phase）

```
Phase A: Stage 1 runtime 验证          ── 先确认现有代码真的能跑
   ↓
Phase B: 基础工具层（fs + 3 transforms） ── 给适配器提供弹药
   ↓
Phase C: 5 适配器 apply/import 实现     ── 让每个工具知道怎么 sync
   ↓
Phase D: sync-engine + sync 命令       ── 串联起来
   ↓
Phase E: 测试套件                       ── 保证 80%+ 覆盖率
   ↓
Phase F: 端到端本机验证                  ── 真实跑通 TRAE CN 同步
```

---

## 三、Phase B：基础工具层

### `src/utils/fs.ts`（新增）

跨平台文件系统工具集：
- `ensureDir(path)`：确保目录存在（递归创建）
- `isSymlink(path)`：判断路径是否为符号链接（Windows 上 junction 也算）
- `readSymlinkTarget(path)`：读取符号链接目标
- `safeRemove(path)`：安全删除（符号链接只删链接不删源）
- `copyRecursive(src, dest)`：递归复制文件或目录
- `isSamePath(a, b)`：判断两个路径是否指向同一文件

### `src/transforms/symlink.ts`（新增）

跨平台符号链接创建器：
```typescript
// 创建跨平台符号链接（自动 fallback）
// 优先级：symlink > junction (Windows) > copy
async function createSymlink(
  target: string,   // 源文件/目录（Hub 内的）
  linkPath: string, // 链接路径（工具目录内的）
  options?: { isDirectory?: boolean; force?: boolean }
): Promise<SymlinkResult>;
```

### `src/transforms/json-toml.ts`（新增）

JSON ↔ TOML 互转器：
- `jsonToToml(jsonStr)`：JSON 字符串 → TOML 字符串
- `tomlToJsonObj(tomlStr)`：TOML 字符串 → JSON 对象
- `mcpJsonToToml(jsonStr)`：MCP 配置的 JSON → TOML 转换
- `mcpTomlToJson(tomlStr)`：Codex TOML → Claude JSON

### `src/transforms/env-interpolation.ts`（新增）

环境变量插值器（`${VAR}` → 实际值）：
- `interpolateEnv(input)`：把 `${VAR}` 替换为 `process.env.VAR`
- `desinterpolateEnv(input, envMap)`：反向去插值

---

## 四、Phase C：5 适配器 apply/import 实现

### 修改 `src/core/adapters/base.ts`

模板方法模式：`apply()` 根据 `SyncTarget.strategy` 派发到子类实现：
- `symlink` → 调用 `createSymlink()`
- `copy` → 调用 `copyRecursive()`
- `native-import` → 调用子类的 `applyNativeImport()`
- `per-project` → 调用子类的 `applyPerProject()`

### 各适配器要点

| 适配器 | 关键实现 |
|---|---|
| **trae-cn** | symlink 策略：profile.md → user_profile.md、skills/、rules/、mcp.json |
| **claude-code** | native-import 策略：生成 CLAUDE.md 聚合 @import；MCP 写入 `~/.claude.json` |
| **codex** | copy 策略：AGENTS.md 内容合并；config.toml JSON→TOML 转换 |
| **workbuddy** | copy 策略：.mcp.json 做 `${VAR}` 插值 |
| **qoder** | per-project 策略：按项目分发 .qoder/ 目录 |

---

## 五、Phase D：Sync 引擎 + CLI 命令

### `src/core/sync-engine.ts`（新增）

```typescript
export class SyncEngine {
  constructor(private hubConfig: HubConfig) {}

  /** 计算同步计划（不执行） */
  async plan(options: SyncOptions): Promise<SyncPlan[]>;

  /** 执行同步 */
  async run(options: SyncOptions): Promise<SyncResult[]>;

  /** 反向导入（从工具回到 Hub） */
  async reverseImport(options: SyncOptions): Promise<SyncResult[]>;
}
```

**核心算法**：
1. `plan()`：遍历 enabled 适配器 → 跳过未安装工具 → 调用 `resolveHubItems()` → 检查每个 target 状态
2. `run()`：调用 `plan()` → 遍历执行 `adapter.apply()`
3. `--dry-run`：只调 `plan()`，不执行
4. `--json`：JSON 输出

### `src/cli/commands/sync.ts`（新增）

`agenthub sync` 命令的 CLI 包装，支持 `--tool` / `--dry-run` / `--json`。

---

## 六、测试策略

### 目录结构

```
tests/
├── unit/
│   ├── transforms/
│   │   ├── symlink.test.ts
│   │   ├── json-toml.test.ts
│   │   └── env-interpolation.test.ts
│   ├── utils/
│   │   └── fs.test.ts
│   ├── core/
│   │   └── sync-engine.test.ts
│   └── adapters/
│       ├── trae-cn.test.ts
│       ├── claude-code.test.ts
│       └── codex.test.ts
└── integration/
    └── sync-trae-cn.test.ts
```

### 覆盖率目标

80%+ lines/functions，分支覆盖率 75%。

---

## 七、关键决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| Stage 2 范围 | 核心 sync MVP | 用户已选；backup/restore/diff 留到 Stage 2.5 |
| apply/import 接口 | 从可选改为必需 | sync 引擎调用时无需类型守卫，类型安全 |
| 默认 apply 实现 | 模板方法模式 | 子类只需 override 特殊策略 |
| symlink fallback 顺序 | symlink → junction → copy | 跨平台无感 |
| HubItem ↔ SyncTarget 关联 | 新增 `resolveHubItems()` 方法 | 比 `targets()` 返回纯路径更完整 |

---

## 八、文件变更总览

### 新增文件（10 个）
- `src/utils/fs.ts`
- `src/transforms/symlink.ts`
- `src/transforms/json-toml.ts`
- `src/transforms/env-interpolation.ts`
- `src/core/sync-engine.ts`
- `src/cli/commands/sync.ts`
- `tests/unit/transforms/symlink.test.ts`
- `tests/unit/transforms/json-toml.test.ts`
- `tests/unit/core/sync-engine.test.ts`
- `tests/integration/sync-trae-cn.test.ts`

### 修改文件（8 个）
- `src/core/adapters/base.ts` — apply/import/transform 从可选改为必需 + 默认实现
- `src/core/adapters/trae-cn.ts` — 实现 resolveHubItems
- `src/core/adapters/claude-code.ts` — 实现 applyNativeImport
- `src/core/adapters/codex.ts` — 实现 apply 含 JSON→TOML
- `src/core/adapters/workbuddy.ts` — 实现 apply 含 ${VAR} 插值
- `src/core/adapters/qoder.ts` — 实现 applyPerProject
- `src/cli/index.ts` — sync 占位换真实命令
- `src/core/types.ts` — 扩展 SyncPlan 类型