# Tasks: enable-tool-hot-swap(工具热切换)

> 提交边界:每任务独立提交,顺序即施工顺序(先补类型与适配器覆盖面→再核心编排→再路由→再前端→最后验收)。
> 命令遵循 recon/HANDOFF(PowerShell 禁 `&&`/npx/.ps1):
> - 后端测试:仓库根 `node node_modules/vitest/vitest.mjs run`
> - 后端类型/构建:`node node_modules/typescript/bin/tsc -b` / `node node_modules/tsup/dist/cli-default.js`
> - 前端:web 目录下同款 tsc/vitest,改完必须 `node node_modules/vite/bin/vite.js build` 再 `node dist/index.js ui`
> - Edit 静默丢写风险:每改即 grep/tsc 回验
> 基线:后端 520 / 前端 148,只增不减。首个打通工具 = workbuddy/codebuddy(维护者已拍板)。
> 分期原则:先在 workbuddy/codebuddy × 六类跑通端到端(T2–T6),再横向扩其余工具(T7),不并行铺开。
> 施工进度(2026-10-11):T1–T6 已完成(后端 553 全绿、tsc 0 错、tsup 构建通过;暂未 git commit)。
> T3–T6 实现落点:core/swap.ts(SwapEngine 编排) + swap-types.ts(契约类型) + swap-plan.ts(预览展开/冲突) +
> swap-exec.ts(单元落盘/覆盖前备份) + swap-verify.ts(回读验证) + swap-fs.ts(枚举/清单/历史/保留)。
> 施工进度(2026-10-11 续):T7–T9 已完成(后端 567 全绿、前端 156 全绿、前后端 tsc 0 错、双端构建通过;暂未 git commit)。
> T7 落点:server/routes/swap.ts(swapRoutesFactory 五端点,对齐 api-contract) + hubContext.getSwapEngine +
> config swap.backupRetain 配置段;适配器横向体检结论:各工具已有映射即能力上限(缺口由
> adapters/swap-support-matrix.test.ts 锁死为 support=false,含 workbuddy agent 不落 expert-history 的边界)。
> T8/T9 落点:web pages/Swap.tsx + components/swap/*(预览面板/结果面板/历史列表/文案) + 侧栏“切换”入口。
> 施工进度(2026-10-11 三续):T10 验收完成——后端 568 / 前端 156 全绿、双端 tsc 0 错、双端构建通过;
> 真实端到端双回环(默认不覆盖+显式覆盖备份)均通过,目录快照回基线;发现并 TDD 修复空目录残留缺陷
> (swap-exec createdDirs 记清单);五端点 Invoke-WebRequest 核实、零外发自查通过。验收记录见 ACCEPTANCE.md。暂未 git commit。

---

## 阶段一:类型与资产覆盖面(G1 地基)

### T1. HubItemType 追加 memory + 类别动态化体检 🔴→🟢　【S/G1】

- `src/core/types.ts`:`HubItemType` 追加 `| 'memory'`(现缺)。
- 体检:grep 全仓是否有写死"4/5 类"数量或穷举 switch 处(sidebar、AssetCategory 映射、scanner),登记需随新类别扩展的点(不写死是本 change 硬约束,taxonomy §六.1)。
- 🔴 先测:新增/更新类型层测试,断言 memory 可作为 HubItem.type 被序列化/计数不报错;overview 计数不因 memory 崩。
- 验证:后端 vitest 全绿 + tsc 0 错。
- 提交:`feat: HubItemType 追加 memory 并体检类别动态扩展点`

### T2. workbuddy/codebuddy 适配器纳入 identity/memory/agent 分发 🔴→🟢　【S/G1】

- `src/core/adapters/workbuddy.ts`:`resolveHubItems` 增补映射——
  - identity → 目标 `IDENTITY.md`(及 `-personal/` 约定,按 recon §3.1);
  - memory → 目标 `memory/`;
  - agent → 目标 experts/agents 落点(与 `add-skill-agent-write-management`/`agent-write.ts` 对齐,复用其写能力,不重实现)。
- `supportedTargets`/`scan()` 同步扩展,反向导入能把这三类收回 Hub。
- 🔴 先测:给定含 identity/memory/agent 的 Hub,`resolveHubItems('workbuddy')` 返回覆盖六类的目标;某类在库中为空则不产生目标项。
- CodeBuddy 写入路径复核(G6):资产优先落 workbuddy;若目标解析到 codebuddy,`mcp.json`(无点)写入路径与 detect 优先级用测试锁死。
- 验证:后端 vitest + tsc;抽测真实 `~/.workbuddy` 目录扫描不炸。
- 提交:`feat: workbuddy/codebuddy 适配器纳入身份记忆子代理分发`

---

## 阶段二:核心编排(纯逻辑,swap 引擎)

### T3. core/swap.ts:Bundle 组装 + 预览 🔴→🟢　【S/G3】

- 新 `src/core/swap.ts`:`buildBundle(tool)` 汇总六类 HubItem;`preview(tool)` 复用 `SyncEngine.plan` 生成 `SwapPreview`(按 api-contract.ts)。
- 冲突判定:differs 项 `defaultOverwrite=false`;不支持类别 `support={supported:false,reason}`。
- 🔴 测:全支持工具预览六类齐全;不支持类别标 skip;differs 默认不覆盖;`generatedAt` 有值。
- 验证:后端 vitest + tsc。
- 提交:`feat: swap 核心-切换包组装与冲突预览`

### T4. core/swap.ts:执行 + 备份 🔴→🟢　【S/G4/G5】

- `execute(req)`:先按 `previewGeneratedAt` 做 staleness 校验(目录变了→拒绝,要求重预览);对将覆盖的 differs 项写前备份到 `.swap-backup/<swapId>/`;复用 `SyncEngine.run` 落盘;新增项不备份。
- 🔴 测:未确认覆盖的 differs 项保持原样且计 skip;确认覆盖项先备份再写;备份只含覆盖项;staleness 命中拒执行。
- 验证:后端 vitest + tsc。
- 提交:`feat: swap 核心-执行与覆盖前备份`

### T5. core/swap.ts:回读验证 🔴→🟢　【S/G4】

- `verify(item)`:回读目标→存在 + 按类型解析(md 直读/json/toml 用既有 transforms)+ 与源一致→`SwapVerifyResult`。
- 诚实文案:结论字段仅表"已写入并校验",不含"工具已加载"。
- 🔴 测:一致→passed;篡改目标→matchesSource=false 计失败;MCP JSON 非法→parseable=false;源缺失→exists=false。
- 验证:后端 vitest + tsc。
- 提交:`feat: swap 核心-落盘回读验证`

### T6. core/swap.ts:回滚 + 历史 + 保留策略 🔴→🟢　【S/G5】

- `rollback(swapId)`:覆盖项从备份恢复、本次新增项移除;原子(要么完整要么报失败)。`history` 记录每次切换;备份保留最近 3 次(默认,`swap.backupRetain` 可配),清理仅及备份目录。
- 🔴 测:回滚后目标==切换前;新增项被删;超 3 次的旧备份被清;清理不触碰工具资产目录。
- 验证:后端 vitest + tsc。
- 提交:`feat: swap 核心-回滚切换历史与备份保留`

---

## 阶段三:HTTP 路由层

### T7. server/routes/swap.ts + 横向扩其余工具　【S】

- 新 `swapRoutes`:`GET /tools`、`POST /preview|/execute|/rollback`、`GET /history`,薄封装调用 core/swap,挂进 `src/server/index.ts`。
- 其余工具(trae-cn/claude-code/codex/qoder)适配器按 T2 同法补 identity/memory/agent 映射(仅其目录存在该概念时;不支持则 support=false),逐个加测。
- 🔴 路由测:preview→execute→history 往返;rollback 幂等;未安装工具作目标返回明确错误。
- 验证:后端 vitest(含新增 swap 路由测)+ tsc + tsup build。
- 提交:`feat: swap HTTP 路由并扩展各工具资产映射`

---

## 阶段四:前端「切换」页

### T8. 切换页:选工具 + 预览 + 冲突决策 🔴→🟢　【S/G3】

- 新页 `web/src/pages/Swap.tsx` + 路由/侧栏入口(复用 PageHeader/设计令牌/toast/ErrorState)。
- 选目标工具(未安装置灰+原因)→ 调 `/api/swap/preview` → 六类分组概览 + 支持/跳过标注 + 冲突项"覆盖"开关(默认关)。
- 🔴 组件测:六类分组渲染、不支持类别显示 skip 文案、differs 项覆盖开关默认关闭。
- 验证:web vitest + tsc。
- 提交:`feat: 切换页-工具选择与冲突预览`

### T9. 切换页:执行 + 验证结果 + 撤销 + 历史　【S/G4/G5】

- 执行按钮→调 `/execute`,进度与结果面板:written/skipped/failed 计数 + 逐资产验证结论(passed/未过维度)。
- "撤销本次切换"→调 `/rollback`;历史列表页展示 `/history`。
- 文案守诚实边界:显示"已写入并校验",不写"工具已生效"。
- 🔴 组件测:验证未过项标红且整体不报全成功;撤销入口在 rollbackAvailable 时出现。
- 验证:web vitest + tsc + vite build。
- 提交:`feat: 切换页-执行验证结果与撤销入口`

---

## 阶段五:验收

### T10. 全量验证与回环　【S】

1. 后端 vitest 全绿(基线 520 只增不减)、前端 vitest 全绿(基线 148 只增不减);双侧 tsc 0 错;tsup + vite build 通过。
2. 端到端(workbuddy/codebuddy,真实但可逆):收藏→切换预览六类齐全→执行(冲突项默认不覆盖)→回读验证全绿→撤销→目标目录回到切换前。冒烟用 API 做可逆操作,不往宿主工具自管目录塞测试数据(HANDOFF §6.6)。
3. 对照四份 spec 全部 Scenario 逐条回环;API 用 Invoke-WebRequest 二次核实;浏览器用完即关。
4. 零数据上传自查:swap 全流程无外发(除用户自配 LLM);grep 网络调用点确认。
5. 测试数据清回基线(技能 442/我的库 31 口径)。
6. 三 pass 自审(Bugs/Security/Compliance);验收记录写 `ACCEPTANCE.md`(参照 P0/P1 惯例)。

---

## 风险应对预案

- T2 identity/memory 目录约定若与工具实际加载格式有出入:以"文件到位+可解析+与源一致"为验证底线,加载层留给真实手工回环抽测,不夸大承诺(spec 已锁文案边界)。
- T4/T6 备份若体量增长快:保留 3 次 + 仅备份覆盖项已控量;仍过大则加"仅元数据+差异文件"策略,另开 C 级任务,不阻塞本 change。
- 横向扩工具(T7 后半)个别工具无某类别概念:置 support=false 跳过即可,强工具全绿即可先交付,弱工具标注降级,分期不拖累端到端。
- 与 `add-skill-agent-write-management` 写能力重叠:swap 只做"把已有写/盘能力接进 bundle + 验证回滚编排",不改其实现;先读那几个 change 的 spec 对齐函数签名。
- Qoder 为 per-project(qoder.ts 有 per-project 策略):切换包对 qoder 的项目级投放若复杂度过高,首版对 qoder 仅投用户级可投类别,项目级归 `sync-project-level-rules` change。
