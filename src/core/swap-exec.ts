/**
 * swap 执行编排（单元级落盘 + 覆盖前备份）
 *
 * 写入粒度与适配器 resolveHubItems 的 (item, target) 单元对齐：
 * - 目标不存在 → 整单元走 adapter.apply(尊重 symlink/copy 策略)，计新增，不备份；
 * - 目标已存在 → 逐文件处理(目录不整体替换)，只动"新增文件"与"已确认覆盖的 differs"，
 *   覆盖前先备份，未确认项保持原样。
 */

import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { copyRecursive, ensureDir, isSymlink, safeRemove } from '../utils/fs.js';
import type { HubItem, SyncTarget } from './types.js';
import type { ToolAdapter } from './adapters/base.js';
import type { SwapItemResult, SwapPreviewItem } from './swap-types.js';
import { backupTarget, type SwapBackupEntry } from './swap-fs.js';

/** 写入单元：一次 adapter.apply 或逐文件落盘的最小粒度 */
export interface WriteUnit {
  item: HubItem;
  target: SyncTarget;
  /** 预览展开出的文件级条目 */
  entries: Array<{ preview: SwapPreviewItem; sourcePath: string }>;
}

/** 一次 execute 的共享上下文 */
export interface ExecContext {
  adapter: ToolAdapter;
  /** 本次切换的备份目录 .swap-backup/<swapId>/ */
  backupDir: string;
  /** hubRelativePath → 是否确认覆盖 */
  decisions: Map<string, boolean>;
  /** 备份清单条目(执行过程中追加) */
  manifest: SwapBackupEntry[];
  /** 本次执行新建的目录(已记入清单，去重用) */
  createdDirs: Set<string>;
  /** 逐资产结果 */
  results: SwapItemResult[];
  counts: { written: number; skipped: number; failed: number };
}

type UnitEntry = WriteUnit['entries'][number];

function recordWritten(ctx: ExecContext, entry: UnitEntry): void {
  ctx.results.push({
    hubRelativePath: entry.preview.hubRelativePath,
    category: entry.preview.category,
    action: 'written',
  });
  ctx.counts.written++;
}

function recordSkipped(ctx: ExecContext, entry: UnitEntry, reason: string): void {
  ctx.results.push({
    hubRelativePath: entry.preview.hubRelativePath,
    category: entry.preview.category,
    action: 'skipped',
    reason,
  });
  ctx.counts.skipped++;
}

function recordFailed(ctx: ExecContext, entry: UnitEntry, reason: string): void {
  ctx.results.push({
    hubRelativePath: entry.preview.hubRelativePath,
    category: entry.preview.category,
    action: 'failed',
    reason,
  });
  ctx.counts.failed++;
}

/**
 * 逐文件写入源内容到目标路径。
 * 目标是符号链接时先移除链接，避免 copyFileSync 穿透链接改写他处文件。
 * 返回本次写入最新建的祖先目录(全部已存在时返回 null)，供回滚时一并清除。
 */
