/**
 * 重复治理：合并草案 / 归档式执行 / 可还原（add-asset-governance K3/K4/K5）
 *
 * spec: specs/duplicate-governance.spec.md Scenario 3/4/5/7
 * 纯逻辑：所有 IO 由 ports 注入，core 不直接碰 fs。
 * 归档只移动、不删除；失败逐项回报且不中断其余项。
 */

import { buildUnifiedDiff } from './unified-diff.js';

export type DuplicateGroupKind = 'exact' | 'near' | 'gray';

export type DuplicateMergeErrorCode =
  | 'EMPTY_MEMBERS'
  | 'KEEP_NOT_MEMBER'
  | 'GRAY_REQUIRES_CONFIRM';

export class DuplicateMergeError extends Error {
  readonly code: DuplicateMergeErrorCode;

  constructor(code: DuplicateMergeErrorCode, message: string) {
    super(message);
    this.name = 'DuplicateMergeError';
    this.code = code;
  }
}

export interface MergeDraftMember {
  hubRelativePath: string;
  content: string;
}

export interface MergeDraftInput {
  groupId: string;
  groupKind: DuplicateGroupKind;
  keepPath: string;
  members: MergeDraftMember[];
  /** 合并后的完整正文；缺省取保留项原文 */
  mergedContent?: string;
  /** 灰区组必须显式勾选才可生成草案（Scenario 7） */
  allowGray?: boolean;
}

export interface MergeDraft {
  groupId: string;
  groupKind: DuplicateGroupKind;
  keepPath: string;
  /** 待归档成员的原相对路径（不含保留项） */
  archivePaths: string[];
  content: string;
  unifiedDiff: string;
}

export interface DuplicateMergeBatchItem {
  path: string;
  archivePath: string;
  ok: boolean;
  reason?: string;
}

export interface DuplicateMergeBatch {
  batchId: string;
  groupId: string;
  groupKind: DuplicateGroupKind;
  date: string;
  createdAt: string;
  keepPath: string;
  /** 合并前保留项原文，用于还原 */
  keepContentBefore: string;
  mergedContent: string;
  archived: DuplicateMergeBatchItem[];
}

export interface MergeDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed' | 'unknown';
  reason?: string;
}

export interface DuplicateMergePorts {
  now(): Date;
  read(hubRelativePath: string): string | null;
  backup(hubRelativePath: string): string;
  write(hubRelativePath: string, content: string): void;
  archive(original: string, archived: string): void;
  /** 分发写库后的保留项；targets 缺省由实现侧决定（通常为已安装工具） */
  distribute(hubRelativePath: string, targets?: string[]): Promise<MergeDispatchItem[]>;
  saveBatch(batch: DuplicateMergeBatch): void;
}

export interface ApplyDuplicateMergeInput {
  draft: MergeDraft;
  batchId: string;
  date: string;
  distribute?: boolean;
  targets?: string[];
}

export interface ApplyDuplicateMergeResult {
  keep: { path: string; written: boolean; backupRef?: string; reason?: string };
  archived: DuplicateMergeBatchItem[];
  dispatch: MergeDispatchItem[];
  batch: DuplicateMergeBatch;
}

export interface UndoDuplicateMergePorts {
  /** 把归档文件移回原路径 */
  restoreArchived(archivedPath: string, originalPath: string): void;
  write(hubRelativePath: string, content: string): void;
}

export interface UndoDuplicateMergeResult {
  keep: { path: string; ok: boolean; reason?: string };
  archived: Array<{ path: string; ok: boolean; reason?: string }>;
}

/** 归档路径固定约定：<Hub>/.archive/duplicates/<日期>/<原相对路径> */
export function archivePathFor(hubRelativePath: string, date: string): string {
  return `.archive/duplicates/${date}/${hubRelativePath}`;
}

