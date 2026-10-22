# tasks: add-github-skill-source

> 前置：本 tasks 与 proposal/specs/api-contract 需维护者审核通过后才允许动代码（SDD 铁律）。
> 全流程 TDD：每条后端任务先红测试；HTTP 一律注入 fake client（GithubHttpClient DI），单测不碰网络。
> 文件 ≤300 行约束：github 模块按 解析/客户端/发现/入库 四文件拆分，超限再细分。

## Phase H — provenance 扩展与源串解析（specs/preview-curate.spec.md 定义节 / specs/github-fetch.spec.md Scenario 4）

- [x] H1 `skill-provenance.ts`：`SkillProvenance` 扩五值 `'github'`；`deriveProvenance` vault 分支加 `github:` 前缀判定（置于 marketplace/plugin 同层）。红测试：五值推导全形态 + 未知前缀回落 self 不回归
  > 实测：SKILL_PROVENANCES 改 ['self','marketplace','plugin','builtin','github']；deriveProvenance 新增 github: 前缀分支；顶部/推导注释同步“四值→五值”。provenance 单测 +3 例绿
- [x] H2 下游闭集联动：`skill-listing.ts` 计数/筛选自动随 `SKILL_PROVENANCES` 扩展（emptyCounts 驱动，预期零逻辑改动仅测试补断言）；`web/src/types/api.ts`、`skill-labels.ts`（徽章文案「GitHub 源」+ PROVENANCE_ORDER/ENV_PROVENANCE_ORDER 归位：github 属资产侧入库后类别，不入 ENV 序）。组件/单测更新
  > 实测：后端 emptyCounts 自动含 github:0，相应 4 处全量 toEqual 断言补 github:0（skills-inventory ×3、skills-routes ×1，属规格五值的正当同步）；前端 countByProvenance 改 Partial（容动态扩展，消费处 SkillsToolbar 已 `?? 0`）；PROVENANCE_LABELS/ORDER 加 github；**parseCurateSource 的 CURATE_SOURCE_PROVENANCE 映射表补 github 键（否则库内 github 技能「来自」徽章不渲染——实施中发现的真缺口）**；新增 SkillDetail github 徽章组件测试 1 例
  > 验收口径：入库一条 github 源技能后，资产视图出处筛选出现「GitHub 源」且计数正确（Scenario 7）
- [x] H3 `src/core/github-ref.ts`：`parseGithubSource(source)` → `GithubSourceSpec | 抛 GithubRefError`；支持 `owner/repo[/subpath][@ref]`，拒绝空段/`..`/非法字符/多 @；纯函数无网络。测试 fetch Scenario 4 全非法形态
  > 实测：17 用例绿（5 合法 + 11 非法 + 格式提示）；错误类 GithubRefError（路由层映 400）；GithubSourceSpec 不含 sha（SHA 由 Phase I 网络层解析后填充为契约 GithubSourceRef）

## Phase I — REST 拉取客户端与发现（specs/github-fetch.spec.md Scenario 1/2/3/5/6/7/8/9/10）

- [x] I1 `src/core/github-source.ts`：`GithubHttpClient` DI（单一 `request(url)`→`{status,headers,text}`）+ REST 封装：ref→SHA（`GET /repos/{o}/{r}/commits/{ref}`，ref 缺省 HEAD 单请求省配额）、树一次拉取（`?recursive=1`）、raw 内容按 SHA 取；404/401→GithubNotFoundError、403/429→GithubRateLimitError（含 retryAfterMinutes，优先 `retry-after` 秒、否则保守 15）、网络异常→GithubNetworkError。测试 Scenario 3/5/6（9 用例绿）
  > 实测：core 只依赖接口（对齐 LlmClient DI 模式），Node 具体 fetch 实现留 Phase K 的 `server/lib/github-http-client.ts`；raw URL 形式 `raw.githubusercontent.com/{o}/{r}/{sha}/{path}`（以 SHA 为 ref，锁版红线断言）