function writeFileToTarget(sourcePath: string, targetPath: string): string | null {
  if (isSymlink(targetPath)) safeRemove(targetPath);
  const missing: string[] = [];
  let dir = dirname(targetPath);
  while (!existsSync(dir)) {
    missing.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  ensureDir(dirname(targetPath));
  copyRecursive(sourcePath, targetPath);
  return missing.length > 0 ? missing[missing.length - 1] : null;
}

/** 本次新建的目录记入清单(kind=dir, previousExisted=false)，回滚倒序时先删文件后删目录 */
function recordCreatedDir(ctx: ExecContext, createdDir: string | null): void {
  if (createdDir === null || ctx.createdDirs.has(createdDir)) return;
  ctx.createdDirs.add(createdDir);
  ctx.manifest.push({ targetPath: createdDir, kind: 'dir', previousExisted: false });
}

/** 整单元走 adapter.apply 的新增投放(目标原本不存在) */
async function applyUnitAsNew(ctx: ExecContext, unit: WriteUnit): Promise<void> {
  try {
    await ctx.adapter.apply(unit.item, unit.target);
  } catch (err) {
    for (const e of unit.entries) recordFailed(ctx, e, (err as Error).message);
    return;
  }
  ctx.manifest.push({
    targetPath: unit.target.targetPath,
    kind: unit.target.isDirectory ? 'dir' : 'file',
    previousExisted: false,
  });
  for (const e of unit.entries) recordWritten(ctx, e);
}

/** 覆盖一个已存在且内容不同的目标：先备份，再落盘新内容 */
async function overwriteWithBackup(
  ctx: ExecContext,
  unit: WriteUnit,
  entry: UnitEntry,
  useApply: boolean,
): Promise<void> {
  const p = entry.preview;
  try {
    const backupKey = backupTarget(p.targetPath, ctx.backupDir, ctx.manifest.length);
    if (useApply) {
      await ctx.adapter.apply(unit.item, unit.target);
    } else {
      recordCreatedDir(ctx, writeFileToTarget(entry.sourcePath, p.targetPath));
    }
    ctx.manifest.push({ targetPath: p.targetPath, kind: 'file', previousExisted: true, backupKey });
    recordWritten(ctx, entry);
  } catch (err) {
    recordFailed(ctx, entry, (err as Error).message);
  }
}

/** 目录级单元(目标已存在)：逐文件处理，不整体替换目录 */
async function executeDirEntriesExistingTarget(ctx: ExecContext, unit: WriteUnit): Promise<void> {
  for (const e of unit.entries) {
    const p = e.preview;
    if (p.conflict === 'exists') {
      recordSkipped(ctx, e, '目标已一致，无需写入');
      continue;
    }
    if (p.conflict === 'none') {
      try {
        recordCreatedDir(ctx, writeFileToTarget(e.sourcePath, p.targetPath));
        ctx.manifest.push({ targetPath: p.targetPath, kind: 'file', previousExisted: false });
        recordWritten(ctx, e);
      } catch (err) {
        recordFailed(ctx, e, (err as Error).message);
      }
      continue;
    }
    // differs：仅显式确认覆盖才写入
    if (ctx.decisions.get(p.hubRelativePath) !== true) {
      recordSkipped(ctx, e, '冲突未确认覆盖，保持原样');
      continue;
    }
    await overwriteWithBackup(ctx, unit, e, false);
  }
}

/** 文件级单元：单目标走 adapter.apply(插值等适配器逻辑由其内部处理) */
async function executeFileUnit(ctx: ExecContext, unit: WriteUnit): Promise<void> {
  for (const e of unit.entries) {
    const p = e.preview;
    const targetNow = existsSync(p.targetPath);

    if (!targetNow) {
      await applyUnitAsNew(ctx, { ...unit, entries: [e] });
      continue;
    }
    if (p.conflict === 'exists') {
      recordSkipped(ctx, e, '目标已一致，无需写入');
      continue;
    }
    if (p.conflict === 'none') {
      // 预览后目标被外部创建：未经确认不动它
      recordSkipped(ctx, e, '目标已存在且未经确认，保持原样');
      continue;
    }
    if (ctx.decisions.get(p.hubRelativePath) !== true) {
      recordSkipped(ctx, e, '冲突未确认覆盖，保持原样');
      continue;
    }
    await overwriteWithBackup(ctx, unit, e, true);
  }
}

/** 执行一个写入单元(T4)；验证结论由 T5 在 execute 层补充 */
export async function executeUnit(ctx: ExecContext, unit: WriteUnit): Promise<void> {
  if (unit.entries.length === 0) return;
  if (unit.target.isDirectory && !existsSync(unit.target.targetPath)) {
    await applyUnitAsNew(ctx, unit);
    return;
  }
  if (unit.target.isDirectory) {
    await executeDirEntriesExistingTarget(ctx, unit);
    return;
  }
  await executeFileUnit(ctx, unit);
}
