# FAQ

## Is my data uploaded to the cloud?

No. AssetPlex is 100% local. All data stays in `~/.assetplex/` on your machine, and the tool makes **no network requests at runtime**. See [Data & Privacy](/data-and-privacy).

## Which AI tools are supported?

Currently TRAE (CN), Claude Code, Codex CLI, WorkBuddy/CodeBuddy and Qoder. See [Supported Tools](/guide/tools). New tools can be added via the plugin-style adapter architecture.

## What does "one hub, every AI agent" mean?

Your identity, skills, rules and MCP servers are your assets. Instead of copy-pasting them into every AI tool, you maintain them once in `~/.assetplex/` and sync to all tools with a single command.

## How do I pull my existing configs into the hub?

Run `assetplex ui`, open the **Import** page, and the wizard will detect your installed tools, scan importable content, resolve conflicts, and merge it all into the hub.

## Does it work on Windows?

Yes. AssetPlex has full Windows support including junction-based symlinks, and the test suite explicitly covers Windows symlink compatibility.

## How do I contribute?

Contributions are welcome! Check [open issues](https://github.com/wynter-cai/assetplex/issues) and good-first-issues, or join the [Discussions](https://github.com/wynter-cai/assetplex/discussions).
