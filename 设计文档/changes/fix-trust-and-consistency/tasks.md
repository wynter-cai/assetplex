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
- [x] I2 `AssetCard` / `DistributionBadge`：改用真实状态渲染；`partial` 时展示「部分工具状态暂不可用」
  > 验收：五状态各有渲染断言；`distributions: []` 不再渲染「未分发」；失败工具不渲染成任何状态。
  > 实测：新增 `web/src/lib/use-distributions.ts`（按资产 id 取条目 + 透出 `partial`/`failedTools`/`projectTools`/`refresh()`，staleTime 30s 与服务端索引缓存同频）；`DistributionBadge` 改成五值闭集映射表（导出 `DISTRIBUTION_STATUS`，卡片与弹窗共用一份，消除同一 `pending` 一边叫「待同步」一边叫「待更新」）；空条目不再渲染任何文字（Scenario 9），闭集之外的状态直接不渲染（Scenario 8，不再把未知状态默认画成灰色「未启用」）；`Vault` 页级拉一次索引、逐卡下发条目，`partial` 时列表上方一行「部分工具状态暂不可用」。额外发现第三处谎：`DistributionDialog` 读 `asset.distributions`（恒空）把所有已装工具都说成「未同步」，一并收敛为索引真值，无条目时只说「状态未知」。新增 20 个用例（badge 8 / card 3 / dialog 3 / hook 4 / Vault 2），前端 37 文件 / 255 用例全绿，`tsc -b` 退出 0，`vite build` 成功。
  > 真实数据探针（用完即删）：37 项资产 **零缺 key**（不会出现满屏无圆点），状态分布 73 synced / 74 not_installed / 1 pending，`partial=false`、`projectTools=[]`；示例 `skills/handoff/SKILL.md` → trae-cn synced / workbuddy synced / claude-code not_installed / codex not_installed。
  > 两个坑：（1）`useCallback` 误从 `@tanstack/react-query` 导入（它不导这个）→ 运行时 `useCallback is not a function`；（2）提示行一旦把 `failedTools`（工具 id，如 `claude`）拼进文案，`findByText` 完全匹配不中，而且把内部 id 直出给用户看违反词表——改为一句话，不点名工具。REFACTOR 步抽出 `web/src/lib/test-factories.ts`，四个测试不再各抄一份八字段夹具。
  > 遗留：`Vault.tsx` 已到 300 行上限，I3 加筛选/分页前必须先拆子组件；卡片「分发」按钮文案属 J1 禁用词范围，本任务只加 `data-testid="distribute-action"` 使文案改动不再连带改测试。
- [x] I3 `Vault`：类别 + 分发状态筛选、50/页分页、切换筛选回第 1 页、空态/失败态文案按 spec
  > 验收：组件测试断言筛选后数量、分页边界、失败态不显示「共 0 项」。
  > 实测：先把列表区从 `Vault.tsx` 拆出（301 行 → 234 行，新增 `components/vault/AssetListPanel.tsx` 226 行 + `AssetFilterBar.tsx` 97 行 + 纯函数 `lib/asset-filter.ts`），再上功能。筛选两个维度：类别下拉（仅「全部资产」页给，URL 已锁定类别时隐藏，不与侧栏双轨）+ 同步状态下拉（选项直接复用 `DISTRIBUTION_STATUS` 那份映射，不建第二套文案）；数量行 `共 N 项资产` 随筛选实时变化；50 项/页 + 上一页/下一页 + `第 X / Y 页`（仅多于一页时出现）；页码与筛选指纹同行存储（`filterKey` 变了就当第 1 页），不用 effect，翻页不会被误判成筛选变化。空态按 Scenario 8 改为「还没有资产」+ 唯一主动作「从工具收藏到我的库」；失败态改用现成的 `ErrorState`（带重试），不再把 `error.message` 直出给用户，也不显示数量行。`Asset.category` 类型放宽为 `AssetCategoryCode`（`FrontendCategory | 'memory' | (string & {})` 开放并集），`api.listAssets` 的 category 不再需要 `as FrontendCategory` 强转。新增 29 个用例（lib 13 / panel 11 / Vault 5），前端 39 文件 / 284 用例全绿，`tsc -b` 退出 0，`vite build` 成功；未动后端。
  > 两个决定：（1）用户可见文案用「同步状态」而不是 tasks 原文的「分发状态」——`分发` 是 product-surface-hygiene 禁用词，不能因为写任务而新增一处。（2）**类别下拉改为由当前列表实际出现的类别派生**（`categoryOptionsFor`），不按 `external` 排除：真实数据下 `/api/assets` 会把 32 个库内技能一并返回，下拉里却没有「技能」就是一处新谎；反过来只走专用接口的类别（如裁决准则）从不在这个列表里出现，也就自然不会进了选项。
  > 真实数据探针（用完即删）：37 项（技能 32 / 规则 3 / 身份 1 / MCP 1）→ 按 50 项/页只有 1 页，分页控件不出现；状态命中数 已同步 37 / 待同步 1 / 冲突 0 / 未启用 0 / 未安装 37（条目总分布 73 synced / 74 not_installed / 1 pending，与 I2 一致）；`ASSETS_WITHOUT_ENTRY=0`，即不会有任何资产在任何状态筛选下凭空消失；`partial=false`。
  > 三个坑：（1）`getByText('共 2 项资产')` 类型的断言会打到 `<option>` 文本上——测试夹具的资产名没有取叫「身份」，改叫「我的人设」；（2）同名两个「清除筛选」按钮（工具条小链接 + 零结果大按钮）逼着测试用 `getAllByRole`，改为零结果时只留大按钮；（3）`Asset.category` 放宽后，`asset.category === 'rule' ? asset.category : null` 不再能收窄成 `DoctorAssetKind`（`string & {}` 不会被字面量比较剔除），`AssetEditor` 的医生入口改为闭集数组查找。
  > 遗留：Scenario 8 的「唯一主动作」只在列表区成立，页头仍有「导入 / 新建」两个按钮；若要全站空态只留一个出口，属 J1 文案与动作收敛范围。
