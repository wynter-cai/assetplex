/**
 * Adapter 接口与基类
 *
 * 借鉴 agentsmesh 的 Plugin 架构：每个工具实现统一接口，
 * 新工具支持无需发版，社区可贡献第三方适配器。
 *
 * Stage 2 升级：apply/import/transform 从可选改为必需方法（模板方法模式）
 * - 默认实现基于 symlink/copy 自动派发
 * - 子类只需 override 特殊策略（native-import/per-project）
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, normalize, relative, join } from 'node:path';
import { homedir } from 'node:os';
import type { HubItem, LintWarning, SyncTarget, ToolStatus, DiscoveredItem, DiscoveredCategory, ConflictStatus } from '../types.js';
import type { HubConfig } from '../config.js';
import type { ToolConfig } from './types.js';
import { log } from '../../utils/logger.js';
import { copyRecursive } from '../../utils/fs.js';
import { createSymlink } from '../../transforms/symlink.js';
import { hubPath } from '../../utils/paths.js';

/**
 * 适配器接口
 *
 * 每个适配器必须实现：
 * - detect(): 检测工具是否安装、版本
 * - targets(): 返回同步目标路径列表（保留向后兼容）
 * - resolveHubItems(): 返回 (HubItem, SyncTarget) 关联列表（sync 引擎主用）
 * - apply(): 把 Hub 内容应用到工具
 * - import(): 从工具反向导入到 Hub
 * - scan(): 扫描工具目录发现所有可导入内容（导入向导用）
 * - transform(): 格式转换
 */
export interface ToolAdapter {
  /** 适配器名（与 hub.toml 中的 key 一致） */
  readonly name: string;

  /** 显示名（用于 CLI 输出） */
  readonly displayName: string;

  /** 工具官网或文档链接 */
  readonly homepage?: string;

  /** 检测工具是否安装、版本 */
  detect(): Promise<ToolStatus>;

  /** 返回该工具的同步目标路径列表（向后兼容） */
  targets(config: ToolConfig): SyncTarget[];

  /**
   * 返回 (HubItem, SyncTarget) 关联列表
   *
   * sync 引擎主用此方法：知道每个 target 对应 Hub 中的哪个文件
   *
   * @param hubConfig Hub 主配置
   * @param hubRoot Hub 根目录绝对路径
   */
  resolveHubItems(hubConfig: HubConfig, hubRoot: string): Array<{ item: HubItem; target: SyncTarget }>;

  /** 把 Hub 内容应用到工具 */
  apply(item: HubItem, target: SyncTarget): Promise<void>;

  /** 从工具反向导入到 Hub */
  import(targetPath: string): Promise<HubItem>;

  /**
   * 扫描工具目录，发现所有可导入内容
   *
   * 导入向导使用此方法获取工具中的所有 identity/skill/rule/mcp/preference 文件。
   * 默认返回空数组，子类必须重写以实现实际扫描逻辑。
   */
  scan(): Promise<DiscoveredItem[]>;

  /** 格式转换 */
  transform(content: Buffer, format: 'json' | 'toml' | 'md'): Buffer;

  /** 同步前 lint 检查（可选） */
  lint?(items: HubItem[]): LintWarning[];
}

/**
 * 适配器基类：提供通用 detect/apply/import/transform 实现
 *
 * 模板方法模式：
 * - apply() 根据 strategy 派发到具体实现（symlink/copy 走默认，native-import/per-project 走子类）
 * - import() 默认读取文件内容
 * - transform() 默认返回原内容
 */
export abstract class BaseAdapter implements ToolAdapter {
  abstract readonly name: string;
  abstract readonly displayName: string;
  readonly homepage?: string;

  /** 该工具的默认配置目录（如 ~/.claude） */
  protected abstract defaultConfigDir: string;

  /** 该工具的标志性文件（用于 detect，如 settings.json、config.toml） */
  protected abstract signatureFiles: string[];

  /** 该工具支持的目标类型 */
  protected abstract supportedTargets: string[];

