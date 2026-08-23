/**
 * Hub 文件 CRUD 路由
 */

import { Hono } from 'hono';
import {
  listHubFiles,
  readHubFile,
  writeHubFile,
  deleteHubFile,
  createHubFile,
  HUB_CATEGORIES,
  type HubFileCategory,
} from '../../core/hub-files.js';

export const filesRoutes = new Hono();

/** 列出 Hub 文件（按类别） */
filesRoutes.get('/', (c) => {
  const category = c.req.query('category') as HubFileCategory | undefined;

  if (category) {
    if (!HUB_CATEGORIES.includes(category)) {
      return c.json(
        { error: `无效的类别：${category}，支持：${HUB_CATEGORIES.join(', ')}` },
        400,
      );
    }
    return c.json({ files: listHubFiles(category) });
  }

  // 无 category 时返回所有类别
  const allFiles = HUB_CATEGORIES.flatMap((cat) => listHubFiles(cat));
  return c.json({ files: allFiles });
});

/** 读取单个文件 */
filesRoutes.get('/*', (c) => {
  const path = c.req.path.replace('/api/files/', '');
  if (!path) {
    return c.json({ error: '缺少文件路径' }, 400);
  }
  const file = readHubFile(path);
  if (!file) {
    return c.json({ error: `文件不存在：${path}` }, 404);
  }
  return c.json({ path, ...file });
});

/** 写入文件（已存在则覆盖） */
filesRoutes.put('/*', async (c) => {
  const path = c.req.path.replace('/api/files/', '');
  if (!path) {
    return c.json({ error: '缺少文件路径' }, 400);
  }
  const body = await c.req.json();
  if (typeof body.content !== 'string') {
    return c.json({ error: '请求体必须包含 content 字段' }, 400);
  }
  writeHubFile(path, body.content);
  return c.json({ success: true, path });
});

/** 创建新文件（已存在则报错） */
filesRoutes.post('/', async (c) => {
  const body = await c.req.json();
  if (typeof body.path !== 'string' || typeof body.content !== 'string') {
    return c.json({ error: '请求体必须包含 path 和 content 字段' }, 400);
  }
  try {
    createHubFile(body.path, body.content);
    return c.json({ success: true, path: body.path });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

/** 删除文件 */
filesRoutes.delete('/*', (c) => {
  const path = c.req.path.replace('/api/files/', '');
  if (!path) {
    return c.json({ error: '缺少文件路径' }, 400);
  }
  try {
    deleteHubFile(path);
    return c.json({ success: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});
