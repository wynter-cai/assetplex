# Privacy Policy / 隐私政策

> **Data is 100% local by default. The only exception is AI features you configure and trigger yourself — and even then, content goes only to the endpoint YOU set up.**

AssetPlex is a **local-first** tool. This document explains exactly what it reads, writes, and — more importantly — what it **never** does with your data.

> **默认数据 100% 本地。唯一例外是你自己配置、自己触发的 AI 功能——而且内容也只会发往你自己设定的端点。**
>
> AssetPlex 是一个**本地优先**的工具。本文档说明它会读写什么，更重要的是——它**绝不会**对你的数据做什么。

---

## 1. Where your data lives / 数据存放位置

All AssetPlex data is stored in a single directory on your own machine:

```
~/.assetplex/
```

This includes your identity profile, skills, rules, MCP server configurations, and preferences. There is **no cloud account, no server, no telemetry endpoint** — AssetPlex has no backend that your data could be uploaded to.

> 所有 AssetPlex 数据都存放在你自己机器上的单一目录 `~/.assetplex/` 中，包括身份画像、技能、规则、MCP 服务器配置和个人偏好。**没有云账号、没有服务器、没有任何遥测端点**——AssetPlex 没有任何可以上传你数据的后端。

## 2. What AssetPlex reads / 读取范围

When you run `assetplex doctor`, `assetplex sync` or the import wizard, AssetPlex reads:

- Your AI tools' local configuration files (e.g. `~/.claude/`, `~/.codex/`, `~/.trae-cn/`, `~/.qoder/`) — **only** to detect tools, sync your hub content, or import your existing configs.
- Nothing else. It does not scan your whole disk, browse unrelated directories, or collect usage statistics.

> 当你运行 `assetplex doctor`、`assetplex sync` 或导入向导时，AssetPlex 会读取：
> - 你各 AI 工具的本地配置文件（如 `~/.claude/`、`~/.codex/`、`~/.trae-cn/`、`~/.qoder/`）——**仅用于**检测工具、同步 Hub 内容或导入你现有的配置。
> - 除此之外不读任何东西。它不会扫描整个磁盘、浏览无关目录，也不会收集使用统计。

## 3. What AssetPlex writes / 写入范围

AssetPlex only writes to:

1. Its own hub directory `~/.assetplex/`
2. The tool config files you explicitly choose to sync or import to (as configured in `hub.toml`)

Every sync action is opt-in per tool. You can always see what a sync would change first with `assetplex sync --dry-run`.

> AssetPlex 只写入：
> 1. 它自己的 Hub 目录 `~/.assetplex/`
> 2. 你在 `hub.toml` 中显式选择要同步或导入的工具配置文件
>
> 每个工具的同步都是按需开启的。你可以随时用 `assetplex sync --dry-run` 先预览同步会改动什么。

## 4. MCP configurations may contain secrets / MCP 配置可能包含密钥

MCP server configurations can contain API keys or tokens. AssetPlex processes these files **locally only**:

- It never transmits MCP configs anywhere.
- It does not log their contents (logs only record file paths and operation results).
- You are fully in control of which MCP configs get synced to which tools.

> MCP 服务器配置可能包含 API Key 或 Token。AssetPlex **仅在本地处理**这些文件：
> - 绝不把 MCP 配置传输到任何地方。
> - 不记录其内容（日志只记录文件路径和操作结果）。
> - 你可以完全控制哪些 MCP 配置同步到哪些工具。

## 5. AI-assisted features are opt-in / AI 辅助功能需你主动启用

Three features make network requests, and only after you explicitly configure an endpoint in the app: **AI skill classification**, **conflict arbitration** (LLM suggests how to resolve a differs conflict in the import wizard), and the **Asset Doctor** (AI diagnosis of one asset plus, on request, a fix draft). The Doctor's mechanical checks run fully offline; only the AI pass sends anything.

- Content sent: only the text AssetPlex is asked about — the skill body being classified, the two sides of that one conflicting file, or the single asset being diagnosed, each plus your enabled adjudication criteria. Never unrelated assets, never paths, never your hub as a whole.
- Destination: **only** the OpenAI-compatible endpoint you configured yourself (base URL / API key / model). AssetPlex has no backend of its own and acts as no relay — there is no third party in between.
- Results (including arbitration suggestions, diagnosis reports and fix drafts, and their local cache files `skill-ai-classifications.json` / `arbitrations.json` / `doctor-reports.json` / `doctor-drafts.json`) stay in `~/.assetplex/`. Both arbitration and the Asset Doctor are **advisory only**: nothing is ever written by the model itself — applying a fix (and any distribution to your tools) happens only when you explicitly confirm it, and that write/distribute step is entirely local, over no network endpoint.
- No endpoint configured, or feature not triggered = zero network requests. Everything else remains 100% local.

**GitHub skill discovery (外部源拉取)** is a separate, fully opt-in flow with its own network behavior:

- When you paste a public repo reference and click *Discover*, AssetPlex calls the **GitHub REST API anonymously** (`api.github.com` + `raw.githubusercontent.com`) to read that repo's file tree and `SKILL.md` files. This is **read-only, writes nothing to disk** (not even a temp file), and happens only because you triggered it. No credentials, no token, no account is involved.
- The commit SHA is locked at discovery time, so a preview and the eventual import read the exact same content even if the upstream repo changes afterwards.
- Only when you explicitly confirm an import does AssetPlex write the chosen skill into your hub (`~/.assetplex/`), tagged with provenance `github`. Overwriting an existing same-named skill backs up the old version first.
- The optional **AI tagging** of discovered skills sends each candidate's `SKILL.md` body to **the same OpenAI-compatible endpoint you configured above** — same red line as AI classification (only the skill text, never your hub, never a relay). Unconfigured = the tag button is disabled and zero requests are made.
- AssetPlex ships **no curated mirror of any repo** and does no content review: external skills are added entirely at your own discretion. Treat third-party `SKILL.md` content as you would any untrusted input.

