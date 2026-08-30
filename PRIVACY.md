# Privacy Policy / 隐私政策

> **Data is 100% local. Nothing ever leaves your machine.**

AssetPlex is a **local-first** tool. This document explains exactly what it reads, writes, and — more importantly — what it **never** does with your data.

> **数据 100% 本地。任何数据都不会离开你的电脑。**
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

## 5. What AssetPlex never does / 绝不做什么

- ❌ No analytics, no telemetry, no usage tracking.
- ❌ No account or login required.
- ❌ No cloud sync or backup of your data (backups, if enabled, are local in `~/.assetplex/.backups/`).
- ❌ No sharing of your data with any third party.

> - ❌ 无分析、无遥测、无使用追踪。
> - ❌ 无需账号或登录。
> - ❌ 不进行任何云端同步或备份（如开启备份，也保存在本地 `~/.assetplex/.backups/`）。
> - ❌ 不向任何第三方共享你的数据。

## 6. Permission boundaries / 权限边界

| Scope | Allowed | Notes |
|---|---|---|
| Read/write `~/.assetplex/` | ✅ | the hub itself |
| Read tool config dirs | ✅ | only for detect/sync/import |
| Write tool config dirs | ✅ | only tools you enabled in `hub.toml` |
| Network access | ❌ | none at runtime |
| Telemetry / analytics | ❌ | none |

> | 范围 | 允许 | 说明 |
> |---|---|---|
> | 读写 `~/.assetplex/` | ✅ | Hub 本体 |
> | 读取工具配置目录 | ✅ | 仅用于检测/同步/导入 |
> | 写入工具配置目录 | ✅ | 仅限你在 `hub.toml` 中启用的工具 |
> | 网络访问 | ❌ | 运行期无任何网络请求 |
> | 遥测 / 分析 | ❌ | 无 |

## 7. Questions / 问题

If you have any privacy or security concerns, please open an issue or start a discussion on [GitHub Discussions](https://github.com/wynter-cai/assetplex/discussions).

> 如果你有任何隐私或安全问题，欢迎在 [GitHub Discussions](https://github.com/wynter-cai/assetplex/discussions) 提出。
