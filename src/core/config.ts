/**
 * hub.toml 配置 schema 与解析器
 *
 * 借鉴 Codex config.toml 的设计：用 TOML 作为主配置格式
 * 借鉴 zod 进行 schema 校验
 */

import { z } from 'zod';
import * as TOML from '@iarna/toml';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { expandHome } from '../utils/paths.js';

/** 同步策略枚举 */
export const SyncStrategySchema = z.enum([
  'native-import',
  'symlink',
  'copy',
  'hybrid',
  'per-project',
]);

/** MCP 格式枚举 */
export const McpFormatSchema = z.enum(['json', 'toml']);

/** Hub 主配置 schema */
export const HubConfigSchema = z.object({
  hub: z
    .object({
      version: z.string().default('1.0'),
      defaultSyncStrategy: SyncStrategySchema.default('hybrid'),
      backupDir: z.string().default('~/.assetplex/.backups'),
      autoWatch: z.boolean().default(false),
      backupKeepCount: z.number().int().positive().default(10),
    })
    .default({}),
  identity: z
    .object({
      profileAutoLearn: z.boolean().default(true),
      learnSources: z.array(z.string()).default(['trae-cn', 'claude-code']),
      learnIntervalHours: z.number().int().positive().default(24),
      learnMaxFacts: z.number().int().positive().default(100),
    })
    .default({}),
  tools: z
    .object({
      'trae-cn': z
        .object({
          enabled: z.boolean().default(true),
          configDir: z.string().default('~/.trae-cn'),
          syncStrategy: SyncStrategySchema.default('symlink'),
          mcpFormat: McpFormatSchema.default('json'),
          targets: z.array(z.string()).default([]),
        })
        .default({}),
      'claude-code': z
        .object({
          enabled: z.boolean().default(true),
          configDir: z.string().default('~/.claude'),
          syncStrategy: SyncStrategySchema.default('native-import'),
          importMaxDepth: z.number().int().positive().max(5).default(4),
          claudeMdAggregator: z.boolean().default(true),
        })
        .default({}),
      codex: z
        .object({
          enabled: z.boolean().default(true),
          configDir: z.string().default('~/.codex'),
          syncStrategy: SyncStrategySchema.default('copy'),
          mcpFormat: McpFormatSchema.default('toml'),
          stripFrontmatterKeys: z.array(z.string()).default([]),
        })
        .default({}),
      workbuddy: z
        .object({
          enabled: z.boolean().default(true),
          configDir: z.string().default('~/.workbuddy'),
          syncStrategy: SyncStrategySchema.default('symlink'),
          envInterpolation: z.boolean().default(true),
          mcpFilename: z.string().default('.mcp.json'),
        })
        .default({}),
      qoder: z
        .object({
          enabled: z.boolean().default(false),
          syncStrategy: SyncStrategySchema.default('per-project'),
          projectTargets: z.array(z.string()).default([]),
        })
        .default({}),
    })
    .default({}),
  marketplace: z
    .object({
      enabled: z.boolean().default(true),
      sources: z.array(z.string()).default([
        'https://claudeskills.info/api',
        'https://agentskills.io/api',
        'https://agskills.dev/api',
      ]),
      cacheDir: z.string().default('~/.assetplex/.marketplace-cache'),
      cacheTtlHours: z.number().int().positive().default(24),
    })
    .default({}),
});

/** Hub 配置类型 */
export type HubConfig = z.infer<typeof HubConfigSchema>;

/**
 * 解析 hub.toml 文件
 * @param configPath 配置文件路径，默认 ~/.assetplex/hub.toml
 */
export function loadHubConfig(configPath?: string): HubConfig {
  const path = configPath ?? resolveHubConfigPath();
  if (!existsSync(path)) {
    return HubConfigSchema.parse({});
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = TOML.parse(raw);
  return HubConfigSchema.parse(parsed);
}

/** 获取默认 hub.toml 路径 */
export function resolveHubConfigPath(): string {
  const hubRoot = process.env.ASSETPLEX_DIR ?? '~/.assetplex';
  return resolve(expandHome(hubRoot), 'hub.toml');
}

/**
 * 保存 HubConfig 到 hub.toml
 * @param config 配置对象
 * @param configPath 配置文件路径，默认 ~/.assetplex/hub.toml
 */
export function saveHubConfig(config: HubConfig, configPath?: string): void {
  const path = configPath ?? resolveHubConfigPath();
  // 确保目录存在
  mkdirSync(dirname(path), { recursive: true });
  // 校验后再写
  const validated = HubConfigSchema.parse(config);
  const toml = TOML.stringify(validated as unknown as TOML.JsonMap);
  writeFileSync(path, toml, 'utf-8');
}

/** 生成默认配置的 TOML 字符串（用于 assetplex init） */
export function generateDefaultConfigToml(): string {
  return `# AssetPlex Configuration
# See: https://github.com/wynter-cai/assetplex

[hub]
version = "1.0"
default_sync_strategy = "hybrid"           # native-import | symlink | copy | hybrid | per-project
backup_dir = "~/.assetplex/.backups"
auto_watch = false
backup_keep_count = 10

[identity]
profile_auto_learn = true
learn_sources = ["trae-cn", "claude-code"]
learn_interval_hours = 24
learn_max_facts = 100

[tools.trae-cn]
enabled = true
config_dir = "~/.trae-cn"
sync_strategy = "symlink"
mcp_format = "json"
targets = [
  "memory/user_profile.md",
  "skills/",
  "rules/",
  "mcp.json",
]

[tools.claude-code]
enabled = true
config_dir = "~/.claude"
sync_strategy = "native-import"
import_max_depth = 4
claude_md_aggregator = true

[tools.codex]
enabled = true
config_dir = "~/.codex"
sync_strategy = "copy"
mcp_format = "toml"
strip_frontmatter_keys = []

[tools.workbuddy]
enabled = true
config_dir = "~/.workbuddy"
sync_strategy = "symlink"
env_interpolation = true
mcp_filename = ".mcp.json"

[tools.qoder]
enabled = false
sync_strategy = "per-project"
project_targets = []

[marketplace]
enabled = true
sources = [
  "https://claudeskills.info/api",
  "https://agentskills.io/api",
  "https://agskills.dev/api",
]
cache_dir = "~/.assetplex/.marketplace-cache"
cache_ttl_hours = 24
`;
}