  /**
   * 默认 detect 实现：检查配置目录是否存在，是否有标志性文件
   */
  async detect(): Promise<ToolStatus> {
    const configDir = this.getConfigDir();
    const configDirExists = configDir ? existsSync(configDir) : false;
    let installed = configDirExists;

    // 检查标志性文件
    if (configDirExists) {
      let hasSignature = false;
      for (const file of this.signatureFiles) {
        if (existsSync(resolve(configDir, file))) {
          hasSignature = true;
          break;
        }
      }
      installed = hasSignature;
    }

    // 尝试通过工具命令检测版本（可选）
    let version: string | undefined;
    try {
      version = await this.detectVersion();
    } catch {
      // 忽略版本检测失败
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
          ? '缺少标志性文件'
          : '未安装',
    };
  }

  /**
   * 获取工具配置目录（子类可重写以支持环境变量重定向）
   */
  getConfigDir(): string {
    return this.expandHome(this.defaultConfigDir);
  }

  /**
   * 返回该工具的同步目标路径列表（子类必须实现）
   * 注意：此方法保留向后兼容；sync 引擎优先用 resolveHubItems()
   */
  abstract targets(config: ToolConfig): SyncTarget[];

  /**
   * 默认 resolveHubItems 实现：基于 targets() 返回路径，HubItem.relativePath 留空
   *
   * 子类应重写此方法以提供准确的 HubItem 关联
   */
  resolveHubItems(hubConfig: HubConfig, _hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    const toolConfig = this.getToolConfig(hubConfig);
    if (!toolConfig) return [];
    const targets = this.targets(toolConfig);
    return targets.map((target) => ({
      item: {
        type: 'preference',
        relativePath: '',
        absolutePath: '',
      },
      target,
    }));
  }

  /**
   * 默认 apply 实现：根据 SyncTarget.strategy 派发
   * - symlink: 用 createSymlink()
   * - copy: 用 copyRecursive()
   * - native-import: 调用子类的 applyNativeImport()
   * - per-project: 调用子类的 applyPerProject()
   */
  async apply(item: HubItem, target: SyncTarget): Promise<void> {
    if (!item.absolutePath) {
      throw new Error(`HubItem.absolutePath 为空，无法 apply 到 ${target.targetPath}`);
    }

    switch (target.strategy) {
      case 'symlink': {
        const r = await createSymlink(item.absolutePath, target.targetPath, {
          isDirectory: target.isDirectory,
          force: true,
        });
        if (!r.success) {
          throw new Error(`${this.name}: 创建 symlink 失败 - ${r.message}`);
        }
        if (r.method === 'copy') {
          log.warn(`${this.name}: symlink 降级为 copy（${r.message}）`);
        } else if (r.method === 'junction') {
          log.debug(`${this.name}: 使用 junction（${r.message ?? ''}）`);
        }
        break;
      }
      case 'copy': {
        copyRecursive(item.absolutePath, target.targetPath);
        break;
      }
      case 'native-import': {
        await this.applyNativeImport(item, target);
        break;
      }
      case 'per-project': {
        await this.applyPerProject(item, target);
        break;
      }
      default:
        throw new Error(`未知的同步策略: ${target.strategy}`);
    }
  }

  /** 子类可选实现：native-import 策略的具体逻辑 */
  protected async applyNativeImport(_item: HubItem, _target: SyncTarget): Promise<void> {
    throw new Error(`${this.name} 不支持 native-import 策略`);
  }

  /** 子类可选实现：per-project 策略的具体逻辑 */
  protected async applyPerProject(_item: HubItem, _target: SyncTarget): Promise<void> {
    throw new Error(`${this.name} 不支持 per-project 策略`);
  }

  /**
   * 默认 import 实现：读取目标文件内容返回 HubItem
   */
  async import(targetPath: string): Promise<HubItem> {
    const content = readFileSync(targetPath);
    return {
      type: 'preference',
      relativePath: '',
      absolutePath: targetPath,
      content,
    };
  }

  /** 默认 transform：直接返回原内容 */
  transform(content: Buffer, _format: 'json' | 'toml' | 'md'): Buffer {
    return content;
  }

