/**
 * 技能批量分发后端路由（refactor-skill-catalog T13 / T14）
 *
 * POST /api/skills/distribution/preview  影响清单（零写入）+ 快照 token
 * POST /api/skills/distribution/execute  校验 token 后逐工具分发，结果附 swapId
 *
 * 一律复用资产写入引擎（proposal D5）；预览与执行都不回传本机绝对路径。
 */

import { Hono } from 'hono';
import { join } from 'node:path';
import type { AssetWriteEngine } from '../../core/asset-write.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import type { SkillFs, SkillOverrideStore, SkillSources } from '../../core/skills-inventory.js';
import { listSkills } from '../../core/skills-inventory.js';
import { getHubRoot } from '../../utils/paths.js';
import { computeSkillContentHash } from '../../core/skill-diagnosis-summary.js';
import { hubContext } from '../lib/hub-context.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';
import {
  buildDistributionPreview,
  executeDistribution,
  resolveDistributionSelection,
} from '../lib/skill-distribution.js';
import {
  DistributionTokenStore,
  type DistributionTokenRecord,
} from '../lib/skill-distribution-types.js';
import { defaultSkillSources } from './skills.js';

export interface SkillDistributionRouteDeps {
  fs: SkillFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  listAdapters: () => ToolAdapter[];
  getEngine: () => AssetWriteEngine;
  /** 当前时间（毫秒），测试可注入以验证过期语义 */
  now?: () => number;
}

/** 解析并去重 ids；非法返回 null */
function parseIds(body: unknown): string[] | null {
  const raw = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '') return null;
    const id = item.trim();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** 解析执行目标；非法返回 null */
function parseTargets(body: unknown): Array<{ tool: string; overwriteConflicts: boolean }> | null {
  const raw = (body as { targets?: unknown } | null)?.targets;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const targets: Array<{ tool: string; overwriteConflicts: boolean }> = [];
  for (const item of raw) {
    const target = item as { tool?: unknown; overwriteConflicts?: unknown } | null;
    if (typeof target?.tool !== 'string' || target.tool.trim() === '') return null;
    if (typeof target.overwriteConflicts !== 'boolean') return null;
    targets.push({ tool: target.tool.trim(), overwriteConflicts: target.overwriteConflicts });
  }
  return targets;
}

/** 当前技能正文哈希；文件读不到返回 null（与预览快照不一致即视为目录已变） */
function currentHashOf(fs: SkillFs, hubRelativePath: string): string | null {
  const raw = fs.read(join(getHubRoot(), ...hubRelativePath.split('/')));
  return raw === null ? null : computeSkillContentHash(raw);
}

/** token 状态校验：已执行 409 / 已过期 409 */
function tokenError(record: DistributionTokenRecord, nowMs: number): { status: 409; message: string } | null {
  if (record.used) return { status: 409, message: '该预览快照已执行过，请重新预览' };
  if (record.expiresAtMs <= nowMs) return { status: 409, message: '预览快照已过期，请重新预览' };
  return null;
}

export function skillDistributionRoutesFactory(deps: SkillDistributionRouteDeps): Hono {
  const routes = new Hono();
  const tokens = new DistributionTokenStore();
  const now = deps.now ?? Date.now;

  /** 影响清单：逐工具预览过滤所选技能，统计四态；本请求不写任何文件 */
  routes.post('/distribution/preview', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const ids = parseIds(body);
    if (ids === null) return c.json({ error: 'ids 必须是非空字符串数组' }, 400);

    const listing = listSkills({ fs: deps.fs, sources: deps.sources, store: deps.store });
    const selection = resolveDistributionSelection({
      ids,
      listing,
      fs: deps.fs,
      vaultSkillsDir: deps.sources.vaultSkillsDir,
    });
    const nowMs = now();
    const { preview, snapshots } = await buildDistributionPreview({
      skills: selection.skills,
      ineligible: selection.ineligible,
      adapters: deps.listAdapters(),
      engine: deps.getEngine(),
      generatedAt: new Date(nowMs).toISOString(),
    });
    const { token, expiresAt } = tokens.create({ skills: selection.skills, tools: snapshots }, nowMs);
    return c.json({ ...preview, token, expiresAt });
  });

  /** 执行：token 快照校验 → 逐工具引擎执行；冲突默认跳过，单工具失败不中断 */
  routes.post('/distribution/execute', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const rawToken = (body as { token?: unknown } | null)?.token;
    if (typeof rawToken !== 'string' || rawToken.trim() === '') {
      return c.json({ error: 'token 必须是非空字符串' }, 400);
    }
    const targets = parseTargets(body);
    if (targets === null) {
      return c.json({ error: 'targets 必须是非空数组，每项含 tool 与 overwriteConflicts' }, 400);
    }

    const nowMs = now();
    const record = tokens.get(rawToken.trim());
    if (record === undefined) {
      return c.json({ error: '预览快照不存在或已失效，请重新预览' }, 404);
    }
    const invalid = tokenError(record, nowMs);
    if (invalid !== null) {
      return c.json({ error: invalid.message }, invalid.status);
    }

    const unknown = targets.find((t) => !record.tools.some((s) => s.tool === t.tool));
    if (unknown !== undefined) {
      return c.json({ error: `预览快照中不含目标工具：${unknown.tool}` }, 400);
    }
    if (record.skills.some((s) => currentHashOf(deps.fs, s.hubRelativePath) !== s.contentHash)) {
      return c.json({ error: '技能正文已变化，请重新预览' }, 409);
    }

    tokens.markUsed(record.id);
    const response = await executeDistribution({ record, targets, engine: deps.getEngine() });
    return c.json(response);
  });

  return routes;
}

/** 默认路由（真实文件系统 + Hub 上下文单例） */
export const skillDistributionRoutes = skillDistributionRoutesFactory({
  fs: nodeAgentFs,
  sources: defaultSkillSources(),
  store: nodeSkillOverrideStore,
  listAdapters: () => hubContext.getAllAdapters(),
  getEngine: () => hubContext.getAssetWriteEngine(),
});
