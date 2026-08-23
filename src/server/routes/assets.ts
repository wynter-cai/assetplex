/**
 * 资产 API 路由
 *
 * 提供资产列表查询、单资产详情、创建/更新/删除、分发配置等接口。
 * 对应 api-contract: ListAssetsApi, GetAssetApi, CreateAssetApi, UpdateAssetApi 等
 */

import { Hono } from 'hono';
import { listAssets, getAsset } from '../../core/assets.js';
import { createHubFile, writeHubFile } from '../../core/hub-files.js';
import type { AssetCategory } from '../../core/assets.js';

export const assetsRoutes = new Hono();

/** 列出资产 */
assetsRoutes.get('/', async (c) => {
  const category = c.req.query('category') as AssetCategory | undefined;
  const search = c.req.query('search') as string | undefined;

  // 校验 category
  const validCategories: AssetCategory[] = ['identity', 'skill', 'rule', 'mcp'];
  if (category && !validCategories.includes(category)) {
    return c.json({ error: `无效类别：${category}，支持：${validCategories.join(', ')}` }, 400);
  }

  const result = await listAssets({ category, search });
  return c.json(result);
});

/** 获取单个资产详情 */
assetsRoutes.get('/:id{.+}', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ error: '缺少资产ID' }, 400);

  // ID 即 hubPath，需要从 URL 中还原路径
  const hubPath = decodeURIComponent(id);
  const asset = await getAsset(hubPath);
  if (!asset) {
    return c.json({ error: `资产不存在：${hubPath}` }, 404);
  }
  return c.json(asset);
});

/** 创建新资产 */
assetsRoutes.post('/', async (c) => {
  const body = await c.req.json<{ name: string; category: AssetCategory; content: string }>();
  if (!body.name || !body.category || typeof body.content !== 'string') {
    return c.json({ error: '必须提供 name、category、content 字段' }, 400);
  }

  const validCategories: AssetCategory[] = ['identity', 'skill', 'rule', 'mcp'];
  if (!validCategories.includes(body.category)) {
    return c.json({ error: `无效类别：${body.category}` }, 400);
  }

  // 前端类别 → 后端目录
  const dirMap: Record<AssetCategory, string> = {
    identity: 'identity',
    skill: 'skills',
    rule: 'rules',
    mcp: 'mcp',
  };
  const ext = body.category === 'mcp' ? '.json' : '.md';
  const hubPath = `${dirMap[body.category]}/${body.name}${ext}`;

  try {
    createHubFile(hubPath, body.content);
    const asset = await getAsset(hubPath);
    return c.json({ asset }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/** 更新资产内容 */
assetsRoutes.put('/:id{.+}', async (c) => {
  const id = c.req.param('id');
  const hubPath = decodeURIComponent(id);
  const body = await c.req.json<{ content: string }>();
  if (typeof body.content !== 'string') {
    return c.json({ error: '必须提供 content 字段' }, 400);
  }

  try {
    writeHubFile(hubPath, body.content);
    const asset = await getAsset(hubPath);
    return c.json({ asset });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
