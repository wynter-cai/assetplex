# tasks: refine-skill-cards-wizard（P2-B）

> 顺序即执行顺序。后端与前端一律先红后绿；纯函数（色彩映射、二进制判定）先写测试。
> 四个独立提交：① 九职能色彩 ② 卡面减负与确认流 ③ 向导降噪 core ④ 向导 UX 与档案。不混 commit。
> 提交前必跑 `node scripts/privacy-check.mjs` 退出 0；截图与临时脚本落系统临时目录，不入库。
> 造数据一律用中性名（`demo-skill`、`_icon.png`），禁止复制本机真实技能目录。

## 组 1 · 九职能色彩（提交 1）

- [ ] **T1** `web/src/index.css` `:root` 增 9 个令牌 `--fn-coding` … `--fn-other`（HSL 三分量），`web/tailwind.config.js` 的 `colors` 增 `fn: { coding: 'hsl(var(--fn-coding))', … }`
  - 验收：颜色数值只在 `index.css` 出现一次；`.dark` 不新增；组件里只用映射类或 `hsl(var(--fn-*))`
- [ ] **T2** 新增 `web/src/components/skills/skill-colors.ts`（≤40 行）+ `skill-colors.test.ts`：导出 `FUNCTION_COLORS: Record<SkillFunction, FunctionColorMeta>` 与 `functionDotClass(key)`
  - 验收：单测断言 9 个 key 与 `FUNCTION_ORDER` 完全一致（无遗漏/多余）、`token` 前缀 `--fn-`、`hue` 与 spec 色相表一致、9 个色相与语义色四区间（0/26/142/224 ±6）无重叠
- [ ] **T3** `web/src/lib/contrast.test.ts` 增「9 个职能色点对 `--background` ≥ 3:1」断言；不达标则回调令牌 L/S（只改令牌，不改组件）
  - 验收：9/9 通过并固化进单测；`--muted-foreground` 相关既有断言仍绿
- [ ] **T4** `SkillCard` 职能徽章、`SkillsToolbar` 的 `CountChip`、`SkillDetail` 元信息行统一加 6px 色点（`aria-hidden` 装饰元素，文字不变）
  - 验收：RTL 断言三处色点存在且 `data-function` 与技能分类一致；选中态仍是 `bg-primary`，语义不变；卡面徽章仍 ≤2 枚
- [ ] **T5** 新增 `web/src/components/skills/FunctionLegend.tsx`（Popover，九行「色点 + 名称 + 当前计数」），入口挂在 `SkillsToolbar`
  - 验收：RTL 断言点击展开、Esc 关闭且焦点回到「图例」按钮；默认状态不渲染常驻九行图例；计数与当前列表分组一致

## 组 2 · 卡面减负与确认流（提交 2）

- [ ] **T6** `web/src/lib/toast-store.ts`：`ToastOptions` 增 `action?: { label: string; onClick: () => void }`，带 action 时 `duration` 下限 30 000ms；`ToastItem` 同步携带
  - 验收：单测断言「带 action 且未传 duration → 30000」「带 action 且传 1000 → 30000」「无 action 仍走 3000」；去重规则与队列上限不变
- [ ] **T7** `web/src/components/ui/toast/*`：渲染 action 文字按钮，点击执行 `onClick` 并 `dismiss(id)`
  - 验收：RTL 断言按钮文案与点击回调各一次；`role="status"` 与自动关闭行为不回归
- [ ] **T8** `SkillCard` 卡面减负：删除底部常驻 `<select>` 行；右上角图标按钮（`aria-label="调整 {name} 的分类"`）+ 卡内确认区（下拉 + 应用 + 取消 + 请求中禁用）
  - 验收：RTL 断言「默认无 select」→「点按钮出现下拉」→「取消不发请求」→「应用只发一次 `PUT`」→「成功后收起」；卡片不含展开区时高度低于变更前
- [ ] **T9** `SkillCard` 失败与撤销：失败 toast + 回滚；成功 toast 带「撤销」，撤销前比对当前分类是否仍等于改动后的值（不等则提示「分类已被修改，撤销已失效」）
  - 验收：单测覆盖「撤销成功写回原值」「撤销时分类已变 → 不发请求」「撤销后 toast 消失」；点击卡内控件不触发整卡展开（`stopPropagation`）
- [ ] **T10** `SkillDetail` 补同款「调整分类」确认控件（行为与卡面一致，共用 T8/T9 的 hook 或组件）
  - 验收：RTL 断言详情内可完成「展开 → 应用 → 撤销」；同一技能在卡面与详情改了分类后列表刷新一致

## 组 3 · 向导降噪 core（提交 3）

