# AssetPlex 产品待办池（Backlog）

> 建立：2026-11-14 · 维护：本文件只记产品层判断与待办，实施仍走 `设计文档/changes/<change-id>/` 的 SDD 流程
> 原则：先让日常使用顺，再追求开源增长；每条都写清「证据 → 验收标准」，避免凭感觉改

---

## 一、优先级总览

| # | 事项 | 级别 | 状态 | change-id |
|---|---|---|---|---|
| P0-1 | 入口过载：侧栏 10 项平铺，陌生用户看不懂产品边界 | M | 🔵 规格已写，待审核 | `simplify-navigation-ia` |
| P0-2 | 首跑无 Aha：`init` 只生成空模板，`--import-existing` 有声明无实现 | S | ✅ 已完成（2026-11-14） | `add-zero-config-onboarding` |
| P0-3 | 适配器缺 Cursor / Windsurf（最大流量池 + 编译壁垒展示场） | M | ⚪ 未启动 | `add-cursor-windsurf-adapter` |
| P0-4 | 缺治理闭环：诊断出问题后无处改，体检与分发之间断层 | S | 🟡 方案已写，待拍板 | `add-asset-governance-center` |
| P1-1 | 同步不自动：`--watch` 未实现、无漂移检测，与「一次配置永久同步」有落差 | M | ⚪ 未启动 | `add-drift-detect-and-watch` |
| P1-2 | 资产不可回滚：Hub 是裸文件，没有版本与时间机器 | S | ⚪ 未启动 | `add-hub-versioning` |
| P1-3 | 无传播飞轮：资产包不能导出/分享，只能单向从 GitHub 拉技能 | M | ⚪ 未启动 | `add-asset-pack` |
| P1-4 | AI 深度诊断未做行业调研：当前体检是静态规则 + 可选 AI 分类，缺 LLM 语义诊断与整改建议 | M | 🟡 调研完成，待 spec | `add-ai-deep-diagnosis` |
| P1-5 | 资产编写无最佳实践依据：不知道人设/规则/技能/MCP 怎样写才算好，诊断只能查格式 | M | 🟡 调研完成，待 spec | `add-asset-authoring-guide` |
| P1-6 | 资产库无异地备份：Hub 只在本机 `~/.assetplex`，硬盘坏了就没了 | M | ⚪ 待讨论 | `add-hub-cloud-backup` |
| P2-1 | 首页信息密度过高（Hero + 建议条 + 快照 + 连接 + 快捷 + 活动） | C | ⚪ 未启动 | 并入 P0-1 二期 |
| P2-2 | 技术债：`buildSupportMatrix()` 仍反推能力矩阵 | C | ⚪ 未启动 | 并入 P0-3 |
| P2-3 | 老用户日常首页形态重设计（Phase 0 行动面板 + 导航五组） | M | ✅ 已完成（2026-11-15，refactor-home-action-panel T1-T13） | 治理中心一期另见 B12 |
| P2-4 | 多端适配（窄屏/平板/移动端） | C | ⚪ 低优先级（功能改完再做） | 未立项 |

---

## 二、问题与证据

### P0-2 首跑无 Aha（最高商业价值，但排 P0-1 之后）

- [init.ts](src/cli/commands/init.ts) 的 `importExisting` 参数只在接口里声明，函数体从未使用。
- 新用户 `npm i -g assetplex && assetplex init` 后得到 6 个空 Markdown 模板，被要求「自己去填人设」。
- 项目已有导入向导与扫描器（`src/core/scanner.ts` + 各 `adapter.scan()`），能力都在，只是没接到首跑路径上。
- 验收标准：清空环境，从 `npx assetplex` 到看见自己的资产清单 **≤ 60 秒**，全程无需手写任何 Markdown。
- **2026-11-14 已完成**：CLI 无子命令首跑进向导、`init --import-existing` 真实导入、Web 六屏向导（盘点 → 结果 → 收藏 → 体检 → 同步 → 完成）与首跑守卫落地。隔离验收：盘点 11 项与 fixture 一致、start→scan 143 ms、预览取消零写、汇报批次备份可查、六条跳过路径全部写标记；后端 1129 / 前端 471 全绿。

### P0-3 缺 Cursor / Windsurf

- `src/core/adapters/` 现有 5 个：trae-cn / claude-code / codex / workbuddy / qoder。
- Cursor 的 `.cursor/rules/*.mdc`（frontmatter：description / globs / alwaysApply）与 Windsurf 的 rules 目录，是「一份源 → 多格式编译」最有力的展示场景。
- 验收标准：`assetplex doctor` 能识别两者；规则与 MCP 双向同步；README 对比表与关键词补上 cursor / windsurf。

### P1-1 同步不自动

- [sync.ts](src/cli/commands/sync.ts) 注释「--watch 暂未实现」；`chokidar` 已安装未使用。
- 无漂移检测：工具侧被手改后，Hub 不知道，下次 sync 会静默覆盖。
- 验收标准：`assetplex status` 能列出「工具侧已偏离 Hub」的条目；`--watch` 可后台常驻。

### P1-2 资产不可回滚

- Hub 是普通目录，`.backups/` 只有覆盖前快照，没有历史与 diff。
- 「保险箱」叙事缺时间机器，是竞品同样缺失的空白点。
- 验收标准：写库自动留痕（可选 git）；`assetplex diff` / `assetplex rollback` 可用。

