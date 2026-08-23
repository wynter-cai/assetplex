/**
 * WorkBuddy / CodeBuddy 适配器
 *
 * 配置目录：~/.workbuddy/ 或 ~/.codebuddy/
 * 标志文件：.mcp.json（注意前导点，与 Claude Code 的 .mcp.json 同名但路径不同）
 * MCP 格式：JSON，支持 ${VAR} 环境变量插值
 *
 * WorkBuddy 特性：
 * - 同时维护新旧两个 MCP 文件（.mcp.json 与 mcp.json）
 * - models.json 用于自定义模型接入
 * - 配置文件需保存为 UTF-8 without BOM
 *
 * Stage 2 实现：${VAR} 环境变量插值（同步时展开，反向导入时去插值）
 */

import { BaseAdapter } from './base.js';
import type { HubItem, SyncTarget, DiscoveredItem } from '../types.js';
import type { HubConfig } from '../config.js';
import type { ToolConfig } from './types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hubPath } from '../../utils/paths.js';
import {
  interpolateEnv,
  extractEnvVars,
  buildEnvMap,
  desinterpolateEnv,
} from '../../transforms/env-interpolation.js';

export class WorkBuddyAdapter extends BaseAdapter {
  readonly name = 'workbuddy';
  readonly displayName = 'WorkBuddy / CodeBuddy';
  readonly homepage = 'https://www.tencentcloud.com/products/codebuddy';

  protected defaultConfigDir = '~/.workbuddy';
  protected signatureFiles = ['.mcp.json', 'mcp.json', 'models.json'];
  protected supportedTargets = ['rules/', 'skills/', '.mcp.json'];

  /**
   * 重写 detect：同时检查 ~/.workbuddy 和 ~/.codebuddy
   */
  async detect() {
    const workbuddyDir = this.expandHome('~/.workbuddy');
    const codebuddyDir = this.expandHome('~/.codebuddy');

    const workbuddyExists = existsSync(workbuddyDir);
    const codebuddyExists = existsSync(codebuddyDir);

    // 优先 workbuddy，回退 codebuddy
    const configDir = workbuddyExists ? workbuddyDir : codebuddyDir;
    const configDirExists = workbuddyExists || codebuddyExists;

    let hasSignature = false;
    if (workbuddyExists) {
      hasSignature =
        existsSync(resolve(workbuddyDir, '.mcp.json')) ||
        existsSync(resolve(workbuddyDir, 'mcp.json')) ||
        existsSync(resolve(workbuddyDir, 'models.json'));
    }
    if (!hasSignature && codebuddyExists) {
      hasSignature =
        existsSync(resolve(codebuddyDir, '.mcp.json')) ||
        existsSync(resolve(codebuddyDir, 'mcp.json')) ||
        existsSync(resolve(codebuddyDir, 'models.json'));
    }

    const installed = configDirExists && hasSignature;

    return {
      name: this.name,
      installed,
      configDirExists,
      configDir,
      error: installed
        ? undefined
        : configDirExists
          ? '缺少标志性文件'
          : '未安装 WorkBuddy/CodeBuddy',
    };
  }

  /**
   * 获取配置目录（动态：workbuddy 或 codebuddy）
   */
  override getConfigDir(): string {
    const workbuddyDir = this.expandHome('~/.workbuddy');
    const codebuddyDir = this.expandHome('~/.codebuddy');
    if (existsSync(workbuddyDir)) return workbuddyDir;
    if (existsSync(codebuddyDir)) return codebuddyDir;
    return workbuddyDir; // 默认
  }

