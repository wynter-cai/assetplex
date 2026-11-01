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
import { ensureDir, safeRemove } from '../utils/fs.js';

/** Hub 文件类别 */
export type HubFileCategory =
  | 'identity'
  | 'skills'
  | 'rules'
  | 'preferences'
  | 'mcp'
  | 'commands'
  | 'agents'
  | 'memory'
  /** 裁决准则元资产（add-llm-conflict-arbitration）：Hub/criteria/<slug>.md */
  | 'criteria';

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
  'memory',
  'criteria',
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
 * 删除 Hub 技能目录（仅 skills/<name>/ 一层，递归删除）
 *
 * 守卫：路径必须位于 Hub 内；仅允许 skills 类别下的一层技能子目录；
 * skills 根目录、多层子路径、路径穿越、普通文件一律抛错。
 * 目录不存在时静默返回（幂等）。删除走 safeRemove，兼容 Windows 与符号链接场景。
 */
export function deleteHubDirectory(relativePath: string): void {
  const hubRoot = getHubRoot();
  const fullPath = resolve(hubRoot, relativePath);

  if (!fullPath.startsWith(hubRoot)) {
    throw new Error(`路径越界：${relativePath}`);
  }

  const skillsRoot = resolve(hubRoot, 'skills');
  if (fullPath === skillsRoot) {
    throw new Error(`不允许删除技能根目录：${relativePath}`);
  }

  const rel = relative(skillsRoot, fullPath);
  if (rel === '' || rel.startsWith('..') || rel.includes('/') || rel.includes('\\')) {
    throw new Error(`仅允许删除 skills/<name> 一层技能目录：${relativePath}`);
  }

  if (!existsSync(fullPath)) {
    return;
  }

  if (!statSync(fullPath).isDirectory()) {
    throw new Error(`不是目录：${relativePath}`);
  }

  safeRemove(fullPath);
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

  // 重名比对不依赖文件系统大小写规则（memory-visible Scenario 4）：
  // Linux 默认大小写敏感，只靠 existsSync 会放过 Team-Decisions.md 与 team-decisions.md 并存。
  const fileName = relativePath.split('/').pop() ?? relativePath;
  const siblings = safeReaddir(dirname(fullPath));
  const clash = siblings.find((entry) => entry.toLowerCase() === fileName.toLowerCase());
  if (clash !== undefined) {
    throw new Error(`文件已存在：${relativePath}（与 ${clash} 重名）`);
  }

  ensureDir(dirname(fullPath));
  writeFileSync(fullPath, content, 'utf-8');
}

/** 目录不存在或不可读时返回空数组：新建路径首次落盘不因读目录失败而中断 */
function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
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
