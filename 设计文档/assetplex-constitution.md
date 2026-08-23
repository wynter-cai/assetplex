# AgentHub 项目宪法 (Constitution)

> **版本**: 1.0 | **生效**: 2026-08-09 | **最后修订**: 2026-08-09
>
> 本文档是 AgentHub 项目的最高开发准则。所有代码、PR、AI Agent 产出必须遵守本文档。
> 参考：GitHub Spec Kit Constitution 模式 + Superpowers TDD 方法论 + SDD 最佳实践。

---

## 文档导航（AI Agent 必读）

所有文档在 `设计文档/` 目录下。**阅读顺序**：

| 顺序 | 文档 | 状态 | 作用 | 何时读 |
|---|---|---|---|---|
| **1** | `assetplex-constitution.md`（本文件） | 🟢 始终有效 | 开发铁律、技术栈、代码风格、工作流 | **每次动手前必读** |
| **2** | `assetplex-import-wizard-plan.md` | 🚧 开发中 | 当前任务实施计划（Phase 分解、文件清单、验收标准） | 写功能代码时直接参考 |
| **3** | `assetplex-prd-v2-import-wizard.md` | 🚧 开发中 | 当前功能产品需求（为什么做、做什么） | 需要理解产品意图时读 |
| **4** | `assetplex-design-plan.md` | 🟢 活跃维护 | 项目全局架构、竞品对比、模块划分、路线图 | 理解整体设计时读 |
| (参考) | `assetplex-stage2-sync-mvp.md` | ✅ 已完成 | 同步引擎历史设计（ADR） | 需要了解已有架构决策时读 |
| (参考) | `assetplex-web-ui-plan.md` | ✅ 已完成 | Web UI 历史设计（ADR） | 需要了解前端架构决策时读 |

**规则**：
- AI Agent 执行任务时，MUST 先读本文档（宪法），再读当前活跃的实施计划
- 标记 ✅ 已完成 的文档是**历史记录**，不要根据它们重复实现已有功能
- 代码本身是最终真相，文档与代码不一致时以代码为准，并更新文档

---

## 第一部分：核心原则 (Core Principles)

> **规则**：以下 6 条原则均为 MUST（必须），不是 SHOULD（建议）。
> **验收标准**：PR review 时每条原则必须能 yes/no 判断是否违反。违反任何一条的 PR 不予合并。

### 原则 I：Spec-First（规格先行）

**MUST**：在写任何实现代码之前，必须先有人类批准的 spec/plan。

- 新功能：必须先有 PRD 或实施计划文档（在 `设计文档/` 下），明确 what（做什么）和 why（为什么做）
- Bug 修复：必须先有 bug 描述和复现步骤
- 重构：必须说明重构范围和目标
- AI Agent 执行任务时，**MUST 先读取相关 spec 文件再动手写代码**
- 禁止"边想边写"（vibe coding）——那是原型阶段的事，不是工程阶段的事

**验收**：PR 描述中 MUST 引用对应的 spec/plan 文档或 issue。

### 原则 II：Test-First（测试先行，Iron Law）

**MUST**：对 core/ 和 transforms/ 下的核心模块，强制执行 RED-GREEN-REFACTOR 循环：

1. **RED**：先写一个会失败的测试，运行确认失败（失败消息必须清晰说明缺什么）
2. **GREEN**：写**刚好让测试通过的最少代码**。不是完美代码，不是完整代码，是最少代码
3. **REFACTOR**：清理代码（改名字、提取重复、简化逻辑），同时保持所有测试绿色

**MUST NOT**：
- 禁止先写实现再补测试（那是"测试事后验证"，不是 TDD）
- 禁止写"必然通过的测试"（测试必须先失败）
- 禁止为了通过测试而修改测试本身（除非测试本身有 bug）

**豁免范围**：CLI 命令层（`cli/`）、UI 组件（`web/src/components/`）、HTTP 路由层（`server/routes/`）——这些层可在核心逻辑测试通过后补集成测试，但核心逻辑 MUST 遵守 TDD。

**验收**：每个新功能 PR MUST 包含对应的测试文件，且测试在 CI 中通过。

### 原则 III：Single Responsibility & Decoupling（单一职责与解耦）

**MUST**：

- 每个文件只做一件事，不超过 **300 行**
- 每个函数只做一件事，不超过 **50 行**（工具函数除外）
- 模块依赖 MUST 单向流动：`cli → core → utils`，`server → core → utils`
- `core/` MUST NOT import `cli/` 或 `server/`
- `utils/` 和 `transforms/` MUST NOT depend on `core/`
- 适配器（`core/adapters/`）MUST 相互独立，新增适配器只需要：新增文件 + 在 registry 注册，不修改 core 其他文件

