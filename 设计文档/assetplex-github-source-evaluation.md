# GitHub 外部技能源评估（github-source-sync）

> 状态：评估结论（未立项）。产出日期：2026-10-19。
> 前置记忆结论：GitHub 是公共来源（类似 npm registry），AssetPlex 是私人保险箱+分发总线，
> 定位互补——本产品做"从公共源挑资产进库"的守门人，不做第二个市场。

## 1. 结论（TL;DR）

**可行，且是低成本高杠杆**。现有基建约完成 70%，真正的增量只有"GitHub 拉取客户端 +
浏览/预览 UI"一块。建议按 S 级变更走 SDD 立项，MVP 一个变更周期可完成。
与排后的"市场技能智能策展"（market-curation）共用同一套拉取+审视基建，建议策划同场审议。

## 2. 现状盘点（代码核实，非猜测）

### 已预留、可直接复用
| 基建 | 位置 | 状态 |
|------|------|------|
| marketplace 配置节（sources/cacheDir/cacheTtlHours） | `src/core/config.ts` | ⚠️ 纯骨架，**零消费代码**（无任何路由拉取这 3 个 API） |
| 出处（provenance）体系 | `src/core/skill-provenance.ts` | `source:` frontmatter 前缀模式成熟（`marketplace:`/`plugin:`），新增 `github:` 前缀即扩展点 |
| 收藏入库链路 | `src/core/skill-curation.ts` | curateVaultSkill：复制入 vault + 写 `source: origin:path` + 同名冲突校验 + 批量部分成功语义——GitHub 入库几乎照抄 |
| 冲突预览模型 | sync-engine / 导入向导 | none/exists/differs + merge/overwrite/skip + AI 仲裁 + Step3 确认屏（2026-10-19 刚落地的"预览→显式确认才落盘"范式） |
| 资产医生 | doctor 全家桶 | 拉回来的外部技能可逐条体检（机械+AI 诊断、修复草案、advisory-only） |
| 单资产分发 | swap onlyHubRelativePaths | 入库后投放到各工具，支持矩阵+预览+回滚齐备 |
| AI 分类 | skill-ai-classification | 拉取清单的策展打标基础（market-curation 前置） |

### 缺口（需新建）
1. **GitHub 拉取客户端**（core 新模块，如 `github-source.ts`）：
   - 解析 `owner/repo[/subpath][@ref]`；走 GitHub REST（git trees + raw 内容）或 shallow clone 二选一（倾向 REST：免 git 依赖、可锁 commit）
   - **锁定 commit SHA** 拉取（不用"跟踪分支"，防上游投毒）；记录进 `source: github:owner/repo@sha`
   - 限额护栏：仓库树深度/文件大小/单仓库技能数上限、匿名请求速率限制（可选用户提供 PAT token 存 hub.toml/本地配置，不入库）
2. **技能发现约定**：识别 `skills/<name>/SKILL.md`、单技能仓库根 `SKILL.md` 等布局；带 references/子目录的技能整目录取
3. **浏览/预览 UI**：输入源 → 列出候选技能（名称/description/路径）→ 查看全文（正文预览，不是只看元数据）→ 勾选 → 确认入库（复用导入向导 Step3 交互骨架）
4. **更新提醒**（P2）：对比 `source:` 中 SHA 与上游最新 commit → 提示"有新版可取"，**逐条人工确认，永不自动同步**

## 3. 安全红线（继承既有决策，写死进 spec）

1. **供应链/提示注入**：SKILL.md 是给 AI 执行的指令。外部内容必须"全文预览 → 用户显式确认 →
   才入 vault 生效"；禁止订阅式自动同步进工具目录。
2. **溯源与锁版**：入库条目 `source: github:owner/repo@commit-sha`；更新是显式动作（重新预览确认），不是后台行为。
3. **开源免责**：文档（PRIVACY/README）写明"外部源内容由用户自行添加，工具不内置官方镜像仓库"；
   若做精选索引则性质变发行方，需承担 License 审查——P3 再议。
4. **数据流出边界**：拉取只连用户主动指定的公开仓库（GitHub 公开 API，只读、无认证信息外发）；
   AI 诊断/分类走既有"仅用户自配端点"边界。PRIVACY 第 5 节届时需把"拉取外部源"如实披露。

## 4. 分期建议

| 期 | 内容 | 量级 |
|----|------|------|
| P1 MVP | GitHub 拉取客户端 + 浏览预览 UI + 收藏入库（锁 SHA、provenance `github:`）+ 入库后引导体检 | S 级一个变更周期 |
| P2 | 更新提醒（SHA 对比）、多源管理（收藏列表按源过滤）、私有仓库 PAT 支持 | M 级 |
| P3 | 精选索引/策展（与 market-curation 合并决策，注意发行方责任） | 另议 |

## 5. 决策点（立项前需维护者拍板）

1. 拉取实现：GitHub REST API（免 git 依赖、锁 SHA 自然）vs shallow clone（子目录/二进制资源更全）——倾向 REST，同意否？
2. P1 是否把"入库后自动发起资产医生体检"做成默认动作（推荐：入库成功页给"立即体检"入口，非自动）
3. 匿名 API 限额（60 次/小时）够用否；不够则 P1 即支持本地配置 token（不入库）
4. 与 market-curation 合并排期？两者共用"拉取+清单+AI 审视"链，合并立项省一次 spec
