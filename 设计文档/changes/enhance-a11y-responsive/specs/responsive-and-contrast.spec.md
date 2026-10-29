# spec: responsive-and-contrast（断点收敛、窄屏可用、文字可读）

> capability：在 375 / 768 / 1024 / 1440 四档宽度下界面不横向溢出、不被侧栏挤死，文字对比度达标
> 关联：proposal G3/G4/G7、D3/D4/D6
> 消费者：AppLayout、Sidebar、所有列表与表单页面

## 为什么需要这份 spec

侧栏固定 `w-60`（240px）且永不收起，在 375px 屏幕下只剩约 135px 给内容；断点散落在 `sm` / `md` / `lg` 三档各写各的，没人知道改一处会影响哪一档；说明文字的灰度从未验证过对比度。本 spec 用「四档实测 + 无横向滚动」把这两件事变成可验收条件。

## 断点表（本 spec 定死）

| 名称 | 最小宽度 | 适用 |
|---|---|---|
| `sm` | 640px | 双列卡片、表单两列 |
| `md` | 768px | 主从两栏（列表 + 详情）、设置页两列 |
| `lg` | 1024px | 侧栏常驻、资产详情右栏吸顶 |
| `xl` | 1280px | 宽屏列表可加列（本变更不新增列） |

规则：只允许使用上表四档；禁止 `min-[Npx]:` 任意值与第五档自定义断点。

## Scenario 1 — 375px 可用

- **Given** 视口 375×812
- **When** 打开首页、资产库、连接、同步、切换、设置、项目
- **Then** 侧栏不占据宽度（收为抽屉），内容区可用宽度 ≥ 335px
- **And** 每个页面 `document.documentElement.scrollWidth` 不大于 `window.innerWidth`
- **And** 顶部工具条始终可见，汉堡按钮可点

## Scenario 2 — 768px 可用

- **Given** 视口 768×1024
- **When** 依次打开上述七页
- **Then** 无横向滚动
- **And** 主从两栏页面（资产库、同步）详情以浮层呈现而非挤压列表
- **And** 列表卡片宽度不小于 240px

## Scenario 3 — 1024px 起恢复常驻侧栏

- **Given** 视口 1024×768
- **When** 打开资产库
- **Then** 侧栏常驻可见，无汉堡按钮
- **And** 资产详情以右栏呈现（不覆盖列表）
- **And** 无横向滚动

## Scenario 4 — 1440px 观感不回归

- **Given** 视口 1440×900
- **When** 与变更前的同页截图对比
- **Then** 布局结构、间距、字号、配色一致（允许焦点环、skip-link 隐藏态不参与比较）
- **And** 主内容最大宽度仍为既有 `max-w-7xl`

## Scenario 5 — 抽屉不遮挡且可关

- **Given** 视口 375px，抽屉已打开
- **When** 点击抽屉外的遮罩区域
- **Then** 抽屉关闭，页面回到原滚动位置
- **And** 抽屉打开时页面背景不滚动（body 滚动被锁定），关闭后恢复

## Scenario 6 — 文字对比度达标

- **Given** 令牌 `--muted-foreground` 在 `--background`、`--card`、`--muted` 三种底色上
- **When** 计算对比度
- **Then** 三者均 ≥ 4.5:1
- **And** `--foreground` 与三种底色均 ≥ 7:1
- **And** 主按钮文字（`--primary-foreground` on `--primary`）≥ 4.5:1
- **And** 语义色文字（`--success` / `--warning` / `--destructive`）用于文字时 ≥ 4.5:1，仅用于图形/描边时 ≥ 3:1
- **And** 达标方式只能是调整令牌值，不允许在组件内覆写颜色

## Scenario 7 — 无任意断点

- **Given** 变更完成后的 `web/src`
- **When** 检索 `min-[` 与 `max-[` 写法的任意断点
- **Then** 结果为 0（既有例外需在本文件登记原因，且最多 1 处）

## Scenario 8 — 表格与长文本不溢出

- **Given** 资产名很长（120 字符）或同步目标路径很长
- **When** 在 375px 下查看列表与详情
- **Then** 文本按既有规则截断或换行，不撑破卡片
- **And** 不出现横向滚动条

## 验收口径

- Playwright 脚本按四档视口逐页断言 `scrollWidth <= innerWidth`，输出 PASS/FAIL 表格；
- 对比度用 `web/src/lib/contrast.ts` 的纯函数在单测里断言，样例值取自 `index.css` 令牌；
- 1440 截图与变更前对比，允许差异仅限 skip-link 隐藏态与焦点环；
- 走查脚本与截图均落系统临时目录，不入库。
