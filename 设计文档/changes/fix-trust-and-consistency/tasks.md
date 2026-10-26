# tasks: fix-trust-and-consistency（阶段 0）

> 前置：proposal / specs / api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 全流程 TDD：每条后端任务先写红测试；前端组件/页面任务遵守「测试与实现同 commit」。
> 拆分提交边界：Phase H（core+server）/ Phase I（web 消费）/ Phase J（文案与文档卫生）/ Phase K（验收），各自独立 commit。

## Phase H — 状态与口径地基（specs/asset-distribution-truth、asset-center-consistency）

- [x] H1 `src/core/asset-categories.ts`：声明源（code / label / description / hubDir / external / syncable / doctorSupported / order）与查询函数
  > 验收：新增一个假类别后，`listCategories()` 返回其配置；现有六类配置与 `web/src/config/asset-categories.ts` 逐字段核对一致（图标除外）。单测覆盖排序与 code 唯一性。
  > 实测：7 用例全绿（含用正则解析前端 fallback 逐字段比对，「新增类别只改一处」靠这条测试守）；`tsc -b` 退出 0；后端 64 文件 / 832 用例、前端 31 文件 / 222 用例全绿。声明源与前端 fallback 的技能描述统一为「同步到各工具」；`SkillsView.tsx` 副标题同句改到 J1 一并做（该文件当时还挂着上一轮未提交的他人改动，不混入本 commit）。
- [x] H2 `src/core/distribution-index.ts` + `src/core/distribution-status.ts`：状态判定矩阵（优先级 1-8）+ 30s 缓存 + `refresh` 强刷 + 单工具失败隔离
  > 验收：symlink 目录、文件 symlink、聚合文件命中/未命中、内容一致/不一致、目标缺失、未启用、未安装、项目级工具跳过——九种边界逐条单测（用临时目录造夹具，中性示例名）。`partial` / `failedTools` 在适配器抛错时正确回填。
  > 实测：13 用例全绿，`tsc -b` 退出 0，后端全量 65 文件 / 845 用例绿。实现拆两文件：`distribution-status.ts`（判定层，259 行）+ `distribution-index.ts`（编排/缓存，134 行），均 ≤300 行。
  > 过程中的真坑：本机文件级 symlink `EPERM`，原测试静默 return（假绿）。改为注入 `FsProbe` 探针后，symlink 分支变为确定性覆盖，并补两条反向用例（链接指向别处 → `conflict`，不得冒充 synced）。
- [x] H3 `src/core/assets.ts`：资产入口文件归一（技能取 `skills/<name>/SKILL.md` 并以 `<name>` 命名）+ 内部文件过滤（`_` / `.` 前缀、技能子文件不作为资产）
  > 验收：单测断言 `skills/demo/SKILL.md` → 名称 `demo`；`skills/demo/_meta.json`、`references/x.md` 不出现；库内技能数与入口文件数一致。
  > 实测：新增 `resolveAssetEntry()` 作为「算不算一项资产」的唯一判定；7 用例全绿（技能按目录名、大小写不敏感入口、`_`/`.` 前缀过滤、`references/` 等子文件不冒充、历史平铺 `skills/<name>.md` 兼容）。真实数据：库内 37 项（技能 32，均为技能名），旧的 42 张 `SKILL` 卡片消失。
- [x] H4 `src/server/routes`：新增 `GET /api/asset-categories`、`GET /api/distributions`；`/api/hub/overview` 增加 `counts` 四口径与 `toolSynced`，保留 `assetStats` 兼容
  > 验收：路由单测覆盖 200 / 400（非法 refresh）/ 500（索引整体失败）；`counts` 与 `toolSynced` 字段与 api-contract 完全一致。
  > 实测：`src/server/lib/distribution-context.ts` 装配与计数 + `src/server/routes/catalog.ts` 两端点；8 用例全绿。额外修一处一致性问题：`/api/hub/overview` 原有 `assetStats` 按文件数统计（含 `_meta.json`、技能子文件），与新 `counts.library` 在同一条响应里给两个数字，现由 `alignAssetStats()` 收敛到同源口径（未纳入声明源的 `memory` 保留原值，不假装有真值）。真实数据：`trae-cn` 已同步 37 / `workbuddy` 36，状态分布 73 synced / 1 pending / 74 not_installed。
- [x] H5 缓存失效挂点：同步、切换、资产医生 apply 成功后使索引失效
  > 验收：集成测试断言写操作后下一次读取 `cached === false`。
  > 实测：4 用例全绿（缓存命中不重算 / `invalidateDistributionIndex` 后重算 / swap 执行后失效 / swap 回滚后失效，均用计数 loader 断言真实重算次数）。挂点：`sync`（run 仅非 dryRun 失效、reverse-import、execute-import）、`swap`（execute、rollback）、`doctor-fix`（apply、undo）。`catalog-summary` 补 `beforeEach(resetDistributionIndexCache)`，否则模块级缓存会串用例。

- [x] H6 `src/core/overview.ts` 反向依赖 server（H4 期间发现）：`getOverview()` 里 `import { hubContext } from '../server/lib/hub-context.js'`，违反「core 不得依赖 server」铁律；应改为适配器/配置由 server 层参数注入，并补一条依赖方向守卫测试。
  > 影响：本次 H4 只是让 overview 多读一份分发索引，没有加剧该问题；但它使 core 层能直接读全局单例，后续拆包/测试会很痛。
  > 实测：`getOverview(deps: OverviewDeps)` 改为参数注入（`adapters` + `hubConfig` 由 `hub.ts` 从 `hubContext` 取后传入）；原来必须 `vi.mock('src/server/lib/hub-context.js')` 才能测的畸形依赖随之消失。新增 `tests/unit/core/dependency-direction.test.ts` 静态扫描 `src/core/**`（含 adapters），禁止 `../server` / `../cli`；含两条自检（能识别违规、扫描文件数 >25 且含 `overview.ts`），防守卫自己失效变假绿。RED 阶段精确报出 `src/core/overview.ts → ../server/lib/hub-context.js` 且全仓仅此一处。全量 69 文件 / 869 用例绿，`tsc -b` 退出 0，build 成功。

