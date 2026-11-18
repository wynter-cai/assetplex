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
import { DOCTOR_ASSET_KINDS, DIAGNOSIS_SEVERITIES } from '../../core/types.js';
import { groupDuplicates } from '../../core/duplicates.js';
import { buildDuplicateAssets, type DuplicateSourceAsset } from '../../core/duplicate-scan.js';
import {
  buildGovernanceSuggestions,
  type DuplicateSummaryForSuggestion,
  type GovernanceSuggestionResult,
} from '../../core/governance-suggestions.js';
import {
  collectDimensionIssues,
  collectGovernanceQueue,
  HEALTH_DIMENSION_IDS,
  sortHealthIssues,
  type GovernanceAssetInput,
  type HealthDimensionId,
  type HealthIssueRef,
} from '../../core/governance-health.js';
import { assetDeepLink, buildQualityOverview, clusterKeyOf, type QualityCoverage } from '../../core/quality-overview.js';
import { ruleAppliesToKind } from '../../core/diagnosis-static.js';
import { loadRuleRegistryFromFile, resolveRuleSetFile } from '../../core/diagnosis-rules.js';
import {
  estimateBatchDiagnosis,
  filterCandidatesByRuleIds,
  type BatchDiagnoseCandidate,
} from '../../core/quality-batch.js';
import { computeDoctorCacheKey, hashRuleSet, sanitizeDoctorEntries } from '../../core/doctor-cache.js';
import { loadAiClassifyConfig, isAiConfigComplete } from '../../core/ai-config.js';
import { nodeAiConfigStore, nodeDoctorCacheStore } from '../lib/node-ai-classify-store.js';
import { loadRouteRuleSet } from '../lib/rule-registry.js';
import { isHubInternalPath } from './doctor.js';
import {
  countActiveIgnores,
  sanitizeIgnoredFindings,
  type DiagnosisIgnoreStore,
} from '../../core/diagnosis-ignore.js';
import {
  createGovernanceSnapshot,
  nodeListAssets,
  nodeRead,
  type GovernanceSnapshotDeps,
} from '../lib/governance-snapshot.js';
import type { DiagnosisRuleSet, DoctorAssetKind } from '../../core/types.js';
import type { DoctorCacheStore } from '../../core/doctor-cache.js';
import { createRemediationRoutes, type RemediationRouteDeps } from './remediation.js';
import { createDuplicateRoutes, defaultListAssets, type DuplicateRouteDeps } from './duplicates.js';

export interface GovernanceRouteDeps extends GovernanceSnapshotDeps {
  /** 重复治理摘要（首页建议用；缺省本地扫描一次，零模型） */
  duplicateSummary?: () => DuplicateSummaryForSuggestion;
  /** 一键整改子路由依赖（草案/写库/撤销/批次存储） */
  remediation?: Omit<RemediationRouteDeps, 'loadAssets' | 'read' | 'now' | 'invalidate'>;
  /** 重复治理子路由依赖（写库/归档/还原/批次存储） */
  duplicates?: Omit<Partial<DuplicateRouteDeps>, 'listAssets' | 'read'>;
  /** 忽略清单：概览「已忽略 N 条」取生效条数（缺省 0，不读本机文件） */
  ignoreStore?: DiagnosisIgnoreStore;
  /** 规则集：缺省按构建产物 / 仓库定义位置加载；显式传 null 表示本轮不跑规则 */
  ruleSet?: DiagnosisRuleSet | null;
  /** 诊断缓存（预估命中数用；缺省读本机 ~/.assetplex/doctor-reports.json） */
  doctorCache?: DoctorCacheStore;
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

/**
 * 概览覆盖度（refactor-governance-center T2）：按需加载口径如实披露。
 * 忽略条数取生效条目（内容哈希仍一致），过期条目不冒充「已忽略」（D7 透明披露）。
 */
function overviewCoverage(
  assets: GovernanceAssetInput[],
  aiConfigured: boolean,
  ignoredCount: number,
): QualityCoverage {
  let rulesVersion = '';
  let evaluatedRules = 0;
  let skippedRules = 0;
  let noChannelRules = 0;
  try {
    const file = resolveRuleSetFile();
    if (file !== null) {
      const { ruleSet } = loadRuleRegistryFromFile(file);
      rulesVersion = ruleSet.version;
      const kinds = [...new Set(assets.map((asset) => asset.kind))];
      for (const rule of ruleSet.rules) {
        if (rule.category === 'mcp') {
          noChannelRules += 1;
          continue;
        }
        const applies = kinds.some((kind) => ruleAppliesToKind(rule, kind));
        if (!applies) continue;
        if (rule.mode === 'static' || aiConfigured) evaluatedRules += 1;
        else skippedRules += 1;
      }
    }
  } catch {
    // 规则集致命错误：概览仍返回健康分与聚类，覆盖度按未知披露（不 500 整页）
    rulesVersion = '';
  }
  return {
    rulesVersion,
    evaluatedRules,
    skippedRules,
    skippedReasons: skippedRules > 0 ? [{ reason: 'no-ai-config', count: skippedRules }] : [],
    noChannelRules,
    ignoredCount,
    aiConfigured,
    semanticEvaluated: aiConfigured && assets.some((asset) => asset.semanticEvaluated),
  };
}

function parseStringArray(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '') return null;
    out.push(item.trim());
  }
  return [...new Set(out)];
}

