/**
 * 技能看板 API 组装（server 层）
 *
 * 把盘点结果 + 诊断摘要存储 + AI 归类配置组装成 GET /api/skills/catalog 响应。
 * 局部数据不可用（摘要存储读失败、缓存读失败）只降级对应字段并打 partial 标记，
 * 不抛错、不 500 整页；响应新增字段一律不含本机绝对路径。
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R7）
 */

import {
  type ListSkillsResult,
  type SkillFs,
  type SkillInfo,
  type SkillSources,
} from '../../core/skills-inventory.js';
import { buildCatalogOverview } from '../../core/skill-catalog.js';
import type {
  SkillCatalogAiClassify,
  SkillCatalogOverview,
} from '../../core/skill-catalog-types.js';
import {
  computeSkillContentHash,
  toDiagnosisSummaryView,
  type SkillDiagnosisSummaryStore,
  type SkillDiagnosisSummaryView,
} from '../../core/skill-diagnosis-summary.js';
import { hashSkillContent, type AiClassifyCacheStore } from '../../core/skill-ai-cache.js';
import { isAiConfigComplete, loadAiClassifyConfig, type AiConfigStore } from '../../core/ai-config.js';
import { toApiCatalogSkill, type SkillApiCatalogInfo } from './skill-api.js';

/** GET /api/skills/catalog 响应 = 看板概览 + 当前筛选下的条目 */
export interface SkillCatalogResponse extends SkillCatalogOverview {
  items: SkillApiCatalogInfo[];
}

export interface CatalogApiInput {
  listing: ListSkillsResult;
  fs: SkillFs;
  sources: SkillSources;
  summaryStore: SkillDiagnosisSummaryStore;
  /** AI 配置存储（缺省视为未配置 AI 端点） */
  aiConfigStore?: AiConfigStore;
  /** AI 分类内容缓存（缺省不计缓存命中） */
  aiCacheStore?: AiClassifyCacheStore;
  generatedAt: string;
}

/** 当前正文哈希；文件读不到返回 null（摘要按过期处理） */
function currentContentHashOf(fs: SkillFs, skill: SkillInfo): string | null {
  const raw = fs.read(skill.sourcePath);
  return raw === null ? null : computeSkillContentHash(raw);
}

/**
 * sourcePath → Hub 内相对路径（如 'skills/demo-a/SKILL.md'）。
 * 只取保险箱根目录（<hub>/skills）之后的片段，绝不回传本机绝对路径。
 */
function hubRelativePathOf(sourcePath: string, vaultSkillsDir: string): string | null {
  const p = sourcePath.replace(/\\/g, '/');
  const prefix = `${vaultSkillsDir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
  if (!p.startsWith(prefix)) return null;
  return `skills/${p.slice(prefix.length)}`;
}

/** 读取摘要存储并按当前内容哈希转展示投影；失败时降级为空表 + 标记 */
function loadDiagnosisViews(input: {
  skills: SkillInfo[];
  fs: SkillFs;
  vaultSkillsDir: string;
  store: SkillDiagnosisSummaryStore;
}): { views: Record<string, SkillDiagnosisSummaryView>; unavailable: boolean } {
  let records: ReturnType<SkillDiagnosisSummaryStore['load']>;
  try {
    records = input.store.load();
  } catch {
    return { views: {}, unavailable: true };
  }
  const views: Record<string, SkillDiagnosisSummaryView> = {};
  for (const skill of input.skills) {
    const relativePath = hubRelativePathOf(skill.sourcePath, input.vaultSkillsDir);
    if (relativePath === null) continue;
    const record = records[relativePath];
    if (!record) continue;
    views[skill.id] = toDiagnosisSummaryView(record, currentContentHashOf(input.fs, skill));
  }
  return { views, unavailable: false };
}

/** 读取 AI 缓存表；未注入返回空表，读失败返回 null（降级标记） */
function loadAiCache(
  store: AiClassifyCacheStore | undefined,
): Record<string, unknown> | null {
  if (!store) return {};
  try {
    return store.load();
  } catch {
    return null;
  }
}

/** AI 归类成本披露：待分类 = 仅关键词来源；缓存命中用当前正文哈希判定 */
function computeAiClassify(input: {
  items: SkillInfo[];
  fs: SkillFs;
  aiConfigStore?: AiConfigStore;
  aiCacheStore?: AiClassifyCacheStore;
}): { value: SkillCatalogAiClassify; unavailable: boolean } {
  const pendingItems = input.items.filter((skill) => skill.functionSource === 'keyword');
  const aiConfigured = input.aiConfigStore
    ? isAiConfigComplete(loadAiClassifyConfig(input.aiConfigStore))
    : false;
  const cache = loadAiCache(input.aiCacheStore);
  let cacheHits = 0;
  if (cache) {
    for (const skill of pendingItems) {
      const raw = input.fs.read(skill.sourcePath);
      if (raw !== null && cache[hashSkillContent(raw)] !== undefined) cacheHits += 1;
    }
  }
  return {
    value: {
      aiConfigured,
      pending: pendingItems.length,
      cacheHits,
      needCall: pendingItems.length - cacheHits,
    },
    unavailable: input.aiCacheStore !== undefined && cache === null,
  };
}

function partialOf(
  diagnosisUnavailable: boolean,
  aiClassifyUnavailable: boolean,
): SkillCatalogOverview['partial'] {
  if (!diagnosisUnavailable && !aiClassifyUnavailable) return undefined;
  const partial: NonNullable<SkillCatalogOverview['partial']> = {};
  if (diagnosisUnavailable) partial.diagnosisUnavailable = true;
  if (aiClassifyUnavailable) partial.aiClassifyUnavailable = true;
  return partial;
}

/** 组装看板响应：概览 + 条目增量字段；任一局部数据失败只降级对应字段 */
export function buildCatalogApiResponse(input: CatalogApiInput): SkillCatalogResponse {
  const diagnosis = loadDiagnosisViews({
    skills: input.listing.items,
    fs: input.fs,
    vaultSkillsDir: input.sources.vaultSkillsDir,
    store: input.summaryStore,
  });
  const aiClassify = computeAiClassify({
    items: input.listing.items,
    fs: input.fs,
    aiConfigStore: input.aiConfigStore,
    aiCacheStore: input.aiCacheStore,
  });
  const overview = buildCatalogOverview({
    listing: input.listing,
    sources: input.sources,
    summaries: diagnosis.views,
    aiClassify: aiClassify.value,
    generatedAt: input.generatedAt,
    partial: partialOf(diagnosis.unavailable, aiClassify.unavailable),
  });
  return {
    ...overview,
    items: input.listing.items.map((skill) =>
      toApiCatalogSkill(skill, input.sources, diagnosis.views[skill.id]),
    ),
  };
}