## Phase I — 界面消费（specs/asset-center-consistency、asset-distribution-truth、product-surface-hygiene）

- [x] I1 `web/src/config/asset-categories.ts`：改为「fallback + 接口覆盖」，侧栏 / 首页快照 / 资产库筛选统一由它派生
  > 验收：接口不可用时回退 fallback 且不白屏（mock 失败测试）；接口返回新增类别时侧栏自动出现（组件测试）。
  > 实测：新增 `web/src/lib/use-asset-categories.ts`（`mergeCategories` + `useAssetCategories` + `pickCategory`，5 分钟 staleTime）与 6 用例；三处消费改吃接口清单 —— `Sidebar` 子项、`AssetSnapshot` 格子与总数、`Vault` 页头 label/description/external 判定。组件测试各条真实断言：接口只下发两类时旧常量类别不再出现（证明吃的不是常量）、接口失败回退 fallback 不白屏、`external` 由接口决定且不打 `/api/assets`。前端 33 文件 / 235 用例全绿，`tsc -b` 退出 0，`vite build` 成功。常量 `ASSET_CATEGORIES` 降级为 `@deprecated` alias，仅供骨架屏与静态兜底文案。
  > 两个坑：（1）首屏先渲染 fallback，若 URL 上是 fallback 认不出的新类别，会先按「内部类别」发一次不该发的 `listAssets` —— 改为 `categoryPending` 等接口清单落地再决定，但接口已失败（`isError`）时不再无限等；（2）lucide 图标是 `forwardRef` 对象，`typeof icon === 'function'` 恒假，断言改成「等于哪个图标」。
- [ ] I2 `AssetCard` / `DistributionBadge`：改用真实状态渲染；`partial` 时展示「部分工具状态暂不可用」
  > 验收：五状态各有渲染断言；`distributions: []` 不再渲染「未分发」；失败工具不渲染成任何状态。
- [ ] I3 `Vault`：类别 + 分发状态筛选、50/页分页、切换筛选回第 1 页、空态/失败态文案按 spec
  > 验收：组件测试断言筛选后数量、分页边界、失败态不显示「共 0 项」。
- [ ] I4 `Connections`：把「已同步资产」改为「已同步 N / 我的库 M」与「可收藏」三口径，删除就地 filter 计数
  > 验收：组件测试断言未安装工具不出现「已同步」数字；页面无 `filter(...).length` 计数。
- [ ] I5 `Sync`：未选目标禁用主操作 + 「请先选择目标工具」；影响范围回显；预览开关可访问且文案随状态变化；未安装卡片 `aria-disabled`
  > 验收：四条场景各有组件测试；删除两条互斥空态文案之一。
- [ ] I6 版本号单一来源：vite define 注入，侧栏与设置页共用；设置页把内部枚举改为中文选项
  > 验收：断言界面版本 === `package.json` 版本；设置页无 `hybrid` / 工具 id 直出。
- [ ] I7 `Swap` / `Connections`：项目级工具展示能力说明；未配置项目时显示「尚未选择项目」+「去配置」，不再六类全标「不支持」；支持矩阵改由工具能力声明推导（D3）
  > 验收：组件测试断言项目级工具卡片存在说明文案；断言零项目时无「不支持」字样；红测试可用「`projectTargets` 为空」复现现缺陷。

## Phase J — 文案与文档卫生（specs/product-surface-hygiene）

- [ ] J1 全站词表收敛：按禁用词清单替换用户可见文案；扩展术语走查测试覆盖导航/页头/空态/toast/确认框
  > 验收：禁用词命中 0；测试在引入任一禁用词时失败。
- [ ] J2 死命令提示：`src/cli/templates.ts` 与 `trae-cn` 适配器提示中的 `profile learn` 改为「即将支持」表述
  > 验收：全仓 grep 无「可运行的未实现命令」样式文案。
- [ ] J3 公开文档卫生：修 `设计文档/assetplex-asset-taxonomy.md` 三处 `file:///` 本地链接；批量把公开文档旧品牌名改为 AssetPlex；README/docs 版本号与 package 对齐
  > 验收：全仓无 `file:///`；旧品牌名命中 0；`node scripts/privacy-check.mjs` 退出码 0。
- [ ] J4 分层提交：docs 规格 / core+server / web / 文案与文档 四个 commit，逐个 `git diff` 核对

## Phase K — 验收

- [ ] K1 双端全量：`npm test`、`npm run typecheck`、`npm run build`；`web` 下 vitest / tsc -b / vite build 全绿
- [ ] K2 API 回环：造中性示例资产 → 断言索引状态 → 执行同步 → 状态转 `synced` → 手工改坏目标文件 → 状态转 `conflict` → 复原
- [ ] K3 浏览器走查：9 个页面 + 800px 窄屏，逐条核对三份 spec 的 Scenario，截图留档
- [ ] K4 本 tasks 勾选与实测记录（每条填 commit 短哈希），并在 `assetplex-project-diagnosis.md` 标注阶段 0 完成
