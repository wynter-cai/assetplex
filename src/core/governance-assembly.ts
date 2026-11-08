/**
 * 健康分数据装配（add-asset-governance H2）
 *
 * 只负责「按类别枚举资产 → 读正文 → 跑机械检查 → 合并缓存中的语义诊断 → 合并分发状态」，
 * 评分逻辑全部交给 governance-health.ts 的纯函数，不重复实现任何检查。
 * 读不到正文的资产标 dataMissing；目录整体不可读时把内容类维度标 data-missing。
 *
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 * Scenario 1/5、边界（零资产 / 数据缺失）
 */

import { basename, dirname } from 'node:path';
import { runMechanicalChecks } from './doctor-mechanical.js';
import { DOCTOR_ASSET_KINDS, type DiagnosisIssue, type DoctorAssetKind } from './types.js';
import type { AssetDistributionInfo } from './distribution-status.js';
import {
  computeGovernanceHealth,
  type GovernanceAssetInput,
  type GovernanceHealth,
  type HealthDuplicateGroup,
  type HealthDimensionId,
} from './governance-health.js';

/** 语义诊断输入（缓存命中才返回；未命中视为未评估，绝不静默调模型） */
export interface AssemblySemanticInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  content: string;
}

export interface AssemblySemanticResult {
  semanticIssues: DiagnosisIssue[];
  evaluated: boolean;
}

export interface GovernanceAssemblyDeps {
  /** 库内某类别资产的文件清单（Hub 相对路径） */
  listAssets(kind: DoctorAssetKind): string[];
  /** 读取资产正文；读不到返回 null（标记 dataMissing） */
  read(hubRelativePath: string): string | null;
  /** 该资产在各工具中的分发状态（空数组 = 无分发对象） */
  distributions(hubRelativePath: string): AssetDistributionInfo[];
  /** 语义诊断来源（缺省 = 不评估语义质量） */
  semantic?(input: AssemblySemanticInput): AssemblySemanticResult;
  duplicateGroups?: HealthDuplicateGroup[];
  aiConfigured: boolean;
  /** 是否来自缓存（透传给响应） */
  cached?: boolean;
  now?: () => string;
}

export interface GovernanceAssemblyResult {
  health: GovernanceHealth;
  assets: GovernanceAssetInput[];
}

/** 内容类维度：目录不可读时无法得出可信结论 */
const CONTENT_DIMENSIONS: HealthDimensionId[] = ['completeness', 'quality', 'uniqueness'];

/**
 * 资产显示名：技能取包目录名（skills/demo-skill/SKILL.md → demo-skill），
 * 其余取文件名去扩展名。
 */
function deriveAssetName(hubRelativePath: string): string {
  const fileName = basename(hubRelativePath);
  if (fileName === 'SKILL.md') {
    const dir = basename(dirname(hubRelativePath));
    if (dir !== '' && dir !== 'skills') return dir;
  }
  return fileName.replace(/\.md$/i, '');
}

function makeAsset(
  deps: GovernanceAssemblyDeps,
  kind: DoctorAssetKind,
  hubRelativePath: string,
): GovernanceAssetInput {
  const content = deps.read(hubRelativePath);
  const distributions = deps.distributions(hubRelativePath);
  if (content === null) {
    return {
      kind,
      hubRelativePath,
      name: deriveAssetName(hubRelativePath),
      mechanicalIssues: [],
      semanticIssues: [],
      semanticEvaluated: false,
      distributions,
      dataMissing: true,
    };
  }

  const mechanicalIssues = runMechanicalChecks(kind, content);
  let semanticIssues: DiagnosisIssue[] = [];
  let semanticEvaluated = false;
  if (deps.aiConfigured && deps.semantic !== undefined) {
    const result = deps.semantic({ kind, hubRelativePath, content });
    // 语义项不重复计入机械项：criterion 带 mechanical: 前缀的一律丢弃
    semanticIssues = result.semanticIssues.filter((issue) => !issue.criterion.startsWith('mechanical:'));
    semanticEvaluated = result.evaluated;
  }

  return {
    kind,
    hubRelativePath,
    name: deriveAssetName(hubRelativePath),
    mechanicalIssues,
    semanticIssues,
    semanticEvaluated,
    distributions,
  };
}

/**
 * 装配并计算健康分。
 *
 * 目录枚举失败时不会静默当成空库：内容类维度标 data-missing，前端据此降级展示。
 */
export function assembleGovernanceHealth(deps: GovernanceAssemblyDeps): GovernanceAssemblyResult {
  const assets: GovernanceAssetInput[] = [];
  let listingFailed = false;

  for (const kind of DOCTOR_ASSET_KINDS) {
    let paths: string[];
    try {
      paths = deps.listAssets(kind);
    } catch {
      listingFailed = true;
      continue;
    }
    for (const path of paths) {
      assets.push(makeAsset(deps, kind, path));
    }
  }

  const health = computeGovernanceHealth({
    assets,
    duplicateGroups: deps.duplicateGroups ?? [],
    aiConfigured: deps.aiConfigured,
    cached: deps.cached === true,
    ...(listingFailed ? { dataMissingDimensions: CONTENT_DIMENSIONS } : {}),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });

  return { health, assets };
}
