# Tasks: add-vault-connections-ui

> 任务清单，每个任务可独立提交。任务前的 `[ ]` 表示待办。

## Phase 1: 导航骨架 + 首页（核心骨架，先做）

### P1-T1: 重构侧边栏导航
- [ ] 修改 `web/src/components/layout/Sidebar.tsx`
- [ ] 从 9 个 tab 改为 4+1 结构：首页 / 资产库 / 连接 / 活动 / 设置
- [ ] 资产库作为父项，子项动态从配置读取（不写死类别）
- [ ] 配置文件定义资产类别（icon/label/code）
- [ ] 验证：进入应用，侧边栏显示新的 5 个导航项
- 优先级: P0
- 验证方式: 视觉检查 + 点击每个导航能切换路由

### P1-T2: 新增首页路由和页面骨架
- [ ] 修改 `web/src/App.tsx`，新增 `/` 路由指向 Home
- [ ] 创建 `web/src/pages/Home.tsx`
- [ ] 实现 4 个区域：HomeHero / 资产快照 / 连接状态 / 快速动作 + 最近活动
- [ ] 用 mock 数据先跑通布局（不接 API）
- [ ] 验证：访问 `/` 看到首页骨架（数据为 mock）
- 优先级: P0
- 验证方式: 视觉检查 + 截图

### P1-T3: 实现 HomeHero 组件
- [ ] 创建 `web/src/components/home/HomeHero.tsx`
- [ ] 显示欢迎语和 Hub 状态
- [ ] 空状态显示"开始盘点你的 AI 资产"主按钮
- [ ] 验证：Hub 为空和不为空两种状态都正确
- 优先级: P0
- 验证方式: 视觉检查 + 测试用例

### P1-T4: 实现资产快照卡片
- [ ] 创建 `web/src/components/home/AssetSnapshot.tsx`
- [ ] 显示 4 类资产的数量（从配置读取类别，不写死）
- [ ] 点击数字跳转到 `/vault?category=xxx`
- [ ] Hub 为空时不显示
- [ ] 验证：spec home-page R1 的 3 个 Scenario
- 优先级: P0
- 验证方式: React Testing Library 测试 + 视觉检查

### P1-T5: 实现连接状态卡片
- [ ] 创建 `web/src/components/home/ConnectionCard.tsx`
- [ ] 显示所有工具的连接和同步状态（图标+颜色区分）
- [ ] 点击跳转到 `/connections?tool=xxx`
- [ ] 验证：spec home-page R2 的 2 个 Scenario
- 优先级: P0
- 验证方式: React Testing Library 测试 + 视觉检查

### P1-T6: 实现快速动作和最近活动
- [ ] 创建 `web/src/components/home/QuickActions.tsx`
- [ ] 创建 `web/src/components/home/RecentActivity.tsx`
- [ ] 快速动作 3 个按钮：导入资产/分发同步/新建技能
- [ ] 最近活动显示最近 5 条时间线
- [ ] 验证：spec home-page R3、R4 的 Scenario
- 优先级: P1
- 验证方式: 视觉检查

### P1-T7: 实现首页聚合 API
- [ ] 创建后端 `src/server/routes/hub.ts` 中新增 `GET /api/hub/overview`
- [ ] **TDD**: 先写测试 `tests/integration/hub-overview.test.ts`
- [ ] 聚合 assetStats + connections + recentActivities + hubInitialized + healthScore
- [ ] 验证：API 返回完整数据结构（符合 api-contract.ts）
- 优先级: P0
- 验证方式: 集成测试通过

### P1-T8: 首页接入真实 API
- [ ] 修改 `Home.tsx`，用 TanStack Query 替换 mock 数据
- [ ] 调用 `GET /api/hub/overview`
- [ ] 实现加载状态（Skeleton）和错误状态
- [ ] 验证：spec home-page R5 的 2 个 Scenario
- 优先级: P0
- 验证方式: 视觉检查 + 浏览器手动测试

---

## Phase 2: 资产库重构 + 连接页框架

### P2-T1: 资产库页面骨架
- [ ] 创建 `web/src/pages/Vault.tsx`
- [ ] 实现左侧类别导航 + 右侧内容区双栏布局
- [ ] 类别从配置读取，显示数量
- [ ] 验证：spec vault-page R1 的 2 个 Scenario
- 优先级: P0
- 验证方式: 视觉检查

### P2-T2: 资产卡片组件
- [ ] 创建 `web/src/components/vault/AssetCard.tsx`
- [ ] 显示资产名称/图标/来源/修改时间/分发状态条/操作按钮
- [ ] 创建 `web/src/components/vault/DistributionBadge.tsx` 显示分发圆点
- [ ] 验证：spec vault-page R2 的 2 个 Scenario
- 优先级: P0
- 验证方式: React Testing Library 测试

### P2-T3: 资产搜索和筛选
- [ ] 在资产库顶部实现搜索框
- [ ] 实现实时筛选（debounce 300ms）
- [ ] 实现空状态
- [ ] 验证：spec vault-page R3 的 2 个 Scenario
- 优先级: P1
- 验证方式: 浏览器手动测试

### P2-T4: 资产新建和编辑器
- [ ] 创建 `web/src/components/vault/AssetEditor.tsx`
- [ ] 实现 Markdown 编辑器（左编辑右预览）
- [ ] 新建/编辑/保存/取消流程
- [ ] 验证：spec vault-page R4、R5 的 Scenario
- 优先级: P1
- 验证方式: 浏览器手动测试

