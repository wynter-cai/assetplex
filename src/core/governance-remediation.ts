/**
 * 一键整改计划（add-asset-governance I1）
 *
 * 纯函数：把诊断报告里的可修复问题按资产聚合成分批计划，零写库、零模型调用。
 * 不可修复项与环境条目不静默丢弃——逐条给出跳过原因。
 * 单批硬上限 20（proposal D3），超出部分明确提示「下一批」。
 *
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 * Scenario 7（先出计划）
 */

import type { DiagnosisIssue, DoctorAssetKind } from './types.js';
import { isCompletenessCriterion, type HealthDimensionId } from './governance-health.js';

/** 单批上限（服务端硬约束，不随客户端参数放宽） */
export const REMEDIATION_BATCH_LIMIT = 20;

export interface RemediationPlanRequest {
  kinds?: DoctorAssetKind[];
  dimension?: HealthDimensionId;
  /** 默认 20，服务端硬上限 20 */
  maxAssets?: number;
}

export interface RemediationPlanItem {
  id: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  /** 对应 DiagnosisReport.issues 下标 */
  issueIndexes: number[];
  issueSummary: string;
  severity: DiagnosisIssue['severity'];
  /** 0 = 全部命中草案缓存；1 = 需一次草案调用 */
  estimatedCalls: 0 | 1;
  cached: boolean;
}

export interface RemediationSkipItem {
  hubRelativePath: string;
  assetName: string;
  reason: string;
}

export interface RemediationPlan {
  items: RemediationPlanItem[];
  skipped: RemediationSkipItem[];
  totalAssets: number;
  estimatedCalls: number;
  truncated: boolean;
  batchLimit: number;
  generatedAt: string;
}

/** 计划输入：单资产诊断快照（报告 issues 保留下标以便生成草案时对齐） */
export interface RemediationAssetInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  name: string;
  /** 诊断报告 issues（index 即数组下标） */
  issues: DiagnosisIssue[];
  /** 该资产的修复草案是否已命中缓存（命中则不消耗模型调用） */
  cached: boolean;
  /** 环境条目（Hub 外，未入库）：不在库内整改范围 */
  external?: boolean;
}

const SEVERITY_RANK: Record<DiagnosisIssue['severity'], number> = { high: 0, medium: 1, low: 2 };

/** 维度能覆盖到哪些可修复问题；分发/唯一性维度没有可自动修复项 */
function matchesDimension(dimension: HealthDimensionId, issue: DiagnosisIssue): boolean {
  if (dimension === 'quality') return true;
  if (dimension === 'completeness') return isCompletenessCriterion(issue.criterion);
  return false;
}

function worstSeverity(issues: DiagnosisIssue[]): DiagnosisIssue['severity'] {
  return issues.reduce<DiagnosisIssue['severity']>(
    (worst, issue) => (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[worst] ? issue.severity : worst),
    'low',
  );
}

function summarize(issues: DiagnosisIssue[]): string {
  const head = issues[0]?.finding ?? '';
  return issues.length > 1 ? `${head} 等 ${issues.length} 项` : head;
}

/**
 * 生成整改计划。
 *
 * 参与计划的条件：库内资产 + 至少一个 `fixable=true` 且命中维度筛选的问题。
 * 全不需要模型的资产 `estimatedCalls=0`，缓存命中在计划页显示「不消耗」。
 */
export function buildRemediationPlan(
  assets: RemediationAssetInput[],
  options: RemediationPlanRequest & { now?: () => string } = {},
): RemediationPlan {
  const now = (options.now ?? (() => new Date().toISOString()))();
  const limit = Math.max(1, Math.min(options.maxAssets ?? REMEDIATION_BATCH_LIMIT, REMEDIATION_BATCH_LIMIT));
  const skipped: RemediationSkipItem[] = [];
  const candidates: Array<{ item: RemediationPlanItem; selected: DiagnosisIssue[] }> = [];

  for (const asset of assets) {
    if (options.kinds !== undefined && !options.kinds.includes(asset.kind)) continue;
    if (asset.external === true) {
      skipped.push({
        hubRelativePath: asset.hubRelativePath,
        assetName: asset.name,
        reason: '环境条目（未入库），不在库内整改范围',
      });
      continue;
    }

    const selectedIndexes: number[] = [];
    const selected: DiagnosisIssue[] = [];
    asset.issues.forEach((issue, index) => {
      if (!issue.fixable) return;
      if (options.dimension !== undefined && !matchesDimension(options.dimension, issue)) return;
      selectedIndexes.push(index);
      selected.push(issue);
    });

    if (selected.length === 0) {
      if (asset.issues.length > 0) {
        skipped.push({
          hubRelativePath: asset.hubRelativePath,
          assetName: asset.name,
          reason: '仅建议，需人工判断',
        });
      }
      continue;
    }

    candidates.push({
      selected,
      item: {
        id: `${asset.kind}:${asset.hubRelativePath}`,
        kind: asset.kind,
        hubRelativePath: asset.hubRelativePath,
        assetName: asset.name,
        issueIndexes: selectedIndexes,
        issueSummary: summarize(selected),
        severity: worstSeverity(selected),
        estimatedCalls: asset.cached ? 0 : 1,
        cached: asset.cached,
      },
    });
  }

  candidates.sort(
    (a, b) =>
      SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity] ||
      a.item.assetName.localeCompare(b.item.assetName) ||
      a.item.hubRelativePath.localeCompare(b.item.hubRelativePath),
  );

  const ordered = candidates.map((c) => c.item);
  const kept = ordered.slice(0, limit);
  for (const item of ordered.slice(limit)) {
    skipped.push({
      hubRelativePath: item.hubRelativePath,
      assetName: item.assetName,
      reason: `超出单批上限（${limit}），请在下一批处理`,
    });
  }

  return {
    items: kept,
    skipped,
    totalAssets: kept.length,
    estimatedCalls: kept.reduce((sum, item) => sum + item.estimatedCalls, 0),
    truncated: ordered.length > limit,
    batchLimit: limit,
    generatedAt: now,
  };
}
