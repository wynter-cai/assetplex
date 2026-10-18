# tasks: add-asset-doctor

> 前置：本 tasks 与 proposal/specs/api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 依赖：add-llm-conflict-arbitration Phase A（准则元资产）与 Phase B（prompt 组装/闭集解析/缓存/LlmClient 基建）先行完成；若维护者要求医生先行，则 Phase A+B 作为医生的前置任务一并执行，仲裁接入（其 Phase C）后置。
> 全流程 TDD：每条后端任务先红测试。

## Phase E — 诊断引擎（specs/asset-diagnosis.spec.md）

- [ ] E1 `src/core/doctor.ts`：确定性预检 `runMechanicalChecks(kind, content)`（frontmatter 必填/description 空/正文超长/shouting，按类别阈值表），输出 DiagnosisIssue（criterion='mechanical:<id>'，fixable 按检查项定义）。测试 Scenario 3
- [ ] E2 `buildDiagnosisPrompt({ kind, content, criteriaBlock })`：内置基线骨架（审视单资产 × 准则、无问题返回空 issues 不凑数）+ 准则区 + JSON 闭集契约；内容截断 6000 并标 `contentTruncated`。测试 Scenario 2/6/7 数据面
- [ ] E3 `parseDiagnosisOutput(output)`：fenced 容忍 → overall 三值闭集 → issue 必填字段与 severity 闭集校验，非法 throw。测试 Scenario 8 全部非法形态
- [ ] E4 `diagnoseAsset(input, deps)`：机械项恒跑；AI 未配置返回 mechanicalOnly=true 不发请求；缓存 key = sha256(内容 + 适用准则集哈希 + model)，命中不调模型。测试 Scenario 4/7
- [ ] E5 server `POST /api/doctor/diagnose` + `GET /api/doctor/estimate`：403 环境条目守卫、错误映射（400/404/422）；红测试先行
- [ ] E6 web：体检报告组件（结论徽标 + issue 列表 + 准则跳转 + cached/mechanicalOnly 标注）；技能/规则/agent/identity 详情接入「资产医生」按钮（环境条目不渲染）。组件测试 Scenario 1/2/7

## Phase F — 修复与分发（specs/fix-and-distribute.spec.md）

- [ ] F1 `src/core/doctor.ts`：`buildFixDraftPrompt(...)` + `generateFixDraft(...)`（基于原文+选中问题+准则产出草案与 changeNotes；contentTruncated 时拒绝 400）。测试 Scenario 1/7
- [ ] F2 `POST /api/doctor/fix-draft` 路由：草案阶段零写库断言（测试验证 fs 无写入调用）
- [ ] F3 `POST /api/doctor/apply`：写库按类别分发到既有路径（hub-files/skill-write/agent-write），覆盖前旧版入备份区并回 backupRef；`distribute=true` 时逐目标工具调用 swap 引擎单资产预览-执行（不自建通道），聚合 DoctorDispatchItem；任一步失败如实回报、整体 rollbackAvailable 判定。红测试先行（Scenario 3/4/5/6）
- [ ] F4 web：「生成修复草案」→ 可编辑草案 + 逐问题修复说明；「应用并分发」一屏确认框（diff 视图 + 工具勾选清单 + 备份说明），提交后逐工具结果与「撤销本次修复 / 回滚本次分发」入口。组件测试 Scenario 1/2/6
- [ ] F5 类别页「全部体检」：先 estimate 再发起，前端并发池 ≤4 逐条 diagnose，进度与失败清单，>50 调用二次确认，报告清单排序可点进单份。测试 Scenario 5；断言不提供批量修复（Scenario 8）

## Phase G — 验收与收尾

- [ ] G1 全量：`npm test` / `tsc -b` 双端 / tsup + vite 构建全绿
- [ ] G2 API 回环：造一个故意写坏的技能（无 description + 冗长正文）→ 机械项命中 → 诊断 → 草案 → apply（只改库）→ 校验备份可撤销 → apply+分发到 1 个测试工具 → swap 回滚复原（临时脚本用毕即删；测试数据一律中性示例名）
- [ ] G3 浏览器走查（Browser 子代理，用完即关）：单资产报告、草案编辑采纳一屏确认、未配置降级、批量 estimate 四类场景
- [ ] G4 文档回写：taxonomy 元资产层补"准则第二个消费方（诊断）"；PRIVACY.md/data-and-privacy.md 补诊断/草案数据流出说明（Scenario 9）
- [ ] G5 隐私终检退出码 0；分层 commit（docs spec / feat 诊断引擎 / feat 诊断 UI / feat 修复分发 / docs 收尾）；本 tasks 勾选与实测记录

## 风险与预留

- 草案质量：以用户编辑版为准 apply（契约注释已定）；草案只对被审视内容负责，超长资产默认禁一键（Scenario 7）
- 分发目标判定"已安装该资产的工具"依赖现有 swap 支持矩阵，误判风险由 swap 预览-确认兜底
- identity 类资产被改写敏感度最高：应用确认框对 identity 额外红字警示"这是你的 AI 人格基座，请逐行确认 diff"
- command 类别诊断依赖 hot-swap 的 command 支持面，走查时按实际适配器覆盖度验证