### P2-T5: 分发管理对话框
- [ ] 创建 `web/src/components/vault/DistributionDialog.tsx`
- [ ] 显示所有工具的开关列表
- [ ] 切换开关 + 立即同步按钮
- [ ] 验证：spec vault-page R6 的 2 个 Scenario
- 优先级: P1
- 验证方式: 浏览器手动测试

### P2-T6: 资产列表 API
- [ ] 后端 `src/server/routes/files.ts` 新增 `GET /api/assets`（带筛选）
- [ ] **TDD**: 先写测试
- [ ] 支持 category 和 search 查询参数
- [ ] 验证：返回数据符合 api-contract.ts
- 优先级: P0
- 验证方式: 集成测试通过

### P2-T7: 连接页骨架
- [ ] 创建 `web/src/pages/Connections.tsx`
- [ ] 左侧工具列表 + 右侧详情面板
- [ ] 工具按安装状态排序
- [ ] 验证：spec connections-page R1 的 2 个 Scenario
- 优先级: P0
- 验证方式: 视觉检查

### P2-T8: 工具详情面板
- [ ] 创建 `web/src/components/connections/ToolDetailPanel.tsx`
- [ ] 显示工具信息 + 资产分发状态 + 未入库文件
- [ ] 同步按钮触发 SyncConfirmDialog
- [ ] 验证：spec connections-page R2、R3、R4 的 Scenario
- 优先级: P0
- 验证方式: 视觉检查 + 浏览器测试

### P2-T9: 连接 API
- [ ] 后端新增 `GET /api/connections` 和 `GET /api/connections/:toolId`
- [ ] **TDD**: 先写测试
- [ ] 聚合工具信息 + 资产分发状态 + 未入库文件
- [ ] 验证：返回数据符合 api-contract.ts
- 优先级: P0
- 验证方式: 集成测试通过

### P2-T10: 同步确认对话框
- [ ] 创建 `web/src/components/connections/SyncConfirmDialog.tsx`
- [ ] 显示将同步的资产列表
- [ ] 确认/取消按钮
- [ ] 同步完成/失败的状态展示
- [ ] 验证：spec connections-page R5 的 3 个 Scenario
- 优先级: P1
- 验证方式: 浏览器手动测试

---

## Phase 3: 活动页 + 入库向导整合 + 打磨

### P3-T1: 活动页
- [ ] 创建 `web/src/pages/Activity.tsx`
- [ ] 时间线展示
- [ ] 筛选（按类型、按时间）
- [ ] 点击展开详情
- [ ] 验证：spec activity-page 的所有 Scenario
- 优先级: P1
- 验证方式: 视觉检查 + 浏览器测试

### P3-T2: 活动 API
- [ ] 后端扩展现有 `/api/sync/history` 为 `/api/activity`
- [ ] **TDD**: 先写测试
- [ ] 支持类型筛选和分页
- [ ] 验证：返回数据符合 api-contract.ts
- 优先级: P1
- 验证方式: 集成测试通过

### P3-T3: 入库向导整合
- [ ] 修改 `web/src/pages/Import.tsx` 为 Modal 形式
- [ ] 从首页/资产库/连接页三处入口触发
- [ ] Step 3 冲突项默认展开 Diff
- [ ] Step 4 完成后提供"去分发"跳转
- [ ] 验证：spec import-wizard 的所有 Scenario
- 优先级: P1
- 验证方式: 浏览器手动测试完整流程

### P3-T4: 旧页面清理
- [ ] 删除 `Dashboard.tsx`、`Identity.tsx`、`Skills.tsx`、`Rules.tsx`、`Mcp.tsx`、`Sync.tsx`、`Tools.tsx`
- [ ] 清理 `App.tsx` 中的旧路由
- [ ] 清理 `api.ts` 中废弃的 API 调用
- [ ] 验证：应用启动无错误，所有功能在新页面都能找到
- 优先级: P1
- 验证方式: 完整功能回归测试

### P3-T5: 空状态和错误处理打磨
- [ ] 所有页面补充空状态组件
- [ ] 所有 API 调用补充错误处理和重试
- [ ] 加载状态用 Skeleton
- [ ] 验证：断网、空数据、API报错三种场景
- 优先级: P2
- 验证方式: 浏览器手动测试异常场景

### P3-T6: 深色模式完善
- [ ] 检查所有新组件的深色模式样式
- [ ] 修复 TailwindCSS 颜色对比问题
- [ ] 验证：亮色/暗色切换所有页面都正常
- 优先级: P2
- 验证方式: 视觉检查

### P3-T7: 类型安全和构建验证
- [ ] 运行 `tsc -b` 确认无类型错误
- [ ] 运行 `pnpm test` 确认所有测试通过
- [ ] 运行 `vite build` 确认构建成功
- [ ] 运行 `node dist/index.js ui` 启动服务验证
- [ ] 验证：所有 spec 的 Scenario 逐条手动验证
- 优先级: P0
- 验证方式: 完整验证清单

---

## 任务统计

| Phase | 任务数 | P0 | P1 | P2 |
|-------|-------|----|----|----|
| Phase 1 | 8 | 6 | 2 | 0 |
| Phase 2 | 10 | 5 | 5 | 0 |
| Phase 3 | 7 | 1 | 4 | 2 |
| **总计** | **25** | **12** | **11** | **2** |
