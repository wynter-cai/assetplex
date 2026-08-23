/**
 * Qoder 适配器
 *
 * Qoder 是项目级工具，配置围绕 .qoder/ 目录展开，
 * 没有独立的用户级配置目录。
 *
 * 同步策略：per-project
 * - 按用户在 hub.toml 中配置的 project_targets 列表分发
 * - 兼容 AGENTS.md（项目根放入 AGENTS.md 自动识别）
 *
 * 权限配置 8 层优先级（来自官方 CLI 文档）：
 * defaults → userSettings → localSettings → flagSettings → projectSettings
 * → enterpriseManaged → commandLine → runtime
 */

import { BaseAdapter } from './base.js';
import type { HubItem, SyncTarget, DiscoveredItem } from '../types.js';
import type { HubConfig } from '../config.js';
import type { ToolConfig } from './types.js';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { hubPath } from '../../utils/paths.js';
import { ensureDir, copyRecursive, listMarkdownFilesRecursive } from '../../utils/fs.js';
import { createSymlink } from '../../transforms/symlink.js';
import { loadHubConfig } from '../config.js';

/**
 * Qoder 项目级 AGENTS.md 中固定聚合的 Hub 文件
 *
 * rules/ 下所有 .md 动态扫描，确保新增规则无需改代码。
 */
const QODER_FIXED_SECTIONS = [
  'identity/profile.md',
  'identity/profile.auto.md',
  'identity/communication-style.md',
  'identity/tech-stack.md',
  'preferences/coding-style.md',
  'preferences/git-workflow.md',
];

/**
 * 动态构造完整聚合列表：固定文件 + rules/ 下所有 .md
 */
function buildQoderSections(): string[] {
  const rulesFiles = listMarkdownFilesRecursive(hubPath('rules')).map(
    (rel) => `rules/${rel}`,
  );
  return [...QODER_FIXED_SECTIONS, ...rulesFiles];
}

export class QoderAdapter extends BaseAdapter {
  readonly name = 'qoder';
  readonly displayName = 'Qoder';
  readonly homepage = 'https://docs.qoder.com/';

  protected defaultConfigDir = ''; // Qoder 无统一用户级目录
  protected signatureFiles: string[] = []; // 由项目级 .qoder/ 判定
  protected supportedTargets = ['rules/', 'skills/', 'quests/', 'knowledge/'];

  /**
   * 重写 detect：Qoder 无用户级目录，detect 永远返回未安装
   * sync 时会通过 resolveHubItems 返回的 targets 处理 per-project
   */
  async detect() {
    return {
      name: this.name,
      installed: false,
      configDirExists: false,
      configDir: '',
      error: 'Qoder 是项目级工具，无用户级目录；请在项目根目录扫描 .qoder/',
    };
  }

  /**
   * 获取配置目录（Qoder 不适用，返回空）
   */
  override getConfigDir(): string {
    return '';
  }

  /**
   * 重写 resolveHubItems：从 hub.toml 读取 project_targets，
   * 为每个项目生成 rules/skills/AGENTS.md 三个 target
   */
  override resolveHubItems(hubConfig: HubConfig, _hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    // 从 hubConfig.tools.qoder 中提取 projectTargets
    const tools = hubConfig.tools as unknown as Record<string, Record<string, unknown>>;
    const qoderConfig = tools[this.name];
    const projectTargets = (qoderConfig?.projectTargets as string[]) ?? [];

    // 若 enabled=false 或无 project_targets，返回空
    if (!qoderConfig?.enabled || projectTargets.length === 0) {
      return [];
    }

    const results: Array<{ item: HubItem; target: SyncTarget }> = [];

    for (const projectRoot of projectTargets) {
      const base = this.expandHome(projectRoot);

      // .qoder/rules ← Hub: rules/
      results.push({
        item: {
          type: 'rule',
          relativePath: 'rules',
          absolutePath: hubPath('rules'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, '.qoder/rules'),
          strategy: 'per-project',
          isDirectory: true,
        },
      });

      // .qoder/skills ← Hub: skills/
      results.push({
        item: {
          type: 'skill',
          relativePath: 'skills',
          absolutePath: hubPath('skills'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, '.qoder/skills'),
          strategy: 'per-project',
          isDirectory: true,
        },
      });

      // 项目根 AGENTS.md ← Hub: 聚合多个文件
      results.push({
        item: {
          type: 'identity',
          relativePath: 'AGENTS.md',
          absolutePath: hubPath('identity/profile.md'),  // 锚点
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, 'AGENTS.md'),
          strategy: 'per-project',
          isDirectory: false,
        },
      });
    }