/** 生成合并草案：零写库，只算正文与 diff */
export function buildMergeDraft(input: MergeDraftInput): MergeDraft {
  const { groupId, groupKind, keepPath, members, mergedContent, allowGray } = input;
  if (members.length === 0) {
    throw new DuplicateMergeError('EMPTY_MEMBERS', '重复组没有任何成员');
  }
  if (groupKind === 'gray' && allowGray !== true) {
    throw new DuplicateMergeError('GRAY_REQUIRES_CONFIRM', '灰区组需显式勾选后才可生成合并草案');
  }
  const keep = members.find((member) => member.hubRelativePath === keepPath);
  if (keep === undefined) {
    throw new DuplicateMergeError('KEEP_NOT_MEMBER', `保留项不在该组内：${keepPath}`);
  }
  const others = members.filter((member) => member.hubRelativePath !== keepPath);
  const content = mergedContent ?? keep.content;
  const reference = others[0];
  const unifiedDiff =
    reference === undefined ? '' : buildUnifiedDiff(keepPath, reference.content, content);

  return {
    groupId,
    groupKind,
    keepPath,
    archivePaths: others.map((member) => member.hubRelativePath),
    content,
    unifiedDiff,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 归档式执行：写保留项（写前备份）→ 逐项归档 → 可选分发；逐项回报，失败不中断 */
export async function applyDuplicateMerge(
  input: ApplyDuplicateMergeInput,
  ports: DuplicateMergePorts,
): Promise<ApplyDuplicateMergeResult> {
  const { draft, batchId, date, distribute, targets } = input;
  const before = ports.read(draft.keepPath) ?? '';

  let backupRef: string | undefined;
  let written = false;
  let keepReason: string | undefined;
  try {
    backupRef = ports.backup(draft.keepPath);
    ports.write(draft.keepPath, draft.content);
    written = true;
  } catch (error) {
    keepReason = errorMessage(error);
  }

  const archived: DuplicateMergeBatchItem[] = [];
  for (const path of draft.archivePaths) {
    const target = archivePathFor(path, date);
    try {
      ports.archive(path, target);
      archived.push({ path, archivePath: target, ok: true });
    } catch (error) {
      archived.push({ path, archivePath: target, ok: false, reason: errorMessage(error) });
    }
  }

  let dispatch: MergeDispatchItem[] = [];
  if (distribute === true) {
    try {
      dispatch = await ports.distribute(draft.keepPath, targets);
    } catch (error) {
      dispatch = [{ tool: '*', action: 'failed', reason: errorMessage(error) }];
    }
  }

  const batch: DuplicateMergeBatch = {
    batchId,
    groupId: draft.groupId,
    groupKind: draft.groupKind,
    date,
    createdAt: ports.now().toISOString(),
    keepPath: draft.keepPath,
    keepContentBefore: before,
    mergedContent: draft.content,
    archived,
  };
  ports.saveBatch(batch);

  return {
    keep: {
      path: draft.keepPath,
      written,
      ...(backupRef === undefined ? {} : { backupRef }),
      ...(keepReason === undefined ? {} : { reason: keepReason }),
    },
    archived,
    dispatch,
    batch,
  };
}

/** 还原：归档成员移回原路径 → 保留项恢复合并前正文；失败逐条列出并继续 */
export function undoDuplicateMerge(
  batch: DuplicateMergeBatch,
  ports: UndoDuplicateMergePorts,
): UndoDuplicateMergeResult {
  const archived = batch.archived
    .filter((item) => item.ok)
    .map((item) => {
      try {
        ports.restoreArchived(item.archivePath, item.path);
        return { path: item.path, ok: true };
      } catch (error) {
        return { path: item.path, ok: false, reason: errorMessage(error) };
      }
    });

  let keepOk = true;
  let keepReason: string | undefined;
  try {
    ports.write(batch.keepPath, batch.keepContentBefore);
  } catch (error) {
    keepOk = false;
    keepReason = errorMessage(error);
  }

  return {
    keep: {
      path: batch.keepPath,
      ok: keepOk,
      ...(keepReason === undefined ? {} : { reason: keepReason }),
    },
    archived,
  };
}
