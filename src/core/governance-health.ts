/**
 * 资产健康分（add-asset-governance H1）
 *
 * 纯函数：输入「资产快照 + 机械诊断 + 语义诊断 + 分发状态 + 重复分组」，
 * 输出可解释、可下钻的四维健康分。不读文件、不调模型、不写库。
 * 分数与资产条数无关：扣分按「不达标资产占比 × 严重度权重」计算。
 *
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 * Scenario 1/2/4、边界（零资产 / 数据缺失）
 */

import type { DiagnosisIssue, DiagnosisSeverity, DoctorAssetKind } from './types.js';
import type { AssetDistributionInfo, DistributionStatus } from './distribution-status.js';

// ============ 契约类型（对应 api-contract.ts） ============

export type HealthDimensionId = 'completeness' | 'quality' | 'distribution' | 'uniqueness';

export type DimensionApplicability = 'applicable' | 'not-applicable' | 'data-missing';

export type HealthGrade = 'empty' | 'at-risk' | 'needs-attention' | 'good' | 'excellent';

export interface HealthIssueRef {
  id: string;
  severity: DiagnosisSeverity;
  title: string;
  kind: DoctorAssetKind;
  hubRelativePath: string;
  assetName: string;
  fixable: boolean;
}

export interface HealthDimension {
  id: HealthDimensionId;
  label: string;
  applicability: DimensionApplicability;
  weight: number;
  effectiveWeight: number;
  /** not-applicable / data-missing 时为 null，禁止用 0 代替 */
  score: number | null;
  evaluatedAssets: number;
  issueCount: number;
  topIssues: HealthIssueRef[];
}

export interface GovernanceHealth {
  score: number;
  grade: HealthGrade;
  totalAssets: number;
  dimensions: HealthDimension[];
  qualityMode: 'mechanical+ai' | 'mechanical-only';
  computedAt: string;
  cached: boolean;
}

// ============ 输入类型 ============

/** 重复分组成员（唯一性维度只用路径与分组类型，不重复做相似度计算） */
export interface HealthDuplicateMember {
  hubRelativePath: string;
  name: string;
  kind: DoctorAssetKind;
}

export interface HealthDuplicateGroup {
  id: string;
  kind: 'exact' | 'near' | 'gray';
  members: HealthDuplicateMember[];
}

/** 单个资产的评分快照（由 H2 数据装配层填装） */
export interface GovernanceAssetInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  name: string;
  /** runMechanicalChecks 输出（机械项恒跑） */
  mechanicalIssues: DiagnosisIssue[];
  /** AI 语义项（不含 mechanical: 前缀项） */
  semanticIssues: DiagnosisIssue[];
  /** 该资产语义质量是否已评估 */
  semanticEvaluated: boolean;
  /** 分发条目；not_enabled / not_installed 不计入分发一致性 */
  distributions: AssetDistributionInfo[];
  /** 正文读取失败：不参与任何维度计分，但计入 totalAssets */
  dataMissing?: boolean;
}

export interface GovernanceHealthInput {
  assets: GovernanceAssetInput[];
  duplicateGroups?: HealthDuplicateGroup[];
  /** AI 端点是否配置（决定 qualityMode） */
  aiConfigured: boolean;
  /** 目录不可读等导致整维数据缺失 */
  dataMissingDimensions?: HealthDimensionId[];
  /** 读取缓存结果 */
  cached?: boolean;
  now?: () => string;
}

// ============ 常量 ============

/** 声明权重（一期固定，界面披露构成） */
export const HEALTH_DIMENSION_WEIGHTS: Record<HealthDimensionId, number> = {
  completeness: 30,
  quality: 30,
  distribution: 25,
  uniqueness: 15,
};

export const HEALTH_DIMENSION_IDS: readonly HealthDimensionId[] = [
  'completeness',
  'quality',
  'distribution',
  'uniqueness',
];

const DIMENSION_LABEL: Record<HealthDimensionId, string> = {
  completeness: '完整性',
  quality: '规范性',
  distribution: '分发一致性',
  uniqueness: '唯一性',
};

/** 严重度权重：单资产单维度封顶 1（多问题不重复放大） */
const SEVERITY_WEIGHT: Record<DiagnosisSeverity, number> = { high: 1, medium: 0.6, low: 0.3 };

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2 };

/** 完整性只认这两类机械项（必填字段缺失 / description 为空） */
const COMPLETENESS_CRITERIA = new Set([
  'mechanical:frontmatter-missing-field',
  'mechanical:description-empty',
]);

/** 完整性判据（必填字段缺失 / description 为空）；整改计划按维度筛选时复用 */
export function isCompletenessCriterion(criterion: string): boolean {
  return COMPLETENESS_CRITERIA.has(criterion);
}

/** 重复类型对唯一性的扣分权重 */
const DUPLICATE_WEIGHT: Record<HealthDuplicateGroup['kind'], number> = { exact: 1, near: 0.6, gray: 0.3 };

