<div align="center">

# AssetPlex

**One hub, every AI agent.**

Sync your **identity, skills, rules & MCP servers** across Claude Code, Codex, TRAE, WorkBuddy and Qoder — **100% local, no cloud**.

[中文文档](README.zh-CN.md) · [Docs](https://wynter-cai.github.io/assetplex/) · [Privacy](PRIVACY.md) · [Discussions](https://github.com/wynter-cai/assetplex/discussions)

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
- **100% local & private** — nothing ever leaves your machine. [Read the privacy model](PRIVACY.md).

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
┌──────────────────────────────────────────────────────────┐
│  🏠 AssetPlex                                    v0.1.0   │
├──────────┬───────────────────────────────────────────────┤
│  📊 Overview │  ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  🔧 Tools    │  │Installed│ │Hub files│ │Last sync│    │
│  🔄 Sync     │  └─────────┘ └─────────┘ └─────────┘    │
│  📥 Import   │                                          │
│  👤 Identity │  ┌─ Tool status ─────────────────────┐  │
│  📦 Skills   │  │ TRAE CN  ✅ installed  ~/.trae-cn/ │  │
│  📋 Rules    │  │ Claude Code  ❌ not installed     │  │
│  🔌 MCP      │  └───────────────────────────────────┘  │
│  ⚙️ Settings │                                          │
└──────────┴──────────────────────────────────────────────┘
```

## Hub Layout

```
~/.assetplex/
├── identity/                  # your profile
│   ├── profile.md
│   ├── communication-style.md
│   ├── tech-stack.md
│   └── env.md
├── skills/                    # cross-tool skill library
│   └── <skill-name>/SKILL.md
├── rules/                     # rules
│   ├── always/global.md
│   ├── by-glob/*.md
│   └── by-project/*.md
├── preferences/               # personal preferences
├── mcp/mcp.sources.json       # MCP server configs
├── commands/                  # custom slash commands
├── agents/                    # sub-agent definitions
├── hub.toml                   # main hub config
└── .backups/                  # automatic backups
```

## Roadmap

**In development** 🚧
- Smart import wizard (4-step: detect → scan → resolve conflicts → import)
- Smart merge (Markdown / JSON / TOML conflict resolution)

**Planned** 📋
- Auto-learned profile from your coding behavior (`profile.auto.md`)
- Skill marketplace (aggregating claudeskills.info, agentskills.io)
- Drift detection & auto-repair
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
