# spec: skill-function-color（九职能色彩编码与卡面减负）

> Capability：技能卡用颜色编码九职能，并提供可随时查阅的图例；卡面保持 ≤2 枚徽章
> 关联：proposal 方案 A/B、拍板点 A/B
> 消费者：`SkillCard`、`SkillsToolbar`（职能 chips）、`SkillDetail`、`index.css`

## 为什么需要

九个职能在卡面、筛选 chips 上完全相同（灰底灰字），用户扫列表时无法建立「颜色 = 职能」的识别；同时卡面底部常驻一行「职能分类」下拉，占掉约 28px 高度，是卡片噪声的主要来源。

## 色彩编码规则

| 职能 | 令牌 | HSL（h s% l%） | 说明 |
|---|---|---|---|
| `coding` 编码开发 | `--fn-coding` | `243 75% 59%` | 与 primary 同族，色点与主按钮可区分（点小、按钮大） |
| `writing` 文档写作 | `--fn-writing` | `36 95% 38%` | 避开 `warning` 26（相距 10°） |
| `browser` 浏览器自动化 | `--fn-browser` | `199 90% 36%` | 避开 `info` 224 |
| `data` 数据处理 | `--fn-data` | `165 80% 31%` | 避开 `success` 142 |
| `devops` DevOps/部署 | `--fn-devops` | `12 85% 42%` | 避开 `destructive` 0 |
| `ai-integration` AI 集成 | `--fn-ai` | `285 65% 50%` | 紫 |
| `design` 设计创意 | `--fn-design` | `330 75% 43%` | 品红 |
| `workflow` 工作流自动化 | `--fn-workflow` | `178 70% 30%` | 青 |
| `other` 其他 | `--fn-other` | `220 9% 42%` | 中性灰（9% 饱和），表示「未归类」 |

实测对比度（对 `--background` 白）：coding 6.18 / writing 3.73 / browser 4.76 / data 4.09 / devops 5.37 / ai 5.26 / design 5.80 / workflow 4.63 / other 5.61，全部 ≥3:1。

- 色点饱和度/明度统一取「对白底 ≥3:1」，不用于文字，不用于大面积填充。
- 徽章形态固定为「6px 圆点 + 文字」，底色沿用中性（`bg-muted` 或 outline），**不得**整枚上色。

### Requirement: 职能色点出现在所有职能可见处

#### Scenario: 卡面职能徽章

- **Given** 技能列表中的任一技能
- **When** 查看其卡片
- **Then** 职能徽章左侧有一个 6px 圆点，颜色为该职能的令牌色
- **And** 徽章文字仍是职能中文名（颜色不是唯一信息载体）

#### Scenario: 职能筛选 chips 同步上色

- **Given** 技能页切到「按职能」维度
- **When** 查看计数 chips
- **Then** 每个 chip 左侧同样有对应 6px 色点，与卡面一致
- **And** 选中态沿用既有 `bg-primary` 样式，不因色点改变选中语义

#### Scenario: 详情面板职能行

- **Given** 用户打开任一技能详情
- **When** 查看元信息区
- **Then** 职能徽章同样带色点，且与卡面颜色一致

### Requirement: 图例可查

#### Scenario: 打开图例

- **Given** 技能页
- **When** 点击工具条上的「图例」按钮
- **Then** 弹出面板列出九个职能的色点 + 名称 + 当前计数
- **And** 面板可用 Esc 关闭，关闭后焦点回到「图例」按钮

#### Scenario: 图例不常驻占高度

- **Given** 技能页默认状态
- **When** 未点击「图例」
- **Then** 页面上不出现常驻的九行图例块

### Requirement: 卡面减负（P1 基础版的收口）

#### Scenario: 卡面不再常驻分类下拉

- **Given** 任一技能卡
- **When** 查看卡面
- **Then** 卡面上没有常驻的 `<select>` 行
- **And** 卡面常驻徽章仍 ≤2 枚（职能 + 出处）
- **And** 卡片高度相比变更前减少（不含展开确认区时）

#### Scenario: 未分类技能

- **Given** 某技能 `functionCategory` 缺失或为 `other`
- **When** 查看其卡片
- **Then** 不渲染空徽章，色点与文字按 `other` 规则显示

#### Scenario: 详情面板保留完整元信息

- **Given** 用户打开任一技能详情
- **When** 查看元信息
- **Then** 版本、副本数、分类来源仍在详情可见（不因卡面减负丢失）

### Requirement: 色彩可访问

#### Scenario: 色点对比度

- **Given** 九个 `--fn-*` 令牌
- **When** 计算它们的色点颜色对 `--background`（白）的对比度
- **Then** 九个比值均 ≥3:1（图形元素门槛）
- **And** 校验用 `web/src/lib/contrast.ts` 的纯函数，断言固化进 `contrast.test.ts`

#### Scenario: 不依赖颜色单独传达

- **Given** 色觉障碍用户
- **When** 查看卡面与图例
- **Then** 每个色点旁都有中文职能名
- **And** 图例文字与卡面文字一致，不出现仅靠颜色区分的场景
