/**
 * 资产治理路由（add-asset-governance H3）
 *
 * GET /api/governance/health   四维健康分（可解释 / 可下钻 / 不伪造）
 * GET /api/governance/issues   单维度问题清单（严重度排序 + 分页）
 *
 * 装配只读：默认复用医生缓存中的语义结论（绝不因打开首页而调模型）；
 * 分发状态取自既有 distribution-index（30 秒缓存）。
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 */

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { listHubFiles, type HubFileCategory } from '../../core/hub-files.js';
import { DIAGNOSIS_SEVERITIES, DOCTOR_ASSET_KINDS, type DoctorAssetKind } from '../../core/types.js';
import { groupDuplicates } from '../../core/duplicates.js';
import { buildDuplicateAssets, type DuplicateSourceAsset } from '../../core/duplicate-scan.js';
import {
  buildGovernanceSuggestions,
  type DuplicateSummaryForSuggestion,
  type GovernanceSuggestionResult,
} from '../../core/governance-suggestions.js';
import { assembleGovernanceHealth, type GovernanceAssemblyDeps } from '../../core/governance-assembly.js';
import {
  collectDimensionIssues,
  HEALTH_DIMENSION_IDS,
  sortHealthIssues,
  type GovernanceAssetInput,
  type HealthDimensionId,
  type HealthDuplicateGroup,
  type HealthIssueRef,
  type GovernanceHealth,
} from '../../core/governance-health.js';
import type { AssetDistributionInfo } from '../../core/distribution-status.js';
import { loadAiClassifyConfig, isAiConfigComplete, type AiConfigStore } from '../../core/ai-config.js';
import { computeDoctorCacheKey, sanitizeDoctorEntries, type DoctorCacheStore } from '../../core/doctor-cache.js';
import { hashCriteria, listCriteria } from '../../core/criteria.js';
import { nodeAiConfigStore, nodeDoctorCacheStore } from '../lib/node-ai-classify-store.js';
import { getDistributions } from '../lib/distribution-context.js';
import { isHubInternalPath } from './doctor.js';
import { createRemediationRoutes, type RemediationRouteDeps } from './remediation.js';
import { createDuplicateRoutes, defaultListAssets, type DuplicateRouteDeps } from './duplicates.js';

export interface GovernanceRouteDeps {
  listAssets?: (kind: DoctorAssetKind) => string[];
  read?: (hubRelativePath: string) => string | null;
  distributions?: (hubRelativePath: string) => AssetDistributionInfo[];
  semantic?: GovernanceAssemblyDeps['semantic'];
  aiConfigured?: () => boolean;
  aiConfigStore?: AiConfigStore;
  cache?: DoctorCacheStore;
  duplicateGroups?: () => HealthDuplicateGroup[];
  /** 重复治理摘要（首页建议用；缺省本地扫描一次，零模型） */
  duplicateSummary?: () => DuplicateSummaryForSuggestion;
  now?: () => string;
  /** 一键整改子路由依赖（草案/写库/撤销/批次存储） */
  remediation?: Omit<RemediationRouteDeps, 'loadAssets' | 'read' | 'now' | 'invalidate'>;
  /** 重复治理子路由依赖（写库/归档/还原/批次存储） */
  duplicates?: Omit<Partial<DuplicateRouteDeps>, 'listAssets' | 'read'>;
}

/** 医生类别 → Hub 目录（与 routes/doctor.ts 同口径） */
const KIND_TO_HUB_DIR: Record<DoctorAssetKind, HubFileCategory> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

/** 默认资产枚举：技能只取包主文件 SKILL.md，其余类别取目录内全部文件 */
const nodeListAssets = (kind: DoctorAssetKind): string[] => {
  const files = listHubFiles(KIND_TO_HUB_DIR[kind]);
  return files
    .filter((f) => !f.isDirectory)
    .filter((f) => (kind === 'skill' ? f.relativePath.endsWith('/SKILL.md') : true))
    .map((f) => f.relativePath);
};

const nodeRead = (hubRelativePath: string): string | null => {
  try {
    if (!isHubInternalPath(hubRelativePath)) return null;
    const full = resolve(getHubRoot(), hubRelativePath);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
  } catch {
    return null;
  }
};

/** 语义诊断只读缓存：未命中即「未评估」，绝不在健康分聚合时调用模型 */
function makeSemanticProvider(
  model: string,
  cache: DoctorCacheStore,
): NonNullable<GovernanceAssemblyDeps['semantic']> {
  const criteria = listCriteria();
  const criteriaHash = hashCriteria(criteria);
  return ({ kind, content }) => {
    const key = computeDoctorCacheKey({ kind, content, criteriaHash, model });
    const entry = sanitizeDoctorEntries(cache.load())[key];
    if (entry === undefined) return { semanticIssues: [], evaluated: false };
    return { semanticIssues: entry.issues, evaluated: true };
  };
}

