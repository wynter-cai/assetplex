# Tasks: fix-ui-trust-gaps（UI 信任缺口止血）

> 提交边界：每个任务独立提交，顺序即建议施工顺序。
> 后端/前端测试命令遵循 project_memory：
> - 后端：`node node_modules/vitest/vitest.mjs run`（仓库根）
> - 前端：web 目录下 `node node_modules/vitest/vitest.mjs run`
> - 类型：后端 `node node_modules/typescript/bin/tsc -b`；前端 web 目录下同
> - 构建：后端 `node node_modules/tsup/dist/cli-default.js`；前端 `node node_modules/vite/bin/vite.js build`
> 每个任务完成即跑相关测试；全部完成跑 T10 总验证块。

---

## 阶段一：后端契约（TDD）

### T1. overview 初始化判定修复 🔴→🟢　【P0】

- 🔴 RED：在 `tests/unit/` 对应 overview 测试中新增用例——hubRoot 存在、有资产文件、hub.toml **不存在**时 `getOverview()` 返回 `hubInitialized=true`；空目录/目录不存在时为 false；toml 与资产都在时保持 true（回归）。
- 🟢 GREEN：修改 `src/core/overview.ts:77` 判定为 `health.hubExists && totalAssets > 0`；`hubTomlExists` 保留在 health 数据中（P2-C 健康度下钻用），不再参与首页 gate。
- 验证：overview 相关测试全绿；`Invoke-WebRequest /api/hub/overview` 实测 hubInitialized=true。
- 提交：`fix: overview 初始化判定不再要求 hub.toml 存在`

### T2. overview assetStats 补 agent 类别 🔴→🟢　【P0】

- 🔴 RED：测试断言 `assetStats` 含 `agent` 键且等于 hub agents 目录文件数；类型测试/前端类型同步。
- 🟢 GREEN：`overview.ts` 的 `FrontendCategory` 扩为 5 类；`CATEGORY_MAP` 增加 `agents: 'agent'`；assetStats 初始值补零。
- 同步更新：`web/src/types/api.ts` 的 overview 类型（assetStats 5 键）；已有 Home/Snapshot 测试夹具补 agent。
- 验证：后端测试绿；API 实测 `assetStats.agent` 为非负整数且与 agents 目录文件数一致。
- 提交：`feat: overview 资产统计补齐 agent 类别`

### T3. 预研并修复 toggle 在 hub.toml 缺失时的持久化 🔴→🟢　【P0】

- 🔴 RED：工具路由测试——hub.toml 不存在（或配置文件缺失）时 POST `/tools/:name/toggle` 返回 200 且再次 GET 配置 enabled 已翻转。
- 🟢 GREEN：若现状失败（saveConfig 不能自建文件），修复配置写入路径（确保目录/文件缺失时创建默认配置后写入）；若现状已通过，仅保留测试作为回归锁。
- 验证：tools 路由测试全绿。
- 提交：`fix: 工具启停开关在配置文件缺失时也可持久化`（无代码改动则不产生提交）

---

## 阶段二：前端反馈底座

### T4. Toast 基础设施 🔴→🟢　【P0】

- 新增 `web/src/components/ui/toast.tsx`（基于 @radix-ui/react-toast 封装：success/error/info 三态、自动关闭时长区分、手动关闭）与 `web/src/lib/toast-store.ts`（zustand 队列，成功 3s/错误 6s、同内容去重）；`App.tsx` 挂载 `<Toaster />`。
- 组件测试：成功/错误 toast 渲染与自动消失、批量汇总长文折叠、多次触发队列行为。
- 验证：web vitest 全绿；tsc 0 错。
- 提交：`feat: 全局 toast 反馈基础设施`

### T5. 友好错误态组件　【P0】

- 新增 `web/src/components/common/ErrorState.tsx`（图标+用户语言说明+重试按钮，可选 title）；组件测试含重试回调。
- 先只建组件与测试；替换在 T8 做。
- 提交：`feat: 统一错误态组件 ErrorState`

---

## 阶段三：页面接线（组件测试先行/随行）

### T6. 首页真实态 + 资产快照 5 类自适应　【P0】

- `AssetSnapshot.tsx`：栅格改 `grid-cols-[repeat(auto-fit,minmax(120px,1fr))]`（或等效响应式），类别继续 map 配置不写死；快照头部总数按 5 类求和。
- `Home.tsx`：骨架屏类别格改为按 `ASSET_CATEGORIES` 生成（5 格一致布局）；确认已初始化态在新判定下正常渲染（欢迎态逻辑不变）。
- `RecentActivity.tsx`：空 recentActivities 时不渲染「查看全部」；有数据时本变更也不渲染（spec 明确）。
- 测试：Home.test 补"toml 缺失但有资产仍显示指挥中心"契约夹具（mock overview）；快照渲染 5 格；窄屏类不断言像素只断言 class/样式钩子。
- 验证：web vitest + tsc；浏览器实测首页不再是欢迎页、5 格齐全。
- 提交：`fix: 首页按真实资产状态渲染并补齐五类快照`

