# Capability: 技能分类全貌（Skills Taxonomy）

> 能力代码: skills-taxonomy
> 对应 API: [../api-contract.ts](../api-contract.ts)（B 部分）
> 状态: 待审核

## 目的

技能数量过百时，让用户看到全貌、按类型浏览。支持两个可切换的分类维度：**职能**与**来源**。分类自动完成，允许手动覆盖。

## 两个维度

**职能（function）**：编码开发 `coding`、文档写作 `writing`、浏览器自动化 `browser`、数据处理 `data`、DevOps/部署 `devops`、AI 集成 `ai-integration`、设计创意 `design`、工作流自动化 `workflow`、其他 `other`。

**来源（origin）**：官方内置 `builtin`、插件自带 `plugin`、个人自建 `personal`、市场安装 `marketplace`。

## 盘点范围（跨全部来源）

- `~/.trae-cn/skills/`（个人自建 + 经市场安装到用户目录）
- `~/.trae-cn/builtin/code|work|design/<persona>/skills/`（官方内置，按 persona 捆绑）
- `~/.trae-cn/builtin/global/skills/` 与 `~/.trae-cn/builtin_skills/`
- `~/.trae-cn/plugins/*/*/skills/`（插件自带）
- CodeBuddy `skills-marketplace`（市场安装）

同名技能去重为主条目，其余副本路径计入 `variants`。

---

## Scenario: 打开技能模块看到全貌统计

- **Given** 机器上存在多个来源、总数过百的技能副本
- **When** 用户进入技能模块
- **Then** 顶部展示技能总数（去重后主条目数）
- **And** 同时展示按职能的分类计数条与按来源的分类计数条
- **And** 默认按「职能」维度分组展示

## Scenario: 按职能自动分类

- **Given** 某技能的 SKILL.md 含 name 与 description
- **When** 系统执行自动分类
- **Then** 根据名称与描述中的关键词将其归入一个职能类别
- **And** 例如含 "pdf/docx/pptx/文档/写作" 的归入 `writing`，含 "browser/浏览器" 的归入 `browser`，含 "xlsx/csv/数据" 的归入 `data`
- **And** 无法匹配任何规则时归入 `other`

## Scenario: 按来源识别分类

- **Given** 技能分布在用户目录、builtin、插件、市场目录
- **When** 系统判定来源
- **Then** 用户 `skills/` 目录中与任何内置/插件不同名的技能标记为 `personal`
- **And** builtin 目录下标记为 `builtin`，插件目录下标记为 `plugin`，CodeBuddy 市场目录标记为 `marketplace`

## Scenario: 切换分类维度

- **Given** 技能页当前按职能分组
- **When** 用户切换为「按来源」
- **Then** 列表按来源重新分组，每组显示该来源下的技能
- **And** 再次切回「按职能」时恢复职能分组，筛选状态被清空

## Scenario: 按分类筛选与关键字搜索

- **Given** 技能全貌已加载
- **When** 用户点击某职能分类（如「文档写作」）或输入关键字
- **Then** 列表仅显示该分类或匹配关键字的技能
- **And** 选中分类的计数高亮，可一键清除筛选恢复全貌

## Scenario: 同名技能去重并保留副本

- **Given** 同一技能名出现在多个 persona 或多个工具目录（如 pdf 出现在多个 persona 包）
- **When** 系统构建技能清单
- **Then** 只产生一个主条目，`variants` 列出其余副本的绝对路径
- **And** 主条目来源按优先级 personal > plugin > marketplace > builtin 取值
- **And** 主条目展示版本号；副本数量在卡片上可见

## Scenario: 手动覆盖职能分类

- **Given** 某技能被自动归入「其他」，但用户认为属于「数据处理」
- **When** 用户在该技能上选择新的职能分类
- **Then** 该技能立即归入新分类，且 `functionOverridden` 为 true
- **And** 覆盖结果持久化，刷新或重新扫描后保持不变
- **And** 覆盖不修改原始 SKILL.md 文件

## Scenario: 被覆盖分类不受重新扫描影响

- **Given** 某技能已被手动覆盖职能分类
- **When** 自动分类规则更新或重新扫描
- **Then** 该技能仍保持用户覆盖的分类，其余未覆盖技能按新规则重新归类

## Scenario: 缺失 frontmatter 时兜底

- **Given** 某 SKILL.md 缺少 name 或 description
- **When** 系统读取技能
- **Then** 名称回退为目录名，描述为空字符串，不抛错
- **And** 职能分类依据可用的标题/正文关键词，仍无法判断时归入 `other`

## Scenario: 来源目录缺失

- **Given** 某来源目录（如 CodeBuddy 市场）不存在或为空
- **When** 系统盘点技能
- **Then** 该来源贡献零条目，不报错，其余来源正常
