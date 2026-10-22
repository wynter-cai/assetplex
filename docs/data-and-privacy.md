# Data & Privacy

**Data is 100% local by default. The only exception is AI features you configure and trigger yourself — and even then, content goes only to the endpoint you set up.**

AssetPlex is a **local-first** tool with no cloud account, no server, and no telemetry endpoint. The full policy lives in the repository at [PRIVACY.md](https://github.com/wynter-cai/assetplex/blob/main/PRIVACY.md).

## Where your data lives

All AssetPlex data is stored in a single directory on your own machine:

```
~/.assetplex/
```

This includes your identity profile, skills, rules, MCP server configurations and preferences.

## What AssetPlex reads

When you run `assetplex doctor`, `assetplex sync` or the import wizard, AssetPlex reads your AI tools' **local** configuration files (e.g. `~/.claude/`, `~/.codex/`, `~/.trae-cn/`) — only to detect tools, sync your hub content, or import existing configs. It never scans your whole disk or collects usage statistics.

## What AssetPlex writes

AssetPlex only writes to:

1. Its own hub directory `~/.assetplex/`
2. The tool config files you explicitly choose to sync or import (as configured in `hub.toml`)

Every sync action is opt-in per tool. Use `assetplex sync --dry-run` to preview changes first.

## MCP configurations may contain secrets

MCP server configs can contain API keys or tokens. AssetPlex processes these **locally only** — it never transmits them, never logs their contents (logs record only file paths and operation results), and you fully control which configs sync to which tools.

## AI-assisted features are opt-in

Three features make network requests, and only after you explicitly configure an endpoint in the app: **AI skill classification**, **conflict arbitration** (the LLM suggests how to resolve a conflicting file during import), and the **Asset Doctor** (AI diagnosis of one asset plus, on request, a fix draft). Each sends only the text being asked about (one skill body, one file's two versions, or the single asset being diagnosed — each plus your enabled adjudication criteria) and only to the OpenAI-compatible endpoint **you** configured — AssetPlex has no backend and relays nothing. The Doctor's mechanical checks run fully offline; only its AI pass sends anything. Results and caches stay in `~/.assetplex/`. Arbitration and the Asset Doctor are advisory only: nothing is written by the model itself, and applying a fix (plus any distribution to your tools) happens only when you explicitly confirm it — and that write/distribute step is entirely local, over no network endpoint. Without a configured endpoint or a manual trigger, there are zero network requests.

## GitHub skill discovery is opt-in and read-only

The *Skill Discovery* page can pull skills from a **public** GitHub repo you name. When you click *Discover*, AssetPlex calls the GitHub REST API **anonymously** (`api.github.com` + `raw.githubusercontent.com`) to read that repo's file tree and `SKILL.md` files — **read-only, nothing is written to disk** (no temp files, no credentials, no token). The commit SHA is locked at discovery so preview and import read the exact same content even if upstream later changes. Only an explicit *Confirm import* writes the chosen skill into `~/.assetplex/` (provenance `github`; overwriting a same-named skill backs up the old version first). Optional AI tagging of discovered skills sends each candidate's skill body to the same endpoint you configured above — same red line as classification, disabled with zero requests if unconfigured. AssetPlex ships **no curated mirror of any repo** and does no content review: external skills are added entirely at your own discretion, so treat third-party `SKILL.md` content as untrusted input.

## What AssetPlex never does

- No analytics, telemetry or usage tracking
- No account or login required
- No cloud sync or backup of your data (backups, if enabled, are local in `~/.assetplex/.backups/`)
- No sharing of your data with any third party