**MUST NOT**：
- 禁止循环依赖（A imports B, B imports A）
- 禁止在工具函数中写业务逻辑
- 禁止在 HTTP 路由中直接操作文件系统（必须通过 core 层）

**验收**：`tsc --noEmit` 无循环依赖错误；新增适配器不需要修改 core/ 下已有文件。

### 原则 IV：Minimal Implementation（最小实现，YAGNI）

**MUST**：

- 只实现当前 spec 明确要求的功能，不预支未来需求（You Aren't Gonna Need It）
- 选**最简单的能工作的方案**，不选"更优雅但更复杂"的方案
- 当有两个方案时，选代码量更少、依赖更少、更容易理解的那个
- 遇到不确定的需求，先问人，不要自己猜

**MUST NOT**：

- 禁止"先写个通用框架以后用"——等到第二次需要时再抽象（Rule of Three）
- 禁止引入不必要的第三方依赖（能用 Node.js 内置模块就用内置的）
- 禁止写"防御性代码"来处理 spec 中没有提到的情况

**验收**：每个新增功能的代码量与 spec 描述的复杂度成比例；Code review 时能解释每一行代码的必要性。

### 原则 V：Type Safety（类型安全）

**MUST**：

- TypeScript strict 模式常开（已在 tsconfig.json 中启用）
- 所有 public 函数 MUST 有显式参数类型和返回类型
- 所有 interface/type MUST 在 `types.ts` 或模块内集中定义
- 跨模块数据传递 MUST 通过显式类型，不用匿名对象

**MUST NOT**：

- **禁止 `any` 类型**。无法确定类型时用 `unknown` + 类型守卫
- **禁止 `as` 类型断言**，除了 `(err as Error).message` 这种标准错误处理模式
- **禁止非空断言 `!`**，必须显式检查 null/undefined
- 禁止用 `@ts-ignore` 或 `@ts-expect-error` 压制类型错误（除非有注释说明原因）

**验收**：`pnpm typecheck` MUST 通过，零类型错误。

### 原则 VI：Verification Before Completion（完成前验证）

一个任务只有在以下**全部**通过时才算"完成"：

1. ✅ **测试通过**：`pnpm test` 全部绿色
2. ✅ **类型检查**：`pnpm typecheck` 零错误
3. ✅ **Lint 检查**：`pnpm lint` 零错误
4. ✅ **构建成功**：`pnpm build` 成功产出 dist/
5. ✅ **手动验证**：核心功能在本机实际运行过（不仅靠单元测试）
6. ✅ **不破坏现有功能**：现有测试全部通过，没有因为新代码导致的回归

**验收**：PR 中 MUST 包含上述检查的结果或命令输出截图。

---

## 第二部分：技术约束 (Technical Constraints)

> 本部分是项目级别的技术选型决策。AI Agent MUST 在这些约束内工作，不要自行更换技术栈。

### 运行时与语言

| 维度 | 选择 | 说明 |
|---|---|---|
| 语言 | TypeScript 5.6 | strict 模式 |
| 运行时 | Node.js >= 18 | ESM modules |
| 模块系统 | ESNext | `"type": "module"` |
| 导入后缀 | `.js` | ESM 规范强制 |
| 配置格式 | TOML + Zod | hub.toml 用 @iarna/toml 解析 + zod 校验 |

### 后端技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| CLI 框架 | Commander.js | 命令行参数解析 |
| HTTP 框架 | Hono | Web UI 后端 API |
| 文件系统 | Node.js `node:fs` | 禁止引入 fs-extra 等替代库 |
| 日志 | 自实现 logger (chalk) | 不引入 winston/pino |
| 构建工具 | tsup | 输出 ESM + d.ts |

### 前端技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 框架 | React 18 | 函数组件 + Hooks |
| 构建 | Vite | 前端打包 |
| UI 组件 | shadcn/ui + Tailwind CSS | 组件库 |
| 路由 | React Router v6 | 客户端路由 |
| 数据获取 | TanStack Query (React Query) | 服务端状态管理 |
| HTTP 客户端 | 原生 fetch | 封装在 `web/src/lib/api.ts` |

### 测试栈

| 层 | 技术 |
|---|---|
| 测试框架 | Vitest |
| 断言库 | Vitest 内置 (expect) |
| Mock | Vitest 内置 (vi.mock) |
| 覆盖率目标 | core/ ≥ 80%, transforms/ ≥ 90%, utils/ ≥ 90% |

### 跨平台约束

