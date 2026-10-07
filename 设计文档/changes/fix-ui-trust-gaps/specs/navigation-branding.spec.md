# Spec: 导航清理与品牌门面

> Capability: navigation-branding
> Change: fix-ui-trust-gaps（P0-3 / P0-6）
> 背景：活动数据源不存在（overview.recentActivities 恒为 []，无活动相关路由实现），
> 占位页是开发中间产物；死链与默认 favicon 伤害第一印象。

## ADDED Requirements

### Requirement: 主导航不暴露无功能页面

#### Scenario: 用户查看侧边主导航

- **Given** 任意已登录本地用户打开应用
- **When** 查看左侧主导航
- **Then** 导航中不出现「活动」菜单项（活动能力随 P2-C 数据源就绪后再加入口）
- **And** 其余导航项（首页、资产库及类别子项、项目、连接、同步、设置）均可正常打开

#### Scenario: 直接访问旧占位路由

- **Given** 用户通过历史链接访问 `/activities`
- **When** 页面加载
- **Then** 不展示"建设中 / Phase 1"等开发措辞
- **And** 路由重定向到首页（通配重定向即可，不新建占位页）

### Requirement: 首页不存在死链

#### Scenario: 最近活动为空时

- **Given** overview 返回空 recentActivities
- **When** 已初始化用户查看首页
- **Then** 「最近活动」卡片显示空态引导文案
- **And** 不渲染「查看全部」链接（旧链接 `/activity` 为死链，活动页未实现前不提供入口）

#### Scenario: 未来活动有数据时（当前后端不产生，仅约束前端结构）

- **Given** recentActivities 非空
- **Then** 卡片展示活动列表；本变更后仍不渲染「查看全部」，直至 P2-C 活动页落地

### Requirement: 浏览器门面品牌化

#### Scenario: 浏览器标签与图标

- **Given** 任意页面
- **Then** 文档标题为 `AssetPlex`（不再出现 `Web UI` 开发后缀）
- **And** favicon 为 AssetPlex 自有图标资源（替换 Vite 默认图标；无设计稿前使用与侧栏 Logo 一致的 Boxes 图形生成简洁 SVG 图标）
