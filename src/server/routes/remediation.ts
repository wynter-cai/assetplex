/**
 * 一键整改路由（add-asset-governance I2/I3）
 *
 * POST /api/governance/remediation/plan   生成计划（零写库、零模型调用）
 * POST /api/governance/remediation/apply  一次确认后逐项执行：草案 → 备份 → 写库 → 可选分发
 * POST /api/governance/remediation/undo   按 batchId 逐项恢复库内旧版
 *
 * 信任红线（沿用 add-asset-doctor D2/D4）：模型只产草案，写库唯一入口是 apply；
 * 单项失败不中断批次，结束给出成功/失败/跳过汇总与 batchId（proposal 风险预留）。
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { DOCTOR_ASSET_KINDS, type DiagnosisIssue, type DoctorAssetKind } from '../../core/types.js';
import {
  HEALTH_DIMENSION_IDS,
  type GovernanceAssetInput,
  type HealthDimensionId,
} from '../../core/governance-health.js';
import {
  buildRemediationPlan,
  type RemediationAssetInput,
  type RemediationPlan,
  type RemediationPlanRequest,
} from '../../core/governance-remediation.js';
import {
  generateFixDraft,
  computeFixDraftCacheKey,
  sanitizeFixDraftEntries,
  FixDraftUnavailableError,
  type FixDraftCacheStore,
  type SelectedFixIssue,
} from '../../core/doctor-fix.js';
import {
  applyAssetFix,
  undoApplyFix,
  ApplyAssetError,
  UndoBackupError,
  type DoctorApplyPorts,
  type UndoApplyPorts,
  type DoctorDispatchItem,
} from '../../core/doctor-apply.js';
import { hashCriteria, listCriteria, type CriterionAsset } from '../../core/criteria.js';
import { loadAiClassifyConfig, isAiConfigComplete, type AiConfigStore } from '../../core/ai-config.js';
import type { LlmClient } from '../../core/skill-ai-classification.js';
import { invalidateDistributionIndex } from '../../core/distribution-index.js';
import { appendActivity, type AppendActivityInput } from '../../core/activity-log.js';
import { nodeAiConfigStore, nodeFixDraftCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';
import {
  createNodeRemediationBatchStore,
  type RemediationBatchItemRecord,
  type RemediationBatchRecord,
  type RemediationBatchStore,
} from '../lib/remediation-batch-store.js';
import { nodeApplyPorts, nodeUndoPorts } from './doctor-fix.js';

export interface RemediationRouteDeps {
  /** 复用健康分装配结果（含机械项与缓存中的语义项） */
  loadAssets: () => Promise<GovernanceAssetInput[]>;
  read(hubRelativePath: string): string | null;
  /** 批次完成后清空健康分缓存（写库后分数需要重算） */
  invalidate?: () => void;
  getCriteria?: () => CriterionAsset[];
  fixCache?: FixDraftCacheStore;
  llmClient?: LlmClient;
  aiConfigStore?: AiConfigStore;
  /** 草案生成覆盖（测试注入；缺省走 doctor-fix 真实链路） */
  prepareDraft?: (input: {
    asset: RemediationAssetInput;
    selected: SelectedFixIssue[];
    content: string;
  }) => Promise<{ draftContent: string; cached: boolean }>;
  apply?: DoctorApplyPorts;
  undo?: UndoApplyPorts;
  batchStore?: RemediationBatchStore;
  /** 活动留痕（add-activity-log T8）；测试注入空实现避免写真实 Hub */
  recordActivity?: (input: AppendActivityInput) => void;
  now?: () => string;
}

export interface RemediationApplyItemResult {
  itemId: string;
  hubRelativePath: string;
  status: 'fixed' | 'failed' | 'skipped';
  backupRef?: string;
  dispatch?: DoctorDispatchItem[];
  reason?: string;
}

export interface RemediationApplyResponse {
  batchId: string;
  results: RemediationApplyItemResult[];
  succeeded: number;
  failed: number;
  skipped: number;
  rollbackAvailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseKinds(raw: unknown): DoctorAssetKind[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const kinds: DoctorAssetKind[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !(DOCTOR_ASSET_KINDS as readonly string[]).includes(item)) return null;
    kinds.push(item as DoctorAssetKind);
  }
  return kinds;
}

function parseDimension(raw: unknown): HealthDimensionId | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !(HEALTH_DIMENSION_IDS as readonly string[]).includes(raw)) return null;
  return raw as HealthDimensionId;
}

