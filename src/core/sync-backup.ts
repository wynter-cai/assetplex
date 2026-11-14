/**
 * 分发前备份（add-zero-config-onboarding T6）
 *
 * 复用 swap-fs 的备份语义：覆盖前把工具侧原文件复制到
 * <Hub>/.backups/onboarding/<swapId>/files/<index>，写 manifest.json 可追溯，
 * 保留最近 3 批（与 swap backupRetain 默认一致）。
 * 没有需要备份的目标时返回 null，绝不创建空目录（取消零改动的前提）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backupTarget, makeSwapId, pruneSwapBackups } from './swap-fs.js';
import type { SyncPlan } from './types.js';

/** 备份保留批次数（与 swap/doctor 的 backupRetain 默认一致） */
const BACKUP_RETAIN = 3;

/** 备份清单条目（manifest.json 内） */
export interface SyncBackupEntry {
  tool: string;
  /** Hub 相对路径；计划未携带时为空串 */
  hubPath: string;
  targetPath: string;
  /** 备份在 files/<key> */
  backupKey: string;
}

export interface SyncBackupResult {
  swapId: string;
  entries: SyncBackupEntry[];
  /** 单个目标备份失败的警告（备份失败不阻断同步，但必须可见） */
  warnings: string[];
}

/**
 * 从同步计划提取「将覆盖的已存在目标」并备份。
 * 口径：action !== 'skip' 且 targetExists === true（symlink 语义由 backupTarget 处理）。
 */
export function backupSyncTargets(plans: SyncPlan[], backupRoot: string): SyncBackupResult | null {
  const candidates: Array<{ plan: SyncPlan['items'][number]; tool: string }> = [];
  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.action !== 'skip' && item.targetExists === true) {
        candidates.push({ plan: item, tool: plan.tool });
      }
    }
  }
  if (candidates.length === 0) return null;

  const swapId = makeSwapId();
  const backupDir = join(backupRoot, swapId);
  const entries: SyncBackupEntry[] = [];
  const warnings: string[] = [];

  candidates.forEach((candidate, index) => {
    const key = String(index);
    try {
      backupTarget(candidate.plan.target.targetPath, backupDir, index);
      entries.push({
        tool: candidate.tool,
        hubPath: candidate.plan.item.relativePath ?? '',
        targetPath: candidate.plan.target.targetPath,
        backupKey: key,
      });
    } catch (err) {
      warnings.push(`${candidate.plan.target.targetPath}: 备份失败 ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  if (entries.length === 0) {
    // 全部备份失败：不留半截批次目录，让上层如实报告
    return { swapId, entries, warnings };
  }

  try {
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(
      join(backupDir, 'manifest.json'),
      JSON.stringify({ swapId, createdAt: new Date().toISOString(), entries }, null, 2) + '\n',
      'utf-8',
    );
  } catch (err) {
    warnings.push(`manifest 写入失败 ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    pruneSwapBackups(backupRoot, BACKUP_RETAIN);
  } catch {
    // 清理失败不影响本次备份
  }

  return { swapId, entries, warnings };
}