  /**
   * 重写 resolveHubItems：明确关联 Hub 内文件与 WorkBuddy 目标
   *
   * 关联关系：
   * - Hub: rules/                       → WorkBuddy: rules       (symlink, dir)
   * - Hub: skills/                       → WorkBuddy: skills      (symlink, dir)
   * - Hub: mcp/mcp.sources.json          → WorkBuddy: .mcp.json   (copy, ${VAR} 插值)
   */
  override resolveHubItems(_hubConfig: HubConfig, _hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    const base = this.getConfigDir();

    return [
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
      // 注意前导点（与 Claude Code 的 .mcp.json 同名但路径不同）
      {
        item: {
          type: 'mcp',
          relativePath: 'mcp/mcp.sources.json',
          absolutePath: hubPath('mcp/mcp.sources.json'),
        },
        target: {
          tool: this.name,
          targetPath: resolve(base, '.mcp.json'),
          strategy: 'copy', // 需要 ${VAR} 插值
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
        targetPath: resolve(base, 'rules'),
        strategy: 'symlink',
        isDirectory: true,
      },
      {
        tool: this.name,
        targetPath: resolve(base, 'skills'),
        strategy: 'symlink',
        isDirectory: true,
      },
      {
        tool: this.name,
        targetPath: resolve(base, '.mcp.json'),
        strategy: 'copy',
        isDirectory: false,
      },
    ];
  }

  /**
   * 重写 apply：处理 .mcp.json 的 ${VAR} 插值
   */
  override async apply(item: HubItem, target: SyncTarget): Promise<void> {
    // .mcp.json：从 Hub 读取 JSON，做 ${VAR} 插值后写入
    if (target.targetPath.endsWith('.mcp.json')) {
      this.applyMcpJson(item, target);
      return;
    }

    // 其他情况走默认实现（symlink 等）
    return super.apply(item, target);
  }

  /**
   * 生成 .mcp.json：读取 Hub 的 mcp.sources.json，做 ${VAR} 插值
   */
  private applyMcpJson(item: HubItem, target: SyncTarget): void {
    const content = readFileSync(item.absolutePath, 'utf-8');

    // 提取所有 ${VAR} 引用，做插值
    const varNames = extractEnvVars(content);
    if (varNames.length === 0) {
      // 无 ${VAR}，直接复制
      writeFileSync(target.targetPath, content, 'utf-8');
      return;
    }

    const result = interpolateEnv(content);
    if (result.missing.length > 0) {
      // 缺失变量：保留原样并记录警告（仍写入文件）
      console.warn(`[workbuddy] 缺失环境变量: ${result.missing.join(', ')}（保留为 \${VAR} 原样）`);
    }
    writeFileSync(target.targetPath, result.output, 'utf-8');
  }

  /**
   * 反向导入：从 WorkBuddy 读 .mcp.json，去插值后写回 Hub
   */
  override async import(targetPath: string): Promise<HubItem> {
    const content = readFileSync(targetPath);

    let type: HubItem['type'] = 'preference';
    if (targetPath.endsWith('.mcp.json')) type = 'mcp';
    else if (targetPath.includes('skills')) type = 'skill';
    else if (targetPath.includes('rules')) type = 'rule';

    // 对 .mcp.json 做反向去插值
    if (targetPath.endsWith('.mcp.json')) {
      const str = content.toString('utf-8');
      const varNames = extractEnvVars(str);
      const envMap = buildEnvMap(varNames);
      if (Object.keys(envMap).length > 0) {
        const restored = desinterpolateEnv(str, envMap);
        return {
          type,
          relativePath: 'mcp/mcp.sources.json',
          absolutePath: targetPath,
          content: Buffer.from(restored, 'utf-8'),
        };
      }
    }

    return {
      type,
      relativePath: '',
      absolutePath: targetPath,
      content,
    };
  }

  /**
   * 扫描 WorkBuddy/CodeBuddy 目录，发现所有可导入内容
   */
  override async scan(): Promise<DiscoveredItem[]> {
    const base = this.getConfigDir();
    const items: DiscoveredItem[] = [];

    // skills/ 目录
    items.push(...this.scanDirectory(resolve(base, 'skills'), base, 'skills', 'skill'));

    // rules/ 目录
    items.push(...this.scanDirectory(resolve(base, 'rules'), base, 'rules', 'rule'));

    // .mcp.json → mcp/mcp.sources.json（WorkBuddy 主 MCP 文件）
    const mcpDotPath = resolve(base, '.mcp.json');
    const mcpDotItem = this.makeDiscoveredItem(mcpDotPath, base, 'mcp/mcp.sources.json', 'mcp');
    if (mcpDotItem) items.push(mcpDotItem);

    // mcp.json（备用，无前导点）
    const mcpPath = resolve(base, 'mcp.json');
    if (existsSync(mcpPath)) {
      // 如果 .mcp.json 不存在则使用 mcp.json，否则作为额外 MCP 文件导入到 preferences
      if (!mcpDotItem) {
        const item = this.makeDiscoveredItem(mcpPath, base, 'mcp/mcp.sources.json', 'mcp');
        if (item) items.push(item);
      } else {
        const item = this.makeDiscoveredItem(mcpPath, base, 'preferences/mcp.json', 'preference');
        if (item) items.push(item);
      }
    }

    // models.json → preferences/models.json
    const modelsPath = resolve(base, 'models.json');
    const modelsItem = this.makeDiscoveredItem(modelsPath, base, 'preferences/models.json', 'preference');
    if (modelsItem) items.push(modelsItem);

    return items;
  }
}
