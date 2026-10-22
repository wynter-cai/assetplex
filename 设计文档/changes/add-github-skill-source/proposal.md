# proposal: add-github-skill-source（GitHub 外部技能源：拉取 → 预览确认入库 → 策展打标）

> 级别：S（新 core 模块 + 新 API + 新页面 + provenance 体系扩展）
> 依据：设计文档/assetplex-github-source-evaluation.md（§2 复用/缺口表、§3 红线、§5 拍板四项、§6 立项指引）
> 合并立项：与 market-curation（市场技能智能策展）共用"拉取+清单+AI 审视"链，一次 spec（拍板 4）
> 状态：待维护者审核，审核通过前不动代码

## 为什么做（背景）

1. 定位互补：GitHub 是公共来源（类似 npm registry），AssetPlex 是私人保险箱+分发总线。本产品做"从公共源挑资产进库"的**守门人**，不做第二个市场。
2. 基建已备约 70%：provenance 前缀扩展点（`skill-provenance.ts`）、收藏入库批量语义（`skill-curation.ts`）、预览→显式确认才落盘范式（导入向导 Step3）、资产医生/单资产分发/AI 分类全部现成。真正的增量只有 **GitHub REST 拉取客户端 + 浏览预览 UI**。
3. 维护者 2026-10-20 拍板四项（详见评估报告 §5），全部写死进本 spec。

## 目标

| # | 目标 | 用户可见结果 |
|---|------|-------------|
| G1 | 源解析与拉取 | 输入 `owner/repo[/subpath][@ref]` → 锁定 commit SHA，列出该仓库按约定布局识别出的候选技能（名称/description/路径/大小） |
| G2 | 全文预览 | 点候选条目看 SKILL.md **全文**（不是只看元数据），支持目录附属文件清单可见 |
| G3 | 确认入库 | 勾选 → 确认屏（同名冲突逐条标注）→ 显式确认才写 vault，`source: github:owner/repo@sha` 溯源落档 |
| G4 | 入库后引导 | 成功页给「立即体检」推荐入口（**非自动发起**），可跳转资产医生；后续分发走既有 swap 链路，零新建 |
| G5 | 策展打标 | 候选清单可手动发起「智能打标」：复用九职能 AI 分类，逐条标注职能徽章，未配置 AI 端点时明确降级 |

## 非目标

- ❌ **订阅/自动同步**：任何后台行为把外部内容送进 vault 或工具目录都禁止（红线 1）；更新提醒对比 SHA 为 P2
- ❌ PAT / 私有仓库支持：匿名限额（拍板 3）；真不够再加，不预留配置
- ❌ 精选索引/内置推荐仓库列表：做了性质变发行方，需 License 审查责任（红线 3），P3 再议
- ❌ 本地资产导出到 GitHub（备份/分享）：本版不做，维护者 2026-10-21 明示"后续再说"，另行立项
- ❌ 入库时的 AI 冲突整合：同名冲突本版只提供 跳过（默认）/覆盖（覆盖前备份旧版）；**"交给 AI 把新旧两版整合成一个"已记为待办，整合策略由维护者后续单独讨论，本版不实现**
- ❌ 启用 `config.ts` 的 marketplace 配置骨架（sources/cacheDir/cacheTtlHours）：本变更用进程内缓存，不接该骨架（零消费现状维持，处置另行决定）

## 关键决策

