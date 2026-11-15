/**
 * 技能看板聚合的类型声明（与 api-contract 同名同值）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R2）
 * 纯类型文件，无运行时逻辑；实现在 skill-catalog.ts。
 */

import type { ListSkillsResult, SkillSources } from './skills-inventory.js';
import type { SkillProvenance } from './skill-provenance.js';
import type { SkillDiagnosisSummaryView } from './skill-diagnosis-summary.js';

export type SkillProvenanceGroup = 'self' | 'platform' | 'imported';

/** 来源无法判定：归入 platform 组并显式标记，不冒充官方内置 */
export type SkillProvenanceUncertain = 'unknown';

/** 分类依据：目录 > 元数据 > 关键词，手动与 AI 为覆盖层 */
export type SkillClassificationBasis = 'directory' | 'metadata' | 'keyword' | 'ai' | 'manual';

/** 条目分类增量字段（GET /api/skills/catalog 与详情共用） */
export interface SkillCatalogEntryFields {
  provenanceGroup: SkillProvenanceGroup;
  provenanceUncertain?: SkillProvenanceUncertain;
  provenanceBasis: SkillClassificationBasis;
  functionBasis: SkillClassificationBasis;
}

export interface SkillCatalogGroupDiagnosis {
  unchecked: number;
  stale: number;
  healthy: number;
  needsAttention: number;
  atRisk: number;
}

export interface SkillCatalogGroup {
  key: string;
  label: string;
  count: number;
  /** 组内最近更新时间（ISO）；全组无有效时间为 null */
  latestModifiedAt: string | null;
  diagnosis: SkillCatalogGroupDiagnosis;
}

export interface SkillCatalogRecentItem {
  id: string;
  name: string;
  provenance: SkillProvenance;
  provenanceGroup: SkillProvenanceGroup;
  lastModifiedAt: string;
}

export interface SkillCatalogDiagnosisTotals {
  checked: number;
  stale: number;
  unchecked: number;
  atRisk: number;
  needsAttention: number;
  healthy: number;
  issues: { high: number; medium: number; low: number };
}

export interface SkillCatalogAiClassify {
  aiConfigured: boolean;
  pending: number;
  cacheHits: number;
  needCall: number;
}

export interface SkillCatalogOverview {
  generatedAt: string;
  scope: 'asset';
  total: number;
  groups: {
    provenance: SkillCatalogGroup[];
    function: SkillCatalogGroup[];
  };
  countByProvenanceGroup: Record<SkillProvenanceGroup | SkillProvenanceUncertain, number>;
  recent: SkillCatalogRecentItem[];
  diagnosis: SkillCatalogDiagnosisTotals;
  aiClassify: SkillCatalogAiClassify;
  partial?: {
    diagnosisUnavailable?: boolean;
    aiClassifyUnavailable?: boolean;
  };
}

/** 聚合入参：列表结果（已按筛选过滤）+ 已判过 stale 的摘要投影 + AI 归类成本 */
export interface CatalogOverviewInput {
  listing: Pick<ListSkillsResult, 'items' | 'total' | 'countByFunction' | 'countByProvenance'>;
  sources: SkillSources;
  summaries: Record<string, SkillDiagnosisSummaryView>;
  aiClassify: SkillCatalogAiClassify;
  generatedAt?: string;
  partial?: SkillCatalogOverview['partial'];
}
