/**
 * TRAE 中国版适配器
 *
 * 配置目录：~/.trae-cn/
 * 标志文件：argv.json、skill-config.json、memory/user_profile.md
 * 同步目标：memory/user_profile.md、skills/、rules/、mcp.json
 *
 * TRAE 中国版的独特价值：memory/user_profile.md 是 AI 自动维护的用户画像，
 * 是 AssetPlex 身份层的天然数据源（核心差异化）
 */

import { BaseAdapter } from './base.js';
import type { HubItem, SyncTarget, DiscoveredItem } from '../types.js';
import type { HubConfig } from '../config.js';
import type { ToolConfig } from './types.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hubPath } from '../../utils/paths.js';

export class TraeCnAdapter extends BaseAdapter {
  readonly name = 'trae-cn';
  readonly displayName = 'TRAE 中国版';
  readonly homepage = 'https://docs.trae.ai/';

  protected defaultConfigDir = '~/.trae-cn';
  protected signatureFiles = ['argv.json', 'skill-config.json'];
  protected supportedTargets = [
    'memory/user_profile.md',
    'skills/',
    'rules/',
    'mcp.json',
  ];

  /**
   * 重写 detect：TRAE CN 的特殊检测逻辑
   * - 检查 ~/.trae-cn/argv.json 是否存在
   * - 检查 ~/.trae-cn/memory/user_profile.md 是否存在（身份画像源）
   */
  async detect() {
    const configDir = this.getConfigDir();
    const argvPath = resolve(configDir, 'argv.json');
    const skillConfigPath = resolve(configDir, 'skill-config.json');
    const profilePath = resolve(configDir, 'memory/user_profile.md');

    const configDirExists = existsSync(configDir);
    const hasArgv = existsSync(argvPath);
    const hasSkillConfig = existsSync(skillConfigPath);
    const hasProfile = existsSync(profilePath);

    // 配置目录存在且有标志性文件之一即认为已安装
    const installed = configDirExists && (hasArgv || hasSkillConfig);

    // 将 hasProfile 状态附加到 error 字段（若已安装但 profile 缺失）
    let extraInfo: string | undefined;
    if (installed && !hasProfile) {
      extraInfo = '已安装，但 memory/user_profile.md 缺失（可运行 assetplex profile learn 生成）';
    }

    // 读取 ide_version.json 获取版本（如存在）
    let version: string | undefined;
    const versionPath = resolve(configDir, 'builtin/ide_version.json');
    if (existsSync(versionPath)) {
      try {
        const { readFileSync } = await import('node:fs');
        const data = JSON.parse(readFileSync(versionPath, 'utf-8'));
        version = data.version ?? data.ideVersion;
      } catch {
        // 忽略
      }
    }

    return {
      name: this.name,
      installed,
      configDirExists,
      version,
      configDir,
      error: installed
        ? extraInfo
        : configDirExists
          ? '缺少标志性文件'
          : '未安装',
    };
  }

  /**
   * 重写 resolveHubItems：明确关联 Hub 内文件与 TRAE CN 目标
   *
   * 关联关系：
   * - Hub: identity/profile.md           → TRAE: memory/user_profile.md (symlink)
   * - Hub: skills/                        → TRAE: skills                 (symlink, dir)
   * - Hub: rules/                         → TRAE: rules                  (symlink, dir)
   * - Hub: mcp/mcp.sources.json          → TRAE: mcp.json               (copy, JSON 格式直接复制)
   */
  override resolveHubItems(_hubConfig: HubConfig, _hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    const base = this.getConfigDir();

    return [
      {
        item: {
          type: 'identity',
          relativePath: 'identity/profile.md',
          absolutePath: hubPath('identity/profile.md'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'memory/user_profile.md'),
          strategy: 'symlink',
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
          type: 'rule',
          relativePath: 'rules',
          absolutePath: hubPath('rules'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'rules'),
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
          targetPath: resolve(base, 'mcp.json'),
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
        targetPath: resolve(base, 'memory/user_profile.md'),
        strategy: 'symlink',
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
        targetPath: resolve(base, 'rules'),
        strategy: 'symlink',
        isDirectory: true,
      },
      {
        tool: this.name,
        targetPath: resolve(base, 'mcp.json'),
        strategy: 'copy',
        isDirectory: false,
      },
    ];
  }

  /**
   * 反向导入：从 TRAE CN 读取现有配置到 Hub
   *
   * 注意：memory/user_profile.md 是 TRAE AI 维护的，反向导入会覆盖 Hub 的 profile.md
   */
  override async import(targetPath: string): Promise<HubItem> {
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(targetPath);

    // 根据 targetPath 推断类型
    let type: HubItem['type'] = 'preference';
    if (targetPath.includes('user_profile')) type = 'identity';
    else if (targetPath.includes('skills')) type = 'skill';
    else if (targetPath.includes('rules')) type = 'rule';
    else if (targetPath.includes('mcp')) type = 'mcp';

    return {
      type,
      relativePath: '',
      absolutePath: targetPath,
      content,
    };
  }

  /**
   * 扫描 TRAE CN 目录，发现所有可导入内容
   */
  override async scan(): Promise<DiscoveredItem[]> {
    const base = this.getConfigDir();
    const items: DiscoveredItem[] = [];

    // memory/user_profile.md → identity/profile.md
    const profilePath = resolve(base, 'memory/user_profile.md');
    const profileItem = this.makeDiscoveredItem(profilePath, base, 'identity/profile.md', 'identity');
    if (profileItem) items.push(profileItem);

    // memory/ 下其他 .md 文件 → preferences/（如 session_memory、topics 等）
    const memoryDir = resolve(base, 'memory');
    if (existsSync(memoryDir)) {
      const { readdirSync } = await import('node:fs');
      try {
        const memoryEntries = readdirSync(memoryDir, { withFileTypes: true });
        for (const entry of memoryEntries) {
          if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'user_profile.md') {
            const fullPath = resolve(memoryDir, entry.name);
            const item = this.makeDiscoveredItem(fullPath, base, `preferences/${entry.name}`, 'preference');
            if (item) items.push(item);
          }
        }
      } catch {
        // 忽略
      }
    }

    // skills/ 目录 → skills/
    items.push(...this.scanDirectory(resolve(base, 'skills'), base, 'skills', 'skill'));

    // rules/ 目录 → rules/
    items.push(...this.scanDirectory(resolve(base, 'rules'), base, 'rules', 'rule'));

    // mcp.json → mcp/mcp.sources.json
    const mcpPath = resolve(base, 'mcp.json');
    const mcpItem = this.makeDiscoveredItem(mcpPath, base, 'mcp/mcp.sources.json', 'mcp');
    if (mcpItem) items.push(mcpItem);

    return items;
  }
}
