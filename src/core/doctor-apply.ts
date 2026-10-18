/**
 * 应用修复编排（add-asset-doctor F3 core）
 *
 * 一次用户确认（fix spec Scenario 2 / proposal D4）后的执行序：备份 → 写库 → 逐工具分发。
 * 信任红线（D2）：本模块只被 apply 路由在用户显式确认后调用，模型永不触达这里；
 * 分发不自建通道——端口实现层复用 swap 单资产预览-执行链路（onlyHubRelativePaths）。
 * 备份/写库/分发全部注入端口，core 不碰 fs（同诊断惯例，Node 实现在 server 层）。
 *
 * spec: 设计文档/changes/add-asset-doctor/specs/fix-and-distribute.spec.md
 */

import type { DoctorAssetKind } from './types.js';

/** 单工具分发结果（契约 api-contract.ts DoctorDispatchItem；swapId 供回滚入口引用） */
export interface DoctorDispatchItem {
  tool: string;
  action: 'written' | 'skipped' | 'failed';
  reason?: string;
  swapId?: string;
}

/** 资产文件读取失败（路由映射 404） */
export class ApplyAssetError extends Error {
  constructor(path: string) {
    super(`资产文件不可读：${path}`);
    this.name = 'ApplyAssetError';
  }
}

/** 备份缺失或 ref 非法（撤销入口映射 404，文案含「备份」便于用户理解保留策略） */
export class UndoBackupError extends Error {
  constructor(ref: string) {
    super(`备份记录不存在或已被保留策略清理：${ref}`);
    this.name = 'UndoBackupError';
  }
}

export interface ApplyFixInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  /** 最终采纳内容（可能经用户编辑）；以用户版本为准，服务端不比对草案哈希 */
  finalContent: string;
  /** false = 只改库不分发（Scenario 6） */
  distribute: boolean;
  /** distribute=true 时的目标工具；缺省 = 已安装该资产的全部工具 */
  targets?: string[];
}

export interface DoctorApplyPorts {
  /** 读当前库内内容（存在性前置守卫） */
  read(hubRelativePath: string): string | null;
  /** 覆盖前把当前文件存入备份区，返回 backupRef（Scenario 3 撤销依据） */
  backup(hubRelativePath: string): string;
  /** 写库（含 Hub 越界守卫，走各类别既有写库路径） */
  write(hubRelativePath: string, content: string): void;
  /** 解析「已安装该资产的工具」（基于 swap 支持矩阵与预览判定） */
  defaultTargets(hubRelativePath: string): Promise<string[]>;
  /** 单工具分发：swap 单资产预览-执行通道，失败可 throw（聚合为 failed 项） */
  dispatchTool(tool: string, hubRelativePath: string): Promise<DoctorDispatchItem>;
}

export interface DoctorApplyResult {
  saved: true;
  backupRef: string;
  dispatch: DoctorDispatchItem[];
  /** 任一工具写成功即 true（Scenario 5：整体回滚入口只对成功分发项有意义） */
  rollbackAvailable: boolean;
}

/**
 * 应用一次修复：备份先于写库；写库失败即中止（不冒充分发）；
 * 分发逐工具独立执行、独立成败（Scenario 4：某工具失败不影响其他工具）。
 */
export async function applyAssetFix(input: ApplyFixInput, ports: DoctorApplyPorts): Promise<DoctorApplyResult> {
  if (ports.read(input.hubRelativePath) === null) {
    throw new ApplyAssetError(input.hubRelativePath);
  }
  const backupRef = ports.backup(input.hubRelativePath);
  ports.write(input.hubRelativePath, input.finalContent);

  if (!input.distribute) {
    return { saved: true, backupRef, dispatch: [], rollbackAvailable: false };
  }

  const targets = input.targets !== undefined && input.targets.length > 0
    ? input.targets
    : await ports.defaultTargets(input.hubRelativePath);

  const dispatch: DoctorDispatchItem[] = [];
  for (const tool of targets) {
    try {
      dispatch.push(await ports.dispatchTool(tool, input.hubRelativePath));
    } catch (err) {
      dispatch.push({ tool, action: 'failed', reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return {
    saved: true,
    backupRef,
    dispatch,
    rollbackAvailable: dispatch.some((d) => d.action === 'written'),
  };
}

export interface UndoApplyPorts {
  /** 按 backupRef 取回旧版；不存在返回 null */
  readBackup(backupRef: string): { hubRelativePath: string; content: string } | null;
  /** 写回库内原路径（同 apply 的写库通道） */
  write(hubRelativePath: string, content: string): void;
}

/**
 * 撤销本次修复：库内恢复旧版（Scenario 3）。
 * 分发侧回滚不在这里——那是 swap 既有 rollback（dispatch[].swapId 逐项可回）。
 */
export async function undoApplyFix(
  backupRef: string,
  ports: UndoApplyPorts,
): Promise<{ restored: true; hubRelativePath: string }> {
  const entry = ports.readBackup(backupRef);
  if (entry === null) throw new UndoBackupError(backupRef);
  ports.write(entry.hubRelativePath, entry.content);
  return { restored: true, hubRelativePath: entry.hubRelativePath };
}
