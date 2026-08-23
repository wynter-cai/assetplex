/**
 * Codex (OpenAI Codex CLI) 适配器
 *
 * 配置目录：~/.codex/
 * 标志文件：config.toml、AGENTS.md
 * MCP 格式：TOML（[mcp_servers.x] 表），需要 JSON→TOML 转换
 *
 * Codex 是集成难度最大的工具：
 * - 用 TOML 格式（其他工具都用 JSON）
 * - 无 @import 显式 include 语法
 * - 仅沿目录树向上查找 AGENTS.md 合并
 *
 * Stage 2 实现：JSON→TOML 转换器 + AGENTS.md 聚合
 */

import { BaseAdapter } from './base.js';
import type { HubItem, SyncTarget, DiscoveredItem } from '../types.js';
import type { HubConfig } from '../config.js';
import type { ToolConfig } from './types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hubPath } from '../../utils/paths.js';
import { listMarkdownFilesRecursive } from '../../utils/fs.js';
import { mcpJsonToToml, mcpTomlToJson } from '../../transforms/json-toml.js';

/**
 * AGENTS.md 聚合内容中固定要包含的 Hub 文件
 *
 * Rules 分区动态扫描 rules/ 下所有 .md，确保新增规则无需改代码即可被 Codex 加载。
 */
const AGENTS_MD_FIXED_SECTIONS = [
  { title: 'Identity', files: [
    'identity/profile.md',
    'identity/profile.auto.md',
    'identity/communication-style.md',
    'identity/tech-stack.md',
    'identity/env.md',
  ]},
  { title: 'Preferences', files: [
    'preferences/coding-style.md',
    'preferences/git-workflow.md',
  ]},
];

/**
 * 动态构造完整 sections：固定分区 + Rules 分区（扫描 rules/ 目录）
 */
function buildAgentsSections(): Array<{ title: string; files: string[] }> {
  const rulesFiles = listMarkdownFilesRecursive(hubPath('rules')).map(
    (rel) => `rules/${rel}`,
  );
  return [...AGENTS_MD_FIXED_SECTIONS, { title: 'Rules', files: rulesFiles }];
}

export class CodexAdapter extends BaseAdapter {
  readonly name = 'codex';
  readonly displayName = 'Codex (OpenAI Codex CLI)';
  readonly homepage = 'https://github.com/openai/codex';

  protected defaultConfigDir = '~/.codex';
  protected signatureFiles = ['config.toml'];
  protected supportedTargets = ['AGENTS.md', 'skills/', 'config.toml'];

