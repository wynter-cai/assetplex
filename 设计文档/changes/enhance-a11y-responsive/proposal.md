# proposal: enhance-a11y-responsive（P2-A：键盘可达、焦点可见、断点收敛）

> 级别：M（跨布局骨架与设计令牌，无新能力模块、无接口变更）
> 输入依据：`设计文档/assetplex-ui-ux-roadmap.md` P2-A；`设计文档/assetplex-project-diagnosis.md` P2-1、P1-5 残余
> 状态：待维护者审核
> 前置：`refactor-design-system`（P1 令牌与页头）已完成

## 为什么做（背景）

阶段 0/P1 解决了「界面说实话」和「视觉统一」，但**键盘用户与窄屏用户仍然被挡在门外**。实测现状（`web/src` 盘点）：

| 问题 | 证据 | 后果 |
|---|---|---|
| 没有「跳到主内容」 | 全仓库无 `skip-link` / `跳到主内容` | 每个页面按 Tab 都要先穿过 8 个侧栏项 + 8 个类别子项 |
| 文本级链接与自定义按钮无焦点环 | `focus-visible` 只出现在 `ui/` 五个原语里（button/input/switch/tabs/textarea）；`Sidebar` 的 `NavLink`、卡片里的文本按钮、`toast` 的「查看详情」都没有 | 键盘焦点看不见，等于不能操作 |
| 侧栏是固定 240px，永不收起 | `Sidebar.tsx` 硬编码 `w-60`，`AppLayout` 直接并排 | 375px 屏只剩约 135px 内容宽；窄屏无汉堡入口 |
| 侧栏里有非法嵌套 | `Sidebar.tsx` 在 `<NavLink>`（渲染成 `<a>`）内部放 `<button>` 折叠按钮 | 屏幕阅读器读到嵌套交互元素，Tab 顺序异常 |
| 地标无名 | 唯一 `<nav>` 无 `aria-label`；`<aside>`/`<main>` 无标签 | 只能靠「第几个导航区」辨认 |
| 断点各写各的 | 页面里 `sm:` / `md:` / `lg:` 混用，无成文断点表 | 改一处布局不知道会影响哪档 |
| 未尊重「减少动效」 | 全仓库无 `prefers-reduced-motion` | 用户系统级关闭动效后，抽屉/toast 仍在滑入 |
| 次要文字对比度未验证 | `--muted-foreground` 未做过对比度实测 | 长文与说明文字可能低于 4.5:1 |

这些不是审美问题：用户一旦用键盘或窄屏，界面就**不可用**。而这是「资产中心」这种要天天开的产品的地基。

## 目标

| # | 目标 | 用户可见结果 |
|---|---|---|
| G1 | 键盘可达 | 首屏第一个 Tab 出现「跳到主内容」，回车即跳过导航 |
| G2 | 焦点可见 | 任何一个可聚焦元素在深、浅背景上都有 ≥2px 的可见焦点环 |
| G3 | 窄屏可用 | <1024px 侧栏收为抽屉，汉堡可见，Esc/遮罩可关，焦点不外逃 |
| G4 | 断点成文 | 全站只用 4 档断点（640/768/1024/1280），四档实测无横向滚动 |
| G5 | 语义正确 | 无交互元素非法嵌套；地标有名字；每页唯一 H1 |
| G6 | 尊重偏好 | 系统开启「减少动效」时，过渡与滑入动画不播放（但状态照常变化） |
| G7 | 文字可读 | 所有正文与说明文字对比度 ≥4.5:1（大字号 ≥3:1），以令牌校准而非局部覆写 |

## 非目标

- ❌ 不做视觉改版：1440px 下现有布局、间距、配色观感不变（G5 的合法嵌套修复除外）
- ❌ 不做深色模式（令牌已具备结构，但本变更不新增主题）
- ❌ 不引入第三方依赖（不装 `focus-trap-react`、不加 a11y lint 全家桶；只用 React + 现有 Tailwind）
- ❌ 不做全站 WCAG AA 审计与整改（颜色以外的图片替代文本、表单错误播报等已在阶段 0/P1 覆盖，剩余项按 P2-B/P2-C 处理）
- ❌ 不改信息架构、不改导航项、不改路由

## 关键决策