> **技能发现（外部源拉取）** 是一条独立的、完全按需开启的网络流程，网络行为与上面三个 AI 功能不同：
> - 当你粘贴一个公开仓库引用并点击「发现」时，AssetPlex 会**匿名**调用 **GitHub REST API**（`api.github.com` + `raw.githubusercontent.com`）读取该仓库的文件树与 `SKILL.md`。这一步**只读、不落任何磁盘**（连临时文件都不写），且只因你主动触发才发生；不涉及任何凭据、Token 或账号。
> - 发现时会锁定 commit SHA，因此即使上游仓库随后变动，预览与最终入库读到的仍是同一份内容。
> - 只有当你**显式确认入库**时，AssetPlex 才把所选技能写入你的 Hub（`~/.assetplex/`），并打上出处标记 `github`；覆盖同名已有技能会先备份旧版。
> - 可选的**智能打标**会把每个候选技能的 `SKILL.md` 正文发往**你上面配置的那一个 OpenAI 兼容端点**——与技能分类同一条红线（只发技能正文，绝不发整个 Hub、不做中转）；未配置则按钮置灰、零请求。
> - AssetPlex **不内置任何仓库的镜像清单**、不承担内容审查：外部技能完全由你自行添加。请像对待任何不受信任输入一样对待第三方 `SKILL.md` 内容。
> 有三个功能会发起网络请求，且都必须你先在应用内显式配置端点才可用：**技能智能分类**、**冲突仲裁**（导入向导中由大模型对 differs 冲突给出建议）、以及**资产医生**（对单个资产做 AI 诊断，并在你请求时生成修复草案）。医生的机械检查完全离线，只有 AI 那一趟会发请求。
> - 发送内容：仅限被询问的文本——待分类的技能正文、该单个冲突文件的两侧内容、或被诊断的那一个资产本体，各自再加上你启用的裁决准则。绝不包含无关资产、路径或整个 Hub。
> - 去向：**只发往你自己配置的** OpenAI 兼容端点。AssetPlex 自身没有任何后端、不做任何中转——中间不存在第三方。
> - 结果（含仲裁建议、诊断报告与修复草案及其本地缓存文件）保存在 `~/.assetplex/`。仲裁与资产医生均仅为建议（advisory-only）：模型本身永不写盘，应用修复（以及向工具的任何分发）只在你显式确认时才发生，且这一步落盘/分发完全在本地进行、不经任何网络端点。
> - 未配置端点或未触发功能 = 零网络请求，其余一切依旧 100% 本地。

## 6. What AssetPlex never does / 绝不做什么

- ❌ No analytics, no telemetry, no usage tracking.
- ❌ No account or login required.
- ❌ No cloud sync or backup of your data (backups, if enabled are local in `~/.assetplex/.backups/`).
- ❌ No sharing of your data with any third party.
- ❌ No silent AI calls — every outbound request comes from a feature you configured and triggered (§5).

> - ❌ 无分析、无遥测、无使用追踪。
> - ❌ 无需账号或登录。
> - ❌ 不进行任何云端同步或备份（如开启备份，也保存在本地 `~/.assetplex/.backups/`）。
> - ❌ 不向任何第三方共享你的数据。
> - ❌ 不会静默调用 AI——所有出站请求都来自你配置并主动触发的功能（见第 5 节）。

## 7. Permission boundaries / 权限边界

| Scope | Allowed | Notes |
|---|---|---|
| Read/write `~/.assetplex/` | ✅ | the hub itself |
| Read tool config dirs | ✅ | only for detect/sync/import |
| Write tool config dirs | ✅ | only tools you enabled in `hub.toml` |
| Network access | ⚠️ opt-in | two opt-in kinds only: (a) AI features send to the endpoint *you* configured, when you trigger classification/arbitration/doctor/tagging (§5); (b) GitHub skill discovery reads a public repo via GitHub's anonymous API, only when you click *Discover* and writes nothing to disk. Zero requests otherwise |
| Telemetry / analytics | ❌ | none |

> | 范围 | 允许 | 说明 |
> |---|---|---|
> | 读写 `~/.assetplex/` | ✅ | Hub 本体 |
> | 读取工具配置目录 | ✅ | 仅用于检测/同步/导入 |
> | 写入工具配置目录 | ✅ | 仅限你在 `hub.toml` 中启用的工具 |
> | 网络访问 | ⚠️ 按需 | 仅两类按需行为：(a) AI 功能在你触发分类/仲裁/资产医生/打标时发往**你自己配置的**端点（见第 5 节）；(b) 技能发现仅在你点击「发现」时匿名读取一个公开仓库的 GitHub API，且零磁盘写入。其余情况零请求 |
> | 遥测 / 分析 | ❌ | 无 |

## 8. Questions / 问题

If you have any privacy or security concerns, please open an issue or start a discussion on [GitHub Discussions](https://github.com/wynter-cai/assetplex/discussions).

> 如果你有任何隐私或安全问题，欢迎在 [GitHub Discussions](https://github.com/wynter-cai/assetplex/discussions) 提出。
