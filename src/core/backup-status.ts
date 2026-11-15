/**
 * 备份时间探测（refactor-home-action-panel T1）
 *
 * 首页状态条「上次备份」的唯一真值来源：只读扫描 Hub 内三个备份根目录
 * （`.doctor-backup/`、`.swap-backup/`、`.backups/onboarding/`），取最新一批的时间。
 *
 * 口径（spec home-dashboard Requirement 1 / 6）：
 * - 三处都不存在 → `none`（从未备份，不填 0、不猜时间）
 * - 目录存在但读取异常 → `unavailable`（不返回半份时间）
 * - 只读目录名（时间戳编码）与单个元数据文件，不递归、不读备份正文
 *
 * 纯逻辑与 fs 端口分离：`detectLatestBackup` 只依赖注入端口，便于测试。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHubRoot } from '../utils/paths.js';

export type BackupState = 'recorded' | 'none' | 'unavailable';

/** 首页状态条需要的备份状态（null 表示没有可用时间） */
export interface BackupStatus {
  state: BackupState;
  lastBackupAt: string | null;
}

/** 一个备份根目录的读取描述 */
export interface BackupRootSpec {
  /** 备份来源标识（doctor / asset-write / onboarding） */
  id: string;
  /** Hub 相对路径（POSIX 风格） */
  relativeRoot: string;
  /** 该备份区的元数据文件名 */
  metadataFile: string;
}

/** 三个备份根目录（与 doctor-backup / asset-write / sync-backup 的实现目录一致） */
export const BACKUP_ROOTS: readonly BackupRootSpec[] = [
  { id: 'doctor', relativeRoot: '.doctor-backup', metadataFile: 'meta.json' },
  { id: 'asset-write', relativeRoot: '.swap-backup', metadataFile: 'manifest.json' },
  { id: 'onboarding', relativeRoot: '.backups/onboarding', metadataFile: 'manifest.json' },
];

/** 文件系统端口：只暴露探测所需的最小能力 */
export interface BackupFsPort {
  /** 列出备份根下的子目录名；根不存在返回 null，读取失败抛错 */
  listBackupDirs(relativeRoot: string): string[] | null;
  /** 读取备份目录内元数据文件文本；不存在返回 null */
  readMetadata(relativeRoot: string, backupId: string, fileName: string): string | null;
}

/** 备份目录名闭集：makeAssetWriteId 的「时间戳-base36」形态 */
const BACKUP_ID_PATTERN = /^(\d{10,})(?:-[a-z0-9]+)?$/i;

/** 从备份目录名提取时间戳（毫秒）；无法识别返回 null（不猜） */
function timestampFromId(backupId: string): number | null {
  const matched = BACKUP_ID_PATTERN.exec(backupId);
  if (matched === null) return null;
  const timestamp = Number(matched[1]);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

/** 取某备份根下最新的一批（按目录名时间戳） */
function newestBackupId(backupIds: readonly string[]): { id: string; at: number } | null {
  let newest: { id: string; at: number } | null = null;
  for (const id of backupIds) {
    const at = timestampFromId(id);
    if (at === null) continue;
    if (newest === null || at > newest.at) newest = { id, at };
  }
  return newest;
}

/** 元数据 createdAt（更精确）；缺失或损坏返回 null，由目录名时间戳兜底 */
function createdAtFromMetadata(text: string | null): number | null {
  if (text === null) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const createdAt = (raw as Record<string, unknown>).createdAt;
    if (typeof createdAt !== 'string') return null;
    const timestamp = Date.parse(createdAt);
    return Number.isNaN(timestamp) ? null : timestamp;
  } catch {
    return null;
  }
}

/** 读某备份根最新一批的时间戳；无可用批次返回 null */
function latestInRoot(fs: BackupFsPort, root: BackupRootSpec): number | null {
  const backupIds = fs.listBackupDirs(root.relativeRoot);
  if (backupIds === null || backupIds.length === 0) return null;
  const newest = newestBackupId(backupIds);
  if (newest === null) return null;
  let metadataText: string | null;
  try {
    metadataText = fs.readMetadata(root.relativeRoot, newest.id, root.metadataFile);
  } catch {
    metadataText = null;
  }
  return createdAtFromMetadata(metadataText) ?? newest.at;
}

/**
 * 探测三个备份根目录中最新的备份时间。
 *
 * 任一目录读取异常即整体 unavailable：此时无法断言「最新」是哪一次，
 * 给出一个可能是旧值的时间等于撒谎。
 */
export function detectLatestBackup(
  fs: BackupFsPort,
  roots: readonly BackupRootSpec[] = BACKUP_ROOTS,
): BackupStatus {
  let latest: number | null = null;
  let failed = false;

  for (const root of roots) {
    let at: number | null;
    try {
      at = latestInRoot(fs, root);
    } catch {
      failed = true;
      continue;
    }
    if (at !== null && (latest === null || at > latest)) latest = at;
  }

  if (failed) return { state: 'unavailable', lastBackupAt: null };
  if (latest === null) return { state: 'none', lastBackupAt: null };
  return { state: 'recorded', lastBackupAt: new Date(latest).toISOString() };
}

/** 真实的 node fs 端口（只读） */
function nodeBackupFs(hubRoot: string): BackupFsPort {
  const rootPath = (relativeRoot: string): string => join(hubRoot, ...relativeRoot.split('/'));
  return {
    listBackupDirs(relativeRoot) {
      const dir = rootPath(relativeRoot);
      if (!existsSync(dir)) return null;
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    },
    readMetadata(relativeRoot, backupId, fileName) {
      if (!BACKUP_ID_PATTERN.test(backupId)) return null;
      const file = join(rootPath(relativeRoot), backupId, fileName);
      if (!existsSync(file)) return null;
      try {
        return readFileSync(file, 'utf-8');
      } catch {
        return null;
      }
    },
  };
}

/** 读真实 Hub 的备份状态（首页路由使用） */
export function readBackupStatus(hubRoot: string = getHubRoot()): BackupStatus {
  return detectLatestBackup(nodeBackupFs(hubRoot));
}