    return results;
  }

  /**
   * 同步目标列表（向后兼容）
   */
  targets(config: ToolConfig): SyncTarget[] {
    const projectTargets = (config.projectTargets as string[]) ?? [];

    const results: SyncTarget[] = [];
    for (const projectRoot of projectTargets) {
      const base = this.expandHome(projectRoot);
      results.push({
        tool: this.name,
        targetPath: resolve(base, '.qoder/rules'),
        strategy: 'per-project',
        isDirectory: true,
      });
      results.push({
        tool: this.name,
        targetPath: resolve(base, '.qoder/skills'),
        strategy: 'per-project',
        isDirectory: true,
      });
      results.push({
        tool: this.name,
        targetPath: resolve(base, 'AGENTS.md'),
        strategy: 'per-project',
        isDirectory: false,
      });
    }
    return results;
  }

  /**
   * 重写 applyPerProject：
   * - 目录类（rules/skills）：用 symlink，fallback 到 copy
   * - AGENTS.md：聚合 Hub 内容生成
   */
  protected override async applyPerProject(item: HubItem, target: SyncTarget): Promise<void> {
    if (target.targetPath.endsWith('AGENTS.md')) {
      this.applyAgentsMd(target);
      return;
    }

    // 目录类：确保父目录存在，然后创建 symlink
    ensureDir(resolve(target.targetPath, '..'));

    if (target.isDirectory) {
      const r = await createSymlink(item.absolutePath, target.targetPath, {
        isDirectory: true,
        force: true,
      });
      if (!r.success) {
        // symlink 失败，fallback 到 copy
        copyRecursive(item.absolutePath, target.targetPath);
      }
    } else {
      // 单文件 per-project：copy
      copyRecursive(item.absolutePath, target.targetPath);
    }
  }

  /**
   * 生成 AGENTS.md：聚合 Hub 内容（与 Codex 相同的聚合逻辑）
   */
  private applyAgentsMd(target: SyncTarget): void {
    const lines: string[] = [
      '<!-- AUTO-GENERATED by assetplex. Do not edit directly. Run `assetplex sync` to update. -->',
      '# AGENTS.md',
      '',
      '> 此文件由 assetplex 自动聚合 Hub 中的身份、偏好和规则文件生成。',
      '',
    ];

    for (const relPath of buildQoderSections()) {
      const absPath = hubPath(relPath);
      if (existsSync(absPath)) {
        const content = readFileSync(absPath, 'utf-8').trim();
        if (content) {
          lines.push(`## ${relPath}`, '', content, '');
        }
      }
    }

    // 确保目标目录存在
    ensureDir(resolve(target.targetPath, '..'));
    writeFileSync(target.targetPath, lines.join('\n'), 'utf-8');
  }

  /**
   * 反向导入：从 Qoder 项目读文件
   */
  override async import(targetPath: string): Promise<HubItem> {
    const content = readFileSync(targetPath);

    let type: HubItem['type'] = 'preference';
    if (targetPath.endsWith('AGENTS.md')) type = 'identity';
    else if (targetPath.includes('skills')) type = 'skill';
    else if (targetPath.includes('rules')) type = 'rule';

    return {
      type,
      relativePath: basename(targetPath),
      absolutePath: targetPath,
      content,
    };
  }

  /**
   * 扫描 Qoder 项目目录，发现所有可导入内容
   *
   * Qoder 是项目级工具，从 hub.toml 读取 projectTargets 来确定扫描范围。
   * 为每个项目扫描 .qoder/skills/、.qoder/rules/ 和项目根 AGENTS.md。
   */
  override async scan(): Promise<DiscoveredItem[]> {
    // 读取 hub 配置获取 projectTargets
    let projectTargets: string[] = [];
    try {
      const config = loadHubConfig();
      const tools = config.tools as unknown as Record<string, { enabled?: boolean; projectTargets?: string[] }>;
      const qoderConfig = tools.qoder;
      if (qoderConfig?.enabled && qoderConfig.projectTargets?.length) {
        projectTargets = qoderConfig.projectTargets;
      }
    } catch {
      // 无法读取配置，返回空
      return [];
    }

    const items: DiscoveredItem[] = [];

    for (const projectRoot of projectTargets) {
      const base = this.expandHome(projectRoot);
      if (!existsSync(base)) continue;

      // 项目根 AGENTS.md → identity/qoder-<projectname>.md
      const agentsMdPath = resolve(base, 'AGENTS.md');
      if (existsSync(agentsMdPath)) {
        const projectName = basename(base) || 'project';
        try {
          const content = readFileSync(agentsMdPath, 'utf-8');
          if (!content.includes('AUTO-GENERATED by assetplex')) {
            const item = this.makeDiscoveredItem(
              agentsMdPath,
              base,
              `identity/qoder-${projectName}.md`,
              'identity',
            );
            if (item) items.push(item);
          }
        } catch {
          // 忽略
        }
      }

      // .qoder/skills/ → skills/
      items.push(...this.scanDirectory(resolve(base, '.qoder/skills'), base, 'skills', 'skill'));

      // .qoder/rules/ → rules/
      items.push(...this.scanDirectory(resolve(base, '.qoder/rules'), base, 'rules', 'rule'));
    }

    return items;
  }
}
