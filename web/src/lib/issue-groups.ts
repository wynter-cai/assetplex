/**
 * 体检问题分组（add-zero-config-onboarding 走查）
 *
 * 治理接口按维度返回问题，同一类问题（如 frontmatter 缺 name）会重复出现。
 * 展示层按「标题 + 资产类型」聚合成一类，避免用户看到一屏同样的描述。
 */

import type { DiagnosisSeverity, HealthIssueRef } from '@/types/api';

export type IssueWithDimension = HealthIssueRef & { dimensionLabel: string };

export interface IssueGroup {
  key: string;
  title: string;
  kind: HealthIssueRef['kind'];
  /** 组内最高严重度 */
  severity: DiagnosisSeverity;
  dimensionLabel: string;
  assets: HealthIssueRef[];
  fixableCount: number;
}

const SEVERITY_ORDER: Record<DiagnosisSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** 按严重度从高到低、同级别按影响资产数从多到少排序 */
export function groupHealthIssues(entries: IssueWithDimension[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.title}`;
    const existing = map.get(key);
    if (existing !== undefined) {
      existing.assets.push(entry);
      if (SEVERITY_ORDER[entry.severity] < SEVERITY_ORDER[existing.severity]) {
        existing.severity = entry.severity;
      }
      if (entry.fixable) existing.fixableCount += 1;
      continue;
    }
    map.set(key, {
      key,
      title: entry.title,
      kind: entry.kind,
      severity: entry.severity,
      dimensionLabel: entry.dimensionLabel,
      assets: [entry],
      fixableCount: entry.fixable ? 1 : 0,
    });
  }

  return [...map.values()].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.assets.length - a.assets.length;
  });
}

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
}

/** 严重度计数（用于卡片头部的分布摘要） */
export function countBySeverity(items: Array<Pick<HealthIssueRef, 'severity'>>): SeverityCounts {
  const counts: SeverityCounts = { high: 0, medium: 0, low: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}
