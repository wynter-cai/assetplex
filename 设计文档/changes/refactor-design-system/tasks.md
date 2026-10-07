# Tasks: refactor-design-system（设计系统立骨）

> 提交边界：每个任务独立提交，顺序即建议施工顺序（术语先定词，页面工作用新词，避免二次返工）。
> 命令遵循 project_memory（PowerShell 禁 `&&`/npx/.ps1）：
> - 前端测试：web 目录下 `node node_modules/vitest/vitest.mjs run`
> - 前端类型：web 目录下 `node node_modules/typescript/bin/tsc -b`
> - 前端构建：web 目录下 `node node_modules/vite/bin/vite.js build`
> - 后端回归（本变更应零改动，抽测确认即可）：仓库根 `node node_modules/vitest/vitest.mjs run`
> - 改完前端必须 `vite build` 后重启 `node dist/index.js ui` 才能看效果
> 基线：后端 520 / 前端 124 测试（P0 收官），只增不减。

---

## 阶段一：令牌与字体底座

### T1. 暗色模式代码摘除　【P1】

- 摘除 `web/src` 中 `.dark` 令牌块与全部 `dark:` 工具类；不动 shadcn 组件亮色默认变量。
- 先全量 grep `dark:` 列出清单（组件文件 + 可能的测试断言），逐文件删除后复 grep 确认清零。
- 注意 Edit 工具静默丢写风险（lesson 18）：每文件改完即 grep 回验，必要时 Node 脚本批量替换兜底。
- 验证：web vitest 全绿、tsc 0 错、vite build 通过；系统深色模式下手动打开应用样式正常。
- 提交：`refactor: 摘除未启用的暗色模式代码`

### T2. 品牌色令牌收编 🔴→🟢　【P1】

- `web/src/index.css`：`--primary` 切靛蓝 indigo-600（hsl 243 75% 59%），联动 `--ring`/`--accent` 等 shadcn 变量与 hover 档（indigo-700）；favicon 同步换靛蓝基调。
- 语义色令牌：新增 success/warning/danger/info 四组令牌，徽章变体改"浅底深字"（文字对比度 ≥4.5:1，如 green-700 深字于 green-100 底）。
- 🟢 组件测试先行（改样式前先改断言基线）：badge 变体测试断言新令牌类名/aria 语义而非旧原色类。
- 硬编码清零：`HomeHero.tsx`、`QuickActions.tsx`、健康度数字/图标等处 `indigo-*` 全部改令牌引用；grep `indigo-` 全仓零命中为验收。
- 语义色散落清零：grep `green-500|yellow-500|red-500|blue-500|purple-500`，除令牌定义处外零命中（ErrorState/toast 等既有语义色一并收编）。
- 验证：web vitest + tsc + build；浏览器逐页核对无两套主色并存。
- 提交：`feat: 品牌主色统一切换靛蓝并将语义色收编入令牌`

### T3. 字体栈与 type scale　【P1】

- `index.css` 定义统一字体栈（系统 UI 字体 + PingFang SC / Microsoft YaHei 中文回退）；新增 `tabular-nums` 应用点（资产快照、统计行、列表计数）。
- 6 档 type scale（12/13/14/16/20/24）以 CSS 变量或 Tailwind 语义档落地；徽章 10px → 12px（`text-[10px]` 清零，grep 验收）。
- 页面标题字号收敛（30px 档消灭）在 T5 页头组件中完成，本任务只落 token。
- 验证：web vitest + tsc + build；浏览器实测徽章 ≥12px、数字对齐。
- 提交：`feat: 落地中文字体栈与六档字号体系`

---

## 阶段二：术语定词

### T4. 术语统一 + 词汇表入分类法文档　【P1】

- 定词：库内资产=「我的库」、入库=「收藏」、分发=「同步」；出处轴一词（spec 提案「自建」，若评审改词只改本任务常量与词汇表）。
- 全站文案替换：grep 旧词（`沉淀到保险箱`、`分发同步`、`Hub 设置` 等）逐处替换；后端字段值不动，仅前端展示层映射。
- 设置页标题/副标题人话化（副标题不含 hub.toml）。
- `设计文档/assetplex-asset-taxonomy.md` 增加「界面词汇表」章节（核心词/禁用别称/出现位置）。
- 验证：grep 旧词清零；相关组件测试中的文案断言同步更新后全绿。
- 提交：`refactor: 全站术语统一并沉淀界面词汇表`

---

## 阶段三：排版与页头

### T5. 页头标准组件与全页接入 🔴→🟢　【P1】

- 新增 `PageHeader` 组件（title + subtitle + actions 右槽，H1 统一 20px 档）；🔴 组件测试先行：渲染结构、操作区插槽、字号档 class。
- 接入页：项目、连接、同步中心、导入、设置，以及资产库 5 个类别页（技能/规则/身份/MCP/智能体，类别名 H1 + 一句话描述 + 主操作）。
- 移除各页自带的 24px/30px 标题写法，统一走 PageHeader。
- 验证：web vitest（含"资产库类别页有 H1"断言）+ tsc + build；浏览器核对各页页头齐整。
- 提交：`feat: 标准页头组件并全页接入（资产库补页头）`

