/**
 * 技能分类全貌聚合（纯逻辑，零 IO）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R2）
 * 契约: 设计文档/changes/refactor-skill-catalog/api-contract.ts
 *
 * 三分组只是看板聚合视图，条目自身出处仍以五值为准（deriveProvenance 口径不变）；
 * 用途与来源计数直接复用 filterAndCountSkills 的分面语义，不另写一套。
 */

import {
  classifyOrigin,
  SKILL_FUNCTIONS,
  type SkillFunction,
  type SkillFunctionSource,
  type SkillInfo,
  type SkillOrigin,
  type SkillSources,
} from './skills-inventory.js';
import { deriveProvenance, type SkillProvenance } from './skill-provenance.js';
import type { SkillDiagnosisSummaryView } from './skill-diagnosis-summary.js';
import type {
  CatalogOverviewInput,
  SkillCatalogDiagnosisTotals,
  SkillCatalogEntryFields,
  SkillCatalogGroup,
  SkillCatalogGroupDiagnosis,
  SkillCatalogOverview,
  SkillCatalogRecentItem,
  SkillClassificationBasis,
  SkillProvenanceGroup,
  SkillProvenanceUncertain,
} from './skill-catalog-types.js';

// ============ 标签与顺序 ============

export const PROVENANCE_GROUP_LABELS: Record<SkillProvenanceGroup, string> = {
  self: '自建',
  platform: '平台自带',
  imported: '导入',
};

export const FUNCTION_LABELS: Record<SkillFunction, string> = {
  coding: '编码开发',
  writing: '文档写作',
  browser: '浏览器自动化',
  data: '数据处理',
  devops: 'DevOps/部署',
  'ai-integration': 'AI 集成',
  design: '设计创意',
  workflow: '工作流自动化',
  other: '其他',
};

const PROVENANCE_GROUP_ORDER: SkillProvenanceGroup[] = ['self', 'platform', 'imported'];

const RECENT_LIMIT = 5;

const CURATE_SOURCE_PREFIXES = ['marketplace:', 'plugin:', 'github:'];

// ============ 分类映射与依据 ============

/** 五值出处 → 三分组视图（D2：视图不是新轴） */
export function toProvenanceGroup(provenance: SkillProvenance): SkillProvenanceGroup {
  if (provenance === 'self') return 'self';
  if (provenance === 'marketplace' || provenance === 'github') return 'imported';
  return 'platform';
}

function hasCurateSourcePrefix(source?: string): boolean {
  if (typeof source !== 'string') return false;
  return CURATE_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix));
}

/** 来源判定依据：目录优先；库内且带收藏溯源前缀才记为元数据 */
export function provenanceBasisOf(
  origin: SkillOrigin | SkillProvenanceUncertain,
  source?: string,
): SkillClassificationBasis {
  if (origin === 'vault' && hasCurateSourcePrefix(source)) return 'metadata';
  return 'directory';
}

