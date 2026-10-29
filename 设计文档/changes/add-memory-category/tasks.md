# tasks: add-memory-category

> 执行顺序即编号顺序；后端一律 TDD（先红后绿），前端核心路径补 RTL 用例。
> 每完成一组做一次验证并独立提交，不混 commit（`docs` / 声明源 / 扫描 / 前端分开）。
> 提交前必跑 `node scripts/privacy-check.mjs` 且退出码 0。
> 变更沿革：原 17 项含命令（T1/T3/T4/T5/T10/T12 等），随 D3 收缩为只做记忆，命令相关项已删除。

## 组 1 · 声明源与契约（后端 core）

- [x] **T1** `src/core/asset-categories.ts` 新增一条声明：`memory`（记忆，order 55，hubDir `memory`，legacyHubDirs `['preferences']`，external false，syncable true，doctorSupported true）；`AssetCategoryDescriptor` 增加 `legacyHubDirs?: readonly string[]`；`ASSET_CATEGORY_DECLARED_AT` 更新为 2026-10-29
  - 验收：单测断言 7 条字段齐全、order 升序且裁决准则仍在末位、既有六条 label/order 未变；`command` 查不到
- [x] **T2** `src/core/types.ts`：`DiscoveredCategory` 增加 `agent`、`memory`（`preference` 降为内部兜底）；`DOCTOR_ASSET_KINDS` 增加 `memory`
  - 验收：`tsc --noEmit` 0 错；switch 穷尽性报错逐个补齐（未用 `any`）
- [x] **T3** `src/core/assets.ts`：`AssetCategory` 增加 `memory`；`DIR_TO_CATEGORY` 增加 `memory` / `preferences → memory`；新增 `CATEGORY_TO_DIRS`（memory 扫 `memory` + `preferences`）；`src/server/routes/assets.ts` 写入映射加 `memory`
  - 验收：`GET /api/assets?category=memory` 同时返回两个目录的文件；新建只落 `memory/`
- [x] **T4** `src/core/overview.ts`：`FrontendCategory` 增加 `memory`；`CATEGORY_MAP` 加 `preferences → memory`；多个后端目录并入同类别时用 `+=` 累加
  - 验收：overview 单测断言记忆计数含旧目录，口径仍为 `library`

## 组 2 · 扫描归类纠正（适配器）

- [x] **T5** `src/core/adapters/claude-code.ts`：`agents/` 由 `preference` 改为 `agent`；`commands/` 扫描规则**删除**（D3：命令不是资产）
  - 验收：新单测断言 `agents` 归类，且 `commands/` 下文件不出现在扫描结果
- [x] **T6** `src/core/adapters/trae-cn.ts`：`memory/user_profile.md` 保持 `identity`，`memory/` 其他 `.md` 由 `preference` 改为 `memory`
  - 验收：单测断言三类发现项归类；`session_memory.md` 目标路径 `memory/session_memory.md`
- [x] **T7** 扫描结果按 `absolutePath` 去重（`src/core/scanner.ts` 的 `dedupeDiscovered`），先命中者优先
  - 验收：构造重复命中夹具，断言不重复、收藏不写两份

## 组 3 · 前端（声明源派生，不改清单文件）

- [x] **T8** `web/src/config/asset-categories.ts`：补 fallback 一条（同字段）+ `CATEGORY_ICONS` 增加 `memory`（Brain）；`web/src/types/api.ts` 的 `AssetCategoryDescriptor` 增加 `legacyHubDirs?`
  - 验收：后端声明源与 fallback 逐字段比对单测通过（含 `legacyHubDirs`）
- [ ] **T9** `web/src/types/api.ts`：`DiscoveredCategory` 与后端对齐（补 `agent`、`memory`）
  - 验收：`tsc -b` 0 错；收藏向导不会因为类型缺失而把新类别当未知
- [ ] **T10** `web/src/components/import/FileItem.tsx`：删掉本地 `categoryLabels` 与图标硬编码，改用声明源（`useAssetCategories` 或 `CATEGORY_ICONS` + 接口清单），未知类别回退默认图标
  - 验收：收藏向导中「记忆」分组显示正确中文名；既有类别显示不变；新增守护用例防止再写死
- [ ] **T11** 「记忆」类别页空态与失败态：空态文案「我的库里还没有记忆」+ 唯一动作「从已安装的工具收藏记忆」；错误态给重试，不显示「共 0 项」
  - 验收：RTL 用例覆盖空态与错误态文案（memory-visible Scenario 3）
- [ ] **T12** 同步对话框对不支持记忆的工具显示具体原因并禁用（复用既有支持矩阵原因文案机制）
  - 验收：用例断言不支持行禁用 + 文案存在（memory-visible Scenario 6）

## 组 4 · 验收与档案

- [ ] **T13** 全量验证：后端 `npm.cmd test` / `npm.cmd run typecheck` / `npm.cmd run build`；`web` 下 `vitest run` / `tsc -b` / `vite build`
- [ ] **T14** API 回环：造中性示例文件 → `GET /api/assets?category=memory` 计数正确（含 `preferences/` 并入）→ 同步到 WorkBuddy → 状态转 `synced` → 清理测试数据
- [ ] **T15** 浏览器走查 Scenario 1–9（含 800px 窄屏），截图落系统临时目录（不入库），走查完关闭标签页
- [ ] **T16** 文档同步：`assetplex-asset-taxonomy.md` 第三梯队 memory 状态列改为「✅ 已管理」，并在 `command` 行标注「不做（单工具专属，D3）」；本文件勾选并填 commit 短哈希
- [x] **T17** 拍板点复核：A（命令是否进资产中心）→ 已拍板**不做**，`command` 整项退出；B（`preferences/` 迁移）留阶段 2；C（legacy 路由）另立 `retire-legacy-routes`

## 预估与风险

- 预估：后端 1.5 天、前端 1 天、验收 0.5 天（净 3 个工作日/周末段）；命令退出后前端量减少约半天
- 风险 1：`preferences/` 目录可能已被某个工具软链占用 → 只读并入，绝不迁移（明确写入 D2）
- 风险 2：`AgentEdit`/资产编辑器的新建流程可能硬编码类别 → T10 之前先跑一次 `grep -r "identity.*skill.*rule" web/src` 排查
- 风险 3：医生对 memory 的检查规则缺失 → 复用既有体积/空文检查，不为 memory 新写专用规则
- 风险 4：删除 Claude `commands/` 扫描会让已收藏进 `commands/` 的历史文件从收藏向导消失（但它仍在磁盘、仍可在文件系统看到）→ 在 D3 与 Scenario 8 明确这是预期行为
