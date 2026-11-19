<div align="center">

# AssetPlex

**One hub, every AI agent.**

Sync your **identity, skills, rules & MCP servers** across Claude Code, Codex, TRAE, WorkBuddy and Qoder — **100% local, no cloud**.

[中文文档（资产箱）](README.zh-CN.md) · [Docs](https://wynter-cai.github.io/assetplex/) · [Privacy](PRIVACY.md) · [Discussions](https://github.com/wynter-cai/assetplex/discussions)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![CI](https://github.com/wynter-cai/assetplex/actions/workflows/ci.yml/badge.svg)](https://github.com/wynter-cai/assetplex/actions/workflows/ci.yml)
[![Docs](https://github.com/wynter-cai/assetplex/actions/workflows/docs.yml/badge.svg)](https://github.com/wynter-cai/assetplex/actions/workflows/docs.yml)
[![npm version](https://img.shields.io/npm/v/assetplex)](https://www.npmjs.com/package/assetplex)
[![npm downloads](https://img.shields.io/npm/dm/assetplex)](https://www.npmjs.com/package/assetplex)
[![GitHub stars](https://img.shields.io/github/stars/wynter-cai/assetplex?style=social)](https://github.com/wynter-cai/assetplex/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/wynter-cai/assetplex/pulls)

</div>

---

## Why AssetPlex?

Your identity, skills, rules and MCP servers are **your assets**. AI coding tools are just consumers of them. Today, that means:

- You write a detailed profile in TRAE — Claude Code doesn't know you.
- You configure 5 MCP servers in Claude Code — Codex makes you redo it all.
- You write 10 skills — and copy-paste them into every tool by hand.
- Switching tools feels like moving house — every time.

**AssetPlex centralizes those assets once, in `~/.assetplex/`, and syncs them to every AI coding tool with a single command.**

```
         ┌──────────────────────────────┐
         │      ~/.assetplex/           │
         │                              │
         │  identity/   your profile    │
         │  skills/     skill library   │
         │  rules/      global rules    │
         │  mcp/        MCP servers     │
         │  preferences/ personal prefs │
         │                              │
         └──────────┬───────────────────┘
                    │  assetplex sync
        ┌───────────┼───────────┬──────────────┐
        ▼           ▼           ▼              ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐  ┌──────────┐
   │ TRAE CN │ │ Claude  │ │  Codex  │  │WorkBuddy │
   └─────────┘ └─────────┘ └─────────┘  └──────────┘
```

## Key Features

- **One central hub** — manage identity, skills, rules & MCP servers in `~/.assetplex/`.
- **Sync everywhere** — `assetplex sync` pushes your assets to all enabled tools.
- **Reverse import** — pull existing configs from your installed tools back into the hub.
- **Visual Web UI** — `assetplex ui` gives you a dashboard for everything.
- **Format translation** — JSON↔TOML for Codex, `${VAR}` interpolation for WorkBuddy.
- **Cross-platform symlinks** — Windows (junction fallback), macOS and Linux.
- **Plugin-style adapters** — add a new tool without touching the core.
- **Skill discovery** — pull skills from a **public GitHub repo you name**, preview, then import only on your explicit confirm. External skills are added entirely at your own discretion: AssetPlex ships no curated repo mirror and does no content review — treat third-party `SKILL.md` as untrusted input.
- **100% local & private** — nothing ever leaves your machine unless you configure and trigger an opt-in AI feature or fetch a repo yourself. [Read the privacy model](PRIVACY.md).

## Supported Tools

| Tool | Syncs | Strategy |
|---|---|---|
| **TRAE (CN)** | profile, skills, rules, MCP | symlink |
| **Claude Code** | CLAUDE.md (`@import` aggregation), skills, MCP | native-import |
| **Codex CLI** | AGENTS.md, skills, MCP (JSON→TOML) | copy |
| **WorkBuddy / CodeBuddy** | skills, rules, MCP (`${VAR}` interpolation) | symlink + copy |
| **Qoder** | project `.qoder/rules`, skills, AGENTS.md | per-project |

## Quick Start

```bash
# Install
npm install -g assetplex

# Initialize your hub (~/.assetplex/)
assetplex init

# Detect installed AI tools
assetplex doctor

# Sync the hub to all tools
assetplex sync

# Open the visual management UI
assetplex ui
```

**Requirements**: Node.js >= 18.

### Use your assets from inside any Agent (MCP)

`assetplex mcp` starts a local stdio MCP server (no port, no browser, no HUB process required). Add one entry to your host's MCP config:

**TRAE / any host using `mcpServers` JSON**

```json
{ "mcpServers": { "assetplex": { "command": "assetplex", "args": ["mcp"] } } }
```

**Claude Code**

```bash
claude mcp add assetplex -- assetplex mcp
```

**Generic stdio** — command `assetplex`, args `["mcp"]`.

Read-only tools (`assetplex_identity_get`, `assetplex_assets_list`, `assetplex_asset_get`, `assetplex_health_get`, `assetplex_asset_diagnose`) make zero model calls. Writes are two-phase: `assetplex_asset_propose` returns a draft + `pendingChangeId` (valid 10 minutes) without touching your hub; `assetplex_asset_commit` writes it with a backup and **does not distribute** unless you explicitly ask.

### Reverse-import from existing tools

```bash
assetplex ui
# → Import page: detects installed tools → scans importable content → pick → one-click merge
```

## Comparison

| Capability | agentsync | agentsmesh | sync-rules | **AssetPlex** |
|---|---|---|---|---|
| China tool stack (TRAE/WorkBuddy/Qoder) | ❌ | ❌ | ❌ | ✅ |
| Visual Web UI | ❌ | ❌ | ❌ | ✅ |
| Reverse import from tools | ❌ | ❌ | ❌ | ✅ |
| Claude `@import` native support | ❌ | ❌ | ✅ | ✅ |
| Windows symlink compatibility | ✅ | ✅ | ❌ | ✅ |
| Plugin architecture | ❌ | ✅ | ❌ | ✅ |
| MCP JSON↔TOML conversion | ❌ | ❌ | ❌ | ✅ |

## Web UI Preview

Run `assetplex ui`, then open `http://127.0.0.1:17521`:

```
┌────────────────────────────────────────────────────────────┐
│  AssetPlex                                          v0.2.0 │
├──────────────┬─────────────────────────────────────────────┤
│ Overview     │  Health 89          Pending governance 18   │
│              │  ┌─ Today ─────────────────────────────────┐ │
│ Vault        │  │ 3 assets drift from their tool copies   │ │
│  Identity    │  │ 2 skills have no description            │ │
│  Skills      │  └─────────────────────────────────────────┘ │
│  Rules       │  ┌─ Tools & sync ──────────────────────────┐ │
│  MCP         │  │ TRAE CN synced · Claude Code synced ·   │ │
│  Agents      │  │ Codex not installed                     │ │
│  Memory      │  └─────────────────────────────────────────┘ │
│  Discover    │  ┌─ Recent changes ────────────────────────┐ │
│              │  │ skill:night-shift synced to 2 tools     │ │
│ Quality      │  └─────────────────────────────────────────┘ │
│ Connections  │                                             │
│ Activity     │                                             │
│ Settings     │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

- **Overview** — health score, today's queue, per-tool sync matrix and recent changes.
- **Vault** — six asset categories (identity, skills, rules, MCP, agents, memory). Open any asset and you get the full pipeline inline: read summary → diagnose → evidence → fix draft → apply → automatic re-check → distribute → undo.
- **Quality Center** — cross-category checkup, batch operations, 71 built-in rules (45 static + 26 AI-assisted, your own endpoint), ignore list, duplicate cleanup and arbitration criteria.
- **Connections & Sync** — detect installed tools, choose what each one receives, manage project workspaces.
- **Activity** — append-only local event log of every sync, import and write.
- **Discover** — pull skills from a GitHub repo you name; nothing is added until you confirm.

## Hub Layout

```
~/.assetplex/
├── identity/                  # your profile
├── skills/                    # cross-tool skill library
│   └── <skill-name>/SKILL.md
├── rules/                     # global / by-glob / by-project rules
├── mcp/mcp.sources.json       # MCP server configs
├── agents/                    # sub-agent definitions
├── memory/                    # long-lived facts, decisions, preferences
├── criteria/                  # arbitration & diagnosis criteria
├── governance/activity/       # append-only local event log
├── hub.toml                   # main hub config
└── .backups/                  # automatic backups
```

Files in a legacy `preferences/` directory are still read and shown under **Memory**; new writes always go to `memory/`.

## Roadmap

**Shipped** ✅
- Unified vault for identity, skills, rules, MCP, agents and memory
- Single-asset pipeline: diagnose → evidence → fix draft → apply → auto re-check → distribute → undo
- Quality Center: cross-category checkup, batch fixes, 71 built-in rules, ignore list, duplicate cleanup
- 4-step import wizard with conflict resolution (Markdown / JSON / TOML)
- Skill discovery from a GitHub repo you name
- Activity log and a local MCP endpoint for agents

**Planned** 📋
- Auto-learned profile from your coding behavior (`profile.auto.md`)
- Skill marketplace aggregation (claudeskills.info, agentskills.io)
- `--watch` mode for live re-sync

## Contributing

Contributions are welcome! See [open issues](https://github.com/wynter-cai/assetplex/issues) and [good first issues](https://github.com/wynter-cai/assetplex/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), or join the [Discussions](https://github.com/wynter-cai/assetplex/discussions).

## Development

```bash
git clone https://github.com/wynter-cai/assetplex.git
cd assetplex

npm install          # install backend dependencies
npm run dev          # watch mode (tsup)
npm run typecheck    # TypeScript check
npm test             # backend tests (Vitest)
npm run build        # build dist/

# Frontend (web/)
cd web
npm install
npm test             # frontend tests
npm run build        # tsc -b && vite build
```

### Project structure

```
assetplex/
├── src/
│   ├── cli/              # CLI commands (init/doctor/sync/ui)
│   ├── core/             # core engine
│   │   ├── adapters/     # tool adapters (base interface)
│   │   ├── sync-engine.ts
│   │   ├── config.ts
│   │   └── types.ts
│   ├── server/           # HTTP server for the Web UI
│   ├── transforms/       # format transforms (symlink/json-toml/env)
│   └── utils/            # fs/paths/logger
├── web/                  # React frontend (Vite + shadcn/ui)
├── tests/                # backend tests
└── 设计文档/              # design docs
```

### Tech stack

| Layer | Tech |
|---|---|
| Language | TypeScript 5.6 |
| Runtime | Node.js 18+ |
| CLI | Commander.js |
| HTTP | Hono |
| Frontend | React 18 + Vite + shadcn/ui + Tailwind |
| Data fetching | TanStack Query |
| Build | tsup |
| Tests | Vitest |

## Design Docs

- [Overall architecture](设计文档/assetplex-design-plan.md)
- [Sync engine MVP](设计文档/assetplex-stage2-sync-mvp.md)
- [Web UI plan](设计文档/assetplex-web-ui-plan.md)
- [Import wizard PRD](设计文档/assetplex-prd-v2-import-wizard.md)

## License

MIT © [Wynter-Cai](https://github.com/wynter-cai)

---

<div align="center">

If AssetPlex helps you, please give it a ⭐ Star!

</div>