export function createRemediationRoutes(deps: RemediationRouteDeps): Hono {
  const routes = new Hono();
  const now = deps.now ?? (() => new Date().toISOString());
  const fixCache = deps.fixCache ?? nodeFixDraftCacheStore;
  const getCriteria = deps.getCriteria ?? listCriteria;
  const recordActivity = deps.recordActivity ?? ((input: AppendActivityInput) => void appendActivity(input));

  /** 组装计划输入：草案缓存命中 = 本次执行不消耗模型调用 */
  async function buildPlanInputs(): Promise<ReturnType<typeof collectPlanInputs>> {
    const assets = await deps.loadAssets();
    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    const aiReady = isAiConfigComplete(config);
    return collectPlanInputs(assets, {
      read: deps.read,
      criteriaHash: hashCriteria(getCriteria()),
      model: aiReady ? config.model : '',
      fixCache,
    });
  }

  routes.post('/plan', async (c) => {
    const body = await readJsonBody(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    const kinds = parseKinds(body.kinds);
    if (kinds === null) return c.json({ error: 'kinds 必须是资产类别数组' }, 400);
    const dimension = parseDimension(body.dimension);
    if (dimension === null) return c.json({ error: 'dimension 不在闭集内' }, 400);
    const maxAssets = body.maxAssets;
    if (maxAssets !== undefined && (typeof maxAssets !== 'number' || !Number.isInteger(maxAssets))) {
      return c.json({ error: 'maxAssets 必须是整数' }, 400);
    }

    const inputs = await buildPlanInputs();
    const request: RemediationPlanRequest & { now: () => string } = {
      now,
      ...(kinds === undefined ? {} : { kinds }),
      ...(dimension === undefined ? {} : { dimension }),
      ...(maxAssets === undefined ? {} : { maxAssets: maxAssets as number }),
    };
    const plan: RemediationPlan = buildRemediationPlan(inputs, request);
    return c.json(plan);
  });

  routes.post('/apply', async (c) => {
    const body = await readJsonBody(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    const itemIds = parseItemIds(body.itemIds);
    if (itemIds === null) return c.json({ error: 'itemIds 必须是非空字符串数组' }, 400);
    if (typeof body.distribute !== 'boolean') {
      return c.json({ error: 'distribute 必须是布尔值（false=只改库不分发）' }, 400);
    }
    const targets = parseTargets(body.targets);
    if (targets === null) return c.json({ error: 'targets 必须是工具名字符串数组' }, 400);

    const inputs = await buildPlanInputs();
    const plan = buildRemediationPlan(inputs);
    const byId = new Map(inputs.map((input) => [`${input.kind}:${input.hubRelativePath}`, input]));
    const known = new Set(plan.items.map((item) => item.id));
    const unknown = itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return c.json({ error: `未知 itemId：${unknown.join(', ')}` }, 400);
    }

    const batchId = randomUUID();
    const results: RemediationApplyItemResult[] = [];
    const records: RemediationBatchItemRecord[] = [];

    for (const itemId of itemIds) {
      const asset = byId.get(itemId);
      if (asset === undefined) continue;
      const allIssues: DiagnosisIssue[] = asset.issues;
      const selected: SelectedFixIssue[] = [];
      const planItem = plan.items.find((item) => item.id === itemId);
      for (const index of planItem?.issueIndexes ?? []) {
        const issue = allIssues[index];
        if (issue !== undefined && issue.fixable) selected.push({ index, issue });
      }
      if (selected.length === 0) {
        results.push({ itemId, hubRelativePath: asset.hubRelativePath, status: 'skipped', reason: '没有可修复问题' });
        records.push({ itemId, hubRelativePath: asset.hubRelativePath, status: 'skipped', reason: '没有可修复问题' });
        continue;
      }

      try {
        const prepared = await prepareDraftFor(deps, asset, selected);
        const applied = await applyAssetFix(
          {
            kind: asset.kind,
            hubRelativePath: asset.hubRelativePath,
            finalContent: prepared.draftContent,
            distribute: body.distribute,
            ...(targets === null ? {} : { targets }),
          },
          deps.apply ?? nodeApplyPorts,
        );
        results.push({
          itemId,
          hubRelativePath: asset.hubRelativePath,
          status: 'fixed',
          backupRef: applied.backupRef,
          dispatch: applied.dispatch,
        });
        records.push({
          itemId,
          hubRelativePath: asset.hubRelativePath,
          status: 'fixed',
          backupRef: applied.backupRef,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        results.push({ itemId, hubRelativePath: asset.hubRelativePath, status: 'failed', reason });
        records.push({ itemId, hubRelativePath: asset.hubRelativePath, status: 'failed', reason });
      }
    }

    const record: RemediationBatchRecord = { batchId, createdAt: now(), items: records };
    batchStoreFor(deps).save(record);
    invalidateDistributionIndex();
    deps.invalidate?.();

    const succeeded = results.filter((r) => r.status === 'fixed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const response: RemediationApplyResponse = {
      batchId,
      results,
      succeeded,
      failed,
      skipped,
      rollbackAvailable: succeeded > 0,
    };
    recordActivity({
      type: 'edit',
      summary: `一键整改：成功 ${succeeded}、失败 ${failed}、跳过 ${skipped}`,
      counts: { succeeded, failed, skipped },
      paths: results.filter((item) => item.status === 'fixed').map((item) => item.hubRelativePath),
    });
    return c.json(response);
  });

  routes.post('/undo', async (c) => {
    const body = await readJsonBody(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    if (typeof body.batchId !== 'string' || body.batchId === '') {
      return c.json({ error: 'batchId 必须是非空字符串' }, 400);
    }
    const record = batchStoreFor(deps).get(body.batchId);
    if (record === null) return c.json({ error: '批次不存在或记录已被清理' }, 404);

    const restored: string[] = [];
    const failures: Array<{ hubRelativePath: string; reason: string }> = [];
    for (const item of record.items) {
      if (item.status !== 'fixed' || item.backupRef === undefined) continue;
      try {
        const result = await undoApplyFix(item.backupRef, deps.undo ?? nodeUndoPorts);
        restored.push(result.hubRelativePath);
      } catch (err) {
        failures.push({
          hubRelativePath: item.hubRelativePath,
          reason: err instanceof UndoBackupError ? err.message : err instanceof Error ? err.message : String(err),
        });
      }
    }

    invalidateDistributionIndex();
    deps.invalidate?.();
    recordActivity({
      type: 'edit',
      summary: `撤销整改：恢复 ${restored.length} 个资产${failures.length > 0 ? `、失败 ${failures.length}` : ''}`,
      counts: { restored: restored.length, failed: failures.length },
      paths: restored,
    });
    return c.json({ restored, failures });
  });

  return routes;
}

// ============ 内部工具 ============

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseItemIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item === '') return null;
    ids.push(item);
  }
  return new Set(ids).size === ids.length ? ids : null;
}

function parseTargets(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) return null;
  return raw;
}

