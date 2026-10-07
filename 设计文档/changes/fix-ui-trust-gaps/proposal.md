# Proposal: fix-ui-trust-gaps（UI 信任缺口止血）

> **级别**：M（多模块、用户可见修复集合）
> **日期**：2026-10-07
> **依据**：[assetplex-ui-ux-audit-2026-10-07.md](../../assetplex-ui-ux-audit-2026-10-07.md) P0-1 ~ P0-6
> **路线图位置**：[assetplex-ui-ux-roadmap.md](../../assetplex-ui-ux-roadmap.md) P0 阶段

## Goal（解决什么问题）

当前界面存在四类"对用户说谎"的缺陷：有 186 个资产却显示新客欢迎页、连接页三个可点控件无反应、导航存在死链与"建设中"占位、所有操作反馈依赖阻塞式原生 alert。本变更在**不改变视觉风格**的前提下，让现有功能全部真实可用、状态真实呈现、操作有反馈。

## Scope（做什么 / 不做什么）

**做**：
1. 修复 overview `hubInitialized` 判定（保险箱目录有资产即已初始化，hub.toml 缺失不再 gate 首页）
2. overview `assetStats` 补齐第 5 类 `agent`（后端类别映射不再丢弃 agents）
3. 首页按真实数据渲染指挥中心；资产快照改自适应栅格、骨架屏与 5 类对齐
4. 连接页三个控件接线到已存在的后端端点（toggle/detect/refetch）；`<a href>` 改 SPA 跳转；支持 `?tool=` 定位
5. Toast 反馈基础设施（@radix-ui/react-toast + zustand，**零新依赖**），替换全部 19 处 alert；设置页保存有成功/失败反馈
6. 统一错误态组件，替换向用户甩 `error.message` 的红字块
7. 撤出无数据源的「活动」主导航入口；修 `/activity`→`/activities` 死链；favicon 与页面标题品牌化

**不做**：
- 不改任何颜色/字体/布局风格（P1 `refactor-design-system` 的范围）
- 不实现活动流页面（P2-C）
- 不改 assetStats 计数口径（文件递归计数 vs 去重技能数，P2-C 统一）
- 不动暗色模式、不做响应式重构
- 不新增任何 npm 依赖

## Risks（风险点）

| 风险 | 缓解 |
|---|---|
| hubInitialized 判定放宽后，真正未初始化用户也看到指挥中心空壳 | 判定仍要求 `hubExists && totalAssets > 0`；空资产走原欢迎态，有测试覆盖 |
| toggle 工具启停会改写 hub.toml 配置（实测环境 toml 缺失时 saveConfig 行为未知） | T4 先补后端 toggle 在 toml 缺失场景的测试；若 saveConfig 不能自建文件，后端一并修复（红测先行） |
| 19 处 alert 替换漏掉特殊分支（如 confirm 语义） | 先全量分类 alert（信息提示/成功汇总/错误），逐个映射 toast；保留需确认的对话框（DeleteConfirmDialog 已存在，不用 confirm 替代） |
| 批量分类结果 alert 长文含逐项明细，toast 空间有限 | 汇总进 toast（成功 N/跳过 N），明细超 3 项折叠或留 console；以 spec 场景为准 |
| 首页快照新增 agent 后老用户看到计数变化产生疑问 | agent 与其他四类同口径（保险箱目录文件数），路线图 P2-C 统一全部口径并公告 |

## 验证策略

- 后端 TDD：overview 两个判定变化各配红测；toggle toml 缺失场景测试
- 前端组件测试：Home 初始化/已初始化两态、Connections 三控件交互、Toaster、ErrorState、Sidebar 无活动入口
- 浏览器回环 6 场景：首页真实态、连接开关切换持久化、重新检测 loading、toast 成功/失败、死链消失、快照 5 类
- API 二次核实：Invoke-WebRequest 核对 toggle 后配置文件真实变化、overview 契约
