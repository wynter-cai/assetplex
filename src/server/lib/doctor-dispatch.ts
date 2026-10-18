/**
 * 医生分发端口 Node 实现（add-asset-doctor F3）
 *
 * 分发不自建通道（proposal D2）：逐工具走 swap 单资产预览-执行链路
 * （onlyHubRelativePaths）。differs 项自动置 overwrite=true——用户在 apply
 * 一屏确认框（Scenario 2）已对该资产覆盖看过 diff，等价显式确认；范围外资产绝不置位。
 * 全程本机执行，零网络（Scenario 9）。
 */

import type { SwapEngine, SwapPreview } from '../../core/swap.js';
import type { DoctorDispatchItem } from '../../core/doctor-apply.js';

export interface DispatchDeps {
  getSwapEngine: () => SwapEngine;
  /** 已安装工具名清单（adapter.detect 判定） */
  listInstalledTools: () => Promise<string[]>;
}

/** 单资产在预览中的文件级条目（路径精确匹配；技能子文件随单元执行，不在 overwrite 面扩大） */
function itemsOfPath(preview: SwapPreview, hubRelativePath: string) {
  return preview.groups.flatMap((g) => g.items).filter((i) => i.hubRelativePath === hubRelativePath);
}

/**
 * 分发一个资产到单个工具：预览 → 单资产范围执行 → 聚合为一个 DoctorDispatchItem。
 * swap 抛错（staleness/未注册等）不在这里吞——由 applyAssetFix 统一 catch 成 failed 项。
 */
export async function dispatchToolViaSwap(
  deps: DispatchDeps,
  tool: string,
  hubRelativePath: string,
): Promise<DoctorDispatchItem> {
  const engine = deps.getSwapEngine();
  const preview = await engine.preview(tool);
  if (!preview.toolInstalled) {
    return { tool, action: 'skipped', reason: '工具未安装' };
  }
  const mine = itemsOfPath(preview, hubRelativePath);
  if (mine.length === 0) {
    return { tool, action: 'skipped', reason: '此工具不支持该资产类别或库内无该资产' };
  }
  const overwriteDecisions = mine
    .filter((i) => i.conflict === 'differs')
    .map((i) => ({ hubRelativePath: i.hubRelativePath, overwrite: true }));

  const result = await engine.execute({
    tool,
    previewGeneratedAt: preview.generatedAt,
    overwriteDecisions,
    onlyHubRelativePaths: [hubRelativePath],
  });
  const failed = result.items.filter((i) => i.action === 'failed');
  if (failed.length > 0) {
    return { tool, action: 'failed', reason: failed.map((f) => f.reason ?? '写入失败').join('; ') };
  }
  if (result.counts.written > 0) {
    return { tool, action: 'written', swapId: result.swapId };
  }
  const skipReason = result.items.find((i) => i.reason !== undefined)?.reason;
  return { tool, action: 'skipped', reason: skipReason ?? '目标已一致，无需写入' };
}

/**
 * 缺省分发目标：「已安装该资产」的工具 = 已安装且预览中该路径 conflict ∈ exists/differs。
 * conflict=none（工具尚无此资产）不计入——新投放需用户在确认框里显式勾选。
 */
export async function resolveDefaultTargets(deps: DispatchDeps, hubRelativePath: string): Promise<string[]> {
  const engine = deps.getSwapEngine();
  const out: string[] = [];
  for (const tool of await deps.listInstalledTools()) {
    try {
      const preview = await engine.preview(tool);
      const installed = preview.groups
        .flatMap((g) => g.items)
        .some((i) => i.hubRelativePath === hubRelativePath && (i.conflict === 'exists' || i.conflict === 'differs'));
      if (installed) out.push(tool);
    } catch {
      // 预览失败的工具不计入默认目标（用户仍可在确认框显式选择后由 targets 传入）
    }
  }
  return out;
}
