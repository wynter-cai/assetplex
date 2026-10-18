# asset-first-view.spec.md：技能页资产优先视图（环境不公示）

> capability: 技能列表的视图分层与默认口径
> 变更: refactor-skill-asset-first-view | 依赖出处语义: skill-origin-taxonomy.spec.md

## 定义

- **资产（asset）**：`inLibrary === true` 或 `provenance === 'self'`（含未入库的个人/项目自建）
- **环境（environment）**：非资产，即未入库且出处为 marketplace / plugin / builtin
- 两集合互斥，并集 = 全量盘点

## Scenario 1：默认只显资产，环境不公示

- **Given** 本机盘点共 600 项（资产约 130、环境约 470，含市场安装/内置/插件）
- **When** 用户打开技能页（未带任何筛选）
- **Then** 请求默认 `scope=asset`，列表只显资产；页面无平级分段控件，仅底部常驻折叠入口「本机技能环境 470」；总计数与职能分面均按资产口径；市场技能（如 12306）不出现在默认列表

## Scenario 2：主动调取环境列表

- **Given** 用户处于资产视图
- **When** 点击折叠入口「本机技能环境」
- **Then** 请求 `scope=environment`，展开未入库的市场/插件/内置列表（可再次收起）；出处 chips（市场安装/插件自带/官方内置）在展开区内可用；「收藏到我的库」操作保留；展开条数与入口计数一致

## Scenario 3：收藏后条目从环境列表消失并出现在资产列表

- **Given** 某市场技能在展开的环境列表中
- **When** 用户点「收藏到我的库」且成功
- **Then** 该技能从环境列表移除，出现在资产列表；入口计数 -1、资产计数 +1，全量合计不变

## Scenario 4：搜索限资产口径，空态指向环境入口

- **Given** 用户处于技能页（默认资产视图）
- **When** 搜索一个仅存在于环境的技能名，结果为空
- **Then** 空态文案提示当前只搜资产，引导展开「本机技能环境」查看（一键展开，不自动切换视图）

## Scenario 5：scope 与细分筛选正交

- **Given** 请求 `scope=environment&provenance=marketplace`
- **When** 后端过滤
- **Then** 结果为"环境 ∩ 市场安装"（scope 先行，细分参数在其内二次过滤）；`countByScope` 随 function/search 联动重算、不含 scope 自身维度（沿用既有分面计数惯例）

## Scenario 6：旧调用零破坏

- **Given** 不带 `scope` 参数的 `GET /api/skills` 调用（既有测试与潜在脚本）
- **When** 请求到达
- **Then** 行为与 `scope=all` 完全一致，items/counts 不因新参数变化；`scope` 非法值 → 400（错误消息格式对齐既有 validate 风格）

## Scenario 7：盘点源补齐——Qoder 自建技能纳入资产（用户批准并入）

- **Given** `~/.qoder-cn/skills/demo-q/SKILL.md`（或回退目录 `~/.qoder/skills/`）与工作区 `<ws>/.qoder/skills/proj-q/SKILL.md` 存在
- **When** 盘点扫描
- **Then** demo-q 纳入盘点（origin=personal、tool=qoder，provenance=self → 属资产视图）；proj-q 纳入盘点（origin=project，携 workspaceName/workspacePath）；两类目录不存在时零贡献不报错；同名于其他工具副本时按既有优先级合并（vault > personal > project）

## Scenario 8：环境列表内官方内置分组排最后

- **Given** 用户展开环境列表，同时存在市场安装/插件自带/官方内置三类
- **When** 列表分组渲染
- **Then** 分组顺序固定为 市场安装 → 插件自带 → 官方内置（最后，用户拍板：内置可收藏分发到其他工具但价最低，保留一格不过度曝光）

## 非目标（Non-goals）

- 不改变 deriveProvenance / inLibrary 推导逻辑；不删除引擎层环境扫描（同名校验/冲突预览/AI 缓存依赖）
- 盘点源不改为适配器注册表驱动（另立变更）；本次仅新增 Qoder 用户级与项目级源
- 不做市场技能价值评分、整理建议；不做使用频率统计（无数据，留分类法 hook）
- rules/mcp/identity 等其他资产页不在本次范围

## 规格修订说明

本 spec 修订 refactor-skill-origin-taxonomy 决策 3（“未入库×市场=待收藏候选池”杀手级查询）：能力保留（API scope 参数 + 收藏操作 + 环境列表可展开），但候选池不再作为平级视图默认曝光——依据用户准则：市场内容随时可重装，不属于需管理的资产（拍板 2026-10-18）。
