# tasks: enhance-a11y-responsive

> 顺序即执行顺序。纯函数（对比度）先写测试；交互改动先写 Playwright 断言再改实现。
> 三个独立提交：① 令牌与全局 CSS ② skip-link + 地标 + 语义 ③ 抽屉与断点。不混 commit。
> 提交前必跑 `node scripts/privacy-check.mjs` 退出 0；走查脚本与截图落系统临时目录，不入库。

## 组 1 · 令牌与全局 CSS

- [x] **T1** `web/src/lib/contrast.ts` + `contrast.test.ts`：实现 `hexToRgb`、`relativeLuminance`、`contrastRatio`，单测用 4 组已知值（黑白 21:1、同色 1:1、中灰对白、品牌色对白）先红后绿
  - 验收：单测通过，函数无副作用、无 `any` ✅（5 用例绿；另补 `hslToHex` 供令牌换算）
- [x] **T2** 实测并校准令牌：用 T1 的纯函数计算现有 `--muted-foreground` / `--foreground` / `--primary-foreground` 在三种底色上的比值，不足则调 `index.css` 令牌值；结论写进本文件末尾「实测记录」
  - 验收：Scenario 6 全部达标；不改任何组件内颜色 ✅（L 46.9%→43.5%，仅动令牌；断言固化进单测）
- [x] **T3** `index.css` base 层焦点环：`a, button, [role='button'], [tabindex]:not([tabindex='-1']), summary` 的 `:focus-visible` 使用 `outline: 2px solid hsl(var(--ring)); outline-offset: 2px`
  - 验收：侧栏链接、toast「查看详情」、卡片文本按钮聚焦时均可见；不引起布局抖动（`outline` 不占布局） ✅（可见性在 T14 走查复核）
- [x] **T4** `index.css` 增加 `@media (prefers-reduced-motion: reduce)`：动画/过渡时长压到 `0.01ms`、`animation-iteration-count: 1`、`scroll-behavior: auto`
  - 验收：抽屉与 toast 动效基本消失但状态照常（toast 仍自动消失） ✅（走查时 Playwright `reducedMotion: 'reduce'` 复核）

## 组 2 · 布局骨架与语义

- [x] **T5** `AppLayout.tsx`：首个子元素加 skip-link（`sr-only focus:not-sr-only` 样式，`href="#main-content"`），`<main id="main-content" tabIndex={-1} aria-label="主内容">`
  - 验收：Playwright 断言首次 Tab 的 `activeElement` 文本为「跳到主内容」，回车后 `activeElement` 为 main（Scenario 1）✅（e2e `a11y-keyboard.spec.ts` 2/2 通过；隐藏态改用 boundingBox 断言——sr-only 的 1px 盒在 Playwright 里仍算 visible）
- [x] **T6** `Sidebar.tsx` 语义修正：`<aside aria-label="侧边栏">`、`<nav aria-label="主导航">`、类别子列表 `<nav aria-label="资产类别">`；把折叠 `<button>` 移出 `<NavLink>`，改「链接 + 按钮」并列布局，按钮保留 `aria-expanded` / `aria-controls`
  - 验收：RTL 用例断言不存在 `a button` 嵌套结构；`aria-expanded` 随状态变化（Scenario 3）✅（Sidebar.test 12 例绿，含地标命名与 aria-controls 指向）
- [x] **T7** 浮层焦点归还：资产详情 / 各对话框关闭后焦点回到触发元素（复用 `useEscapeKey` 调用点，记录触发元素引用）
  - 验收：Playwright 断言 Esc 后 `activeElement` 为原触发按钮（Scenario 5）✅（`useEscapeKey` 新增可选 `returnFocusRef`；Vault 在打开时刻记录卡片；e2e 断言 Esc 后卡片获焦）
- [x] **T8** `AssetListPanel` 的结果数文本加 `role="status"` 与 `aria-live="polite"`（拍板点 C）
  - 验收：筛选后该区域文本变化，且不抢焦点（Scenario 8）✅（单测断言 role/aria-live；无程序化聚焦，不抢焦点）

## 组 3 · 窄屏抽屉与断点

- [x] **T9** 新增 `web/src/lib/use-focus-trap.ts`（≤50 行）：接收容器 ref 与开关，Tab/Shift+Tab 在容器内循环，Esc 回调关闭
  - 验收：单测模拟 Tab 序列，断言焦点在首尾循环；无第三方依赖 ✅（43 行；6 例绿：首尾循环/前进/Esc/未启用不抢焦点）
