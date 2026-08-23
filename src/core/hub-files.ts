/**
 * Hub 文件 CRUD 封装
 *
 * 为 Web UI 提供统一的 Hub 文件列出/读取/写入/删除 API。
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { getHubRoot } from '../utils/paths.js';
import { ensureDir } from '../utils/fs.js';

/** Hub 文件类别 */
export type HubFileCategory =
  | 'identity'
  | 'skills'
  | 'rules'
  | 'preferences'
  | 'mcp'
  | 'commands'
  | 'agents';

/** Hub 文件信息 */
export interface HubFileInfo {
  /** 相对于 Hub 根目录的路径，如 'identity/profile.md' */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间（ISO 字符串） */
  modified: string;
  /** 是否目录 */
  isDirectory: boolean;
}

/** 支持的类别列表 */
export const HUB_CATEGORIES: HubFileCategory[] = [
  'identity',
  'skills',
  'rules',
  'preferences',
  'mcp',
  'commands',
  'agents',
];

/**
 * 列出指定类别下的所有文件（递归）
 */
export function listHubFiles(category: HubFileCategory): HubFileInfo[] {
  const hubRoot = getHubRoot();
  const categoryDir = join(hubRoot, category);

  if (!existsSync(categoryDir)) {
    return [];
  }

  const files: HubFileInfo[] = [];
  collectFiles(categoryDir, hubRoot, files);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function collectFiles(currentDir: string, hubRoot: string, out: HubFileInfo[]): void {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      // 跳过隐藏目录（如 .backups、.marketplace-cache）
      if (entry.name.startsWith('.')) continue;
      collectFiles(fullPath, hubRoot, out);
    } else if (entry.isFile()) {
      // 跳过隐藏文件
      if (entry.name.startsWith('.')) continue;
      const stat = statSync(fullPath);
      out.push({
        relativePath: relative(hubRoot, fullPath).replace(/\\/g, '/'),
        absolutePath: fullPath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        isDirectory: false,
      });
    }
  }
}

/**
 * 读取 Hub 文件内容
 * @param relativePath 相对于 Hub 根目录的路径，如 'identity/profile.md'
 */
export function readHubFile(relativePath: string): { content: string; size: number; modified: string } | null {
  const hubRoot = getHubRoot();
  const fullPath = resolve(hubRoot, relativePath);

  // 安全检查：必须位于 hubRoot 内
  if (!fullPath.startsWith(hubRoot)) {
    throw new Error(`路径越界：${relativePath}`);
  }

  if (!existsSync(fullPath)) {
    return null;
  }

  const stat = statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`路径是目录而非文件：${relativePath}`);
  }

  return {
    content: readFileSync(fullPath, 'utf-8'),
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
}

/**
 * 写入 Hub 文件
 * @param relativePath 相对于 Hub 根目录的路径
 * @param content 文件内容
 */
export function writeHubFile(relativePath: string, content: string): void {
  const hubRoot = getHubRoot();
  const fullPath = resolve(hubRoot, relativePath);

  // 安全检查
  if (!fullPath.startsWith(hubRoot)) {
    throw new Error(`路径越界：${relativePath}`);
  }

  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, content, 'utf-8');
}

/**
 * 删除 Hub 文件
 */
export function deleteHubFile(relativePath: string): void {
  const hubRoot = getHubRoot();
  const fullPath = resolve(hubRoot, relativePath);

  if (!fullPath.startsWith(hubRoot)) {
    throw new Error(`路径越界：${relativePath}`);
  }

  if (!existsSync(fullPath)) {
    return;
  }

  const stat = statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`暂不支持删除目录：${relativePath}`);
  }

  unlinkSync(fullPath);
}

/**
 * 创建新 Hub 文件（如果已存在则抛错）
 */
export function createHubFile(relativePath: string, content: string): void {
  const hubRoot = getHubRoot();
  const fullPath = resolve(hubRoot, relativePath);

  if (!fullPath.startsWith(hubRoot)) {
    throw new Error(`路径越界：${relativePath}`);
  }

  if (existsSync(fullPath)) {
    throw new Error(`文件已存在：${relativePath}`);
  }

  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, content, 'utf-8');
}

/**
 * Hub 健康度检查
 */
export interface HubHealth {
  hubRoot: string;
  hubExists: boolean;
  hubTomlExists: boolean;
  fileCountByCategory: Record<string, number>;
  totalFiles: number;
}

export function checkHubHealth(): HubHealth {
  const hubRoot = getHubRoot();
  const health: HubHealth = {
    hubRoot,
    hubExists: existsSync(hubRoot),
    hubTomlExists: existsSync(join(hubRoot, 'hub.toml')),
    fileCountByCategory: {},
    totalFiles: 0,
  };

  for (const cat of HUB_CATEGORIES) {
    const files = listHubFiles(cat);
    health.fileCountByCategory[cat] = files.length;
    health.totalFiles += files.length;
  }

  return health;
}