/** 用途判定依据：手动 / AI / 关键词直映射 */
export function functionBasisOf(functionSource: SkillFunctionSource): SkillClassificationBasis {
  return functionSource;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function isUnderBuiltinRoot(absolutePath: string, sources: SkillSources): boolean {
  const p = toPosix(absolutePath);
  const under = (dir: string): boolean => p.startsWith(`${toPosix(dir).replace(/\/+$/, '')}/`);
  return under(sources.builtinRoot) || under(sources.builtinSkillsDir);
}

/**
 * 目录来源判定的严格版本：已知来源根之外返回 'unknown'。
 * 只对 classifyOrigin 的 builtin 兜底值再校验一次，不改变五值出处口径。
 */
export function classifyOriginOrUnknown(
  absolutePath: string,
  sources: SkillSources,
): SkillOrigin | SkillProvenanceUncertain {
  const origin = classifyOrigin(absolutePath, sources);
  if (origin !== 'builtin') return origin;
  return isUnderBuiltinRoot(absolutePath, sources) ? 'builtin' : 'unknown';
}

/** 条目分类增量字段（看板与条目共用同一判定） */
export function catalogFieldsOf(
  skill: Pick<SkillInfo, 'origin' | 'source' | 'sourcePath' | 'functionSource'>,
  sources: SkillSources,
): SkillCatalogEntryFields {
  const strictOrigin = classifyOriginOrUnknown(skill.sourcePath, sources);
  const uncertain = strictOrigin === 'unknown';
  const fields: SkillCatalogEntryFields = {
    provenanceGroup: uncertain ? 'platform' : toProvenanceGroup(deriveProvenance(skill.origin, skill.source)),
    provenanceBasis: provenanceBasisOf(uncertain ? 'unknown' : skill.origin, skill.source),
    functionBasis: functionBasisOf(skill.functionSource),
  };
  if (uncertain) fields.provenanceUncertain = 'unknown';
  return fields;
}

// ============ 聚合 ============

interface CatalogEntry {
  skill: SkillInfo;
  fields: SkillCatalogEntryFields;
}

function emptyGroupDiagnosis(): SkillCatalogGroupDiagnosis {
  return { unchecked: 0, stale: 0, healthy: 0, needsAttention: 0, atRisk: 0 };
}

/** 单条摘要归入哪一种展示态（未体检不显示 0 问题） */
function diagnosisBucketOf(
  summary: SkillDiagnosisSummaryView | undefined,
): keyof SkillCatalogGroupDiagnosis | null {
  if (!summary) return 'unchecked';
  if (summary.stale) return 'stale';
  if (summary.overall === 'healthy') return 'healthy';
  if (summary.overall === 'needs-attention') return 'needsAttention';
  return 'atRisk';
}

function summarizeDiagnosis(
  entries: CatalogEntry[],
  summaries: Record<string, SkillDiagnosisSummaryView>,
): SkillCatalogGroupDiagnosis {
  const counts = emptyGroupDiagnosis();
  for (const { skill } of entries) {
    const bucket = diagnosisBucketOf(summaries[skill.id]);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}

function latestModifiedAtOf(entries: CatalogEntry[]): string | null {
  let latest: string | null = null;
  for (const { skill } of entries) {
    if (skill.lastModifiedAt === null) continue;
    if (latest === null || skill.lastModifiedAt > latest) latest = skill.lastModifiedAt;
  }
  return latest;
}

function countUnknown(entries: CatalogEntry[]): number {
  return entries.filter((entry) => entry.fields.provenanceUncertain === 'unknown').length;
}

function buildCountByProvenanceGroup(
  entries: CatalogEntry[],
  countByProvenance: Record<SkillProvenance, number>,
): Record<SkillProvenanceGroup | SkillProvenanceUncertain, number> {
  const unknown = countUnknown(entries);
  return {
    self: countByProvenance.self,
    // 判不出的技能按五值兜底计入 builtin，这里扣掉后单列
    platform: countByProvenance.builtin + countByProvenance.plugin - unknown,
    imported: countByProvenance.marketplace + countByProvenance.github,
    unknown,
  };
}

function buildProvenanceGroups(
  entries: CatalogEntry[],
  countByProvenance: Record<SkillProvenance, number>,
  summaries: Record<string, SkillDiagnosisSummaryView>,
): SkillCatalogGroup[] {
  return PROVENANCE_GROUP_ORDER.map((key) => {
    const groupEntries = entries.filter((entry) => entry.fields.provenanceGroup === key);
    // 组行沿用分面计数：platform 含「来源待确认」，与 R2.5「归入平台自带」一致
    const count =
      key === 'self'
        ? countByProvenance.self
        : key === 'imported'
          ? countByProvenance.marketplace + countByProvenance.github
          : countByProvenance.builtin + countByProvenance.plugin;
    return {
      key,
      label: PROVENANCE_GROUP_LABELS[key],
      count,
      latestModifiedAt: latestModifiedAtOf(groupEntries),
      diagnosis: summarizeDiagnosis(groupEntries, summaries),
    };
  });
}

function buildFunctionGroups(
  entries: CatalogEntry[],
  countByFunction: Record<SkillFunction, number>,
  summaries: Record<string, SkillDiagnosisSummaryView>,
): SkillCatalogGroup[] {
  return SKILL_FUNCTIONS.map((key) => {
    const groupEntries = entries.filter((entry) => entry.skill.functionCategory === key);
    return {
      key,
      label: FUNCTION_LABELS[key],
      count: countByFunction[key],
      latestModifiedAt: latestModifiedAtOf(groupEntries),
      diagnosis: summarizeDiagnosis(groupEntries, summaries),
    };
  });
}

function buildRecent(entries: CatalogEntry[]): SkillCatalogRecentItem[] {
  const dated = entries.flatMap((entry) =>
    entry.skill.lastModifiedAt === null
      ? []
      : [{ entry, at: entry.skill.lastModifiedAt }],
  );
  dated.sort((a, b) => b.at.localeCompare(a.at));
  return dated.slice(0, RECENT_LIMIT).map(({ entry, at }) => ({
    id: entry.skill.id,
    name: entry.skill.name,
    provenance: deriveProvenance(entry.skill.origin, entry.skill.source),
    provenanceGroup: entry.fields.provenanceGroup,
    lastModifiedAt: at,
  }));
}

function buildDiagnosisTotals(
  entries: CatalogEntry[],
  summaries: Record<string, SkillDiagnosisSummaryView>,
): SkillCatalogDiagnosisTotals {
  const totals: SkillCatalogDiagnosisTotals = {
    checked: 0,
    stale: 0,
    unchecked: 0,
    atRisk: 0,
    needsAttention: 0,
    healthy: 0,
    issues: { high: 0, medium: 0, low: 0 },
  };
  for (const { skill } of entries) {
    const summary = summaries[skill.id];
    const bucket = diagnosisBucketOf(summary);
    if (bucket) totals[bucket] += 1;
    if (!summary || summary.stale) continue;
    totals.checked += 1;
    totals.issues.high += summary.issueCounts.high;
    totals.issues.medium += summary.issueCounts.medium;
    totals.issues.low += summary.issueCounts.low;
  }
  return totals;
}

/** 看板聚合：三组 + 九类 + 最近更新 + 摘要分布 + AI 归类成本 */
export function buildCatalogOverview(input: CatalogOverviewInput): SkillCatalogOverview {
  const { listing, sources, summaries, aiClassify, generatedAt, partial } = input;
  const entries: CatalogEntry[] = listing.items.map((skill) => ({
    skill,
    fields: catalogFieldsOf(skill, sources),
  }));
  const overview: SkillCatalogOverview = {
    generatedAt: generatedAt ?? new Date().toISOString(),
    scope: 'asset',
    total: listing.total,
    groups: {
      provenance: buildProvenanceGroups(entries, listing.countByProvenance, summaries),
      function: buildFunctionGroups(entries, listing.countByFunction, summaries),
    },
    countByProvenanceGroup: buildCountByProvenanceGroup(entries, listing.countByProvenance),
    recent: buildRecent(entries),
    diagnosis: buildDiagnosisTotals(entries, summaries),
    aiClassify,
  };
  if (partial) overview.partial = partial;
  return overview;
}
