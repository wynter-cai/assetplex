/**
 * 技能批量分发预览路由（refactor-skill-catalog T13）
 *
 * POST /api/skills/distribution/preview  影响清单（零写入）+ 快照 token
 *
 * 复用资产写入引擎（proposal D5）；目标路径只给工具内相对路径，不回传本机绝对路径。
 */

import { Hono } from 'hono';
import type { AssetWriteEngine } from '../../core/asset-write.js';
import type { ToolAdapter } from '../../core/adapters/base.js';
import type { SkillFs, SkillOverrideStore, SkillSources } from '../../core/skills-inventory.js';
import { listSkills } from '../../core/skills-inventory.js';
import { hubContext } from '../lib/hub-context.js';
import { nodeAgentFs } from '../lib/node-agent-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';
import { buildDistributionPreview, resolveDistributionSelection } from '../lib/skill-distribution.js';
import { DistributionTokenStore } from '../lib/skill-distribution-types.js';
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