- [x] I2 进程内缓存：`createGithubCache({now,ttlMs})` 双 Map（ref→sha、repo+sha→DiscoverResult），TTL 10 分钟，`cached` 标志回传；**不写任何磁盘**（github-discover.ts 不 import fs，结构上零落盘）；「重新发现」force 绕过。测试 Scenario 8（命中零新增请求 + force 重新拉）
- [x] I3 `src/core/github-discovery.ts`：`identifyGithubSkills({ tree, root, truncated })` 布局识别三形态（`skills/<name>/SKILL.md` / 根 `SKILL.md` / subpath 下同规则）；附属文件按技能目录归属。护栏：深度 ≤8、SKILL.md ≤512KB、候选 ≤50、GitHub 截断，超限截断/标注入 notes（不整体报错）。测试 Scenario 1/2/7（7 用例绿）
  > 实测：本模块不拉内容（name/description 由 I4 补），`supportingTotal` 已算供 Phase J 入库护栏；二进判定属 Phase J
- [x] I4 `src/core/github-discover.ts`（新增文件，github-source 拆出以守 ≤300 行）：`discoverGithub(source, deps)` 串联解析→锁SHA→取树→识别→逐候选 fetchRaw SKILL.md + parseFrontmatter 补 name/description（缺 name 回落目录名）；超限候选不 fetch（省配额）；空仓库/无约定布局 → 空 candidates + 提示 note。测试 Scenario 2/9 空态（5 用例绿）
  > 实测修正 D2：候选清单需展示 description，因此**发现阶段逐候选读 SKILL.md**（树 1 请求 + 候选 raw ≤50 + 缓存复用）；预览/入库走结果缓存不重复拉正文。已同步修订 proposal D2 描述

## Phase J — 确认入库链路（specs/preview-curate.spec.md Scenario 1-5/8/9）

- [x] J1 `src/core/github-curate.ts`：`curateGithubSkills({ repo, sha, items }, deps)` 逐条：raw 拉 SKILL.md+附属（二进制判定跳过并标注）→ validateAssetName → 冲突判定（缺省 action=skip；overwrite 走 doctor-backup 备份旧版取 backupRef）→ 整目录写 vault（buildAssetMarkdown source=`github:{repo}@{sha}:{skillPath}`）→ 批量部分成功不回滚（语义对齐 skill-curation 测试基线）。红测试先行
  > 实测：9 用例绿（新建/溯源串/盘点归属 github/空 items 400/默认跳过不拉内容/覆盖备份 backupRef/非库冲突请改名/改名入库/部分成功不回滚）。附属文本逐条 fetch，单条附属失败仅跳过该文件不影响主技能已落库；二进制按扩展名判定跳过
- [x] J2 全文预览 `previewGithubSkill({ repo, sha, skillPath }, deps)`：raw 取正文 + 附属清单（path/size/binary）；展示截断阈值常量 + contentTruncated。测试 Scenario 1；断言预览零落盘
  > 实测：预览零写入断言 `fs.files.size===0` 绿；截断阈值落 Phase K 路由层（MAX_PREVIEW_CHARS）
  > 验收：Phase J 全绿，后端累计 801 passed

## Phase K — server 路由（api-contract.ts 全端点）

- [x] K1 `routes/github.ts`：`POST /api/github/discover`、`POST /api/github/preview`、`POST /api/github/curate`、`POST /api/github/classify/estimate`、`POST /api/github/classify`；错误映射（400 非法源串/空 items，404 仓库不可公开访问，422 限流+retryAfterMinutes，500 网络）；任何错误路径零磁盘写入断言。红测试（fake deps）
  > 实测：路由工厂 + 默认单例导出，挂 `app.route('/api/github')`；`server/lib/github-error.ts` 集中映射、`server/lib/github-http-client.ts` Node fetch 实现（进程内 memo 去重省匿名限额、错误不缓存、fetch 抛错→GithubNetworkError）；curate 覆盖备份缺省接 doctor-backup（Hub 相对路径）