| 约束 | 处理方式 |
|---|---|
| Windows symlink 权限 | 三级降级：symlink → junction → copy（已实现） |
| Windows 文件锁/删除延迟 | retry + busy-wait（已实现） |
| 路径分隔符 | 始终用 `node:path` 的 `resolve/join`，不硬编码 `/` 或 `\` |
| 换行符 | 写文件时不强制，Node.js 默认处理 |
| 环境变量大小写 | Windows 不区分大小写，访问时统一小写 |

### 禁止引入的依赖

- ❌ Lodash / Underscore（用原生 ES 方法）
- ❌ Express / Koa / Fastify（用 Hono）
- ❌ fs-extra（用 node:fs + 自封装 utils/fs.ts）
- ❌ Axios（用原生 fetch）
- ❌ Moment.js（用原生 Date 或 Intl）
- ❌ class-validator / joi（用 Zod，已在依赖中）
- ❌ 任何 ORM（本项目不需要数据库）

---

## 第三部分：开发工作流 (Development Workflow)

### Feature 开发流程（SDD 模式）

```
1. SPECIFY（规格定义）
   - 写 spec/plan 文档 → 人类 review → 批准
   - 产出：设计文档/*.md

2. PLAN（任务拆解）
   - 将 spec 拆成可独立验证的小任务
   - 每个任务：明确输入、输出、涉及文件、验证方式
   - 产出：todo list（在 TodoWrite 中管理）

3. TASKS（逐任务执行）
   对每个任务：
   a. 写测试 → RED（确认测试失败）
   b. 写最少代码 → GREEN（确认测试通过）
   c. 重构 → REFACTOR（保持测试绿色）
   d. 标记任务完成

4. VERIFY（整体验证）
   - pnpm test + typecheck + lint + build 全过
   - 手动运行验证核心流程
   - 不破坏现有功能

5. COMMIT（提交）
   - commit message 遵循格式（见下文）
   - 每个 commit 是一个逻辑完整的变更
```

### Bug 修复流程

```
1. REPRODUCE（复现）
   - 写一个会失败的测试来复现 bug
   
2. FIX（修复）
   - 写最少代码让测试通过
   
3. REGRESSION（防回归）
   - 确认现有测试仍然全部通过
   - 考虑是否需要添加额外边界测试
```

### AI Agent 执行规范

当 AI Coding Agent（Trae / Claude Code / Codex 等）执行任务时，MUST 遵守：

1. **先读 spec 再写代码**：执行前先读取相关设计文档和目标文件
2. **一次只做一个任务**：不要同时修改不相关的文件
3. **改完一个文件就验证**：不要一口气改 10 个文件再一起测试
4. **遇到不确定的地方停下来问**：宁可多问一句，不要猜错了方向
5. **遵守完成验证清单**：每完成一个任务都要过原则 VI 的 6 项检查
6. **不要自作主张加功能**：spec 里没写的不要做

---

## 第四部分：代码风格规范 (Code Style)

### 命名规范

| 类型 | 格式 | 示例 |
|---|---|---|
| 文件名 | kebab-case | `sync-engine.ts`, `json-toml.ts` |
| 目录名 | kebab-case | `adapters/`, `transforms/` |
| React 组件 | PascalCase | `Import.tsx`, `ToolCard.tsx` |
| 类名 | PascalCase | `SyncEngine`, `BaseAdapter` |
| 函数/变量 | camelCase | `loadHubConfig()`, `hubRoot` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY`, `DEFAULT_PORT` |
| 类型/接口 | PascalCase，无 I 前缀 | `HubItem`, `ToolStatus`（❌ `IHubItem`） |
| 私有方法 | camelCase，无下划线前缀 | `private detectVersion()`（❌ `_detectVersion`） |
| 布尔变量/函数 | is/has/should/can 前缀 | `isSymlink()`, `hasSignature` |

### 文件组织

```
src/
├── cli/              # CLI 层：参数解析 + 用户交互（不写业务逻辑）
│   ├── index.ts      # Commander 入口
│   └── commands/     # 每个子命令一个文件
├── core/             # 核心业务逻辑
│   ├── adapters/     # 工具适配器（每个工具一个文件）
│   │   ├── base.ts   # 适配器基类
│   │   ├── registry.ts
│   │   └── *.ts      # 具体适配器
│   ├── types.ts      # 公共类型定义
│   ├── config.ts     # 配置解析
│   ├── sync-engine.ts
│   ├── scanner.ts
│   ├── merger.ts
│   └── hub-files.ts
├── server/           # HTTP 层：路由 + 中间件（不写业务逻辑）
│   ├── index.ts
│   ├── lib/
│   └── routes/       # 每个路由模块一个文件
├── transforms/       # 纯函数工具层（格式转换，不依赖 core）
│   ├── symlink.ts
│   ├── json-toml.ts
│   └── env-interpolation.ts
└── utils/            # 通用工具（不依赖 core）
    ├── fs.ts
    ├── paths.ts
    └── logger.ts
```

### 导入顺序

```typescript
// 1. Node.js 内置模块（MUST 用 node: 前缀）
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 2. 第三方依赖
import { z } from 'zod';
import { Hono } from 'hono';

// 3. 内部模块（用相对路径 + .js 后缀）
import { log } from '../utils/logger.js';
import type { HubItem } from '../types.js';
```

- 类型导入 MUST 用 `import type`
- 导入 MUST 按上述分组，组间空行
- 同组内按字母顺序排列

### 注释规范

- **默认不写注释**。好代码自己解释自己。
- 只有当"为什么这样做"不明显时才写注释（隐藏约束、坑、workaround）
- JSDoc：public API（export 的函数/类/接口）MUST 有 JSDoc
- 注释语言：与代码上下文一致。核心逻辑中文注释（因为是中文项目），API/类型用英文也可以
- 禁止写"做什么"的注释（代码已经说了做什么），只写"为什么这样做"

```typescript
// ✅ 好的注释：解释为什么
// Windows 上 lstatSync().isSymbolicLink() 对 junction 返回 false，
// 但 junction 功能上等价于 symlink，所以用 readlinkSync 判断
export function isSymlink(path: string): boolean { ... }

// ❌ 坏的注释：重复代码在做什么
// 读取文件内容
const content = readFileSync(path, 'utf-8');
```

### 错误处理

```typescript
// 错误消息 MUST 包含上下文：[模块名] 操作 路径: 原因
throw new Error(`[trae-cn] scan 失败: 无法读取 ${filePath}: ${err.message}`);

// 三层错误处理策略：
// 1. 不可恢复错误（配置文件不存在、权限不足）→ throw Error，中断执行
// 2. 可恢复错误（单个文件读取失败）→ log.warn + 继续处理下一个
// 3. 预期错误（工具未安装）→ 返回状态对象，不 throw
```

---

## 第五部分：Git 规范

### Commit 消息格式

```
<type>: <subject>

<body>（可选，详细说明）
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变功能） |
| `test` | 测试相关 |
| `docs` | 文档更新 |
| `chore` | 构建/依赖/配置 |

示例：
```
feat: 新增 scanner.ts 实现工具内容扫描
fix: 修复 Windows junction 不被 isSymlink 识别的问题
refactor: 将 adapter base 类中的 apply 方法提取为模板方法
test: 为 json-toml 转换器添加边界测试
```

### 分支策略

- `main`：稳定分支，始终可发布
- `feat/<name>`：功能分支
- `fix/<name>`：修复分支

---

## 第六部分：治理 (Governance)

### 如何修改本宪法

- 核心原则（第一部分）的修改：MUST 经过 review 并明确说明原因
- 技术约束（第二部分）的修改：引入新依赖或更换技术栈时需要
- 代码风格（第四部分）的修改：可以随项目演进调整，但 MUST 全项目一致
- 修改宪法后 MUST 更新版本号和"最后修订"日期

### AI Agent 自检清单

AI Agent 在完成每个任务后，MUST 逐条检查：

- [ ] 是否先读了相关 spec/plan 再写代码？（原则 I）
- [ ] core/ 下的新功能是否先写了测试？测试先确认过失败？（原则 II）
- [ ] 文件是否 ≤ 300 行？函数是否 ≤ 50 行？（原则 III）
- [ ] 是否只实现了 spec 要求的功能？有没有过度设计？（原则 IV）
- [ ] 是否有 any/as/! 类型违规？（原则 V）
- [ ] test + typecheck + lint + build 是否全部通过？（原则 VI）
- [ ] 新增文件是否在正确的目录？（文件组织）
- [ ] 导入是否按顺序、带 .js 后缀？（导入规范）
- [ ] 错误消息是否包含上下文？（错误处理）
- [ ] 是否没有引入禁止的依赖？（技术约束）
- [ ] 现有功能是否没有被破坏？（回归测试）

---

## 参考资料

- [GitHub Spec Kit](https://github.com/github/spec-kit) — Constitution + SDD 工作流
- [Superpowers (obra)](https://github.com/obra/superpowers) — TDD 强制执行方法论
- [ThoughtWorks: Spec-driven development](https://www.thoughtworks.com/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [Martin Fowler: Understanding Spec-Driven Development](https://martinfowler.com/articles/spec-driven-development.html)
- [JetBrains: How to Use a Spec-Driven Approach](https://blog.jetbrains.com/junie/2025/10/how-to-use-a-spec-driven-approach-for-coding-with-ai/)