### T7. 连接页三控件接线 + 内部导航　【P0】

- Switch 接 `api.toggleTool`（mutation）：进行中禁用、失败回退+错误 toast、成功 invalidate `['tools']` 与 `['tool-detail',name]` 及 `['overview']`。
- 「重新检测」接 `api.detectTool`：按钮加载态、成功轻反馈、失败 toast 且不清空面板。
- 「扫描新工具」改文案「重新扫描」，接 query refetch（GET /tools）；加载禁用。
- 「导入到 Hub」`<a href>` 改 react-router `navigate('/import')`（用 Button asChild 时改 Link/useNavigate）。
- 连接页读 `?tool=<name>`：有效则选中，无效回退第一个；替换现有"无条件选第一个"。
- 测试：AgentsView 同款 Testing Library 模式——切换成功/失败回退、detect 点击、query 选择。
- 验证：web vitest + tsc；浏览器：TRAE 关→开持久化（API 二次核实配置文件）、Qoder 检测、?tool=codex 定位。
- 提交：`fix: 连接页启停/检测/扫描控件接线并支持工具定位`

### T8. 19 处 alert 替换 + 设置页反馈 + 错误态替换　【P0】

- 按 `feedback-toast.spec.md` 分类逐文件替换：SkillsView(4)/use-ai-classify(3)/AiConfigDialog(2)/SkillDetail(2)/SkillCard/SkillCreateDialog/SkillDialogs、agents×3、ProjectCard、WorkspaceSettingsCard。
  - 错误 → `toast.error`；批量结果 → 汇总标题 + 失败明细（>3 折叠）；SkillCard 职能切换失败增加 select 值回退。
  - 若发现 `confirm` 语义的 alert：保留为既有确认对话框模式，不用 toast 冒充确认。
- 设置页保存 mutation：onSuccess toast + 已有"未保存"清除；onError toast。
- `ErrorState` 替换 SkillsView/Vault/Projects/Connections 的 `加载失败: {message}` 红字块（重试=refetch）。
- 替换后全仓 Grep `alert(` 应只剩测试或零命中（如 jsdom 对 toast 的断言除外）。
- 测试：更新相关组件测试断言 toast 文本而非 alert dialog；批量部分成功场景必测。
- 提交：`refactor: 全量以 toast 替换 alert 并统一列表错误态`
- （如 diff 过大可拆两个提交：alert 替换 / 错误态+设置反馈）

### T9. 导航清理与品牌门面　【P0】

- `Sidebar.tsx`：移除「活动」项与 ActivityIcon 导入；确认无其他入口指向 /activities。
- 路由：`/activities` 占位路由替换为 `<Navigate to="/" replace />`；Placeholder.tsx 若无其他引用则删除（含其测试如有）。
- `index.html`：title 改 `AssetPlex`；新增 `web/public/favicon.svg`（Boxes 图形简洁 SVG，单色 primary 近黑或靛蓝待 P1 统一，先用近黑与现 Logo 一致），替换 vite.svg 引用。
- 测试：Sidebar.test 断言无"活动"项；路由测试（若有）/手动验证 /activities 回首页、/activity 死链不再被任何组件引用（Grep `/activity` 精确匹配）。
- 提交：`fix: 撤下无数据源的活动入口并品牌化 favicon/标题`

---

## 阶段四：验收

### T10. 全量验证与浏览器回环　【P0】

1. 后端 vitest 全绿；前端 vitest 全绿（记录测试数对比：当前 512 / 97 基线，只增不减）。
2. 双侧 tsc 0 错；tsup build + vite build 通过。
3. 重启服务（vite build 后重启 node dist/index.js ui），浏览器 6 场景回环：
   - ① 首页显示指挥中心（非欢迎页）、快照 5 类含智能体；
   - ② 连接页 Qoder（未启用）开关打开→刷新仍打开→关闭还原（测后恢复原态）；
   - ③ 「重新检测」有加载与反馈、「重新扫描」列表刷新；
   - ④ `/connections?tool=codex` 直接选中 Codex；
   - ⑤ 制造一次失败操作（如断网/错误 id）验证错误 toast 与 select 回退；
   - ⑥ /activities 回首页、侧栏无活动、favicon/title 生效。
4. 数据清回基线（toggle 改动恢复）；API 用 Invoke-WebRequest 二次核实；浏览器标签关闭。
5. 三 pass 自审（Bugs/Security/Compliance），输出验收记录到本 change 目录 `ACCEPTANCE.md`（可选，参照既有变更惯例）。

---

## 风险应对预案

- toggle 写配置若牵连 hub.toml 自动生成逻辑过大：T3 时间盒 1h，超出则降级为"toml 缺失时开关禁用并 tooltip 提示初始化"，另开 C 级任务，不阻塞 T7 其余控件。
- alert 替换中若发现阻塞式确认流程依赖（破坏性操作）：保留确认对话框（DeleteConfirmDialog 模式），记录清单，不强行 toast 化。
- 浏览器实测与组件测试冲突时，以 api-contract.ts 与真实 API 回环为准（lesson 15）。
