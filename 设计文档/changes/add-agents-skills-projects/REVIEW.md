# REVIEW: add-agents-skills-projects（三 Pass 自审）

> 审查范围：Phase 1 智能体只读盘点、Phase 2 技能双维分类、Phase 3 AI-Coding 项目模块的全部新增/修改代码。
> 方法：静态逐文件审查 + 真实数据冒烟 + 浏览器验收。
> 结论：三 pass 发现的问题均已修复或确认为可接受残留（见末尾「残留项」）。

---

## Pass 1 — Bugs（正确性）

| # | 问题 | 严重度 | 证据 / 复现 | 处置 |
|---|------|--------|-------------|------|
| B1 | **纯中文/非 ASCII 项目名生成空 ID**：`makeId()` 用 `/[^a-z0-9]+/g` 折叠，路径 `sample-docs`（worktree 历史条目）ID 变为 `''`，导致前端无法渲染可用 key、`POST /api/projects//open` 无法匹配白名单（实测返回 404），且多个非 ASCII 名会互相撞 ID | 高 | 真实数据冒烟：17 个项目中历史条目「sample-docs」id 为空 | 已修：改为 `/[^\p{L}\p{N}]+/gu`，保留 Unicode 字母数字；先补 TDD 用例（RED）再修复（GREEN）。复测三个已删除项目（含中文）均正确返回 400 |
| B2 | 技能全文关键词匹配过度分类（writing 一度 222 个） | 中（Phase 2 内已修） | 真实数据 374 技能分布异常 | 已修：ASCII 词边界正则 + 中文包含匹配；正文仅在 description 为空时截取前 400 字符参与，修复后 writing=49，分布合理 |
| B3 | 内存 mock fs 的 `listDir` 不暴露中间父目录，2 层路径（`<storage>/<hash>/workspace.json`）扫描失败 | 中（测试夹具） | Phase 3 初期 6 个用例失败 | 已修：测试夹具补 `parentDirs`；routes 测试同模式处理 |
| B4 | IDE 打开分支注释声称「缺失 code 时回退资源管理器」，实际无回退 | 低 | 审 `node-project-opener.ts` | 已修：更正注释为实际行为（本机无 TRAE CLI，统一走 VS Code CLI；本机 PATH 含 `code.cmd`） |

未发现：排序/去重逻辑错误（mtime 取最新、worktree 同名去重忽略大小写均有测试覆盖）；`existingOnly` 语义为「items 过滤、total/existingCount 保持全量口径」，前后端一致。

---

## Pass 2 — Security（安全）

安全关键面是 **Phase 3 的本机打开接口**（服务端会 spawn 本机进程）。

| # | 检查点 | 结论 |
|---|--------|------|
| S1 | **路径白名单**：`POST /:id/open` 每次请求**重新扫描**，经 `validateOpenRequest()` 校验 id ∈ 本次清单、target ∈ 三枚举、目录仍 exists，opener 拿到的路径只能来自扫描记录，用户无法在 body/path 中注入任意路径 | ✅ 核心逻辑 TDD 覆盖；实测非法 target→400、未知 id→404、已删除项目（含中文 id）→400 |
| S2 | **命令注入**：explorer/terminal/ide 全部用 `spawn` 参数数组（无 `shell:true`）；terminal 走 PowerShell 时路径用单引号包裹且 `'` 翻倍转义（`psQuote`），并以 `-LiteralPath` 传入；不经过 shell 字符串拼接 | ✅ 白名单路径来自用户本机 workspace.json，纵深防御到位 |
| S3 | **技能覆盖存储**：PUT 的 id 必须在重扫清单中命中，否则 404，不能借 id 写任意 key/路径；值经枚举白名单过滤；加载时再 sanitize 防脏数据；只写 `~/.assetplex/skill-overrides.json`，绝不回写 SKILL.md | ✅ 单测 + 真实持久化验证；验证后已删除测试产生的 overrides 文件 |
| S4 | **智能体原始内容读取**：`getAgentRawContent()` 先按 id 在扫描结果中查找，读取的是**记录里的绝对路径**，不用请求参数拼路径，无路径穿越 | ✅ |
| S5 | 信息泄露：错误信息会带本机路径 | 可接受：服务仅绑定 127.0.0.1，且现有所有接口均无鉴权（既有设计） |
| S6 | DNS/CSRF 面：本机其他网页可向 127.0.0.1:17521 发 POST 触发打开操作 | 残留（见 R2）：影响上限仅为以 explorer/终端/IDE 打开**用户自己已扫描的项目目录**，无任意路径/命令能力；与既有本地服务风险面一致，后续可加 origin/令牌校验 |

未发现：`child_process` 执行用户可控字符串、任意文件写入、依赖混淆等问题。

---

## Pass 3 — Compliance（项目规约）

| 规约 | 结论 |
|------|------|
| SDD：spec/tasks 先行，Given-When-Then | ✅ proposal/api-contract/specs/tasks 均在 `设计文档/changes/add-agents-skills-projects/`，本 REVIEW 为 tasks G.1 产物 |
| 后端 TDD（RED→GREEN→REFACTOR） | ✅ 全部 core/route 功能先写失败测试；B1 修复同样先红后绿 |
| 测试结果 | ✅ 后端 19 个文件 **228** 用例全过；前端 5 个文件 **24** 用例全过 |
| 类型安全：禁 `any` / `@ts-ignore` / 显式返回类型 / null 显式处理 | ✅ 新增源码 grep 无 `any`/`@ts-ignore`；请求体一律 `unknown` + 形态收窄；`tsc -b` 双端零错误 |
| 架构单向依赖（cli/server → core） | ✅ core 三个 inventory 模块零框架/零 node 依赖；fs/git/opener 全部接口注入，node 实现位于 server/lib |
| 构建 | ✅ 后端 tsup build 成功；前端 vite build 成功（413.97 kB） |
| 资产类别动态扩展 | ✅ 智能体走 asset-categories 配置（external 标记），未写死类别数 |
| 函数 ≤50 行 / 文件 ≤300 行 | ⚠️ 残留 R1：`projects.ts`、`skills-inventory.ts`、`agent-inventory.ts` 三个 core 模块略超 300 行（300~450），均为内聚的单一领域模块；函数均未超 50 行。未拆分以免打断已验证逻辑，建议下次改动时按「解析/富化/聚合」拆段 |
| 真实数据手动验收 | ✅ Phase1：7 个 TRAE persona；Phase2：374 去重技能、覆盖持久化与 400/404；Phase3：17 项目（14 存在/3 移除）、git/标记/统计正确、浏览器 5 项验收全过 |

---

## 残留项（不阻塞交付）

- **R1（规约）**：三个 core 文件略超 300 行软上限，后续触碰时拆分。
- **R2（安全加固）**：本地服务无鉴权属既有设计；若未来 open 接口扩展能力，建议加 Origin 校验或一次性令牌。
- **R3（体验）**：IDE 打开依赖 PATH 上的 `code`（本机已具备）；TRAE 无命令行启动器，暂无法直接「用 TRAE 打开」，待官方提供 CLI 后在 opener 增加首选分支。
- **R4（性能）**：每次请求实时扫描 + git 子进程（非 git 项目 3s 超时上限），当前 17 项目实测秒级返回；项目量级到数百时建议加短 TTL 缓存与并发上限。
