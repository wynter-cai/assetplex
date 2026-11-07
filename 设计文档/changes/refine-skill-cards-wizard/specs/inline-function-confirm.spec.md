# spec: inline-function-confirm（卡面改职能的确认与撤销）

> Capability：技能卡上的「调整分类」是显式确认动作，成功后 30 秒内可撤销
> 关联：proposal 方案 B、拍板点 B/C
> 消费者：`SkillCard`、`SkillDetail`、`toast-store`

## 为什么需要

当前卡面下拉框 `onChange` 即刻发 `PUT /skills/:id/function`：误触即改、无 loading、成功无反馈、失败只弹一句错误、没有撤销。用户改错一次就得再改一次，且不知道改成功了没有。

## 交互定义

- 卡面右上角一个图标按钮（`aria-label="调整 {name} 的分类"`），点击展开卡内确认区：职能下拉（默认值＝当前分类）+「应用」「取消」。
- 只有点「应用」才发请求；「取消」或 Esc 收起确认区，不发请求。
- 请求成功后：确认区收起 → toast「已改为 {新分类}」并带「撤销」动作，30 秒有效。
- 点撤销：再次写回原分类，成功后 toast「已撤销，恢复为 {原分类}」。

### Requirement: 改分类必须显式确认

#### Scenario: 展开确认区

- **Given** 某技能当前分类为「编码开发」
- **When** 点击卡面「调整分类」按钮
- **Then** 卡内出现下拉与「应用」「取消」按钮，当前值为「编码开发」
- **And** 此时**尚未**发出任何请求

#### Scenario: 应用

- **Given** 确认区已展开
- **When** 选择「数据处理」并点「应用」
- **Then** 发出一次 `PUT /skills/:id/function`，载荷为新分类
- **And** 确认区在请求成功后收起
- **And** 出现成功 toast「已改为 数据处理」，带「撤销」按钮

#### Scenario: 取消

- **Given** 确认区已展开且已选择新分类
- **When** 点「取消」或按 Esc
- **Then** 确认区收起，下拉回到当前分类，不发出请求

### Requirement: 失败与回滚

#### Scenario: 请求失败

- **Given** 确认区已展开
- **When** 点「应用」且请求失败
- **Then** 出现错误 toast（含失败原因）
- **And** 列表数据刷新回真实分类，确认区不残留「以为改成功」的状态

### Requirement: 撤销

#### Scenario: 撤销成功

- **Given** 刚把某技能从「编码开发」改为「数据处理」，成功 toast 仍在
- **When** 点 toast 上的「撤销」
- **Then** 再次发出请求把分类写回「编码开发」
- **And** 出现 toast「已撤销，恢复为 编码开发」

#### Scenario: 撤销过期

- **Given** 成功 toast 已超过 30 秒自动消失
- **When** 用户想撤销
- **Then** 界面上不再提供撤销入口（不做超期撤销）

#### Scenario: 撤销前分类已被他人/他处改动

- **Given** 成功 toast 仍可点撤销
- **When** 该技能的当前分类已不等于「改动后的值」
- **Then** 不写回，提示「分类已被修改，撤销已失效」

### Requirement: 键盘与可访问

#### Scenario: 键盘操作全链路

- **Given** 用户仅用键盘
- **When** Tab 到「调整分类」按钮并回车
- **Then** 焦点进入确认区第一个控件（下拉）
- **And** 可 Tab 到「应用」「取消」，Esc 收起并把焦点还给「调整分类」按钮

#### Scenario: 详情面板同样可改

- **Given** 用户打开技能详情
- **When** 查看元信息区
- **Then** 存在同一套「调整分类」确认控件（行为与卡面一致）

## 契约

- `toast-store` 的 `ToastOptions` 增加 `action?: { label: string; onClick: () => void }`；带 action 的 toast 时长至少 30 秒，不受默认 3 秒影响。
- 撤销写回复用既有 `PUT /skills/:id/function`，不新增接口。
