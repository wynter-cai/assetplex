/**
 * 质量中心概览聚类（refactor-governance-center T2）
 *
 * 纯函数：把四个维度的问题按「问题类型」聚成一条，回答「哪类问题最多、先改哪类」。
 * 待处理总数不由聚类相加得出，直接取首页待办同源总数，避免两个数字打架。
 *
 * 降级口径：快照层暂不携带规则编号与置信度（规则集接入后由 findings 补齐），
 * 故本轮按归一化标题聚类，keySource='title' 如实标注，不伪造 ruleId。
 */

import type { DiagnosisConfidence, DiagnosisSeverity, FindingSource, RuleCategory, RuleMode } from './types.js';
import type { GovernanceHealth, HealthIssueRef } from './governance-health.js';

export type ClusterKeySource = 'rule' | 'title';

export interface QualityClusterAssetRef {
  hubRelativePath: string;
  assetName: string;
  kind: HealthIssueRef['kind'];
  severity: DiagnosisSeverity;
  confidence: DiagnosisConfidence;
  source: FindingSource;
  fixable: boolean;
  ignored: boolean;
  deepLink: string;
}

export interface QualityIssueCluster {
  key: string;
  keySource: ClusterKeySource;
  ruleId: string | null;
  title: string;
  category: RuleCategory;
  severity: DiagnosisSeverity;
  mode: RuleMode;
  assetCount: number;
  hitCount: number;
  severityDistribution: Record<DiagnosisSeverity, number>;
  fixableAssetCount: number;
  estimatedCalls: number;
  cachedCount: number;
  impactScore: number;
  samples: QualityClusterAssetRef[];
}

export interface QualityCoverage {
  rulesVersion: string;
  evaluatedRules: number;
  skippedRules: number;
  skippedReasons: Array<{
    reason: 'no-ai-config' | 'semantic-disabled' | 'budget' | 'timeout' | 'rule-invalid' | 'no-channel';
    count: number;
  }>;
  noChannelRules: number;
  ignoredCount: number;
  semanticEvaluated: boolean;
}

export interface QualityOverview {
  health: GovernanceHealth;
  clusters: QualityIssueCluster[];
  sortRule: 'impact-desc-calls-asc';
  pendingTotal: number;
  coverage: QualityCoverage;
  generatedAt: string;
  cached: boolean;
}

export interface QualityOverviewInput {
  health: GovernanceHealth;
  /** 首页待办同源的跨维度去重队列 */
  queue: { total: number; items: HealthIssueRef[] };
  coverage: QualityCoverage;
  now?: () => string;
  cached?: boolean;
}

/** 严重度权重：只用于影响面排序，不是评分 */
const SEVERITY_WEIGHT: Record<DiagnosisSeverity, number> = { high: 3, medium: 2, low: 1 };
const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2 };

/** 类别 → 资产库深链；未建类别页的回退 /vault（与前端同一口径） */
const KIND_DEEPLINK: Partial<Record<HealthIssueRef['kind'], string>> = {
  identity: '/vault/identity',
  skill: '/vault/skill',
  rule: '/vault/rule',
  agent: '/vault/agent',
  memory: '/vault/memory',
};

/** 库内相对路径 → 资产详情深链；未建类别页的 kind 回退 /vault */
export function assetDeepLink(kind: HealthIssueRef['kind'], hubRelativePath: string): string {
  const base = KIND_DEEPLINK[kind];
  if (base === undefined || hubRelativePath === '') return '/vault';
  return `${base}?asset=${encodeURIComponent(hubRelativePath)}`;
}

function deepLinkOf(issue: HealthIssueRef): string {
  return assetDeepLink(issue.kind, issue.hubRelativePath);
}

/** 标题归一化：折叠空白与标点差异，避免同一条问题被拆成两条 */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

function severityMax(current: DiagnosisSeverity, next: DiagnosisSeverity): DiagnosisSeverity {
  return SEVERITY_RANK[next] < SEVERITY_RANK[current] ? next : current;
}

function toAssetRef(issue: HealthIssueRef): QualityClusterAssetRef {
  return {
    hubRelativePath: issue.hubRelativePath,
    assetName: issue.assetName,
    kind: issue.kind,
    severity: issue.severity,
    // 快照层无置信度：保守取 medium，规则集接入后由 findings 覆盖
    confidence: 'medium',
    source: issue.source ?? 'rule',
    fixable: issue.fixable,
    ignored: false,
    deepLink: deepLinkOf(issue),
  };
}

/** 聚类键：规则编号就位前按归一化标题；批量诊断圈选复用同一口径 */
export function clusterKeyOf(issue: HealthIssueRef): string {
  return `title:${normalizeTitle(issue.title)}`;
}

/** 聚类分组：key = 归一化标题（规则编号接入后改为按 ruleId） */
function groupByTitle(items: HealthIssueRef[]): Map<string, HealthIssueRef[]> {
  const groups = new Map<string, HealthIssueRef[]>();
  for (const issue of items) {
    const key = clusterKeyOf(issue);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [issue]);
    else list.push(issue);
  }
  return groups;
}

function buildCluster(key: string, items: HealthIssueRef[]): QualityIssueCluster {
  const kinds = new Set(items.map((item) => item.kind));
  let severity: DiagnosisSeverity = 'low';
  let impactScore = 0;
  let fixableAssetCount = 0;
  const assets = new Map<string, QualityClusterAssetRef>();
  const severityDistribution: Record<DiagnosisSeverity, number> = { high: 0, medium: 0, low: 0 };

  for (const item of items) {
    severity = severityMax(severity, item.severity);
    severityDistribution[item.severity] += 1;
    const ref = assets.get(item.hubRelativePath);
    if (ref === undefined) {
      assets.set(item.hubRelativePath, toAssetRef(item));
      if (item.fixable) fixableAssetCount += 1;
    } else if (item.fixable && !ref.fixable) {
      // 同一资产多次命中：可修复按资产去重计数
      fixableAssetCount += 1;
    }
  }
  // 契约口径：assetCount × 聚类最高严重度权重
  impactScore = assets.size * SEVERITY_WEIGHT[severity];

  const samples = [...assets.values()]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.assetName.localeCompare(b.assetName))
    .slice(0, 3);

  return {
    key,
    keySource: 'title',
    ruleId: null,
    title: items[0].title,
    category: kinds.size > 1 ? 'cross' : (items[0].kind as RuleCategory),
    severity,
    mode: 'static',
    assetCount: assets.size,
    hitCount: items.length,
    severityDistribution,
    fixableAssetCount,
    estimatedCalls: 0,
    cachedCount: 0,
    impactScore,
    samples,
  };
}

/** 排序口径：影响面降序 → 成本升序 → 标题稳定序；前端不得自行重排 */
function sortClusters(clusters: QualityIssueCluster[]): QualityIssueCluster[] {
  return [...clusters].sort(
    (a, b) =>
      b.impactScore - a.impactScore ||
      a.estimatedCalls - b.estimatedCalls ||
      a.title.localeCompare(b.title),
  );
}

export function buildQualityOverview(input: QualityOverviewInput): QualityOverview {
  const groups = groupByTitle(input.queue.items);
  const clusters = sortClusters([...groups.entries()].map(([key, items]) => buildCluster(key, items)));
  return {
    health: input.health,
    clusters,
    sortRule: 'impact-desc-calls-asc',
    pendingTotal: input.queue.total,
    coverage: input.coverage,
    generatedAt: (input.now ?? (() => new Date().toISOString()))(),
    cached: input.cached ?? false,
  };
}
