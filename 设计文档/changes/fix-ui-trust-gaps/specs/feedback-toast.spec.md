# Spec: 全局操作反馈（Toast）与友好错误态

> Capability: feedback-system
> Change: fix-ui-trust-gaps（P0-4）
> 技术约束：仅使用 web 已有依赖（@radix-ui/react-toast、zustand），不新增 npm 依赖

## ADDED Requirements

### Requirement: 应用内操作反馈必须使用统一 Toast，禁止原生 alert

系统提供全局 toast 通道（成功/错误/信息三态），应用内所有操作结果反馈通过 toast 呈现；代码库中不再出现浏览器原生 `window.alert` 调用。

#### Scenario: 单个操作成功

- **Given** 用户执行一个可成功的操作（如编辑保存技能、切换工具开关、保存设置）
- **When** 操作成功返回
- **Then** 屏幕边缘出现非阻塞 toast，含成功态图标与一句话结果（如"已保存"）
- **And** toast 在数秒后自动消失，不阻塞用户继续操作

#### Scenario: 单个操作失败

- **Given** 某操作接口返回错误
- **When** 操作失败
- **Then** 出现错误态 toast，展示用户可理解的失败原因（优先后端 error 文案；网络错误显示通用"网络异常，请稍后重试"）
- **And** toast 不自动消失过快（错误态停留时间长于成功态），可手动关闭

#### Scenario: 批量操作部分成功

- **Given** 用户执行批量收藏或批量 AI 分类，返回 created/failed 混合结果
- **When** 批量操作完成
- **Then** toast 标题给出汇总数量（如"收藏完成：成功 8 个，跳过 2 个"）
- **And** 失败项逐项列出名称与原因；明细超过 3 项时折叠（"查看详情"展开），不得撑屏

#### Scenario: 长时操作进行中

- **Given** AI 批量分类等耗时操作正在进行
- **When** 用户观察触发入口
- **Then** 触发按钮显示进行中态并禁用重复提交（现状已具备，保持）
- **And** 完成后按成功/部分成功/失败三态出 toast

### Requirement: 设置页保存有明确反馈

#### Scenario: 保存 Hub 配置成功

- **Given** 用户在设置页修改了配置并点击「保存配置」
- **When** 保存成功
- **Then** 出现成功 toast，"未保存"标记消失，按钮恢复可用

#### Scenario: 保存失败

- **When** 保存接口失败
- **Then** 出现错误 toast 说明原因，"未保存"标记保留，用户修改不丢失

### Requirement: 列表加载失败展示友好错误态

#### Scenario: 任一主列表数据加载失败

- **Given** 技能页、资产库、项目页或连接页的数据请求失败
- **When** 错误态渲染
- **Then** 页面显示统一错误态组件：警示图标 + 一句用户语言说明（"加载失败，请检查服务是否运行"）+「重试」按钮
- **And** 不向用户展示原始异常字符串（如 `request failed with status 500`、堆栈信息）
- **And** 点击重试重新发起该查询

### Requirement: 行内即时操作的反馈与防错

#### Scenario: 卡片上直接修改职能分类

- **Given** 用户在技能卡片上通过下拉框切换职能分类
- **When** 修改请求成功
- **Then** 出现轻量成功反馈（toast"已更新分类"），列表数据刷新
- **When** 修改请求失败
- **Then** 下拉框回退为修改前的值并出现错误 toast（现状失败仅 alert 且视觉停留新值，需修正回退）
