# Spec: 连接页控件真实可用

> Capability: connections-controls
> Change: fix-ui-trust-gaps（P0-2）
> API 契约：`../api-contract.ts` 的 `[CONSUMED] POST /tools/:name/toggle`、`POST /tools/:name/detect`

## ADDED Requirements

### Requirement: 启用同步开关可真实切换并持久化

#### Scenario: 启用一个已安装但未启用的工具

- **Given** 用户在连接页选中一个"已安装·未启用"的工具
- **When** 用户打开「启用同步」开关
- **Then** 系统调用 toggle 接口，开关显示进行中状态，期间不可重复点击
- **And** 成功后开关保持打开，工具状态徽章与左侧列表副标题更新为"已连接"
- **And** 用户刷新页面后开关仍为打开状态（配置已持久化）

#### Scenario: 停用一个已启用的工具

- **Given** 工具当前为已连接
- **When** 用户关闭开关
- **Then** 调用 toggle 接口，成功后状态更新为"未启用"，左侧列表同步更新
- **And** 首页连接卡的状态在下次进入首页时同步变化

#### Scenario: 未安装工具的开关不可操作

- **Given** 工具状态为未安装
- **Then** 开关为禁用（disabled）状态，点击无任何请求发出

#### Scenario: 切换请求失败

- **Given** toggle 接口返回错误或网络失败
- **When** 用户拨动开关
- **Then** 开关回退到拨动前的视觉状态
- **And** 页面出现错误 toast 说明"启用/停用失败"及原因

#### Scenario: 配置文件缺失时切换仍可持久化

- **Given** 保险箱 hub.toml 不存在（实测环境即此状态），工具已安装
- **When** 用户拨动开关
- **Then** 操作成功，配置被写入持久化存储，刷新后状态保留

### Requirement: 重新检测单个工具

#### Scenario: 手动重新检测当前工具

- **Given** 用户正在查看某个已安装工具的详情面板
- **When** 用户点击「重新检测」
- **Then** 按钮进入加载态（图标旋转或文案变化），调用 detect 接口
- **And** 成功后面板中的版本、安装状态、可导入资产列表按最新结果刷新
- **And** 成功后出现轻量成功反馈（toast 或按钮内短暂"已刷新"提示）

#### Scenario: 重新检测失败

- **When** detect 接口失败
- **Then** 出现错误 toast，按钮恢复可点击，面板保留原数据不清空

### Requirement: 扫描新工具（重新扫描全部）

#### Scenario: 重新扫描所有工具

- **Given** 用户在连接页
- **When** 用户点击左下角「扫描新工具」
- **Then** 系统重新拉取全部工具状态（GET /tools，内部重新检测所有适配器）
- **And** 按钮加载期间禁用；完成后工具列表与状态刷新
- **And** 按钮文案/提示不承诺"发现新工具"，仅表达"重新扫描"

### Requirement: 连接页内部导航不离开应用

#### Scenario: 从工具详情去导入

- **Given** 当前工具存在可导入资产
- **When** 用户点击「导入到 Hub」
- **Then** 在应用内路由跳转到 `/import`（不发生浏览器整页刷新）

#### Scenario: 从首页连接卡带参数跳转

- **Given** 用户在首页点击某工具连接卡（跳转 URL 为 `/connections?tool=<name>`）
- **When** 连接页加载
- **Then** 左侧列表自动选中该工具，右侧展示其详情
- **And** query 中的工具名不存在时，回退选中列表第一个工具且不报错