- **D1 焦点环走全局兜底，而非逐页改**：在 `index.css` 的 base 层为 `a, button, [role='button'], [tabindex]:not([tabindex='-1']), summary` 提供 `:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px }`；组件内已有的 `focus-visible:ring-*` 保留（视觉更细致），二者不冲突。理由：逐页加类必然漏，且新增页面会立刻退化。
- **D2 skip-link 是布局骨架的一部分**：`AppLayout` 的第一个子元素为 `<a href="#main-content">`，默认 `sr-only`，聚焦时变为可见按钮；`<main id="main-content" tabIndex={-1}>`。理由：跳过导航是键盘用户的第一需求，放在最外层才能覆盖所有页面。
- **D3 断点表定死四档**：`sm 640 / md 768 / lg 1024 / xl 1280`，写入设计文档并在 code review 里作为检查项；禁止 `min-[900px]:` 这类任意值。理由：现状 5 处不同断点混用，无法预判影响面。
- **D4 侧栏折叠用「抽屉 + 轻量焦点陷阱」**：<1024px 显示顶部工具条（汉堡 + 当前页 H1 摘要）；抽屉从左侧滑出覆盖内容，遮罩点击/Esc 关闭，关闭后焦点回到汉堡；打开后焦点移到第一个导航项，Tab 在抽屉内循环。不引第三方，用 40 行内的 `useFocusTrap` 实现。理由：移动端抽屉是标准解，但引入依赖只为 40 行逻辑不划算。
- **D5 修掉非法嵌套**：折叠按钮移出 `<NavLink>`，改为「链接 + 按钮」并排（`grid-cols-[1fr_auto]`），按钮保留 `aria-expanded` / `aria-controls`。理由：`<button>` 嵌套在 `<a>` 内不符合 HTML 规范，也破坏屏幕阅读器语义。
- **D6 对比度靠令牌校准**：先写一个纯函数 `contrastRatio(hexA, hexB)`（单测覆盖 4 个已知样例），实测现有 `--muted-foreground` 在 `--background` / `--card` / `--muted` 三种底色上的比值；不足 4.5 则调整 `--muted-foreground` 的 lightness 直到达标。禁止在具体组件里覆写颜色。理由：局部覆写会让同类文字出现两种灰，正是 P1 花力气统一掉的问题。
- **D7 减少动效是全局媒体查询**：`@media (prefers-reduced-motion: reduce)` 内把 `animation-duration` / `transition-duration` 压到 `0.01ms`，并 `animation-iteration-count: 1`。理由：不做「直接关掉动画」，避免依赖 `animationend` 的逻辑（如 toast 自动关闭）失效。
- **D8 验收手段**：键盘走查用 Playwright（`page.keyboard.press('Tab')` + `document.activeElement` 断言），断点用 `page.setViewportSize` + `scrollWidth > innerWidth` 断言，截图落系统临时目录。

## 影响面

- `web/src/index.css`：base 层焦点环、`prefers-reduced-motion`、令牌校准
- `web/src/components/layout/AppLayout.tsx`：skip-link、`main` 地标
- `web/src/components/layout/Sidebar.tsx`：`aria-label`、合法嵌套、抽屉形态、`useFocusTrap`
- 新增 `web/src/components/layout/MobileTopBar.tsx`（<1024px 专用）与 `web/src/lib/use-focus-trap.ts`
- `web/src/lib/contrast.ts`（纯函数 + 单测）
- 各页面：仅当实测出横向溢出的那一处做最小修正（预计 Import 五列网格、Connections 左栏）
- 不动：后端任何代码、接口、数据口径、路由

## 回滚

- 三个 commit 边界：① 令牌与全局 CSS（含 reduced-motion）② skip-link + 地标 + 语义修复 ③ 抽屉与断点修正。
- revert ③ 回滚到固定侧栏，窄屏恢复现状但不影响桌面端；revert ① 只丢焦点环与动效偏好，不破坏布局。

## 待维护者拍板

- **A 抽屉交互**：默认「遮罩 + 点击关闭 + Esc」。是否接受「<1024 常驻折叠成图标条（56px 宽）」这种替代方案？后者更省一次点击，但图标条对中文类目名不友好。
- **B 对比度调整幅度**：若实测 `--muted-foreground` 差一点点（如 4.3:1），是「微调到 4.5」还是「保留观感、把说明文字改用 `--foreground/70`」？建议前者（令牌一次性调，全局一致）。
- **C 是否顺带做 `role="status"` 的空结果播报**（筛选后结果数变化时屏幕阅读器播报）？建议纳入本变更（约 10 行），否则键盘用户筛完不知道为什么列表变空。