/** 无身份资产时的完整性缺口扣分（身份是管家层的地基） */
const IDENTITY_GAP_PENALTY = 15;

/** 参与「已分发」判定的状态（其余状态不代表该工具接收此资产） */
const DISTRIBUTION_COUNTED = new Set<DistributionStatus>(['synced', 'pending', 'conflict']);

// ============ 计分工具 ============

/** 资产池：数据缺失的资产不参与计分 */
function scorableAssets(assets: GovernanceAssetInput[]): GovernanceAssetInput[] {
  return assets.filter((a) => a.dataMissing !== true);
}

/** 单维度的逐资产扣分（每资产封顶 1） */
function penaltiesFor(
  assets: GovernanceAssetInput[],
  pickIssues: (asset: GovernanceAssetInput) => DiagnosisIssue[],
): number[] {
  return assets.map((asset) => {
    const total = pickIssues(asset).reduce((sum, issue) => sum + SEVERITY_WEIGHT[issue.severity], 0);
    return Math.min(1, total);
  });
}

/** 达标率计分：与资产条数无关，只看不达标占比 */
function ratioScore(penalties: number[]): number {
  if (penalties.length === 0) return 100;
  const sum = penalties.reduce((acc, n) => acc + n, 0);
  return Math.round(100 * (1 - sum / penalties.length));
}

/** 问题排序：high → medium → low，同级按资产名 → issue id */
export function sortHealthIssues(issues: HealthIssueRef[]): HealthIssueRef[] {
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.assetName.localeCompare(b.assetName) ||
      a.id.localeCompare(b.id),
  );
}

function toIssueRef(
  dimension: HealthDimensionId,
  asset: GovernanceAssetInput,
  issue: DiagnosisIssue,
  index: number,
): HealthIssueRef {
  return {
    id: `${dimension}:${asset.hubRelativePath}:${issue.criterion}:${index}`,
    severity: issue.severity,
    title: issue.finding,
    kind: asset.kind,
    hubRelativePath: asset.hubRelativePath,
    assetName: asset.name,
    fixable: issue.fixable,
  };
}

// ============ 问题清单（topIssues 与下钻接口共用） ============

/**
 * 收集某维度的完整问题清单。
 *
 * 健康卡只展示前 5 条（topIssues），下钻接口需要全量——两处必须同源，
 * 否则会出现「卡片说 3 个问题、清单里 5 个」的自相矛盾。
 */
export function collectDimensionIssues(
  assets: GovernanceAssetInput[],
  duplicateGroups: HealthDuplicateGroup[],
  dimension: HealthDimensionId,
): HealthIssueRef[] {
  const issues: HealthIssueRef[] = [];

  if (dimension === 'completeness' || dimension === 'quality') {
    const pick =
      dimension === 'completeness'
        ? (asset: GovernanceAssetInput): DiagnosisIssue[] =>
            asset.mechanicalIssues.filter((i) => COMPLETENESS_CRITERIA.has(i.criterion))
        : (asset: GovernanceAssetInput): DiagnosisIssue[] => [...asset.mechanicalIssues, ...asset.semanticIssues];
    for (const asset of assets) {
      pick(asset).forEach((issue, index) => issues.push(toIssueRef(dimension, asset, issue, index)));
    }
    return issues;
  }

  if (dimension === 'distribution') {
    for (const asset of assets) {
      for (const info of asset.distributions) {
        if (!DISTRIBUTION_COUNTED.has(info.status) || info.status === 'synced') continue;
        issues.push({
          id: `distribution:${asset.hubRelativePath}:${info.toolId}:${info.status}`,
          severity: info.status === 'conflict' ? 'high' : 'medium',
          title:
            info.status === 'conflict'
              ? `${info.toolName} 中的副本与库内不一致`
              : `${info.toolName} 尚未同步到最新内容`,
          kind: asset.kind,
          hubRelativePath: asset.hubRelativePath,
          assetName: asset.name,
          fixable: false,
        });
      }
    }
    return issues;
  }

  for (const group of duplicateGroups) {
    if (group.members.length < 2) continue;
    const label = group.kind === 'exact' ? '完全重复' : group.kind === 'near' ? '近重复' : '疑似重复（待确认）';
    for (const member of group.members.slice(1)) {
      issues.push({
        id: `uniqueness:${group.id}:${member.hubRelativePath}`,
        severity: group.kind === 'exact' ? 'high' : group.kind === 'near' ? 'medium' : 'low',
        title: `与同类别 ${group.members.length} 项${label}`,
        kind: member.kind,
        hubRelativePath: member.hubRelativePath,
        assetName: member.name,
        fixable: false,
      });
    }
  }
  return issues;
}

// ============ 主函数 ============

/**
 * 计算四维健康分。
 *
 * 权重归一化：`not-applicable` / `data-missing` 维度 effectiveWeight=0，
 * 总分按剩余维度折算——不把「没有评估对象」当成 0 分。
 */
