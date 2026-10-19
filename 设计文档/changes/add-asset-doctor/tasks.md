# tasks: add-asset-doctor

> 前置：本 tasks 与 proposal/specs/api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 依赖：add-llm-conflict-arbitration Phase A（准则元资产）与 Phase B（prompt 组装/闭集解析/缓存/LlmClient 基建）先行完成；若维护者要求医生先行，则 Phase A+B 作为医生的前置任务一并执行，仲裁接入（其 Phase C）后置。
> 全流程 TDD：每条后端任务先红测试。

## Phase E — 诊断引擎（specs/asset-diagnosis.spec.md）

- [x] E1 `src/core/doctor.ts`：确定性预检 `runMechanicalChecks(kind, content)`（frontmatter 必填/description 空/正文超长/shouting，按类别阈值表），输出 DiagnosisIssue（criterion='mechanical:<id>'，fixable 按检查项定义）。测试 Scenario 3
  > 实测：落地于 doctor-mechanical.ts；阈值表 skill/agent 必填 name+description、command 必填 description、rule/identity 无必填；正文限 skill 10000/agent 6000/rule 4000/identity 8000/command 2000 字符；shouting ≥3 处连续全大写词。8/8 绿（b8001d6）
- [x] E2 `buildDiagnosisPrompt({ kind, content, criteriaBlock })`：内置基线骨架（审视单资产 × 准则、无问题返回空 issues 不凑数）+ 准则区 + JSON 闭集契约；内容截断 6000 并标 `contentTruncated`。测试 Scenario 2/6/7 数据面
  > 实测：另含 mechanicalFindings 注入（防模型重复报机械项）；截断标注+contentTruncated 三态齐备（b8001d6）
- [x] E3 `parseDiagnosisOutput(output)`：fenced 容忍 → overall 三值闭集 → issue 必填字段与 severity 闭集校验，非法 throw。测试 Scenario 8 全部非法形态
  > 实测：落地于 doctor-parse.ts；fixable 缺失宽容为 false；extractJsonObjectText 从 arbitration 抽公共 llm-output.ts（b8001d6）
- [x] E4 `diagnoseAsset(input, deps)`：机械项恒跑；AI 未配置返回 mechanicalOnly=true 不发请求；缓存 key = sha256(内容 + 适用准则集哈希 + model)，命中不调模型。测试 Scenario 4/7
  > 实测：缓存仅存模型部分（doctor-cache.ts，机械项每次重跑）；机械 high 项不被模型 healthy 覆盖（mergeOverall）；15/15 绿（b8001d6）
- [x] server `POST /api/doctor/diagnose` + `GET /api/doctor/estimate`：403 环境条目守卫、错误映射（400/404/422）；红测试先行
  > 实测：E5 落地 routes/doctor.ts，绝对路径/越界→403、缺文件→404、非法输出→422 不落缓存；estimate 未配置 AI 时 willCall=0；缓存命中按内容哈希（同内容资产共享条目）；11/11 绿，后端全量 704/704（b8001d6）
- [x] E6 web：体检报告组件（结论徽标 + issue 列表 + 准则跳转 + cached/mechanicalOnly 标注）；技能/规则/agent/identity 详情接入「资产医生」按钮（环境条目不渲染）。组件测试 Scenario 1/2/7
  > 实测：DiagnosisPanel（hubRelativePath 直用 / absolutePath 经 hubRoot 换算，Hub 外自动隐藏入口）；接入 SkillDetail（isLibrary）/AgentDetail（isHub tool）/Rules/Identity；新增 10 用例，前端全量 190/190，tsc 0 错，vite build 成；command 类详情入口待后续页面成型再接

## Phase F — 修复与分发（specs/fix-and-distribute.spec.md）

- [x] F1 `src/core/doctor.ts`：`buildFixDraftPrompt(...)` + `generateFixDraft(...)`（基于原文+选中问题+准则产出草案与 changeNotes；contentTruncated 时拒绝 400）。测试 Scenario 1/7
  > 实测：落地为 src/core/doctor-fix.ts（诊断主体已占 doctor.ts 文件名）；超长不调模型直接 400；草案缓存 doctor-drafts.json 与报告分文件；13 用例绿（8c554a0）
- [x] F2 `POST /api/doctor/fix-draft` 路由：草案阶段零写库断言（测试验证 fs 无写入调用）
  > 实测：服务端 re-run diagnoseAsset 对齐 issueIndexes；越界/非 fixable → 400；错误映射 404/422/400/500（c762c8c）