- [x] **T10** 新增 `MobileTopBar.tsx`（`lg:hidden`）：汉堡按钮（`aria-expanded` / `aria-controls`）+ 当前页 H1 摘要；`Sidebar.tsx` 在 `<lg` 改为 `fixed` 抽屉 + 遮罩，打开时锁 body 滚动，关闭归还焦点
  - 验收：375px 下 Playwright 断言抽屉打开/关闭、焦点进入与归还、背景不滚动（Scenario 4 + responsive Scenario 5）✅（e2e 4/4；锁滚作用在 `<main>`；点导航项/遮罩/Esc 三路关闭；导航项常量抽到 `nav-items.ts` 共用）
- [x] **T11** 断点收敛：`AppLayout` 与主要页面统一到 `sm/md/lg/xl` 四档；按四档实测结果修掉横向溢出（预计 Import 五列网格改 `md:grid-cols-3 lg:grid-cols-5`、Connections 左栏在 `<md` 折叠为顶部选择器）
  - 验收：四档 × 七页 `scrollWidth <= innerWidth` 全 PASS（responsive Scenario 1/2/3）✅（实测八页四档均无溢出，Import/Connections 无需改；将容器由 `.container`+双层 padding 改为 `p-4 sm:p-8`，375 内容可用宽 279→343px）
- [x] **T12** 长文本不溢出：列表卡片标题、同步目标路径在 375px 使用既有的 `truncate` / `break-all` 规则修正
  - 验收：构造 120 字符资产名，375px 无横向滚动（responsive Scenario 8）✅（AssetCard 标题与同步路径已有 `truncate`+`min-w-0`；注入 120 字符后 `scrollWidth` 仍 375）

## 组 4 · 验收与档案

- [ ] **T13** 全量验证：`web` 下 `vitest run` / `tsc -b` / `vite build`；后端三条命令一并跑（确认零影响）
- [ ] **T14** Playwright 走查脚本（临时文件，跑完删除）：四档视口 × 七页截图 + `activeElement` 断言 + 溢出断言，输出 PASS/FAIL 表
- [ ] **T15** 1440px 前后对比截图，确认除 skip-link 隐藏态与焦点环外无差异（responsive Scenario 4）
- [ ] **T16** 文档：`assetplex-ui-ux-roadmap.md` P2-A 行标记完成；断点表写入设计文档；本文件勾选并填 commit 短哈希
- [ ] **T17** 拍板点复核：A（抽屉 vs 图标条，建议抽屉）、B（令牌微调，建议微调）、C（`role="status"`，建议纳入并已实现于 T8）

## 预估与风险

- 预估：令牌与语义 1 天、抽屉与断点 1 天、验收 0.5 天（净 2.5 个工作日）
- 风险 1：`AppLayout` 是 `h-screen overflow-hidden`，抽屉滚动锁要作用在 `<main>` 而非 body，避免破坏已有滚动容器
- 风险 2：全局 `:focus-visible` outline 可能被组件内 `focus-visible:outline-none` 覆盖 → 组件保留 ring 即可，但需逐个确认 ring 未失效（button/input/switch/tabs/textarea 五个已确认有效）
- 风险 3：`lg:static` 的详情面板靠 `lg` 断点切换，抽屉恰好也在 `lg` 切换 → 抽屉打开时禁用详情面板的 `lg:static` 生效条件需实测
- 风险 4：无 e2e 基建（`web/e2e` 已有 Playwright 配置但仅 3 条）→ 本变更只补必要用例，不追求覆盖率

## 实测记录（执行后填写）

| 令牌 | on `--background` | on `--card` | on `--muted` | 结论 |
|---|---|---|---|---|
| `--muted-foreground` 初值（L 46.9%） | 4.76 | 4.76 | **4.34** | 在 `--muted` 上不达标 |
| 调整后（L 43.5%） | 5.35 | 5.35 | 4.88 | 三底色均 ≥ 4.5，达标（拍板点 B：微调到标，无局部覆写） |

其余实测均达标，未动：`--foreground` 20.01 / 20.01 / 18.26（≥ 7）；`--primary-foreground` on `--primary` 5.90；语义色文字 on 白：success 5.15、warning 5.02、destructive 4.80、info 6.66（均 ≥ 4.5）。
实测方式：`web/src/lib/contrast.ts` 纯函数经 esbuild 临时打包后直接计算；达标断言已固化进 `contrast.test.ts`「设计令牌对比度」describe。
