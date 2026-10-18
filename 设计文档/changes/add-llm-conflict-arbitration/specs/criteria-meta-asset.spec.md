# criteria-meta-asset.spec.md：裁决准则元资产

> capability: criterion 类别的存储、管理与组装契约
> 变更: add-llm-conflict-arbitration | 决策依据: proposal.md D2/D5

## 定义

- **准则（criterion）**：一条可复用的裁决/诊断标准，存为 `Hub/criteria/<slug>.md`，frontmatter 含 `name`（显示名）、`description`（一句话用途）、`priority`（整数，越小越优先）、`enabled`（缺省 true）、`appliesTo`（适用资产类别，缺省 ['all']）、`source`（可选，业内来源标注）；正文为准则内容本身（markdown，供组装进 prompt）
- 准则服务两个消费方：**冲突仲裁**（本变更）与**资产医生诊断**（add-asset-doctor 变更），组装时按目标资产类别匹配 appliesTo 后取入
- 准则属**资产侧**：在资产库导航中新增「裁决准则」入口，与 identity/skill/rule/mcp 等类别并列；不参与技能页的 asset/environment 口径体系（那是 skill 类别内部的事，criteria 整类都是资产）
- `slug` 由文件名派生（去 .md），全库唯一

## Scenario 1：准则页可见可用

- **Given** 用户从未建过准则，`Hub/criteria/` 为空
- **When** 打开资产库「裁决准则」页
- **Then** 空态提示"还没有准则。仲裁与诊断将只按内置基线工作"，并提供「新建准则」与「导入业内准则包」两个动作；页面不自动写入任何文件

### Scenario 1b：业内准则包导入

- **Given** 软件内置了一套精选业内最佳实践准则模板（skill 设计/agent 配置/token 效率/规则简洁等，每条标 appliesTo 与 source）
- **When** 用户点「导入业内准则包」并勾选其中若干条
- **Then** 仅被勾选的准则生成到 `Hub/criteria/`，列表卡片展示来源标注；同名拒绝不覆盖；导入后用户可自由编辑（准则是资产，不是只读配置）

## Scenario 2：新建准则落库并在列表可见

- **Given** 用户在准则页点「新建准则」
- **When** 填写名称「Skill 渐进披露」、描述、正文（skill 应把细节放二级文件、正文保持精炼）、优先级 10，保存
- **Then** `Hub/criteria/<slug>.md` 生成（frontmatter 完整），列表出现该准则卡，含启用开关与优先级徽章；再次仲裁时该准则参与组装

## Scenario 3：插入示例不覆盖同名

- **Given** 已存在同名准则「Skill 渐进披露」
- **When** 用户点「插入示例准则」中的同名示例
- **Then** 后端拒绝并提示已存在（沿用既有同名校验语义），已有文件内容不发生任何变化

## Scenario 4：停用与删除即时生效

- **Given** 某准则 enabled=true 且参与过仲裁
- **When** 用户将其停用（或删除）
- **Then** 下一次仲裁的 prompt 组装不再包含它（enabled=false 只改 frontmatter，不删文件；删除有确认对话框并警示"仲裁建议质量将受影响"）

## Scenario 5：组装顺序、类别匹配与 token 预算（对应 proposal G2/D5）

- **Given** 库内有多条 enabled 准则，priority 各异，总长超过 4000 字符预算
- **When** 系统组装仲裁/诊断 prompt（目标资产类别为 skill）
- **Then** 先按 appliesTo 匹配（'all' 或含 'skill' 的准则参与，其余不参与），再按 priority 升序、同优先级按 slug 字典序取入，直到预算耗尽；被舍去的条数记入返回的 `criteriaSkipped`；建议卡上可见「N 条准则未参与本次裁决」

## Scenario 6：无 AI 配置时准则管理不依赖 LLM

- **Given** 用户未配置 AI 端点
- **When** 浏览/新建/编辑/删除准则
- **Then** 全部操作正常完成（准则 CRUD 是纯本地文件操作，不发起任何网络调用）

## 非目标

- 准则的版本历史 UI（Hub 文件级由备份机制兜底，分类法层面另议）
- 从工具 rule 文件"提炼准则"的导入向导（下期结合策展一起做）
- 准则跨工具分发（见 proposal 非目标）