- [x] K2 打标端点接线：复用 `buildClassifyPrompt`/`parseCategoryOutput`/`skill-ai-cache`（内容哈希缓存与盘点分类共用一份 store）；estimate 报 total/cacheHits/willCall/aiConfigured；并发 ≤4、逐条失败隔离（CandidateTag.error）。测试 tagging Scenario 1-4/6；断言未配置端点 willCall=0 且不发请求（Scenario 2）
  > 实测：新增 `src/core/github-classify.ts`（classifyGithubCandidates + estimateGithubClassification，runPool 并发 4）；路由 classify 缺省按配置构造 OpenAI 客户端、测试注入 fake llm；未配置 AiConfigIncompleteError→400
  > 验收：Phase K 全绿，后端累计 825 passed、双端 tsc 0、tsup 构建成功

## Phase L — web「技能发现」页（proposal D8）

- [x] L1 路由与导航：`/discover` 页面骨架 + 侧栏入口「技能发现」；四步状态机（输入源 → 候选清单 → 预览抽屉 → 确认/结果屏）
  > 实测：活动前端为仓库根 `web/`（server 托管 `./web/dist`，非 agent-hub/web）；`types/api.ts` 补 GitHub 发现契约类型 + `GithubCandidate.functionCategory`；`lib/api.ts` 加 `api.github.{discover,preview,curate,classifyEstimate,classify}`；Sidebar 加 Compass「技能发现」入口、App.tsx 加 `/discover` 路由；`pages/Discover.tsx` 四步状态机 + `components/discover/` 五组件（discover-utils/PreviewDialog/CandidateList/ConfirmPanel/ResultPanel）
- [x] L2 候选清单：源输入校验提示、锁定 SHA 展示（短哈希可展开全量）、notes 截断提示、勾选、职能徽章（打标后）与筛选、「智能打标」按钮（先 estimate 披露预算再发起，未配置 AI 置灰+引导）；「重新发现」按钮 force 刷新。组件测试 fetch S3/S6、tagging S1/S2/S6
  > 实测：本地校验镜像后端（`looksLikeGithubSource`/`validateSkillNameLocal`）；打标先 classifyEstimate→未配置直接 return 不发 classify；`functionCategory` 回填候选徽章；force「重新发现」绕过缓存
- [x] L3 预览与确认屏：全文预览抽屉（截断标注）；确认屏逐条 新增/同名已存在 标注 + 默认跳过 + 覆盖切换 + 改名输入（即时校验）+「查看已有版本」对照；**未点确认零请求**断言。组件测试 curate S2/S3/S9
  > 实测：PreviewDialog（Radix，只读，不发 curate）；ConfirmPanel 库内冲突预校验（existingByName 取 inLibrary）+ 改名即时校验 + 覆盖开关；测试断言「未点确认零 curate 请求」
- [x] L4 结果屏：成功/跳过/失败分组、backupRef 提示、「建议立即体检」CTA（跳 doctor，不自动调用）、「去库内查看」「分发」入口（跳既有页）。组件测试 curate S6；vite build + tsc
  > 实测：ResultPanel 分组 + backupRefs + 「立即体检」CTA（非自动）；Discover.test 5 例绿；前端全量 **220 passed（31 files）、tsc 0、vite build 成功**（基线 214→220 只增不减）

## Phase M — 验收与收尾

- [x] M1 全量：后端 `npm test` / 前端 vitest / 双端 tsc / tsup+vite 构建全绿（基线 753+214 只增不减）
  > 实测（2026-10-21）：后端 `vitest run` **825 passed（63 files）**零失败；前端 **220 passed（31 files）**；双端 `tsc -b` 退出码 0；tsup + vite build 均成功（基线 753/214 → 825/220 只增不减）