  /**
   * 重写 detect：
   * - 检查 ~/.codex/config.toml 是否存在
   */
  async detect() {
    const configDir = this.getConfigDir();
    const configPath = resolve(configDir, 'config.toml');
    const agentsMdPath = resolve(configDir, 'AGENTS.md');

    const configDirExists = existsSync(configDir);
    const hasConfig = existsSync(configPath);
    const hasAgentsMd = existsSync(agentsMdPath);

    const installed = configDirExists && (hasConfig || hasAgentsMd);

    // 尝试获取 Codex CLI 版本
    let version: string | undefined;
    try {
      const { execSync } = await import('node:child_process');
      const output = execSync('codex --version 2>&1', {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const match = output.match(/(\d+\.\d+\.\d+)/);
      if (match) version = match[1];
    } catch {
      // CLI 未安装或不在 PATH
    }

    return {
      name: this.name,
      installed,
      configDirExists,
      version,
      configDir,
      error: installed
        ? undefined
        : configDirExists
          ? '缺少 config.toml'
          : '未安装 Codex CLI',
    };
  }

  /**
   * 重写 resolveHubItems：明确关联 Hub 内文件与 Codex 目标
   *
   * 关联关系：
   * - Hub: identity/* + preferences/* + rules/* → Codex: AGENTS.md   (copy, 聚合)
   * - Hub: skills/                                 → Codex: skills      (symlink, dir)
   * - Hub: mcp/mcp.sources.json                  → Codex: config.toml (copy, JSON→TOML 转换)
   */
  override resolveHubItems(_hubConfig: HubConfig, _hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    const base = this.getConfigDir();

    return [
      {
        item: {
          type: 'identity',
          relativePath: 'AGENTS.md',  // 虚拟路径，apply 时会聚合多个 Hub 文件
          absolutePath: hubPath('identity/profile.md'),  // 锚点文件
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'AGENTS.md'),
          strategy: 'copy',
          isDirectory: false,
        },
      },
      {
        item: {
          type: 'skill',
          relativePath: 'skills',
          absolutePath: hubPath('skills'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'skills'),
          strategy: 'symlink',
          isDirectory: true,
        },
      },
      {
        item: {
          type: 'mcp',
          relativePath: 'mcp/mcp.sources.json',
          absolutePath: hubPath('mcp/mcp.sources.json'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'config.toml'),
          strategy: 'copy',
          isDirectory: false,
        },
      },
    ];
  }

  /**
   * 同步目标列表（向后兼容）
   */
  targets(config: ToolConfig): SyncTarget[] {
    const configDir = config.configDir || this.defaultConfigDir;
    const base = this.expandHome(configDir);

    return [
      {
        tool: this.name,
        targetPath: resolve(base, 'AGENTS.md'),
        strategy: 'copy',
        isDirectory: false,
      },
      {
        tool: this.name,
        targetPath: resolve(base, 'skills'),
        strategy: 'symlink',
        isDirectory: true,
      },
      {
        tool: this.name,
        targetPath: resolve(base, 'config.toml'),
        strategy: 'copy',
        isDirectory: false,
      },
    ];
  }

  /**
   * 重写 apply：处理 AGENTS.md 聚合 和 config.toml JSON→TOML 转换
   */
  override async apply(item: HubItem, target: SyncTarget): Promise<void> {
    // AGENTS.md：聚合多个 Hub 文件
    if (target.targetPath.endsWith('AGENTS.md')) {
      this.applyAgentsMd(target);
      return;
    }

    // config.toml：JSON → TOML 转换
    if (target.targetPath.endsWith('config.toml')) {
      this.applyConfigToml(item, target);
      return;
    }

    // 其他情况走默认实现（如 skills/ 的 symlink）
    return super.apply(item, target);
  }

  /**
   * 生成 AGENTS.md：聚合 Hub 内 identity + preferences + rules 内容
   */
  private applyAgentsMd(target: SyncTarget): void {
    const lines: string[] = [
      '<!-- AUTO-GENERATED by assetplex. Do not edit directly. Run `assetplex sync` to update. -->',
      '# AGENTS.md',
      '',
      '> 此文件由 assetplex 自动聚合 Hub 中的身份、偏好和规则文件生成。',
      '> 修改请编辑 ~/.assetplex/ 下对应文件后运行 `assetplex sync`。',
      '',
    ];

    for (const section of buildAgentsSections()) {
      lines.push(`## ${section.title}`, '');
      for (const relPath of section.files) {
        const absPath = hubPath(relPath);
        if (existsSync(absPath)) {
          const content = readFileSync(absPath, 'utf-8').trim();
          if (content) {
            lines.push(`### ${relPath}`, '', content, '');
          }
        }
      }
    }

    writeFileSync(target.targetPath, lines.join('\n'), 'utf-8');
  }

  /**
   * 生成 config.toml：从 mcp.sources.json (JSON) 转换为 TOML
   */
  private applyConfigToml(item: HubItem, target: SyncTarget): void {
    const jsonContent = readFileSync(item.absolutePath, 'utf-8');
    const tomlContent = mcpJsonToToml(jsonContent);
    writeFileSync(target.targetPath, tomlContent, 'utf-8');
  }

  /**
   * 重写 transform：JSON → TOML 转换
   */
  override transform(content: Buffer, format: 'json' | 'toml' | 'md'): Buffer {
    if (format === 'toml') {
      const jsonStr = content.toString('utf-8');
      const tomlStr = mcpJsonToToml(jsonStr);
      return Buffer.from(tomlStr, 'utf-8');
    }
    return content;
  }

  /**
   * 反向导入：从 Codex 读 config.toml 转 JSON 到 Hub
   */
  override async import(targetPath: string): Promise<HubItem> {
    const content = readFileSync(targetPath);

    let type: HubItem['type'] = 'preference';
    if (targetPath.endsWith('config.toml')) type = 'mcp';
    else if (targetPath.endsWith('AGENTS.md')) type = 'identity';
    else if (targetPath.includes('skills')) type = 'skill';

    // 对 config.toml 做反向 TOML → JSON 转换
    if (targetPath.endsWith('config.toml')) {
      const tomlStr = content.toString('utf-8');
      const jsonStr = mcpTomlToJson(tomlStr);
      return {
        type,
        relativePath: 'mcp/mcp.sources.json',
        absolutePath: targetPath,
        content: Buffer.from(jsonStr, 'utf-8'),
      };
    }

    return {
      type,
      relativePath: '',
      absolutePath: targetPath,
      content,
    };
  }

  /**
   * 扫描 Codex 目录，发现所有可导入内容
   */
  override async scan(): Promise<DiscoveredItem[]> {
    const base = this.getConfigDir();
    const items: DiscoveredItem[] = [];

    // AGENTS.md → identity/codex.md（如果不是 AUTO-GENERATED 的）
    const agentsMdPath = resolve(base, 'AGENTS.md');
    if (existsSync(agentsMdPath)) {
      try {
        const content = readFileSync(agentsMdPath, 'utf-8');
        if (!content.includes('AUTO-GENERATED by assetplex')) {
          const item = this.makeDiscoveredItem(agentsMdPath, base, 'identity/codex.md', 'identity');
          if (item) items.push(item);
        }
      } catch {
        // 忽略
      }
    }

    // skills/ 目录
    items.push(...this.scanDirectory(resolve(base, 'skills'), base, 'skills', 'skill'));

    // config.toml 中的 MCP 配置 → mcp/mcp.sources.json
    // 注意：config.toml 是 TOML，makeDiscoveredItem 做的是字节比较，
    // TOML 和 JSON 格式不同会判定为 differs，这是正确行为——导入时会走 merge 逻辑
    const configTomlPath = resolve(base, 'config.toml');
    const tomlItem = this.makeDiscoveredItem(configTomlPath, base, 'mcp/mcp.sources.json', 'mcp');
    if (tomlItem) items.push(tomlItem);

    return items;
  }
}
