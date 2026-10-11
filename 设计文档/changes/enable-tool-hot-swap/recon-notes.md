# 技术预研:工具热切换可行性(2026-10-11)

> 目的:验证"积分用光 → 换工具 → 低成本接着干"这一诉求,在当前 AssetPlex 代码与真实工具目录下的可行性与缺口。
> 结论先行:**地基已具备 70%,缺的是"资产覆盖面"和"一键切换工作流",不是重写。**

---

## 一、重要修正(推翻新 Agent 首日的一些假设)

1. **CodeBuddy 适配器不是"缺失",而是早已存在**——它被合并在 [`workbuddy.ts`](../../../src/core/adapters/workbuddy.ts) 里,`displayName = 'WorkBuddy / CodeBuddy'`,`detect()`/`getConfigDir()` 同时探测 `~/.workbuddy` 与 `~/.codebuddy`,优先 workbuddy。因此"新增 codebuddy 适配器"这一项**取消**,改为"扩写现有 workbuddy/codebuddy 适配器的资产覆盖面"。
2. 大量"资产写管理"地基已在历史 change 铺过:`add-skill-agent-write-management`、`add-project-skills-discovery`、`add-agents-skills-projects`(agents 只读盘点)。本变更**复用**这些能力,不重复立项。

---

## 二、当前分发引擎能力面(已具备)

[`sync-engine.ts`](../../../src/core/sync-engine.ts) 的 `SyncEngine` 已提供:

| 方法 | 能力 | 对热切换的意义 |
|---|---|---|
| `plan({tools:[x]})` | 按工具**干跑**出同步计划,含冲突检测(`exists`/`differs`/`none`)、symlink 现状判定 | ✅ "切到工具 X 会写哪些文件、会不会覆盖"的预览底座已存在 |
| `run({tools:[x]})` | 按工具**实际落盘**(symlink/copy/native-import/per-project 策略派发) | ✅ 单工具定向分发已可行 |
| `reverseImport` | 从工具目录反向读回 Hub | ✅ 迁移前"先把现有资产收进来"可用 |
| `scanAll` / `executeImport` | 全量盘点 + 导入向导 | ✅ 导入侧可用 |

REST 面(`src/server/routes/`):`/sync/plan`、`/sync/run`、`/sync/reverse-import`、`/sync/history`、`/sync/diff`、`/tools/:name/toggle`、`/tools/:name/detect`。

**即:最难的"按工具格式适配 + 干跑计划 + 冲突检测 + 定向落盘"已经跑通。**

---

## 三、真实目录盘点(本机实测)

### 3.1 `~/.workbuddy`(资产最全,用户主战场)

| 资产 | 路径 | 现适配器是否覆盖 |
|---|---|---|
| 身份 | `IDENTITY.md`(根)、`<user>-personal/IDENTITY.md`、`SOUL.md`、`USER.md` | ❌ **未覆盖** |
| 规则 | `rules/` | ✅ 覆盖 |
| 技能 | `skills/`(demo-assistant、deep-research…) | ✅ 覆盖 |
| 记忆 | `memory/` | ❌ **未覆盖** |
| MCP | `.mcp.json` / `mcp.json` | ✅ 覆盖 |
| 子代理/experts | `expert-history.json` 等 | ❌ **只读盘点,未入分发** |
| 运行时噪声 | logs/traces/sessions/shell-snapshots/blobs/cache | 正确忽略(不在 supportedTargets) |

### 3.2 `~/.codebuddy`(本机偏空)

- `mcp.json` = `{"mcpServers":{}}`(空);`settings.json`(插件开关);`expert-history.json`(空 sessions)。
- `skills-marketplace/skills/*` 是**第三方技能市场缓存(数百个)**,非用户自有资产——适配器**正确地不扫它**(扫的是 `skills/`,不存在)。
- 无 `rules/`、`memory/`:说明用户当前主要在 WorkBuddy 侧沉淀。CodeBuddy 与 WorkBuddy 同生态(均腾讯),目录约定一致,故适配器合并合理。
- `~/.codebuddycn` 是 CodeBuddy **IDE(VS Code fork)**,只有 `extensions/`、`argv.json`,非资产目录,不在管理范围。

---

## 四、缺口清单(热切换要补的)

| # | 缺口 | 严重度 | 说明 |
|---|---|---|---|
| G1 | 切换包**不带 identity / memory / agent** | 🔴 高 | `resolveHubItems` 对 workbuddy 只映射 rules/skills/mcp。换工具后新工具没有你的身份、记忆、子代理,"接着干"体验断裂 |
| G2 | **项目级规则**完全不分发 | 🔴 高 | 痛点核心:换工具能否接着干**这个项目**。`.trae/rules`、`.claude/CLAUDE.md`、`AGENTS.md`、`.qoder/rules` 目前只读视图,未入库未分发 |
| G3 | 没有"**一键切换**"顶层工作流 | 🟠 中高 | 现状是按 hub.toml 已启用工具做**逐类 sync**;缺"选目标工具 → 打包我全部资产 → 一次投放 → 验证生效"的编排 |
| G4 | **落盘后不验证** | 🟠 中 | `run` 写完不回读确认文件到位且格式合法;换工具最怕"以为同步了其实没生效" |
| G5 | **无回滚** | 🟡 中 | 装错工具/覆盖错了无法撤回 |
| G6 | CodeBuddy 目录约定细节 | 🟡 低 | CodeBuddy 用无点 `mcp.json`,workbuddy 主用 `.mcp.json`;若用户资产实际落在 codebuddy 侧需确认写入路径(当前优先 workbuddy,风险低) |

---

## 五、可行性判断

- **不需要新框架**:G1/G2 是"把 asset 类别补进现有 adapter 的 resolveHubItems + 项目级 per-project 策略(base 已有 `applyPerProject` 钩子)";G3/G4/G5 是"在 sync 引擎之上加一层编排 + 回读校验 + 备份回滚",都是**加法**。
- **零数据上传红线不破**:所有动作都是本机文件读写,身份/记忆只在 Hub 与各工具目录间搬运,AI 相关仍走用户自配 LLM 端点。
- **规模**:属 S 级(新顶层工作流 + 跨多资产类别)。建议拆两个 change:
  - `enable-tool-hot-swap`(S):一键切换工作流 + 验证 + 回滚 + 把 identity/memory/agent 纳入切换包(编排层为主)
  - `sync-project-level-rules`(M):项目级规则入库与分发(G2 独立推进,可先行)
- **建议起步**:先做 `sync-project-level-rules` 的最小闭环或 `enable-tool-hot-swap` 的"切换 + 验证"骨架,小步见效。
