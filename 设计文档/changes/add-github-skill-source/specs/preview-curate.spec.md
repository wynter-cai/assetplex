# preview-curate.spec.md：全文预览与确认入库

> capability: 候选全文预览、勾选、冲突标注确认屏、溯源入库、结果页体检推荐
> 变更: add-github-skill-source | 决策依据: proposal.md D3/D5/D7，红线 1/2/3

## 定义

- **确认屏**：入库前最后一屏，逐条展示 动作（新增/跳过/覆盖）+ 来源仓库与锁定 SHA，**用户显式点「确认入库」前零落盘**（沿用导入向导 Step3 范式）
- **溯源记录**：入库 SKILL.md frontmatter `source: github:owner/repo@sha:skillPath`
- **provenance 五值**：`SkillProvenance` 扩为 self/marketplace/plugin/builtin/**github**；vault 条目 source 以 `github:` 开头 → 推导 `github`（徽章文案「GitHub 源」）

## Scenario 1：全文预览而非元数据

- **Given** 候选清单中某技能
- **When** 用户点击该条目
- **Then** 展示 SKILL.md **完整正文**（frontmatter 渲染为元数据区+正文原文），并列出附属文件清单（路径/大小）；超长内容截断显示并标注"已截断，全文以入库后为准"

## Scenario 2：勾选与确认屏

- **Given** 候选 5 条，用户勾选 3 条
- **When** 点「入库所选」
- **Then** 进入确认屏：逐条列出 名称、目标库名（默认同名，可改名）、动作标注（新增/同名已存在）、来源 `owner/repo@短SHA`；**确认前 vault 无任何写入**（单测断言）

## Scenario 3：同名冲突默认跳过、可切覆盖（proposal D7）

- **Given** 勾选条目与库内已有技能同名
- **When** 确认屏渲染
- **Then** 该条标注"同名已存在"，动作默认**跳过**，可切换为**覆盖**；提供「查看已有版本」对照入口（库内全文 vs 外部全文）；其他条目名撞任何盘点技能（含未入库工具技能）时同规则校验（与新建技能一致 400 语义，在确认屏预先暴露）；**本版不提供"AI 整合新旧两版"选项（已记待办，整合策略待维护者后续讨论）**

## Scenario 4：确认后入库落盘与溯源

- **Given** 确认屏 2 新增 + 1 覆盖 + 1 跳过
- **When** 用户点「确认入库」
- **Then** 逐条写 vault（整目录：SKILL.md + 附属文件），SKILL.md 重写 frontmatter：name=目标名、`source: github:owner/repo@sha:path`；覆盖项旧版先入备份区（回报 backupRef）；**永不触碰任何工具目录**（分发是入库后的独立显式动作）

## Scenario 5：批量部分成功语义

- **Given** 入库 3 条，其中 1 条附属文件 raw 拉取失败
- **When** 执行完成
- **Then** 结果页分组回报：成功 2（可在库内看到）、失败 1（原因如实），已成功**不回滚**（与 skill-curation 批量语义一致）；二进制附属文件跳过并如实标注（不假装完整）

## Scenario 6：成功页体检推荐（拍板 2，非自动）

- **Given** 入库至少 1 条成功
- **When** 结果页渲染
- **Then** 显示「建议立即体检」CTA 与说明文案（外部内容是 AI 指令，建议审视后再分发）；**不自动发起**任何 doctor 调用；点击后跳转/展开资产医生诊断；同时提供「去库内查看」与「分发给工具」（跳 swap）入口

## Scenario 7：入库后盘点与视图归属

- **Given** GitHub 源技能已入库
- **When** 技能页资产视图刷新
- **Then** 该技能 origin=vault、provenance=github、inLibrary=true、scope=资产；出处筛选/计数出现第五类「GitHub 源」；后续收藏/编辑/分发/医生行为与库内技能完全一致（无特殊分支）

## Scenario 8：更新是显式动作（红线 2）

- **Given** 已入库技能，上游仓库其后有新提交
- **When** 用户不做任何操作
- **Then** 本地条目零变化；用户**重新发现同仓 + 预览 + 确认覆盖**才会更新（本版无自动 SHA 对比提醒，P2 评估）；不做"跟踪分支"式订阅

## Scenario 9：改名入库

- **Given** 候选技能名含非法字符或与库内撞名
- **When** 确认屏中用户改目标名
- **Then** 走 validateAssetName 同规则校验（非法即时提示）；改名后入库 source 仍记录原始 skillPath（溯源不失真）

## Scenario 10：免责与隐私披露（红线 3/4）

- **Given** 本功能上线
- **When** 用户查看文档
- **Then** PRIVACY.md 第 5 节新增"外部源拉取"条目（只连用户指定的公开仓库、匿名只读、内容仅经确认才留本机 vault）；README/data-and-privacy 写明"外部源内容由用户自行添加，工具不内置官方镜像仓库"