- [x] M2 真实回环（匿名限额内控制在 ≤10 次请求；用公开示例仓库、中性名测试，脚本用毕即删）：发现 → 预览 → 确认入库 → 盘点归属验证（provenance=github）→ 覆盖+备份回滚 → DELETE 清理；限额场景用假 429 头验证文案
  > 实测（2026-10-21）：启动 `node dist/index.js ui`、走 HTTP API 端到端。真实发现 `anthropics/skills`（1 commits + 1 tree + 候选 raw，同会话 memo/缓存复用远低于 10 次）→ 锁 SHA dbd458、识别 20 候选；preview 零落盘（vaultExists=False）；中性名 `zz-m2-smoke` curate created=1、盘点 provenance=github+inLibrary=True、SKILL.md source 串 `github:anthropics/skills@{full sha}:skills/academy-guide/SKILL.md`；overwrite created=1+backupRefs=1（旧版已备份）；DELETE 200、vault 与清单均无残留。限额 429 文案由 `github-http-client`/`github-routes` 单测覆盖（403→422+retryAfterMinutes）
- [x] M3 浏览器走查（MCP browser-use 直连，用完回 about:blank）：四步流、冲突默认跳过、打标降级、结果页 CTA 非自动
  > 实测：`/discover` 实走——首屏输入→候选清单（SHA 徽章 `@ dbd458`、命中缓存标记、20 条候选带描述/体积/附属数/勾选、筛选、预览、智能打标、下一步齐全）→确认屏（逐条「新增」徽章 + 可改编入名 + 红线文案「仅写入保险箱 skills/，绝不改动任何工具目录」 + 仅点确认才写）→返回候选（双向导航 OK）；预览抽屉只读展开全文+附属清单。冲突默认跳过/打标未配置置灰/CTA 非自动由 Discover.test 断言。浏览器已回 about:blank、UI 服务已停、临时日志已删
- [x] M4 文档回写：PRIVACY.md 第 5 节 + docs/data-and-privacy.md 补「外部源拉取」与打标数据流出（curate S10 / tagging S5）；README（中英）免责句"外部源内容由用户自行添加，工具不内置官方镜像仓库"；taxonomy provenance 五值修订；HANDOFF.md 进度表回写
  > 实测：PRIVACY.md §5 新增「GitHub skill discovery（外部源拉取）」双语段 + §7 权限表网络行拆两类；docs/data-and-privacy.md 新增「opt-in and read-only」节；README.md/README.zh-CN.md 加「技能发现」特性行 + 免责句 + 修正「100% 本地」表述；taxonomy Phase A 后新增「技能出处轴五值」表；HANDOFF.md §5 进度行 + §基线数字回写
- [ ] M5 隐私终检 `node scripts/privacy-check.mjs` 退出码 0；分层 commit（docs spec / feat provenance 扩展 / feat 拉取客户端 / feat 入库链路 / feat 路由 / feat 发现页 / docs 收尾）
  > 隐私终检已过（退出码 0，无命中；含本轮文档回写后复扫）；**分层 commit 按维护者 2026-10-21「晚点再 Commit」暂缓**，待明确指令后执行

## 风险与预留

- GitHub 树 API 对超大仓库 recursive 有 10 万条目/截断上限（`truncated` 响应字段）：命中时如实提示"仓库过大，清单可能不完整"，不做分页兜底（低频、留 P2）
- 附属目录整体入库依赖 raw 逐文件拉取，条数多时消耗限额：预览不算账、入库前在确认屏显示"将额外请求 N 次 raw"（与打标预算披露同屏风格）；实测超限再考虑树并发
- `github:` 前缀条目在旧版本 AssetPlex 中会被 deriveProvenance 回落为 self（前向兼容安全，无迁移）
- 上游仓库内容风险由红线体系兜底（预览确认+锁 SHA+advisory 体检），不承担内容审查义务（免责句落文档）
- P2 挂账：更新提醒（SHA 对比）、「已入库来源」列表按源过滤、PAT/私有仓库、导出到 GitHub（另行立项，本版不做）
- ⭐ 待办（维护者 2026-10-21 明示）：同名冲突的"AI 整合新旧两版"能力本版不做（仅 跳过/覆盖），日后专项讨论整合策略后另起变更实现