- [x] I4 `Connections`：把「已同步资产」改为「已同步 N / 我的库 M」与「可收藏」三口径，删除就地 filter 计数
  > 验收：组件测试断言未安装工具不出现「已同步」数字；页面无 `filter(...).length` 计数。
  > 实测：数字改为服务端派生。新增 `src/server/lib/tool-asset-counts.ts`（`buildToolAssetCounts` 纯函数：已同步只认分发索引里该工具的 `synced`、未入库资产不参与；可收藏＝`conflict === 'none'` 且按 `hubTargetPath` 去重；未安装工具 synced/pendingImport 全 0；项目级工具只报 `projectCount`）；`routes/tools.ts` 改为 `toolsRoutesFactory(deps)`（默认走 hubContext，与 swap/catalog 同一注入惯例）并让 `/api/tools/:name/detail` 下发 `assetCounts`，索引或资产清单读不到时 `assetCounts = null`。前端拆出 `ToolDetailPanel.tsx`（98）/ `ToolAssetSummary.tsx`（210）/ `tool-display.tsx`（26），`Connections.tsx` 302 → 105 行（原文件已超 300 行上限）；连接页不再请求 `/api/assets`（新用例直接断言 `api.listAssets` 未被调用），`assetsData.items.filter(...).length` 就地计数删除。新增 26 个用例（后端 13 / 前端 13），后端 70 文件 / 882 用例、前端 40 文件 / 298 用例全绿，`tsc -b` 两端退出 0，tsup + vite 构建成功。
  > 三个决定：（1）「可收藏」＝`conflict === 'none'`——`differs` 意味着我的库里已有同名资产只是内容不同，那是冲突不是「没收藏」；服务端把 `discovered.<cat>` 也按同一口径筛过，保证计数与文件列表同源不打架。（2）区块标题「已同步资产」→「同步情况」，行内 `已同步 N / 我的库 M` + 徽章 `可收藏 K`，数字紧跟口径名（D4）；`Hub 中尚无资产可同步` / `导入到 Hub` / `可导入资产` 等禁用词在本页清零（后者改为「可收藏的新文件」+「去收藏」）。（3）spec 自身的文案冲突按词表卫生优先：asset-distribution-truth Scenario 6 的示例句「…分发在项目页管理」含禁用词 `分发`，界面落地为「本工具按项目同步，请在项目页查看（已接入 N 个项目）」，需同步回 spec。
  > 真实数据探针（用完即删）：我的库 37（身份 1 / 技能 32 / 规则 3 / MCP 1）；trae-cn 已同步 37 / 可收藏 0（扫到 190 条全部 `exists`——工具目录与库同源，没有新东西可收藏）；workbuddy 已同步 36（MCP 未同步，即 I3 的那 1 条 pending）、扫到 2 条 memory `conflict=none`；claude-code / codex 未安装 → 不给任何数字。
  > 两个坑：（1）初版把未纳入声明源的类别（memory）也用 code 当 label 列出来，探针显示它给出「memory 已同步 0 / 我的库 0 + 可收藏 2」这种英文直出且文件列表里落不了地的孤立数字 → 改为只渲染声明源类别（与侧栏、资产库同一清单），补一条用例锁死；（2）文件列表原先把工具目录绝对路径整串铺在界面上，改为只显示文件名（技能取目录名）——既是隐私卫生也是可读性。
  > 遗留（交给 I7）：`projectTools` 只在 `projectCount > 0` 时才含该工具，因此**尚未配置项目的 Qoder** 在连接页仍会落到普通分支显示「已同步 0 / 我的库 32」——比旧的「已同步 32」诚实，但项目级身份必须由工具能力声明显式判定（D3），不能靠项目数凑。
-- [x] I5 `Sync`：未选目标禁用主操作 + 「请先选择目标工具」；影响范围回显；预览开关可访问且文案随状态变化；未安装卡片 `aria-disabled`
  > 验收：四条场景各有组件测试；删除两条互斥空态文案之一。
  > 实测：新增纯逻辑 `web/src/lib/sync-impact.ts`（79 行：`summarizeImpact` / `impactText` / `derivePrimaryAction` / `modeCaption`）+ 单测 10 条；拆出 `components/sync/TargetToolCard.tsx`（99）、`SyncActionBar.tsx`（56）、`ToolPlanDetail.tsx`（48）、`SyncResultCard.tsx`（30）、已有 `sync-display.ts`（44）；重写 `Sync.tsx` 397 → 164 行。关键改动：（1）主操作由 `derivePrimaryAction` 三态驱动（未选目标 / 无内容 / 可执行），旧「将同步到全部已启用工具」文案清零；（2）Switch 加 `aria-label="预览模式"` + 模式说明由 `modeCaption` 渲染；（3）未安装工具 `aria-disabled={!installed}` + onClick 守卫 + 「安装后重新扫描即可启用」引导；（4）`api.runSync` 始终传 `selectedList`（不再传 undefined）；（5）影响范围逐字「将影响 N 个工具 · M 项变更 · K 项冲突」。新增 18 用例（lib 10 / 页面 8），前端 42 文件 / 316 用例、后端 70 文件 / 882 用例全绿，`tsc -b` 退出 0，`vite build` 成功。
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