- [ ] **T11** `src/core/adapters/base.ts:scanDirectory` 跳过以 `.` 开头的文件与目录（先写失败测试再改实现）
  - 验收：单测「点文件/点目录被跳过」「嵌套隐藏目录整棵跳过」「正常文件照常返回」；WorkBuddy/Claude Code 的 `.mcp.json` 仍出现在盘点中；Qoder `base/.qoder/skills` 起点照常扫到
- [ ] **T12** `src/core/types.ts`：`DiscoveredItem` 增 `binary: boolean`；新增纯函数 `src/core/binary-detect.ts`（`isBinaryPath` 扩展名判定 + `looksBinary` NUL 嗅探）
  - 验收：单测覆盖 `.png/.jpg/.zip/.woff2` 判二进制、`.md/.json/.toml/.js` 判文本、UTF-8 中文 md 不误判、含 `0x00` 判二进制、空文件判文本
- [ ] **T13** `src/core/hub-files.ts` 增 `writeHubFileBytes(relativePath: string, data: Buffer): void`；`SyncEngine.executeImport` 二进制分支：`created`/`overwritten` 走字节写入，`strategy==='merge'` 时 `skipped` + `skipReason='binary-merge'`
  - 验收：单测「二进制 created 落盘逐字节相同」「overwrite 逐字节相同」「merge → skipped 且库内文件不变」「文本路径行为零变化（既有 899 用例全绿）」；`ImportResultItem` 增可选 `skipReason`
- [ ] **T14** `web/src/types/api.ts` 镜像 `binary`（`DiscoveredItem` 必填、`ImportItem` 可选）与 `skipReason`；`Import.tsx` 的 `buildImportRequest` 透传 `binary`
  - 验收：`tsc -b` 0 错；构造二进制条目时请求体含 `binary: true`

## 组 4 · 向导 UX 与档案（提交 4）

- [ ] **T15** `FileItem`：二进制条目显示「二进制」徽章与「收藏时按原样复制」说明；`Import.tsx` 进入 Step 2 的自动全选排除二进制（手动仍可勾选）
  - 验收：RTL 断言二进制项默认未勾选、「全选」后仍未勾选、手动可勾选；文本项默认全选不变
- [ ] **T16** `ConflictDialog` 二进制分支：仅「覆盖 / 跳过」，默认「跳过」，不显示差异视图与仲裁，说明「二进制文件无法逐行合并」
  - 验收：RTL 断言二进制冲突无「智能合并」选项、无「查看差异」按钮；`Import.tsx` 的 `goToStep3` 对 `binary` 冲突项默认写 `skip`，文本项仍 `merge`
- [ ] **T17** Step 3 三组折叠：「内容冲突（N）」「库内已存在（N）」「新增文件（N）」，冲突组默认展开、其余折叠，0 项组不渲染
  - 验收：RTL 断言三组标题与计数之和等于选中数、折叠状态默认值、点击展开后可预览条目、空组不出现
- [ ] **T18** 全量验证：后端 `npm test` / `tsc --noEmit` / `npm run build`；`web` 下 `vitest run` / `tsc -b` / `vite build`
  - 验收：基线不回退（后端 73 文件 899 用例、前端 49 文件 376 用例起步，只增不减）；构建零警告新增
- [ ] **T19** e2e（Playwright）：① 技能页「调整分类 → 应用 → 撤销」回环；② 收藏向导隐藏文件不出现、二进制条目文案与「无合并选项」约束
  - 验收：新增用例全绿，既有 3 条 spec 不回归；跑完关闭全部标签页
- [ ] **T20** 档案：`tasks.md` 勾选并填 commit 短哈希；`assetplex-ui-ux-roadmap.md` P2-B 标记完成；本变更的「拍板结果」回填 proposal
  - 验收：隐私终检 exit 0；四个提交 `git log --oneline -4` 自证并汇报

## 预估与风险

- 预估：色彩 0.5 天、卡面与确认流 1.5 天、core 降噪 1 天、向导 UX 与验收 1 天（净 4 个工作日）
- 风险 1：`scanDirectory` 是四个适配器共享基类 → 先写覆盖四个工具的失败测试，再改一行实现，避免误伤显式映射的点文件
- 风险 2：二进制扩展名白名单必然有漏 → 扫描期扩展名 + 导入期 NUL 嗅探双保险，未知后缀走嗅探
- 风险 3：`SkillCard` 整卡是 `role="button"`，确认区内控件要全部 `stopPropagation`，否则点开下拉会同时展开详情
- 风险 4：撤销是「乐观」动作，可能与用户随后手改冲突 → 写回前比对当前值，不等则只提示不写
- 风险 5：Step 3 分组改动会动到既有 e2e 的选择器 → 用 `data-testid` 定位组标题，不依赖文案