### T6. Markdown 排版层级恢复　【P1】

- `Markdown.tsx`：H1 18px / H2 16px / H3 14px / 正文 14px、行高 ≥1.6；H2 与 H1 拉开字号+字重双通道。
- 🔴 组件测试先行：给定含 H1/H2/H3/正文的 markdown，断言渲染出的标签与字号档 class 层级递减。
- 描述区 12px/1.33 旧排版一并升级（详情页技能描述场景）。
- 验证：web vitest + tsc + build；浏览器打开真实技能文档阅读验证。
- 提交：`fix: 技能文档 Markdown 排版层级恢复`

---

## 阶段四：导航与卡片

### T7. 导航去重 + 窄屏详情 overlay + 连接页出血清理　【P1】

- `Vault.tsx`：删除内部 192px 类别栏，类别导航仅保留全局侧栏；布局改单内容列。
- 详情呈现：≥1024px 保留主从，但列表卡片宽度不低于 200px（不足改 overlay）；<1024px 详情一律全屏/抽屉 overlay，关闭返回列表且滚动位置/筛选不丢。
- `Connections.tsx`：去除 `-mx-4 -mt-4` 负 margin 出血；信息面板固定像素宽改自适应。
- 🔴 组件测试先行/随行：Vault 无重复类别栏、窄屏断点下详情 overlay 钩子（断 class/行为而非像素）、连接页容器对齐。
- 验证：web vitest + tsc + build；浏览器 718px 与 1366px 两档实测卡片宽度与详情开关往返。
- 提交：`refactor: 类别导航单轨化并将窄屏详情改为 overlay`

### T8. 技能卡徽章减负（基础版）🔴→🟢　【P1】

- `SkillCard.tsx`：卡面常驻徽章 ≤2（职能 + 出处，格式「自建 · 来源名」）；版本/副本/分类来源移入详情面板；移除右下「查看详情」重复按钮（整卡可点保留）；缺失轴不显示空徽章。
- 🔴 组件测试先行：卡面徽章数量 ≤2 断言、详情含版本/分类来源断言、无「查看详情」按钮断言、无分类卡不出现空徽章。
- 详情面板元信息区补齐（版本/副本/分类来源展示）。
- 验证：web vitest + tsc + build；浏览器核对真实数据卡面。
- 提交：`refactor: 技能卡徽章减负并收敛详情入口`

---

## 阶段五：验收

### T9. 全量验证与浏览器回环　【P1】

1. web vitest 全绿（对比基线 124 只增不减）；后端 vitest 抽测全绿（本变更应零后端改动，确认 520 基线未被动到）。
2. 双侧 tsc 0 错；vite build + tsup build 通过。
3. grep 清零清单逐项复核：`indigo-`、`text-[10px]`、`dark:`、`.dark{`、`沉淀到保险箱`、`分发同步`、`Hub 设置`、`查看详情`（技能卡内）。
4. 重启服务后浏览器 8 场景回环：
   - ① 主色贯通：主按钮/选中导航/CTA/健康度均为靛蓝，无近黑主操作元素；
   - ② 字号：徽章 ≥12px、无 10px 中文，数字等宽对齐；
   - ③ 页头：资产库 5 类别页有 H1+副标题+操作区，设置页显示「设置」；
   - ④ Markdown：真实技能文档 H1/H2/H3 层级可辨、正文 14px/1.6；
   - ⑤ 导航：Vault 内无类别栏，窄屏详情 overlay，开关往返列表状态不丢；
   - ⑥ 卡片：常驻徽章 ≤2、详情含完整元信息、无重复详情按钮；
   - ⑦ 术语：我的库/收藏/同步三词贯穿，无禁用别称；
   - ⑧ 系统深色模式下应用亮色正常。
5. API 二次核实（Invoke-WebRequest）：overview/tools 契约与 P0 交付一致，未被本变更牵动。
6. 浏览器用完即关；三 pass 自审（Bugs/Security/Compliance）；验收记录写入本 change 目录 `ACCEPTANCE.md`（参照 P0 惯例）。

---

## 风险应对预案

- T2 若语义色收编波及面过大（>8 组件）：先保 badge 变体与 ErrorState/toast 主链路收编达标，其余组件列清单随 T7/T8 顺手消化，不阻塞阶段推进。
- T7 详情 overlay 若与既有筛选/滚动状态耦合过深：时间盒半天，超出则 ≥1024px 暂保主从+卡片最小宽兜底（CSS min-width），overlay 只做 <1024px，剩余另开 C 级任务。
- 术语「自建」若评审会改词：只动 T4 常量与词汇表一处 + 全站替换一次，spec 锁"一词"不锁"哪个词"。
- Edit 工具静默丢写（lesson 18）：每处修改后 grep/tsc 回验，批量改动用 Node 脚本带命中断言。