export function computeGovernanceHealth(input: GovernanceHealthInput): GovernanceHealth {
  const now = (input.now ?? (() => new Date().toISOString()))();
  const assets = input.assets;
  const pool = scorableAssets(assets);
  const duplicateGroups = input.duplicateGroups ?? [];
  const missing = new Set(input.dataMissingDimensions ?? []);
  const isEmpty = assets.length === 0;

  // ---- 问题清单：四个维度同源收集（topIssues 只是它的前 5 条） ----
  const issuesByDimension: Record<HealthDimensionId, HealthIssueRef[]> = {
    completeness: collectDimensionIssues(pool, duplicateGroups, 'completeness'),
    quality: collectDimensionIssues(pool, duplicateGroups, 'quality'),
    distribution: collectDimensionIssues(pool, duplicateGroups, 'distribution'),
    uniqueness: collectDimensionIssues(pool, duplicateGroups, 'uniqueness'),
  };

  // ---- 完整性：机械项中的必填字段/描述 + 身份资产存在性 ----
  let completenessScore = ratioScore(
    penaltiesFor(pool, (a) => a.mechanicalIssues.filter((i) => COMPLETENESS_CRITERIA.has(i.criterion))),
  );
  if (!isEmpty && !assets.some((a) => a.kind === 'identity')) {
    completenessScore = Math.max(0, completenessScore - IDENTITY_GAP_PENALTY);
  }

  // ---- 规范性：全部机械项 + 语义项 ----
  const qualityScore = ratioScore(penaltiesFor(pool, (a) => [...a.mechanicalIssues, ...a.semanticIssues]));

  // ---- 分发一致性：已启用工具中 pending/conflict 占比 ----
  let entries = 0;
  let badEntries = 0;
  let distributedAssets = 0;
  for (const asset of pool) {
    let counted = 0;
    for (const info of asset.distributions) {
      if (!DISTRIBUTION_COUNTED.has(info.status)) continue;
      counted += 1;
      entries += 1;
      if (info.status !== 'synced') badEntries += 1;
    }
    if (counted > 0) distributedAssets += 1;
  }
  const distributionScore = entries === 0 ? null : Math.round(100 * (1 - badEntries / entries));

  // ---- 唯一性：重复分组中「应归档」成员占比 ----
  let duplicateExcess = 0;
  for (const group of duplicateGroups) {
    if (group.members.length < 2) continue;
    duplicateExcess += (group.members.length - 1) * DUPLICATE_WEIGHT[group.kind];
  }
  const uniquenessScore =
    pool.length === 0
      ? null
      : Math.round(100 * (1 - Math.min(1, duplicateExcess / pool.length)));

  // ---- 维度装配 ----
  const raw: Record<HealthDimensionId, { score: number | null; issues: HealthIssueRef[]; evaluated: number }> = {
    completeness: { score: isEmpty ? null : completenessScore, issues: issuesByDimension.completeness, evaluated: pool.length },
    quality: { score: isEmpty ? null : qualityScore, issues: issuesByDimension.quality, evaluated: pool.length },
    distribution: { score: isEmpty ? null : distributionScore, issues: issuesByDimension.distribution, evaluated: distributedAssets },
    uniqueness: { score: isEmpty ? null : uniquenessScore, issues: issuesByDimension.uniqueness, evaluated: pool.length },
  };

  const dimensions: HealthDimension[] = HEALTH_DIMENSION_IDS.map((id) => {
    const weight = HEALTH_DIMENSION_WEIGHTS[id];
    const { score, issues, evaluated } = raw[id];
    const applicability: DimensionApplicability = isEmpty
      ? 'not-applicable'
      : missing.has(id)
        ? 'data-missing'
        : score === null
          ? 'not-applicable'
          : 'applicable';
    const sorted = sortHealthIssues(issues);
    return {
      id,
      label: DIMENSION_LABEL[id],
      applicability,
      weight,
      effectiveWeight: applicability === 'applicable' ? weight : 0,
      score: applicability === 'applicable' ? score : null,
      evaluatedAssets: applicability === 'applicable' ? evaluated : 0,
      issueCount: issues.length,
      topIssues: sorted.slice(0, 5),
    };
  });

  // ---- 总分与等级 ----
  const effectiveTotal = dimensions.reduce((sum, d) => sum + d.effectiveWeight, 0);
  const weighted = dimensions.reduce((sum, d) => sum + (d.score ?? 0) * d.effectiveWeight, 0);
  const score = isEmpty || effectiveTotal === 0 ? 0 : Math.round(weighted / effectiveTotal);

  const usesAi = input.aiConfigured && assets.some((a) => a.semanticEvaluated);

  return {
    score,
    grade: gradeFor(score, isEmpty),
    totalAssets: assets.length,
    dimensions,
    qualityMode: usesAi ? 'mechanical+ai' : 'mechanical-only',
    computedAt: now,
    cached: input.cached ?? false,
  };
}

/** 等级闭集：空库单列，避免给首次使用者展示 0 分 */
function gradeFor(score: number, isEmpty: boolean): HealthGrade {
  if (isEmpty) return 'empty';
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'needs-attention';
  return 'at-risk';
}