interface BatchEstimateBody {
  kinds?: DoctorAssetKind[];
  clusterKeys?: string[];
  ruleIds?: string[];
}

/** 批量诊断预估请求体校验：数组元素必须是非空字符串，类别必须在医生闭集内 */
function parseBatchEstimateBody(body: unknown): { value?: BatchEstimateBody; error?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: '请求体必须是 JSON 对象' };
  }
  const raw = body as Record<string, unknown>;
  const kindsRaw = parseStringArray(raw['kinds']);
  if (kindsRaw === null) return { error: 'kinds 必须是非空字符串数组' };
  for (const kind of kindsRaw) {
    if (!(DOCTOR_ASSET_KINDS as readonly string[]).includes(kind)) {
      return { error: `kinds 含医生不支持的类别：${kind}` };
    }
  }
  const clusterKeys = parseStringArray(raw['clusterKeys']);
  if (clusterKeys === null) return { error: 'clusterKeys 必须是非空字符串数组' };
  const ruleIds = parseStringArray(raw['ruleIds']);
  if (ruleIds === null) return { error: 'ruleIds 必须是非空字符串数组' };

  const value: BatchEstimateBody = {};
  if (kindsRaw.length > 0) value.kinds = kindsRaw as DoctorAssetKind[];
  if (clusterKeys.length > 0) value.clusterKeys = clusterKeys;
  if (ruleIds.length > 0) value.ruleIds = ruleIds;
  return { value };
}

