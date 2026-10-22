# github-fetch.spec.md：GitHub 源拉取与技能发现

> capability: 源串解析、REST 拉取锁 SHA、布局发现、限额护栏、缓存与错误处理
> 变更: add-github-skill-source | 决策依据: proposal.md D1/D2/D6，红线 2/4

## 定义

- **源串**：`owner/repo[/subpath][@ref]`，ref 缺省为默认分支；解析后必须落到**具体 commit SHA** 才产出候选
- **候选技能**：从仓库树按布局约定识别出的外部技能条目（路径 + frontmatter 元数据），**未入库前只是内存中的预览对象**，不进盘点、不落盘
- **发现（discover）**：一次"解析 ref → 锁 SHA → 取树 → 识别布局"的手动动作

## Scenario 1：合法源串发现出候选清单

- **Given** 公开仓库含 `skills/foo/SKILL.md` 与 `skills/bar/SKILL.md`（带 references/ 子目录）
- **When** 用户输入 `owner/repo` 手动发起发现
- **Then** 返回锁定的 commit SHA + 2 条候选（名称、description、skillPath、SKILL.md 字节数、附属文件数）；`skills/foo/references/` 下文件归入 foo 的附属清单，不单列候选

## Scenario 2：三种布局识别

- **Given** 仓库根有 `SKILL.md`（单技能仓库）
- **When** 发现
- **Then** 根技能作为 1 条候选（名称取 frontmatter name）；同理识别 `skills/<name>/SKILL.md` 与 subpath 下同规则布局；不符合任一约定的仓库返回空清单

## Scenario 3：@ref 与锁 SHA 展示

- **Given** 源串 `owner/repo@v1.2.0`（tag）或 `@main`（分支）
- **When** 发现完成
- **Then** 结果展示"实际锁定 SHA"（短哈希+全哈希可查），后续预览/入库全部按该 SHA 取内容；ref 之后上游移动不影响本次会话

## Scenario 4：源串非法

- **Given** 输入 `not-a-repo`、空串、`owner//repo`、路径穿越段（`..`）
- **When** 发现
- **Then** 400 报"源格式应为 owner/repo[/subpath][@ref]"，不发任何网络请求

## Scenario 5：仓库不存在 / 非公开 / 网络失败

- **Given** 源指向不存在或私有仓库
- **When** GitHub 返回 404/401
- **Then** 如实回报"仓库不存在或不可公开访问"（不泄露区分私有原因的猜测）；网络层失败回报"无法连接 GitHub，未做任何重试以外的后台行为"；候选清单为空态

## Scenario 6：匿名限额命中

- **Given** 用户一小时内频繁发现/预览耗尽 GitHub 匿名配额（API 返回 403/429 rate limit）
- **When** 再次发起
- **Then** 明确提示"GitHub 匿名请求限额已用完，约 X 分钟后可再试"（读限流响应头 reset 时间），不静默失败、不自动等待重试、不预留 token 配置（拍板 3）

## Scenario 7：护栏限额（proposal D6）

- **Given** 超大仓库（树深 >8 / SKILL.md >512KB / 附属合计 >2MB / 候选 >50 条）
- **When** 发现
- **Then** 超限项**截断并如实标注**（如"仅展示前 50 条候选""xx 技能超单文件上限已跳过"），不整体报错；树请求本身按 recursive 一次拉取（免逐目录遍历烧配额）

## Scenario 8：进程内缓存降配额消耗（proposal D2）

- **Given** 同一 repo+SHA 十分钟内重复发现
- **When** 第二次发起
- **Then** 命中内存缓存不再请求 GitHub 树；**缓存不落盘**（重启即失）；预览的 raw 内容同样按 repo+SHA+path 内存缓存；用户可点「重新发现」绕过缓存取最新 ref 解析

## Scenario 9：零后台行为（红线 1 的拉取侧）

- **Given** 发现成功后页面停留任意久
- **When** 无任何用户动作
- **Then** 不发生任何自动轮询/自动刷新/自动入库；候选内容不写入 vault、工具目录或任何磁盘位置（单测断言 fs 无写入调用）

## Scenario 10：数据流出边界（红线 4）

- **Given** 任一拉取动作
- **When** 请求发出
- **Then** 仅向 `api.github.com`/`raw.githubusercontent.com` 发**匿名只读**请求，目标为**用户主动指定**的公开仓库；请求不携带任何本机路径、技能内容或配置数据；无任何遥测