### P1-3 无传播飞轮

- 现有 `add-github-skill-source` 只做单向拉取技能，用户无法把自己的资产打包分享。
- 验收标准：`assetplex pack export` / `assetplex pack add github:user/repo`；资产包含 manifest + 版本 + license。

### P1-4 AI 深度诊断（调研完成，待 spec）

- 现状：向导「体检」= 静态健康分（四维规则）+ 可选「AI 分类」（`ai-classify`，只判职能归属），**没有**基于 LLM 的语义诊断与整改建议。
- 调研（2026-11-14 完成）：[research-ai-deep-diagnosis-2026-11-14.md](./research/research-ai-deep-diagnosis-2026-11-14.md)
- 调研结论要点：业内成熟形态是「确定性规则先筛 → LLM 只做解释/降噪/建议」；每条结论必须带文件+片段级证据；LLM 会系统性过度判错（ASE 2025），必须留「证据不足」出口；降噪比召回更影响信任。
- 调研方向（待做）：业内 AI 配置体检/Agent 审计产品如何做（规则引擎 + LLM 混合、可解释证据链、误报控制、成本与隐私边界）；对标至少 3 个产品/开源项目并落盘对比。
- 产品要求（初稿）：每条结论必须带「证据（文件/行）→ 影响 → 建议动作」，可一键应用/撤销；零 Key 时静态体检仍完整可用；AI 只做增量、不阻断主链路。
- 验收标准：调研报告 + spec（含评测用例与误报率口径）通过审核；向导体检屏与独立体检页接入同一套诊断结果模型。

### P0-4 资产治理中心（方案已写，待拍板）

- 方案：[assetplex-home-and-governance-proposal.md](./assetplex-home-and-governance-proposal.md)（含主页布局、治理三视图、与引导/分发的串联）
- 现状：向导体检只展示问题，没有「改进」闭环；正式页面也缺按资产类型的深度体检。
- 定位：引导不承载完整治理（守 60 秒承诺），只展示 Top 3 + 入口；完整治理放正式导航，按人设/规则/技能/MCP/命令/子代理/记忆分类深做。
- 依赖：P1-4 诊断结果模型、P1-5 各资产检查清单、P1-2 版本化（撤销）。
- 验收标准：每条问题带证据/影响/建议/依据；可应用与撤销；修完可一键同步；分类视图覆盖七类资产。

### P1-5 资产编写最佳实践知识库（调研完成，待 spec）

- 调研（2026-11-14 完成）：[research-ai-asset-authoring-2026-11-14.md](./research/research-ai-asset-authoring-2026-11-14.md)；分册在 `research/parts/`。
- 关键结论：触发能力由 name+description 决定；载体放错比写错字更常见；官方硬线（根规则 <200 行、SKILL.md <500 行、子代理描述 ≤15k token）；规则冲突不会被自动仲裁；MCP 要查 lethal trifecta。
- 产物：技能 15 条、人设 12 条、规则 12 条、MCP 10 条、commands 8 条、agents 9 条、memory 9 条可执行检查项。
- 下一步：合并去重成 `diagnosis-rules.yaml`，跑 30–50 条样本基线，再写 spec。

### P1-6 资产库云备份（网盘一期）

- 现状：Hub 默认 `~/.assetplex`（可用 `ASSETPLEX_DIR` 覆盖），资产是普通文件，仅存本机。
- 一期（网盘）：用户指定一个本地同步目录（坚果云/OneDrive/百度网盘/群晖 Drive 的同步文件夹），`assetplex backup` 生成带 manifest 与哈希的快照，交给网盘客户端同步；`restore` 校验哈希后恢复。
- 二期（对象存储）：S3 兼容（OSS/COS/R2），版本化快照 + 客户端加密。
- 安全边界：默认排除 `ai-config.json`、MCP 配置中的密钥、`.backups`；`--include-secrets` 需显式确认并提示风险。
- 验收标准：备份产物可离线校验；恢复前自动备份当前 Hub；排除项有测试锚定；网盘客户端无需 AssetPlex 联网。

---

## 三、分阶段计划

| 阶段 | 内容 | 目标 |
|---|---|---|
| Phase 0 | 发布通车（0.1.1、NPM_TOKEN、Social preview、README 首屏） | ✅ 已完成（2026-11-14 确认） |
| Phase 1 | `simplify-navigation-ia`：侧栏 10 → 5，其余收进「更多」 | 作者自己日常用得顺；陌生用户 5 秒看懂产品边界 |
| Phase 2 | `add-zero-config-onboarding`：盘点式初始化 | 首跑 60 秒见价值 |
| Phase 3 | `add-cursor-windsurf-adapter` | 补最大市场与传播弹药 |
| Phase 4 | `add-hub-versioning` + `add-drift-detect-and-watch` | 从「同步」升级为「可信」 |
| Phase 5 | `add-asset-pack` | 社区自传播飞轮 |

---

## 四、明确的非目标（不做）

- ❌ 云端托管、账号体系、资产市场后端 —— 与「零数据上传」宪法冲突
- ❌ 在 Phase 1 里合并页面（Sync / Connections / Swap 合并为 tabs 是后续独立 change）
- ❌ 发布前继续加深治理类功能（健康分、重复合并已足够）
- ❌ 访客统计接 GA —— 与隐私模型冲突