- [x] F3 `POST /api/doctor/apply`：写库按类别分发到既有路径（hub-files/skill-write/agent-write），覆盖前旧版入备份区并回 backupRef；`distribute=true` 时逐目标工具调用 swap 引擎单资产预览-执行（不自建通道），聚合 DoctorDispatchItem；任一步失败如实回报、整体 rollbackAvailable 判定。红测试先行（Scenario 3/4/5/6）
  > 实测：swap 增加 onlyHubRelativePaths 单元级范围（既有 32 回归绿）；备份区 <Hub>/.doctor-backup 保留 3 份；apply 序 read→backup→write→分发；9+5+6 用例，后端全量 753/753（921ae45/c762c8c）
- [x] F4 web：「生成修复草案」→ 可编辑草案 + 逐问题修复说明；「应用并分发」一屏确认框（diff 视图 + 工具勾选清单 + 备份说明），提交后逐工具结果与「撤销本次修复 / 回滚本次分发」入口。组件测试 Scenario 1/2/6
  > 实测：FixFlow 五态状态机 + FixFlowViews 拆文件；全不勾=只改库（distribute:false）；identity 红字；未安装工具不入清单；9+2 联动用例，web 208/208，tsc 0 错，vite build 成（8717d46）
- [x] F5 类别页「全部体检」：先 estimate 再发起，前端并发池 ≤4 逐条 diagnose，进度与失败清单，>50 调用二次确认，报告清单排序可点进单份。测试 Scenario 5；断言不提供批量修复（Scenario 8）
  > 实测：BatchCheckup（并发≤4/排序清单/展开 ReportView）+ SkillsCheckupSection 容器（仅库内且 Hub 内条目）；本期接入技能页，rule/identity/agent 页批量入口待后续（单资产详情已有医生）；7 用例绿

## Phase G — 验收与收尾

- [x] G1 全量：`npm test` / `tsc -b` 双端 / tsup + vite 构建全绿
  > 实测：后端 753/753（55 文件）；前端 211/211（29 文件）；双端 tsc 0 错；tsup/vite build 成（chunk >500KB 警告为既有现象）
- [x] G2 API 回环：造一个故意写坏的技能（无 description + 冗长正文）→ 机械项命中 → 诊断 → 草案 → apply（只改库）→ 校验备份可撤销 → apply+分发到 1 个测试工具 → swap 回滚复原（临时脚本用毕即删；测试数据一律中性示例名）
  > 实测：造坏技能→诊断命中机械项→草案真产出→apply只改库→undo 恢复→apply+分发 全链路 PASS；非法 backupRef '../evil'→404；本机 .trae-cn/skills、rules 为 Junction 指向 Hub（同 inode），分发必然 skipped（目标已一致），written+swapId+rollback 真实分支由路由单测覆盖；临时脚本用毕已删
- [x] G3 浏览器走查（子代理不稳，改 MCP browser-use 直连，用完导航回 about:blank）：单资产报告、草案编辑采纳一屏确认、未配置降级、批量 estimate 四类场景
  > 实测：场景1-4 通过（全部体检按钮/预算文案 42 次/技能报告“需关注”含机械+语义/修复流 3 勾选）；场景5初发现 /vault/rule 详情无医生入口→修复（AssetEditor view 模式对 rule/identity 渲染 DiagnosisPanel，commit efd69d0）→复验：规则详情正文上方出现“资产医生”按钮；截图受窗口隐藏阻塞，改 DOM 快照核验
- [x] G4 文档回写：taxonomy 元资产层补“准则第二个消费方（诊断）”；PRIVACY.md/data-and-privacy.md 补诊断/草案数据流出说明（Scenario 9）
  > 实测：taxonomy 1.3 版（元资产表“资产诊断（已上线）”+历史行）；PRIVACY.md 第5节 + data-and-privacy.md “Two→Three features”并加入资产医生（机械检查离线、apply/分发全本地、advisory-only）
- [ ] G5 隐私终检退出码 0；分层 commit（docs spec / feat 诊断引擎 / feat 诊断 UI / feat 修复分发 / docs 收尾）；本 tasks 勾选与实测记录

## 风险与预留

- 草案质量：以用户编辑版为准 apply（契约注释已定）；草案只对被审视内容负责，超长资产默认禁一键（Scenario 7）
- 分发目标判定"已安装该资产的工具"依赖现有 swap 支持矩阵，误判风险由 swap 预览-确认兜底
- identity 类资产被改写敏感度最高：应用确认框对 identity 额外红字警示"这是你的 AI 人格基座，请逐行确认 diff"
- command 类别诊断依赖 hot-swap 的 command 支持面，走查时按实际适配器覆盖度验证
