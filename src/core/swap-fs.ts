/**
 * swap 文件系统辅助
 *
 * 切换编排专用的文件枚举、备份清单与历史记录读写封装，供 core/swap.ts 使用。
 * 不反向依赖 cli/server/web；仅本机文件操作，零数据上传。
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { copyRecursive, ensureDir, isSymlink, safeRemove } from '../utils/fs.js';
import type { SwapHistoryEntry } from './swap-types.js';

/** 备份清单单条：记录覆盖前状态，回滚的唯一依据 */
export interface SwapBackupEntry {
  /** 工具侧目标绝对路径 */
  targetPath: string;
  kind: 'file' | 'dir';
  /** 切换前目标是否已存在(false=本次新增，回滚即移除) */
  previousExisted: boolean;
  /** 覆盖前备份在 files/<key>；新增项无备份 */
  backupKey?: string;
}

/** 一次切换的备份清单 */
export interface SwapBackupManifest {
  swapId: string;
  tool: string;
  createdAt: string;
  entries: SwapBackupEntry[];
}

/**
 * 递归列出目录下所有文件(绝对路径)，跳过以 . 开头的文件与目录。
 * 目录不存在返回空数组。
 */
export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  walk(dir, out);
  return out;
}

function walk(currentDir: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(currentDir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    } else {
      try {
        if (statSync(fullPath).isFile()) out.push(fullPath);
      } catch {
        // 忽略不可读条目
      }
    }
  }
}

/** 生成可排序的切换 id（时间戳前缀 + 随机后缀） */
export function makeSwapId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 覆盖前备份目标(文件或目录)到 <backupDir>/files/<index>。
 * 返回备份 key；符号链接先按解析后内容复制。
 */
export function backupTarget(targetPath: string, backupDir: string, index: number): string {
  const key = String(index);
  const dest = join(backupDir, 'files', key);
  ensureDir(join(backupDir, 'files'));
  copyRecursive(targetPath, dest);
  return key;
}

/**
 * 按清单条目恢复目标：
 * - 有备份 → 恢复覆盖前内容(目标是符号链接时先移除链接)
 * - 本次新增(无备份) → 移除目标
 */
export function restoreTarget(entry: SwapBackupEntry, backupDir: string): void {
  if (entry.backupKey !== undefined) {
    const src = join(backupDir, 'files', entry.backupKey);
    if (!existsSync(src)) {
      throw new Error(`备份缺失: ${src}`);
    }
    if (isSymlink(entry.targetPath)) safeRemove(entry.targetPath);
    copyRecursive(src, entry.targetPath);
    return;
  }
  if (!entry.previousExisted && existsSync(entry.targetPath)) {
    safeRemove(entry.targetPath);
  }
}

/** 备份清单是否存在 */
export function hasBackup(backupRoot: string, swapId: string): boolean {
  return existsSync(join(backupRoot, swapId, 'manifest.json'));
}

/** 写入备份清单 */
export function writeBackupManifest(backupDir: string, manifest: SwapBackupManifest): void {
  ensureDir(backupDir);
  writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

/** 读取备份清单；不存在或损坏返回 null */
export function readBackupManifest(backupDir: string): SwapBackupManifest | null {
  const file = join(backupDir, 'manifest.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as SwapBackupManifest;
  } catch {
    return null;
  }
}

/** 列出备份根下所有 <swapId> 目录名，按 id(时间戳前缀)倒序 */
export function listSwapBackupDirs(backupRoot: string): string[] {
  if (!existsSync(backupRoot)) return [];
  try {
    return readdirSync(backupRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a, 'en'));
  } catch {
    return [];
  }
}

/**
 * 保留策略：仅保留最近 retain 次备份目录，更早的删除。
 * 只清理备份目录内的 <swapId> 子目录，绝不触碰工具资产目录。
 */
export function pruneSwapBackups(backupRoot: string, retain: number): void {
  const dirs = listSwapBackupDirs(backupRoot);
  for (const name of dirs.slice(Math.max(retain, 1))) {
    safeRemove(join(backupRoot, name));
  }
}

/** 历史文件路径(存于备份根内，随备份目录一同受管) */
function historyFile(backupRoot: string): string {
  return join(backupRoot, 'history.json');
}

/** 读取切换历史(原始存储顺序) */
export function readHistory(backupRoot: string): SwapHistoryEntry[] {
  const file = historyFile(backupRoot);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
    return Array.isArray(parsed) ? (parsed as SwapHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** 追加一条切换历史(仅本机存储) */
export function appendHistory(backupRoot: string, entry: SwapHistoryEntry): void {
  const list = readHistory(backupRoot);
  list.push(entry);
  ensureDir(backupRoot);
  writeFileSync(historyFile(backupRoot), JSON.stringify(list, null, 2), 'utf-8');
}

/** 更新指定 swapId 的历史字段 */
export function updateHistory(
  backupRoot: string,
  swapId: string,
  patch: Partial<Pick<SwapHistoryEntry, 'rolledBack' | 'rollbackAvailable'>>,
): void {
  const list = readHistory(backupRoot);
  const target = list.find((e) => e.swapId === swapId);
  if (!target) return;
  Object.assign(target, patch);
  writeFileSync(historyFile(backupRoot), JSON.stringify(list, null, 2), 'utf-8');
}