function collectPlanInputs(
  assets: GovernanceAssetInput[],
  env: {
    read(hubRelativePath: string): string | null;
    criteriaHash: string;
    model: string;
    fixCache: FixDraftCacheStore;
  },
) {
  const entries = sanitizeFixDraftEntries(env.fixCache.load());
  return assets
    .filter((asset) => asset.dataMissing !== true)
    .map((asset) => {
      const content = env.read(asset.hubRelativePath);
      const issues: DiagnosisIssue[] = [...asset.mechanicalIssues, ...asset.semanticIssues];
      const indexes = issues.map((issue, index) => (issue.fixable ? index : -1)).filter((i) => i >= 0);
      let cached = false;
      if (content !== null && env.model !== '' && indexes.length > 0) {
        const key = computeFixDraftCacheKey({
          kind: asset.kind,
          content,
          criteriaHash: env.criteriaHash,
          model: env.model,
          issueIndexes: indexes,
        });
        cached = entries[key] !== undefined;
      }
      return {
        kind: asset.kind,
        hubRelativePath: asset.hubRelativePath,
        name: asset.name,
        issues,
        cached,
      };
    });
}

const prepareDraftFor = async (
  deps: RemediationRouteDeps,
  asset: RemediationAssetInput,
  selected: SelectedFixIssue[],
): Promise<{ draftContent: string; cached: boolean }> => {
  const content = deps.read(asset.hubRelativePath);
  if (content === null) throw new ApplyAssetError(asset.hubRelativePath);
  if (deps.prepareDraft !== undefined) {
    return deps.prepareDraft({ asset, selected, content });
  }
  const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
  if (!isAiConfigComplete(config)) throw new FixDraftUnavailableError();
  const draft = await generateFixDraft(
    { kind: asset.kind, hubRelativePath: asset.hubRelativePath, selected },
    {
      fs: { read: deps.read },
      getCriteria: deps.getCriteria ?? listCriteria,
      cache: deps.fixCache ?? nodeFixDraftCacheStore,
      llm: deps.llmClient ?? createOpenAiLlmClient(config),
      config,
      ...(deps.now === undefined ? {} : { now: deps.now }),
    },
  );
  return { draftContent: draft.draftContent, cached: draft.cached };
};

function batchStoreFor(deps: RemediationRouteDeps): RemediationBatchStore {
  return deps.batchStore ?? createNodeRemediationBatchStore();
}
