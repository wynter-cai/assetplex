/**
 * 资产医生修复与分发路由（add-asset-doctor F2/F3）
 *
 * POST /api/doctor/fix-draft  生成改写草案（Scenario 1：此阶段零写库，只回文本）
 * POST /api/doctor/apply      用户一屏确认后：备份 → 写库 → 可选分发（Scenario 2-6）
 * POST /api/doctor/undo       按 backupRef 撤销库内修复（Scenario 3；分发侧回滚走 /api/swap/rollback）
 *
 * 信任红线（proposal D2/D4）：模型只产草案，落盘唯一入口是 apply 且必须携带用户确认的最终内容。
 * spec: 设计文档/changes/add-asset-doctor/specs/fix-and-distribute.spec.md
 */

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { diagnoseAsset, DiagnosisAssetError, DiagnosisOutputError } from '../../core/doctor.js';
import {
  generateFixDraft,
  FixDraftOutputError,
  FixDraftTruncatedError,
  FixDraftUnavailableError,
  type FixDraftCacheStore,
  type SelectedFixIssue,
} from '../../core/doctor-fix.js';
import type { DoctorCacheStore } from '../../core/doctor-cache.js';
import { listCriteria, type CriterionAsset } from '../../core/criteria.js';
import { loadAiClassifyConfig, type AiConfigStore } from '../../core/ai-config.js';
import type { LlmClient } from '../../core/skill-ai-classification.js';
import {
  applyAssetFix,
  undoApplyFix,
  ApplyAssetError,
  UndoBackupError,
  type DoctorApplyPorts,
  type UndoApplyPorts,
} from '../../core/doctor-apply.js';
import { backupHubFileForDoctor, readDoctorBackup } from '../../core/doctor-backup.js';
import { writeHubFile } from '../../core/hub-files.js';
import { invalidateDistributionIndex } from '../../core/distribution-index.js';
import { hubContext } from '../lib/hub-context.js';
import { dispatchToolViaSwap, resolveDefaultTargets } from '../lib/doctor-dispatch.js';
import { nodeAiConfigStore, nodeDoctorCacheStore, nodeFixDraftCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';
import { parseDiagnoseBody } from './doctor.js';

export interface DoctorFixRouteDeps {
  /** 资产内容读取（与诊断路由同口径：越界视为读不到） */
  fs?: { read(hubRelativePath: string): string | null };
  getCriteria?: () => CriterionAsset[];
  /** 诊断缓存：fix-draft 前重新诊断以对齐 issueIndexes 与报告 */
  doctorCache?: DoctorCacheStore;
  /** 草案缓存 */
  fixCache?: FixDraftCacheStore;
  llmClient?: LlmClient;
  aiConfigStore?: AiConfigStore;
  /** 写库+分发端口（缺省 Node 实现：doctor-backup + hub-files + swap 单资产通道） */
  apply?: DoctorApplyPorts;
  /** 撤销端口 */
  undo?: UndoApplyPorts;
  now?: () => string;
}

/** Node 分发端口依赖：hubContext 单例引擎 + 安装检测（懒调用，测试注入不触达） */
function nodeDispatchDeps() {
  return {
    getSwapEngine: () => hubContext.getSwapEngine(),
    listInstalledTools: async (): Promise<string[]> => {
      const out: string[] = [];
      for (const adapter of hubContext.getAllAdapters()) {
        try {
          if ((await adapter.detect()).installed) out.push(adapter.name);
        } catch {
          // detect 失败视为未安装
        }
      }
      return out;
    },
  };
}

const nodeApplyPorts: DoctorApplyPorts = {
  read: (hubRelativePath) => {
    try {
      const full = resolve(getHubRoot(), hubRelativePath);
      return existsSync(full) ? readFileSync(full, 'utf-8') : null;
    } catch {
      return null;
    }
  },
  backup: (hubRelativePath) => backupHubFileForDoctor(hubRelativePath),
  write: (hubRelativePath, content) => writeHubFile(hubRelativePath, content),
  defaultTargets: (hubRelativePath) => resolveDefaultTargets(nodeDispatchDeps(), hubRelativePath),
  dispatchTool: (tool, hubRelativePath) => dispatchToolViaSwap(nodeDispatchDeps(), tool, hubRelativePath),
};

const nodeUndoPorts: UndoApplyPorts = {
  readBackup: (backupRef) => readDoctorBackup(backupRef),
  write: (hubRelativePath, content) => writeHubFile(hubRelativePath, content),
};

/** issueIndexes 校验：非空、非负整数、无重复 */
function parseIssueIndexes(raw: unknown): { indexes?: number[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'issueIndexes 必须是非空数组' };
  const indexes: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return { error: 'issueIndexes 必须是非负整数下标' };
    indexes.push(v);
  }
  if (new Set(indexes).size !== indexes.length) return { error: 'issueIndexes 含重复下标' };
  return { indexes };
}

