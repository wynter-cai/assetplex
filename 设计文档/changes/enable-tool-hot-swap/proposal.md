# Proposal: enable-tool-hot-swap(工具热切换)

> **级别**:S(新顶层工作流 + 跨多资产类别 + 新编排/验证/回滚模块)
> **日期**:2026-10-11
> **依据**:[recon-notes.md](./recon-notes.md) 缺口 G1/G3/G4/G5;[assetplex-asset-taxonomy.md](../../assetplex-asset-taxonomy.md) Phase B
> **诉求原文(维护者)**:TRAE/CodeBuddy/Codex/Qoder 积分会用光,要能在工具间切换,且**低成本切换**;全局规则/项目规则/用户记忆/技能/MCP/Agent 都能方便互迁,并有资产中心统一管理。
> **前置**:P0/P1 UI 已完成;`add-skill-agent-write-management`、`add-agents-skills-projects` 已铺部分写管理地基。

## Goal(解决什么问题)

把产品重心从"**资产保险箱(存)**"迁到"**工具热切换(用)**":当某个 AI 工具积分耗尽,用户在 AssetPlex 里**选定目标工具 → 一键把自己的全部能力(身份/规则/技能/MCP/记忆/子代理)按目标工具格式投放到位 → 系统回读验证确实生效 → 出错可回滚**。目标体验:换工具到能接着干,控制在几分钟内,且"显示成功=真的成功"。

**本次不做项目级规则分发**(G2),它单独立项 `sync-project-level-rules`(M),可先行或并行——避免本变更范围膨胀。

## 北极星与成功标准

- **North Star**:"我能随时把工具换掉,而能力不缩水。"
- **一次切换算成功的判据**:目标工具目录里,该带的资产**文件确实存在 + 格式合法 + 回读内容与源一致**;身份/记忆/子代理不再缺失;失败/覆盖有预览与回滚。

## Scope(做什么 / 不做什么)

**做(核心编排层)**:
1. **切换包(Swap Bundle)模型**:定义"我的资产集"= 当前 Hub 内的 identity + rule + skill + mcp + memory + agent 的集合快照;以"工具"为单位整体投放,而非逐类手动 sync。
2. **资产覆盖面补齐(G1)**:把 `identity`、`memory`、`agent` 纳入各适配器的 `resolveHubItems` 分发映射(workbuddy/codebuddy 已知缺 identity+memory+agent;其余工具按其目录约定补齐)。复用 `add-skill-agent-write-management` 的写能力。
3. **一键切换工作流(G3)**:新交互——选目标工具 → 展示切换包概览与冲突预览(复用 `plan`) → 确认执行(复用 `run`)→ 逐资产**回读验证**(G4,新增)→ 结果面板。
4. **验证生效(G4)**:落盘后回读目标文件,校验存在 + 可解析(按类型:md/json/toml)+ 与源一致;不一致标红并计入结果。
5. **回滚(G5)**:执行前对被覆盖的目标做备份(仅覆盖 `differs`/已存在项),提供"撤销本次切换"恢复备份;新增切换历史(喂给活动流)。

**不做(防蔓延)**:
- 项目级规则分发(G2 → `sync-project-level-rules`)
- 跨机器/云同步、账号体系(违背零上传)
- 多工具"同时保持实时一致"的常驻守护(本次是**显式触发的切换动作**,非自动同步)
- P2 的 a11y/卡片减负(独立 change)
- AI 分类/推荐增强

## 架构落点(不违背单向依赖)

- 新增 `core/swap.ts`(纯逻辑:Bundle 组装、验证、回滚编排),依赖 `sync-engine` + `adapters`,不反向依赖 server/web。
- 验证与回滚作为 `SyncEngine.run` 的**后置增强**,不改现有 plan/run 契约;新增 `swapRoutes`:预览 / 执行 / 验证结果 / 回滚。
- 前端新增"切换"页(选工具 + 预览 + 执行 + 验证/回滚),复用 P0/P1 的 toast、ErrorState、PageHeader、设计令牌。

## Risks(风险点)

| 风险 | 缓解 |
|---|---|
| identity/memory 各工具目录约定不一(路径/文件名/格式差异大),写进去工具不认 | 逐工具适配器显式实现映射,不做大一统假设;先用 workbuddy/codebuddy 打通,其余按 recon 逐个补;每个映射都有 Given-When-Then + 回读验证 |
| 回滚备份体积/清理(把工具目录越写越乱) | 只备份"将被覆盖"的项,备份落 Hub 内 `.swap-backup/<ts>/`,成功切换后按保留策略清理 |
| 一键投放误覆盖用户在目标工具里手改的资产 | 执行前冲突预览(复用 plan 的 differs),differs 项默认不覆盖需显式确认(智能默认宪法①) |
| 验证"通过"但工具实际没加载(工具自身加载逻辑黑盒) | 验证只保证"文件到位且合法可解析",文案如实说"已写入并校验",不谎称"工具已生效";浏览器/手工回环抽测 |
| 范围横跨 6 类资产 × 5 工具,易失控 | 分期:先 1 个工具(默认 workbuddy/codebuddy)× 6 类跑通端到端,再横向扩工具;tasks 按"工具×能力"切小步 |
| 与历史 change(写管理/盘点)职责重叠 | 本 change 只做"编排+验证+回滚+把已有写能力接进 bundle",不重实现写;先读那几个 change 的 spec |

## Definition of Done(本变更)

1. `core/swap.ts` 的 Bundle/验证/回滚有单测(TDD,Red→Green),覆盖:缺 identity 时切换失败可定位、differs 不默认覆盖、回滚恢复备份。
2. 至少 1 个工具端到端:一键切换把 identity/rule/skill/mcp/memory/agent 全投放,回读验证全绿;手改冲突项被拦在预览。
3. 后端/前端 vitest 全绿(基线后端 520/前端 148,只增不减)、双侧 tsc 0 错、tsup + vite build 通过。
4. 对照 specs 所有 Scenario 手工/浏览器回环;API 用 Invoke-WebRequest 核实;测试数据清回基线。
5. 零数据上传自查:全流程无外发动作(除用户自配 LLM 端点)。

## 待维护者拍板(评审会上一次决)

1. **首个打通工具**选哪个?(建议 workbuddy/codebuddy,因你资产主战场在此、适配器最现成)
2. **切换包默认含哪些类别**?(建议:六类全选为默认,身份/记忆若某工具不支持则该项目标注"此工具不支持,已跳过")
3. **回滚保留策略**:成功后备份保留几次/多久?(建议保留最近 3 次,可配置)
4. 是否认可把 **G2 项目级规则**拆成独立 change `sync-project-level-rules` 先行。
