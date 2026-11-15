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
import { assetDeepLink, buildQualityOverview, type QualityCoverage } from '../../core/quality-overview.js';
import { ruleAppliesToKind } from '../../core/diagnosis-static.js';
import { loadRuleRegistryFromFile, resolveRuleSetFile } from '../../core/diagnosis-rules.js';
import {
  countActiveIgnores,
  sanitizeIgnoredFindings,
  type DiagnosisIgnoreStore,
} from '../../core/diagnosis-ignore.js';
import {
  createGovernanceSnapshot,
  nodeRead,
  type GovernanceSnapshotDeps,
} from '../lib/governance-snapshot.js';
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
    semanticEvaluated: aiConfigured && assets.some((asset) => asset.semanticEvaluated),
  };
}

export function createGovernanceRoutes(deps: GovernanceRouteDeps = {}): Hono {
  const routes = new Hono();

  /** 共享治理快照装配（30 秒缓存；refresh=1 强制绕过，写库后失效） */
  const snapshot = createGovernanceSnapshot(deps);
  const load = snapshot.load;

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
    const aiConfigured = snapshot.health.qualityMode === 'mechanical+ai';
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