function isDimensionId(raw: string | undefined): raw is HealthDimensionId {
  return raw !== undefined && (HEALTH_DIMENSION_IDS as readonly string[]).includes(raw);
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function parseInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

export function createGovernanceRoutes(deps: GovernanceRouteDeps = {}): Hono {
  const routes = new Hono();

  /** 健康分聚合缓存（与分发索引同口径的短 TTL；refresh=1 强制绕过） */
  const CACHE_TTL_MS = 30_000;
  let cache: {
    at: number;
    health: GovernanceHealth;
    assets: GovernanceAssetInput[];
    groups: HealthDuplicateGroup[];
  } | null = null;

  /** 装配一次：健康分与问题清单共用同一份资产快照 */
  async function load(force = false): Promise<{
    health: GovernanceHealth;
    assets: GovernanceAssetInput[];
    groups: HealthDuplicateGroup[];
  }> {
    if (!force && cache !== null && Date.now() - cache.at < CACHE_TTL_MS) {
      return { health: { ...cache.health, cached: true }, assets: cache.assets, groups: cache.groups };
    }

    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    const aiConfigured = deps.aiConfigured === undefined ? isAiConfigComplete(config) : deps.aiConfigured();
    const semantic =
      deps.semantic ??
      (aiConfigured ? makeSemanticProvider(config.model, deps.cache ?? nodeDoctorCacheStore) : undefined);

    let distributionIndex: Record<string, AssetDistributionInfo[]> | null = null;
    if (deps.distributions === undefined) {
      distributionIndex = (await getDistributions()).index;
    }
    const groups = (deps.duplicateGroups ?? (() => []))();

    const assembled = assembleGovernanceHealth({
      listAssets: deps.listAssets ?? nodeListAssets,
      read: deps.read ?? nodeRead,
      distributions:
        deps.distributions ??
        ((hubRelativePath) => (distributionIndex as Record<string, AssetDistributionInfo[]>)[hubRelativePath] ?? []),
      ...(semantic === undefined ? {} : { semantic }),
      duplicateGroups: groups,
      aiConfigured,
      ...(deps.now === undefined ? {} : { now: deps.now }),
    });
    cache = { at: Date.now(), health: assembled.health, assets: assembled.assets, groups };
    return { health: assembled.health, assets: assembled.assets, groups };
  }

  /** 本机确定性扫描一次重复分组（只读、零模型），用于首页建议 */
  function computeDuplicateSummary(): DuplicateSummaryForSuggestion {
    const list = deps.listAssets ?? defaultListAssets;
    const read = deps.read ?? nodeRead;
    const sources: DuplicateSourceAsset[] = [];
    for (const kind of DOCTOR_ASSET_KINDS) {
      for (const path of list(kind)) {
        const content = read(path);
        if (content === null) continue;
        sources.push({ kind, hubRelativePath: path, content, lastModified: '1970-01-01T00:00:00.000Z' });
      }
    }
    const result = groupDuplicates(buildDuplicateAssets(sources));
    const grayGroups = result.groups.filter((group) => group.kind === 'gray');
    return {
      mergeableGroupCount: result.mergeableGroupCount,
      mergeableAssetCount: result.estimatedReduction,
      grayGroupCount: grayGroups.length,
      grayAssetCount: grayGroups.reduce((sum, group) => sum + group.members.length, 0),
    };
  }

  routes.get('/suggestions', async (c) => {
    const { health } = await load();
    const summary = (deps.duplicateSummary ?? computeDuplicateSummary)();
    const result: GovernanceSuggestionResult = buildGovernanceSuggestions({
      health,
      duplicates: summary,
      aiConfigured: health.qualityMode === 'mechanical+ai',
      scanned: health.totalAssets > 0,
      coverage: null,
    });
    return c.json(result);
  });

  routes.get('/health', async (c) => {
    const refresh = c.req.query('refresh');
    if (refresh !== undefined && refresh !== '' && refresh !== '0' && refresh !== '1') {
      return c.json({ error: 'refresh 只允许 0 或 1' }, 400);
    }
    const { health } = await load(refresh === '1');
    return c.json(health);
  });

  routes.get('/issues', async (c) => {
    const dimension = c.req.query('dimension');
    if (!isDimensionId(dimension)) {
      return c.json({ error: `dimension 必须是 ${HEALTH_DIMENSION_IDS.join('/')}` }, 400);
    }

    const severityFloor = c.req.query('severityFloor');
    if (severityFloor !== undefined && !(DIAGNOSIS_SEVERITIES as readonly string[]).includes(severityFloor)) {
      return c.json({ error: `severityFloor 必须是 ${DIAGNOSIS_SEVERITIES.join('/')}` }, 400);
    }

    const limit = parseInteger(c.req.query('limit'), 20, 1, 100);
    if (limit === null) return c.json({ error: 'limit 必须是 1-100 的整数' }, 400);
    const offset = parseInteger(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (offset === null) return c.json({ error: 'offset 必须是非负整数' }, 400);

    const { assets, groups } = await load();
    let items: HealthIssueRef[] = sortHealthIssues(collectDimensionIssues(assets, groups, dimension));
    if (severityFloor !== undefined) {
      const floorRank = SEVERITY_RANK[severityFloor] ?? 0;
      items = items.filter((item) => SEVERITY_RANK[item.severity] <= floorRank);
    }

    return c.json({ dimension, total: items.length, items: items.slice(offset, offset + limit) });
  });

  // 一键整改子路由：复用同一份资产快照，写库后清空健康分缓存
  routes.route(
    '/remediation',
    createRemediationRoutes({
      ...deps.remediation,
      loadAssets: async () => (await load()).assets,
      read: deps.read ?? nodeRead,
      invalidate: () => {
        cache = null;
      },
      ...(deps.now === undefined ? {} : { now: deps.now }),
    }),
  );

  // 重复治理子路由：与健康分共用同一份资产枚举口径，写库后清空健康分缓存
  routes.route(
    '/duplicates',
    createDuplicateRoutes({
      ...deps.duplicates,
      listAssets: deps.listAssets ?? defaultListAssets,
      read: deps.read ?? nodeRead,
      ...(deps.aiConfigured === undefined ? {} : { aiConfigured: deps.aiConfigured }),
      ...(deps.aiConfigStore === undefined ? {} : { aiConfigStore: deps.aiConfigStore }),
      ...(deps.now === undefined ? {} : { now: deps.now }),
      invalidate: () => {
        cache = null;
        deps.duplicates?.invalidate?.();
      },
    }),
  );

  return routes;
}
