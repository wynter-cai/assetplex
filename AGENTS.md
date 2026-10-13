# AssetPlex - AI Agent Instructions

> 本文件是所有AI Agent（TRAE、Cursor、Claude Code、Windsurf等）进入本项目时的首要指令。
> 开始任何工作前，请务必阅读并遵守本文件。

---

## 项目是什么

AssetPlex 是用户的**AI资产保险箱+分发中心**。用户的身份（Identity）、技能（Skills）、规则（Rules）、MCP服务器（Servers）是核心资产，AI工具（TRAE、WorkBuddy、Claude Code、Codex等）只是资产的消费端。核心价值：用户掌控自己的AI资产，换工具不丢东西。

技术栈：
- 后端：TypeScript + Node.js + Hono（server）+ tsup 构建
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
- 运行测试：`npm test`
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

### 🔒 6. Git 提交规范

**权限边界**：
- ✅ 允许：`git add`（逐个指定文件）、`git commit`、status/diff/log 查看类操作
- ❌ 禁止：`git push`（推送由用户亲自执行或明确批准）、`--amend`、`rebase`、`reset --hard`、`clean`
- 丢弃任何未提交改动（`checkout --` / `restore`）前必须先问用户

**提交前检查**：
1. `git status` 审查全部变更，与本次任务无关的文件不提交，不使用 `git add -A` / `git add .`
2. 绝不提交：.env、密钥凭证类文件、日志、临时文件、node_modules、构建产物
3. `git diff` 逐文件确认内容与提交描述一致后再提交
4. 提交前跑隐私终检 `node scripts/privacy-check.mjs`（见 §7 隐私终检 SOP），退出码 0 才可提交

**粒度与风格**：
- 一个 commit 只做一件事（一个任务或一个修复），不混功能
- 格式：`<type>: <中文描述>（<change-id> T<n>）`，type 取 feat/fix/refactor/docs/chore/test
  示例：`refactor: 技能卡徽章减负并收敛详情入口（refactor-design-system T8）`

**环境约束（PowerShell 5.1）**：
- 多行中文 commit message 用 here-string：`$msg = @'...'@; git commit -m $msg`；禁用 heredoc 和 `&&`
- 提交后用 `git log --oneline -3` + `git status` 自证，并向用户汇报提交了哪些文件、为什么这样拆分

**提交身份**：
- 统一使用 `Wynter-Cai <299045391+wynter-cai@users.noreply.github.com>`（已配置在全局 `~/.gitconfig`，勿覆盖）
- 若某环境读不到全局配置，用 `git -c user.name="Wynter-Cai" -c user.email="299045391+wynter-cai@users.noreply.github.com" commit ...` 兜底；禁止使用机器名猜测出的身份

### 🔒 7. 隐私终检 SOP（事故级铁律，所有 Agent 必守）

本仓库**面向开源**。维护者与协作者的个人隐私一旦入库，就永久留在 git 历史里，抹除需全历史重写（代价极高，已发生过一次事故）。任何将进入公开仓库的内容——源码、测试夹具、文档、验收记录、脚本——都不得含隐私。

**双层架构**（关键：方法公开、隐私值不外泄）：
- 自查工具 `scripts/privacy-check.mjs` 随仓库公开，本体不含任何真实隐私值，只定义扫描方法。
- 真实隐私关键词清单存于本机 `.privacy-keywords.local`，已被 `.gitignore` 排除，**绝不入库**。新环境接入时由维护者连同 `HANDOFF.md` 一并带到该文件。

**何时跑**（强制）：每次 `git commit` 前、每次 push/发布前。
```bash
node scripts/privacy-check.mjs            # 扫全历史 + 工作区（推送前用）
```
退出码 0=干净可提交；1=发现隐私（`FAIL` 命中真实关键词 / `WARN` 命中通用机械标识结构），必须处置成 0 命中后才允许提交。

**命中怎么处置**：
- 工作区/新内容：把隐私改成中性示例（真实目录名→通用名、用户名→`demo`/`testuser`、称谓→`维护者`、绝对路径→中性占位），重跑至 0 命中。
- 已入库的历史：用 `git filter-branch --tree-filter`（改文件内容）/ `--env-filter`（改作者身份）重写；操作前先建备份分支，重写后跑 `privacy-check.mjs` 对全历史复扫 + 测试全绿才算完。

**三个必踩的坑**：
1. 测试夹具/示例数据**禁止照搬本机真实目录名、技能名、用户名**——造数据时用一眼可知的中性名，别图省事复制真实 storage。
2. 脱敏要**全形态枚举**：同一隐私串常有明文(`d:/X`)、单反斜杠(`d:\X`)、源码双反斜杠(`d:\\X`)、URI编码(`d%3A/X`)、msys(`/d/X`)五种写法，替换规则缺一即漏，复扫务必覆盖全部形态。
3. Windows PowerShell 命令行传**中文关键词**给 `git grep` 会因编码产生**假阴性**（明明还在却报 0 命中）。所以复扫必须走本脚本（内部用 `execFileSync` 直传 UTF-8），不要手敲 `git grep 中文`。脚本内部正则须用 POSIX ERE（`git grep -E` 不支持 Perl 式 `(?:...)` 非捕获组）。

---

## 关键命令

```bash
# 后端
npm test              # 运行所有测试
npm run typecheck     # TypeScript 类型检查
npm run build         # tsup 构建
node dist/index.js ui  # 启动 Web UI 服务（端口17521）

# 前端（web目录下）
cd web
npx vitest run        # 前端测试
node node_modules/typescript/bin/tsc -b  # 类型检查
node node_modules/vite/bin/vite.js build  # 构建前端（产物被后端托管）
```

---

## 文档位置

- **设计文档目录**：`./设计文档/`（仓库根目录下的“设计文档”文件夹）
  - **交接快照**：根目录 `HANDOFF.md` — 本机私有文件，不入库，由用户在新环境接入时提供（当前进度、文档地图、环境坑、测试基线）
  - **资产分类法**：`assetplex-asset-taxonomy.md` ⭐ 战略级文档，定义管什么资产、怎么分级、扩展路线
  - 总体UI重构方案：`assetplex-ui-redesign-v2.md`
  - 项目宪法：`assetplex-constitution.md`
  - 变更规格：`changes/<change-id>/` 下
- **历史/过时文档**：本地私有目录（仅参考，不是当前真相，不入库）

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
- ❌ 不要把个人隐私/本机真实信息（用户名、机器名、真实目录名/技能名、个人称谓、绝对路径）提交入库——commit/push 前必跑 `scripts/privacy-check.mjs`（§7），测试造数据一律用中性示例名