- **D1（拍板 1）REST API + 锁 SHA**：GitHub REST（git trees + raw content），解析 `@ref` 后解析为具体 commit SHA 再取内容；不用 shallow clone（免 git 依赖、锁版自然）。入库条目记录 `github:owner/repo@sha:<路径>` 全要素。
- **D2（拍板 3）匿名限额 + 纯手动触发**：匿名 60 次/小时；候选清单需展示 description，故一次“发现”= 1 次 ref→SHA + 1 次树 + 逐候选读 SKILL.md（≤上限 50，超护栏项不读）；预览按需补附属。进程内内存缓存（按 repo+SHA 存整份发现结果，TTL 10 分钟）降重复消耗，**不落盘**（技能内容只有用户确认入库才持久化，与宪法“零数据上传+资产只留本机入库区”一致）。
- **D3（拍板 2）体检推荐非自动**：入库成功页 CTA「建议立即体检」→ 点击才调 doctor；与 advisory-only 逐步确认哲学一致。
- **D4（拍板 4）合并立项**：策展打标即 market-curation 的"AI 审视候选清单"能力，复用 `skill-ai-classification` 的 LlmClient/闭集解析/内容哈希缓存，一次变更交付。
- **D5 provenance 扩第五值 `github`**：`SkillProvenance` 由四值（self/marketplace/plugin/builtin）扩为五值；vault 条目 `source:` 以 `github:` 开头 → 推导为 `github`。出处 MECE 语义不变（按最初从哪来）。候选（未入库）不进盘点体系，无状态残留。
- **D6 布局发现约定（缺口 2）**：识别三种布局——①`skills/<name>/SKILL.md`（顶层 skills 目录逐项）②仓库根 `SKILL.md`（单技能仓库）③用户指定 subpath 下按①②递归一次；技能目录内其余文件（references/、scripts/ 等）作为附属整体入库。护栏：树深度 ≤8、单 SKILL.md ≤512KB、附属目录合计 ≤2MB、单仓库候选 ≤50 条（超限截断并如实提示）。
- **D7 冲突语义（缺口 3 复用）**：确认屏逐条标注 新增/同名已存在；同名默认**跳过**，可切**覆盖**（覆盖前旧版存入备份区，复用 doctor-backup/swap 备份语义）；提供已有同名技能全文对照查看。不新建第二条冲突通道。（AI 整合为待办，本版不实现）
- **D8 新页面「技能发现」（/discover）**：侧栏入口 + 四步流（输源 → 候选清单 → 勾选/预览 → 确认入库结果屏），确认屏交互复用导入向导 Step3 骨架；候选条目按九职能徽章可筛选（打标后）。

## 安全红线（评估报告 §3，写死为 specs 场景）

1. **供应链/提示注入**：SKILL.md 是给 AI 执行的指令——必须"全文预览 → 用户显式确认 → 才入 vault 生效"，禁止任何形式的自动/订阅同步。
2. **溯源与锁版**：入库条目 `source: github:owner/repo@commit-sha`；更新是显式动作（重新发现+预览+确认），不是后台行为。
3. **开源免责**：PRIVACY/README 写明"外部源内容由用户自行添加，工具不内置官方镜像仓库"。
4. **数据流出边界**：拉取只连用户主动指定的**公开**仓库（GitHub 只读、无认证信息）；AI 打标仅发用户自配端点；PRIVACY.md 第 5 节补"拉取外部源"披露。

## 影响面

- `src/core/`：新文件 `github-ref.ts`（源串解析）、`github-source.ts`（REST 客户端+缓存+护栏）、`github-discovery.ts`（布局识别）、`github-curate.ts`（入库+冲突语义）；改 `skill-provenance.ts`（第五值）、`skill-listing.ts`/`skills-inventory.ts`（计数闭集自动随 SKILL_PROVENANCES 扩展）
- `src/server/`：新路由 `routes/github.ts`（discover / preview / curate / classify）
- `web/`：新页面 `Discover.tsx` + 组件组；`types/api.ts` 与 `skill-labels.ts` provenance 五值；侧栏导航
- 文档：PRIVACY.md 第 5 节 + data-and-privacy.md、README（免责）、taxonomy（provenance 五值修订）
- 不动：扫描器、同步引擎、swap/doctor 内部逻辑（仅被复用）；config.ts marketplace 骨架

## 回滚

分 commit 分层：provenance 扩展（H）独立可 revert（github 前缀条目回落为 self，入库条目 source 原文仍在）；拉取客户端+路由（I/J）与 UI（K）各自独立；revert 整个变更退回无外部源状态，vault 已入库技能不受影响（就是普通库内技能）。
