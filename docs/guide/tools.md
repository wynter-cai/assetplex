# Supported Tools

| Tool | Syncs | Strategy |
|---|---|---|
| **TRAE (CN)** | profile, skills, rules, MCP | symlink |
| **Claude Code** | CLAUDE.md (`@import` aggregation), skills, MCP | native-import |
| **Codex CLI** | AGENTS.md, skills, MCP (JSON→TOML) | copy |
| **WorkBuddy / CodeBuddy** | skills, rules, MCP (`${VAR}` interpolation) | symlink + copy |
| **Qoder** | project `.qoder/rules`, skills, AGENTS.md | per-project |

## Adapter architecture

AssetPlex uses a plugin-style adapter architecture. Adding a new tool requires no changes to the core engine:

```typescript
interface ToolAdapter {
  name: string;                    // adapter name
  displayName: string;             // display name
  detect(): Promise<ToolStatus>;   // detect if the tool is installed
  resolveHubItems(config, root): Array<{ item, target }>;  // hub ↔ tool mapping
  apply(item, target): Promise<void>;   // hub → tool
  import(targetPath): Promise<HubItem>; // tool → hub
  scan(): Promise<DiscoveredItem[]>;    // scan tool content
  transform(content, format): Buffer;   // format conversion
}
```

Each tool lives in its own adapter file under `src/core/adapters/`, implementing the shared base interface.
