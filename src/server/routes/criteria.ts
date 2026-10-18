/**
 * 裁决准则路由（add-llm-conflict-arbitration A5）
 *
 * 只读聚合 + 业内准则包导入。单条准则的增删改查走现有 /api/files
 * （criteria 已入 HUB_CATEGORIES，零新写库通道）；本路由提供：
 * - GET  /api/criteria          frontmatter 解析后的准则清单（UI 列表，priority→slug 序）
 * - GET  /api/criteria/pack     内置业内准则包模板元数据（UI 勾选导入用，不含正文）
 * - POST /api/criteria/import-pack  按勾选导入；同名拒绝不覆盖（Scenario 1b/3）
 *
 * spec: specs/criteria-meta-asset.spec.md
 */

import { Hono } from 'hono';
import { listCriteria } from '../../core/criteria.js';
import { CRITERIA_PACK, insertCriteriaPack } from '../../core/criteria-pack.js';

export const criteriaRoutes = new Hono();

/** 库内准则清单（解析后全字段） */
criteriaRoutes.get('/', (c) => c.json({ criteria: listCriteria() }));

/** 业内准则包模板列表：仅元数据，正文不进列表避免响应膨胀 */
criteriaRoutes.get('/pack', (c) => {
  const templates = CRITERIA_PACK.map(
    ({ slug, name, description, priority, appliesTo, source }) => ({
      slug,
      name,
      description,
      priority,
      appliesTo,
      source,
    }),
  );
  return c.json({ templates });
});

/** 按勾选导入准则包；已有同名文件拒绝且内容零变化 */
criteriaRoutes.post('/import-pack', async (c) => {
  const body = await c.req.json().catch(() => null);
  const slugs: unknown = body !== null && typeof body === 'object' ? (body as { slugs?: unknown }).slugs : undefined;
  if (!Array.isArray(slugs) || !slugs.every((s): s is string => typeof s === 'string')) {
    return c.json({ error: '请求体必须包含 slugs 字符串数组' }, 400);
  }
  return c.json(insertCriteriaPack(slugs));
});