export function createGovernanceRoutes(deps: GovernanceRouteDeps = {}): Hono {
  const routes = new Hono();

  /** 共享治理快照装配（30 秒缓存；refresh=1 强制绕过，写库后失效） */
  const snapshot = createGovernanceSnapshot(deps);
  const load = snapshot.load;

  /**
   * 当前是否配置了可用的 AI 端点。
   * 不能用 `health.qualityMode` 反推：它还要求「已有资产完成语义评估」，
   * 用户配好 Key 但没跑过语义体检时会被误判成「AI 未配置」（T11）。
   */
  function aiConfiguredNow(): boolean {
    if (deps.aiConfigured !== undefined) return deps.aiConfigured();
    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    return isAiConfigComplete(config);
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
      aiConfigured: aiConfiguredNow(),
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

  /**
   * 全局体检报告概览（refactor-governance-center T2）：问题按类型聚类 + 影响面排序。
   * 待处理总数直接取与首页待办同源的去重队列总数，禁止二次计算。
   */
  routes.get('/overview', async (c) => {
    const refresh = c.req.query('refresh');
    if (refresh !== undefined && refresh !== '' && refresh !== '0' && refresh !== '1') {
      return c.json({ error: 'refresh 只允许 0 或 1' }, 400);
    }
    const snapshot = await load(refresh === '1');
    const queue = collectGovernanceQueue(snapshot.assets, snapshot.groups, Number.MAX_SAFE_INTEGER);
    const aiConfigured = aiConfiguredNow();
    const ignoredCount =
      deps.ignoreStore === undefined
        ? 0
        : countActiveIgnores(
            sanitizeIgnoredFindings(deps.ignoreStore.load()),
            (path) => (deps.read ?? nodeRead)(path),
          );
    return c.json(
      buildQualityOverview({
        health: snapshot.health,
        queue,
        coverage: overviewCoverage(snapshot.assets, aiConfigured, ignoredCount),
        ...(deps.now === undefined ? {} : { now: deps.now }),
        cached: snapshot.health.cached,
      }),
    );
  });

  /**
   * 跨类别批量诊断预估（Requirement 3）：零模型零写库。
   * 圈选 = 类别 ∩ 聚类 ∩ 规则命中；不可诊断项逐条列原因，缺规则集按 422/503 如实报错。
   */
  routes.post('/diagnose/estimate', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = parseBatchEstimateBody(body);
    if (parsed.value === undefined) {
      return c.json({ error: parsed.error ?? '请求体不合法' }, 400);
    }
    const registry = loadRouteRuleSet(deps.ruleSet);
    if (registry.error !== null) return c.json({ error: registry.error.message }, 422);
    if (registry.ruleSet === null) return c.json({ error: '规则集未加载，无法预估本轮成本' }, 503);
    if (registry.ruleSet.version.trim() === '' || registry.ruleSet.rules.length === 0) {
      return c.json({ error: '规则集不完整（缺版本或无有效规则），无法预估' }, 422);
    }

    const snapshot = await load();
    const list = deps.listAssets ?? nodeListAssets;
    const read = deps.read ?? nodeRead;
    const kinds = parsed.value.kinds ?? [...DOCTOR_ASSET_KINDS];

    let allowedPaths: Set<string> | null = null;
    if (parsed.value.clusterKeys !== undefined) {
      const queue = collectGovernanceQueue(snapshot.assets, snapshot.groups, Number.MAX_SAFE_INTEGER);
      const keys = new Set(parsed.value.clusterKeys);
      allowedPaths = new Set(
        queue.items.filter((item) => keys.has(clusterKeyOf(item))).map((item) => item.hubRelativePath),
      );
    }

    const candidates: BatchDiagnoseCandidate[] = [];
    for (const kind of kinds) {
      for (const path of list(kind)) {
        if (allowedPaths !== null && !allowedPaths.has(path)) continue;
        const hubInternal = isHubInternalPath(path);
        candidates.push({
          kind,
          hubRelativePath: path,
          content: hubInternal ? read(path) : null,
          hubInternal,
        });
      }
    }
    const selected = filterCandidatesByRuleIds(registry.ruleSet, parsed.value.ruleIds ?? [], candidates);

    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    const aiConfigured = deps.aiConfigured === undefined ? isAiConfigComplete(config) : deps.aiConfigured();
    const cache = deps.doctorCache ?? nodeDoctorCacheStore;
    const rulesHash = hashRuleSet(registry.ruleSet);
    const entries = aiConfigured ? sanitizeDoctorEntries(cache.load()) : {};

    const estimate = estimateBatchDiagnosis({
      ruleSet: registry.ruleSet,
      candidates: selected,
      aiConfigured,
      isCached: ({ kind, content }) =>
        entries[computeDoctorCacheKey({ kind, content, rulesHash, model: config.model })] !== undefined,
      ...(deps.now === undefined ? {} : { now: deps.now }),
    });
    return c.json(estimate);
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

    return c.json({
      dimension,
      total: items.length,
      items: items.slice(offset, offset + limit).map((item) => ({
        ...item,
        // 规则编号与置信度在快照层尚不可得：按标题口径如实标注，前端不得自造
        ruleId: null,
        keySource: 'title',
        confidence: 'medium',
        source: item.source ?? 'rule',
        ignored: false,
        evidence: [],
        deepLink: assetDeepLink(item.kind, item.hubRelativePath),
      })),
    });
  });

  // 一键整改子路由：复用同一份资产快照，写库后清空健康分缓存
  routes.route(
    '/remediation',
    createRemediationRoutes({
      ...deps.remediation,
      loadAssets: async () => (await load()).assets,
      read: deps.read ?? nodeRead,
      invalidate: () => {
        snapshot.invalidate();
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
        snapshot.invalidate();
        deps.duplicates?.invalidate?.();
      },
    }),
  );

  return routes;
}
