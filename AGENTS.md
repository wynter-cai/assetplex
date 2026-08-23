# AssetPlex - AI Agent Instructions

> 本文件是所有AI Agent（TRAE、Cursor、Claude Code、Windsurf等）进入本项目时的首要指令。
> 开始任何工作前，请务必阅读并遵守本文件。

---

## 项目是什么

AssetPlex 是用户的**AI资产保险箱+分发中心**。用户的身份（Identity）、技能（Skills）、规则（Rules）、MCP服务器（Servers）是核心资产，AI工具（TRAE、WorkBuddy、Claude Code、Codex等）只是资产的消费端。核心价值：用户掌控自己的AI资产，换工具不丢东西。

技术栈：
- 后端：TypeScript + Node.js + Fastify（server）+ tsup 构建
- 前端：React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query
- 测试：Vitest（已配置80%覆盖率阈值）
- 包管理：pnpm

---

## 工作铁律（必须遵守）

### 🔒 1. SDD: Spec First（规格先行）

任何 S/M 级变更（新功能、模块重构、UI改版），**必须先写 spec，再写代码**：

- 规格文件位置：`设计文档/changes/<change-id>/` （仓库根目录的"设计文档"文件夹下）
- 最小规格集：`proposal.md` + `specs/<capability>.spec.md` + `tasks.md`
- Spec 必须用 Given-When-Then 场景描述用户可见行为，不写实现细节
- API 契约用 TypeScript interface 写在 `api-contract.ts`
- 用户审核通过 spec 和 tasks 后才能开始写代码

**变更分级**：
| 级别 | 定义 | 流程 |
|------|------|------|
| S | 架构变更、新模块、新页面 | 完整 SDD 流程 |
| M | 功能优化、较大改动 | specs + tasks + TDD |
| C | Bug 修复、小功能 | 直接 TDD（写测试先） |
| X | 文字/样式/文案微调 | 直接改，跑测试 |

### 🔒 2. TDD: Test First（测试先行）

后端代码（src/ 下除 web 外）**必须**严格遵循 Red-Green-Refactor：

```
🔴 RED: 先写一个失败的测试，明确要实现什么
🟢 GREEN: 写最少的代码让测试通过（不要提前优化）
🔵 REFACTOR: 测试全绿后再重构优化
```

- 测试放在 `tests/` 目录，与 src/ 目录结构对应
- 运行测试：`pnpm test`
- 覆盖率门槛：行 80% / 函数 80% / 分支 75%（vitest 已配置，不达标构建会失败）
- 前端核心组件/页面也要写测试（React Testing Library + Vitest）

### 🔒 3. 类型安全（Type Safety）

- **禁止使用 `any`** — 用 `unknown` + 类型守卫代替
- **禁止使用 `@ts-ignore` / `@ts-expect-error`**（除非有注释说明为什么必须）
- 所有公共函数必须有显式返回类型
- null/undefined 必须显式处理，不依赖 truthy/falsy 隐式转换

### 🔒 4. 架构约束

依赖方向必须单向：
```
cli/ ──┐
       ├──> core/ （纯逻辑，无框架依赖，不能反向依赖外层）
server/─┘
```
- `core/` 绝不能 import 任何来自 `cli/`、`server/`、`web/` 的模块
- `core/adapters/` 中每个 AI 工具一个适配器文件，遵循 base.ts 接口
- 共享类型放 `types.ts`，不跨文件循环依赖

### 🔒 5. Done 的定义（Definition of Done）

一个任务只有在以下全部满足时才算"做完了"：
1. ✅ 对应测试已写且通过（遵循 TDD）
2. ✅ TypeScript 类型检查通过（`tsc -b` 无错误）
3. ✅ 构建成功（后端 tsup build / 前端 vite build）
4. ✅ 对照 spec 中所有 Scenario 手动验证过
5. ✅ 没有新增 lint/type 警告

---

## 关键命令

```bash
# 后端
pnpm test              # 运行所有测试（带覆盖率）
pnpm test -- --run     # 非watch模式跑一次
pnpm build             # tsup 构建
node dist/index.js ui  # 启动 Web UI 服务（端口17521）

# 前端（web目录下）
cd web
pnpm test              # 前端测试
node node_modules/typescript/bin/tsc -b  # 类型检查
node node_modules/vite/bin/vite.js build  # 构建前端（产物被后端托管）
```

---

## 文档位置

- **设计文档目录**：`d:\Trae\Agent武器库\设计文档\`
  - **资产分类法**：`assetplex-asset-taxonomy.md` ⭐ 战略级文档，定义管什么资产、怎么分级、扩展路线
  - 总体UI重构方案：`assetplex-ui-redesign-v2.md`
  - 项目宪法：`assetplex-constitution.md`
  - 变更规格：`changes/<change-id>/` 下
- **历史/过时文档**：`.trae/documents/`（仅参考，不是当前真相）

## 资产分类参考

任何涉及资产的工作，必须先参考 [assetplex-asset-taxonomy.md](设计文档/assetplex-asset-taxonomy.md)。

当前管理的资产类别（第一梯队）：
- `identity` — 身份/人设
- `skill` — 技能
- `rule` — 规则
- `mcp` — MCP 服务器

扩展规划（第二梯队，UI 重构完成后补全）：
- `command` — 斜杠命令
- `agent` — 子代理配置
- `memory` — 长期记忆

⚠️ **重要**: 前端资产库导航、后端 AssetCategory 类型、扫描器配置都不能写死 4 个类别，必须支持动态扩展。

---

## 快速开始工作

如果用户让你开始一个新功能，请按以下顺序：

1. **理解需求**：阅读相关设计文档（先看 UI 设计方案，再看对应 spec）
2. **确认级别**：S/M/C/X 级？S/M 级必须先补 spec
3. **写/读 spec**：确保 spec 里的 Scenario 覆盖了用户要的行为
4. **写测试**：先写失败的测试
5. **写代码**：让测试通过
6. **验证**：跑测试、类型检查、构建
7. **汇报**：告诉用户做了什么、测试覆盖率、怎么验证

如果用户明确说"先做个原型看看"或"先把页面骨架搭出来"——可以先用 mock 数据做静态UI（不写API调用），这类属于原型验证，SDD 流程可简化，但必须在交付时提醒用户"这是原型，后续接入真实API时再走TDD"。

---

## 常见陷阱

- ❌ 不要改了前端代码就重启服务看效果——必须先 `vite build` 前端
- ❌ 不要为了"方便"在 core/ 里直接操作 fs 路径——用 utils/fs.ts 里的封装
- ❌ 不要为了让测试通过而改测试——测试是规格的体现，测试错了先改 spec 再改测试
- ❌ 不要一个 commit 混多个功能——每个任务独立提交
- ❌ 不要写超过50行的函数/超过300行的文件——拆分