export function createDoctorFixRoutes(deps: DoctorFixRouteDeps = {}): Hono {
  const routes = new Hono();
  const fs = deps.fs ?? {
    read: (hubRelativePath: string): string | null => nodeApplyPorts.read(hubRelativePath),
  };

  /** 草案生成：诊断取报告 → 校验选中问题 → 产文本；全程不写库（Scenario 1） */
  routes.post('/fix-draft', async (c) => {
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
    const { indexes, error } = parseIssueIndexes((body as Record<string, unknown>).issueIndexes);
    if (indexes === undefined) {
      return c.json({ error: error ?? 'issueIndexes 非法' }, 400);
    }

    const config = loadAiConfig(deps);
    const llm = deps.llmClient ?? createOpenAiLlmClient(config);
    try {
      const report = await diagnoseAsset(parsed.input, {
        fs,
        getCriteria: deps.getCriteria ?? listCriteria,
        cache: deps.doctorCache ?? nodeDoctorCacheStore,
        llm,
        config,
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
      const selected: SelectedFixIssue[] = [];
      for (const idx of indexes) {
        const issue = report.issues[idx];
        if (issue === undefined) {
          return c.json({ error: `issueIndexes 越界：${idx}（报告共 ${report.issues.length} 条）` }, 400);
        }
        if (!issue.fixable) {
          return c.json({ error: `问题 ${idx} 不可修复（纯建议项），请选择可修复的问题` }, 400);
        }
        selected.push({ index: idx, issue });
      }
      const draft = await generateFixDraft(
        { ...parsed.input, selected },
        {
          fs,
          getCriteria: deps.getCriteria ?? listCriteria,
          cache: deps.fixCache ?? nodeFixDraftCacheStore,
          llm,
          config,
          ...(deps.now === undefined ? {} : { now: deps.now }),
        },
      );
      return c.json(draft);
    } catch (err) {
      if (err instanceof DiagnosisAssetError) return c.json({ error: err.message }, 404);
      if (err instanceof DiagnosisOutputError || err instanceof FixDraftOutputError) {
        return c.json({ error: err.message }, 422);
      }
      if (err instanceof FixDraftUnavailableError || err instanceof FixDraftTruncatedError) {
        return c.json({ error: err.message }, 400);
      }
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /** 应用修复：一次确认后依次 备份 → 写库 → 逐工具分发（Scenario 2-6） */
  routes.post('/apply', async (c) => {
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
    const p = (body ?? {}) as Record<string, unknown>;
    if (typeof p.finalContent !== 'string' || p.finalContent === '') {
      return c.json({ error: 'finalContent 必须是非空字符串（以用户确认版本为准）' }, 400);
    }
    if (typeof p.distribute !== 'boolean') {
      return c.json({ error: 'distribute 必须是布尔值（false=只改库不分发）' }, 400);
    }
    if (p.targets !== undefined && (!Array.isArray(p.targets) || !p.targets.every((t) => typeof t === 'string'))) {
      return c.json({ error: 'targets 必须是工具名字符串数组' }, 400);
    }
    try {
      const result = await applyAssetFix(
        { ...parsed.input, finalContent: p.finalContent, distribute: p.distribute, ...(p.targets === undefined ? {} : { targets: p.targets as string[] }) },
        deps.apply ?? nodeApplyPorts,
      );
      // apply 可能同时写库并分发，状态索引需重算（proposal D2）
      invalidateDistributionIndex();
      return c.json(result);
    } catch (err) {
      if (err instanceof ApplyAssetError) return c.json({ error: err.message }, 404);
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /** 撤销本次修复：按 backupRef 恢复库内旧版（Scenario 3；分发回滚走 swap 既有入口） */
  routes.post('/undo', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const p = (body ?? {}) as Record<string, unknown>;
    if (typeof p.backupRef !== 'string' || p.backupRef === '') {
      return c.json({ error: 'backupRef 必须是非空字符串' }, 400);
    }
    try {
      const result = await undoApplyFix(p.backupRef, deps.undo ?? nodeUndoPorts);
      invalidateDistributionIndex();
      return c.json(result);
    } catch (err) {
      if (err instanceof UndoBackupError) return c.json({ error: err.message }, 404);
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return routes;
}

function loadAiConfig(deps: DoctorFixRouteDeps) {
  return loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
}
