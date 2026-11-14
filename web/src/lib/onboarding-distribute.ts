/**
 * 分发四分类（add-zero-config-onboarding T5，纯逻辑无 React 依赖）
 *
 * spec Requirement 6.1 口径（只用 plan 与分发索引的事实，不猜「被手改」）：
 * - unchanged：计划 skip，或分发索引判定 synced（内容已一致，不计入前三类）
 * - create：目标不存在，将新建
 * - conflict：目标存在且分发索引判定 conflict（曾同步过、工具侧偏离）
 * - overwrite：其余已存在目标（此前未同步过的首次接管）
 */

import type { SyncPlan, SyncPlanItem, DistributionIndexResponse } from '@/types/api';

/** 分发动作四分类 */
export type DistributeAction = 'create' | 'overwrite' | 'conflict' | 'unchanged';

/** 影响清单中的单条文件 */
export interface DistributeFile {
  toolId: string;
  /** Hub 相对路径；计划未携带时回退为目标路径（保证清单可读） */
  hubPath: string;
  targetPath: string;
  action: DistributeAction;
}

/** 汇总：计数 + 文件清单 + 每工具待写入数 */
export interface DistributeSummary {
  counts: Record<DistributeAction, number>;
  files: DistributeFile[];
  /** toolId → 该工具待写入条目数（不含 unchanged） */
  byTool: Record<string, number>;
}

function emptyCounts(): Record<DistributeAction, number> {
  return { create: 0, overwrite: 0, conflict: 0, unchanged: 0 };
}

/** 查分发索引状态：索引不可用或资产不在索引时返回 undefined */
function lookupStatus(
  item: SyncPlanItem,
  distribution: DistributionIndexResponse | null,
): string | undefined {
  const hubRel = item.item.relativePath;
  if (!distribution || hubRel === '') return undefined;
  const entries = distribution.index[hubRel];
  if (!Array.isArray(entries)) return undefined;
  return entries.find((e) => e.toolId === item.target.tool)?.status;
}

/** 单条分类（spec 6.1） */
export function classifyDistributeItem(
  item: SyncPlanItem,
  distribution: DistributionIndexResponse | null,
): DistributeAction {
  if (item.action === 'skip') return 'unchanged';
  if (item.targetExists === false) return 'create';

  const status = lookupStatus(item, distribution);
  if (status === 'synced') return 'unchanged';
  if (status === 'conflict') return 'conflict';
  return 'overwrite';
}

/** 汇总已选工具的计划：计数、文件清单、每工具待写入数 */
export function summarizeDistribute(
  plans: SyncPlan[],
  distribution: DistributionIndexResponse | null,
): DistributeSummary {
  const counts = emptyCounts();
  const files: DistributeFile[] = [];
  const byTool: Record<string, number> = {};

  for (const plan of plans) {
    for (const item of plan.items) {
      const action = classifyDistributeItem(item, distribution);
      counts[action] += 1;
      if (action === 'unchanged') continue;
      files.push({
        toolId: plan.tool,
        hubPath: item.item.relativePath !== '' ? item.item.relativePath : item.target.targetPath,
        targetPath: item.target.targetPath,
        action,
      });
      byTool[plan.tool] = (byTool[plan.tool] ?? 0) + 1;
    }
  }

  return { counts, files, byTool };
}

/** 「新增 2 · 覆盖 3 · 冲突 1」——零值部分省略，全零返回空串 */
export function distributeCountsText(counts: Record<DistributeAction, number>): string {
  const parts: string[] = [];
  if (counts.create > 0) parts.push(`新增 ${counts.create}`);
  if (counts.overwrite > 0) parts.push(`覆盖 ${counts.overwrite}`);
  if (counts.conflict > 0) parts.push(`冲突 ${counts.conflict}`);
  return parts.join(' · ');
}
