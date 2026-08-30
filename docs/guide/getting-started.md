# Getting Started

AssetPlex is an open-source CLI that centralizes your **identity, skills, rules and MCP servers** in `~/.assetplex/` and syncs them to all your AI coding tools.

## Requirements

- Node.js >= 18

## Install

```bash
npm install -g assetplex
```

Or try it directly without installing:

```bash
npx assetplex init
```

## Initialize your hub

```bash
assetplex init
```

This creates the hub directory `~/.assetplex/` with template files for your identity, skills, rules, preferences and MCP configs.

## Detect your tools

```bash
assetplex doctor
```

Detects which AI tools are installed on your machine and checks hub integrity.

## Sync to all tools

```bash
assetplex sync
```

Pushes your hub content to every enabled tool. Preview changes first with:

```bash
assetplex sync --dry-run
```

## Open the visual UI

```bash
assetplex ui
```

Open `http://127.0.0.1:17521` in your browser. Use the **Import** page to pull existing configs from your installed tools back into the hub, then manage everything from the dashboard.

## Next steps

- See [Supported Tools](/guide/tools) for what each tool syncs.
- Read [Data & Privacy](/data-and-privacy) to understand the 100% local privacy model.