  /**
   * 默认 scan 实现：返回空数组。
   * 子类必须重写此方法以扫描工具目录中的可导入内容。
   */
  async scan(): Promise<DiscoveredItem[]> {
    return [];
  }

  /**
   * 辅助方法：为单个文件创建 DiscoveredItem，自动检测冲突状态
   *
   * @param absolutePath 源文件绝对路径
   * @param baseDir 工具配置目录（用于计算 relativePath）
   * @param hubTargetPath 导入到 Hub 的目标相对路径
   * @param category 文件类别
   * @returns DiscoveredItem
   */
  protected makeDiscoveredItem(
    absolutePath: string,
    baseDir: string,
    hubTargetPath: string,
    category: DiscoveredCategory,
  ): DiscoveredItem | null {
    try {
      const stat = statSync(absolutePath);
      if (!stat.isFile()) return null;

      const relPath = relative(baseDir, absolutePath);
      const hubFullPath = hubPath(hubTargetPath);

      let conflict: ConflictStatus = 'none';
      let existingSize: number | undefined;

      if (existsSync(hubFullPath)) {
        try {
          const existingStat = statSync(hubFullPath);
          existingSize = existingStat.size;
          if (existingStat.size === stat.size) {
            const existingContent = readFileSync(hubFullPath);
            const newContent = readFileSync(absolutePath);
            conflict = existingContent.equals(newContent) ? 'exists' : 'differs';
          } else {
            conflict = 'differs';
          }
        } catch {
          conflict = 'differs';
        }
      }

      return {
        absolutePath,
        relativePath: relPath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        category,
        hubTargetPath,
        conflict,
        existingSize,
        tool: this.name,
      };
    } catch {
      return null;
    }
  }

  /**
   * 辅助方法：递归扫描目录下所有文件，为每个文件创建 DiscoveredItem
   *
   * @param dirPath 要扫描的目录绝对路径
   * @param baseDir 工具配置目录（用于计算 relativePath）
   * @param hubPrefix Hub 目标路径前缀（如 'skills'、'rules'）
   * @param category 文件类别
   * @returns DiscoveredItem[]
   */
  protected scanDirectory(
    dirPath: string,
    baseDir: string,
    hubPrefix: string,
    category: DiscoveredCategory,
  ): DiscoveredItem[] {
    if (!existsSync(dirPath)) return [];

    const results: DiscoveredItem[] = [];

    const walk = (currentDir: string): void => {
      try {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            const relFromDir = relative(dirPath, fullPath);
            const hubTarget = `${hubPrefix}/${relFromDir.split(/[/\\]/).join('/')}`;
            const item = this.makeDiscoveredItem(fullPath, baseDir, hubTarget, category);
            if (item) results.push(item);
          }
        }
      } catch {
        // 忽略权限错误等
      }
    };

    walk(dirPath);
    return results;
  }

  /**
   * 默认版本检测：返回 undefined，子类可重写
   */
  protected async detectVersion(): Promise<string | undefined> {
    return undefined;
  }

  /**
   * 从 hubConfig 中提取当前工具的配置
   */
  protected getToolConfig(hubConfig: HubConfig): ToolConfig | null {
    const tools = hubConfig.tools as unknown as Record<string, Record<string, unknown>>;
    const raw = tools[this.name];
    if (!raw) return null;
    return {
      enabled: (raw.enabled as boolean) ?? false,
      configDir: (raw.configDir as string) ?? '',
      syncStrategy: (raw.syncStrategy as ToolConfig['syncStrategy']) ?? 'hybrid',
      mcpFormat: raw.mcpFormat as ToolConfig['mcpFormat'] | undefined,
      ...raw,
    };
  }

  /**
   * 展开 ~ 为 home 目录
   */
  protected expandHome(filepath: string): string {
    if (!filepath) return filepath;
    if (filepath === '~') return homedir();
    if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
      return normalize(resolve(homedir(), filepath.slice(2)));
    }
    return normalize(filepath);
  }
}
