/**
 * 医生库内备份区（add-asset-doctor F3）
 *
 * 应用修复前的旧版快照：<Hub>/.doctor-backup/<backupId>/{meta.json, files/0}。
 * 备份与保留策略复用 swap 语义（backupTarget/pruneSwapBackups，保留 3 次），
 * 但独立目录、不写 swap 历史——医生撤销与工具切换回滚是两本账，互不污染。
 * 仅本机文件操作（宪法②）。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getHubRoot } from '../utils/paths.js';
import { backupTarget, makeSwapId, pruneSwapBackups } from './swap-fs.js';

/** 备份保留次数（与 swap backupRetain 默认一致） */
export const DOCTOR_BACKUP_RETAIN = 3;

/** backupId 闭集形态：makeSwapId 的「时间戳-base36」，杜绝穿越类 ref */
const BACKUP_ID_PATTERN = /^[0-9]+-[a-z0-9]+$/i;

interface DoctorBackupMeta {
  hubRelativePath: string;
  createdAt: string;
}

function doctorBackupRoot(): string {
  return resolve(getHubRoot(), '.doctor-backup');
}

/** Hub 内路径守卫（路由已守卫，此处为写链路兜底）：绝对路径/越界拒绝 */
function assertHubInternal(hubRelativePath: string): string {
  const hubRoot = getHubRoot();
  const full = resolve(hubRoot, hubRelativePath);
  if (full === hubRoot || !full.startsWith(hubRoot + sep)) {
    throw new Error(`无法备份：路径不在 Hub 内：${hubRelativePath}`);
  }
  return full;
}

/**
 * 覆盖前备份一个 Hub 文件，返回 backupRef（撤销依据）。
 * 文件不存在即 throw——绝不留下半份备份目录。
 */
export function backupHubFileForDoctor(hubRelativePath: string): string {
  const full = assertHubInternal(hubRelativePath);
  if (!existsSync(full)) {
    throw new Error(`无法备份：文件不存在：${hubRelativePath}`);
  }
  const backupId = makeSwapId();
  const backupDir = join(doctorBackupRoot(), backupId);
  backupTarget(full, backupDir, 0);
  const meta: DoctorBackupMeta = { hubRelativePath, createdAt: new Date().toISOString() };
  writeFileSync(join(backupDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  pruneSwapBackups(doctorBackupRoot(), DOCTOR_BACKUP_RETAIN);
  return backupId;
}

/** 按 backupRef 取回旧版；id 非法/备份缺失（如被保留策略清理）返回 null */
export function readDoctorBackup(backupId: string): { hubRelativePath: string; content: string } | null {
  if (!BACKUP_ID_PATTERN.test(backupId)) return null;
  const backupDir = join(doctorBackupRoot(), backupId);
  const metaFile = join(backupDir, 'meta.json');
  const contentFile = join(backupDir, 'files', '0');
  if (!existsSync(metaFile) || !existsSync(contentFile)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaFile, 'utf-8')) as Partial<DoctorBackupMeta>;
    if (typeof meta.hubRelativePath !== 'string' || meta.hubRelativePath === '') return null;
    return { hubRelativePath: meta.hubRelativePath, content: readFileSync(contentFile, 'utf-8') };
  } catch {
    return null;
  }
}
