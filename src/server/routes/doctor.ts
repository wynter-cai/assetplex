/**
 * 资产医生路由（add-asset-doctor E5）
 *
 * POST /api/doctor/diagnose  单资产体检（advisory-only：只读+调模型，永不写库）
 * GET  /api/doctor/estimate  批量体检前的预算估算（Scenario 5：>50 次调用需二次确认）
 *
 * 错误约定（api-contract）：400 请求体非法 / 403 非库内资产（医生只服务资产侧）/
 * 404 资产文件不存在 / 422 模型输出非法（"诊断失败：<原因>"）/ 500 其他。
 * AI 未配置不是错误：diagnose 返回 200 机械降级报告（Scenario 7）。
 * spec: 设计文档/changes/add-asset-doctor/specs/asset-diagnosis.spec.md
 */

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { diagnoseAsset, DiagnosisAssetError, DiagnosisOutputError } from '../../core/doctor.js';
import { computeDoctorCacheKey, sanitizeDoctorEntries, type DoctorCacheStore } from '../../core/doctor-cache.js';
import { hashCriteria, listCriteria, type CriterionAsset } from '../../core/criteria.js';
import { loadAiClassifyConfig, isAiConfigComplete, type AiConfigStore } from '../../core/ai-config.js';
import type { LlmClient } from '../../core/skill-ai-classification.js';
import { DOCTOR_ASSET_KINDS, type DoctorAssetKind } from '../../core/types.js';
import { listHubFiles, type HubFileCategory } from '../../core/hub-files.js';
import { nodeAiConfigStore, nodeDoctorCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';

export interface DoctorRouteDeps {
  /** 资产内容读取（按 Hub 相对路径）；缺省 Node 实现（越界视为读不到） */
  fs?: { read(hubRelativePath: string): string | null };
  /** 库内某类别资产的文件清单（Hub 相对路径）；缺省按 Hub 目录枚举 */
  listAssets?: (kind: DoctorAssetKind) => string[];
  getCriteria?: () => CriterionAsset[];
  cache?: DoctorCacheStore;
  llmClient?: LlmClient;
  aiConfigStore?: AiConfigStore;
  now?: () => string;
}

/** 医生类别 → Hub 目录（hub-files HubFileCategory 的单值映射） */
const KIND_TO_HUB_DIR: Record<DoctorAssetKind, HubFileCategory> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

/**
 * 库内资产判定：必须是非绝对路径，且规范化后仍在 Hub 根内。
 * 绝对路径/越界 = 工具侧或环境条目 → 医生不提供（spec「定义」：诊断范围=资产侧）。
 * 修复/分发路由（routes/doctor-fix.ts）共用同一守卫。
 */
export function isHubInternalPath(relativePath: string): boolean {
  if (relativePath.trim() === '' || isAbsolute(relativePath) || /^[A-Za-z]:[\\/]/.test(relativePath)) {
    return false;
  }
  const hubRoot = getHubRoot();
  const full = resolve(hubRoot, relativePath);
  return full !== hubRoot && full.startsWith(hubRoot + sep);
}

const nodeRead = {
  read: (hubRelativePath: string): string | null => {
    try {
      if (!isHubInternalPath(hubRelativePath)) return null;
      const full = resolve(getHubRoot(), hubRelativePath);
      if (!existsSync(full)) return null;
      return readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
  },
};

/** 默认资产枚举：技能只取包主文件 SKILL.md，其余类别取目录内全部文件 */
const nodeListAssets = (kind: DoctorAssetKind): string[] => {
  const files = listHubFiles(KIND_TO_HUB_DIR[kind]);
  return files
    .filter((f) => !f.isDirectory)
    .filter((f) => (kind === 'skill' ? f.relativePath.endsWith('/SKILL.md') : true))
    .map((f) => f.relativePath);
};

/** 请求体校验：合法返回诊断输入，非法返回错误文案与状态码（fix-draft 路由共用 kind/hubRelativePath 守卫） */
export function parseDiagnoseBody(body: unknown): { input?: { kind: DoctorAssetKind; hubRelativePath: string }; error?: string; status?: 400 | 403 } {
  if (typeof body !== 'object' || body === null) return { error: '请求体必须是 JSON 对象', status: 400 };
  const p = body as Record<string, unknown>;
  if (typeof p.kind !== 'string' || !(DOCTOR_ASSET_KINDS as readonly string[]).includes(p.kind)) {
    return { error: `kind 必须是 ${DOCTOR_ASSET_KINDS.join('/')}`, status: 400 };
  }
  if (typeof p.hubRelativePath !== 'string' || p.hubRelativePath.trim() === '') {
    return { error: 'hubRelativePath 必须是非空字符串', status: 400 };
  }
  if (!isHubInternalPath(p.hubRelativePath)) {
    return { error: '医生只服务库内资产：hubRelativePath 必须是 Hub 内相对路径', status: 403 };
  }
  return { input: { kind: p.kind as DoctorAssetKind, hubRelativePath: p.hubRelativePath } };
}

function parseEstimateCategory(raw: string | undefined): { kind?: DoctorAssetKind; error?: string } {
  if (raw === undefined || raw === '') return { error: `category 必须是 ${DOCTOR_ASSET_KINDS.join('/')}` };
  if (!(DOCTOR_ASSET_KINDS as readonly string[]).includes(raw)) {
    return { error: `category「${raw}」不在医生类别闭集内` };
  }
  return { kind: raw as DoctorAssetKind };
}

export function createDoctorRoutes(deps: DoctorRouteDeps = {}): Hono {
  const routes = new Hono();
  const fs = deps.fs ?? nodeRead;
  const listAssets = deps.listAssets ?? nodeListAssets;

  routes.post('/diagnose', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = parseDiagnoseBody(body);
    if (parsed.input === undefined) {
      return c.json({ error: parsed.error ?? '请求体不合法' }, parsed.status ?? 400);
    }

    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    const llm = deps.llmClient ?? createOpenAiLlmClient(config);

    try {
      const report = await diagnoseAsset(parsed.input, {
        fs,
        getCriteria: deps.getCriteria ?? listCriteria,
        cache: deps.cache ?? nodeDoctorCacheStore,
        llm,
        config,
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
      return c.json(report);
    } catch (err) {
      if (err instanceof DiagnosisAssetError) return c.json({ error: err.message }, 404);
      if (err instanceof DiagnosisOutputError) return c.json({ error: err.message }, 422);
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  routes.get('/estimate', (c) => {
    const { kind, error } = parseEstimateCategory(c.req.query('category'));
    if (kind === undefined) {
      return c.json({ error: error ?? 'category 非法' }, 400);
    }
    const assets = listAssets(kind);
    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    // AI 未配置：批量只跑机械项，零模型调用（Scenario 7 批量口径）
    if (!isAiConfigComplete(config)) {
      return c.json({ category: kind, total: assets.length, cacheHits: 0, willCall: 0 });
    }
    const criteria = (deps.getCriteria ?? listCriteria)();
    const criteriaHash = hashCriteria(criteria);
    const entries = sanitizeDoctorEntries(deps.cache !== undefined ? deps.cache.load() : nodeDoctorCacheStore.load());
    let cacheHits = 0;
    for (const path of assets) {
      const content = fs.read(path);
      if (content === null) continue;
      const key = computeDoctorCacheKey({ kind, content, criteriaHash, model: config.model });
      if (entries[key] !== undefined) cacheHits += 1;
    }
    return c.json({ category: kind, total: assets.length, cacheHits, willCall: assets.length - cacheHits });
  });

  return routes;
}
