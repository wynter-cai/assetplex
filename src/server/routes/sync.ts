/**
 * 同步操作相关路由
 */

import { Hono } from 'hono';
import { hubContext } from '../lib/hub-context.js';
import type { ImportRequest } from '../../core/types.js';

export const syncRoutes = new Hono();

// 简单内存历史记录（首版不持久化）
const syncHistory: Array<{
  timestamp: string;
  tool?: string;
  dryRun: boolean;
  results: unknown[];
}> = [];

/** 解析工具过滤参数：支持 ?tool=a&tool=b 或 ?tools=a,b */
function parseTools(query: Record<string, string | string[]>): { tool?: string; tools?: string[] } {
  const raw = query.tool;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const toolsRaw = query.tools;
  const fromCsv = (Array.isArray(toolsRaw) ? toolsRaw.join(',') : toolsRaw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const all = [...list, ...fromCsv];
  if (all.length === 0) return {};
  if (all.length === 1) return { tool: all[0] };
  return { tools: all };
}

/** 获取同步计划 */
syncRoutes.get('/plan', async (c) => {
  const filter = parseTools(c.req.query() as Record<string, string | string[]>);
  const engine = hubContext.getEngine();
  const plans = await engine.plan(filter);
  return c.json({ plans });
});

/** 执行同步 */
syncRoutes.post('/run', async (c) => {
  const filter = parseTools(c.req.query() as Record<string, string | string[]>);
  const dryRun = c.req.query('dryRun') === 'true';
  const engine = hubContext.getEngine();
  const results = await engine.run({ ...filter, dryRun });

  // 记录历史
  syncHistory.unshift({
    timestamp: new Date().toISOString(),
    tool: filter.tool,
    dryRun,
    results,
  });
  // 保留最近 20 条
  if (syncHistory.length > 20) syncHistory.pop();

  return c.json({ results });
});

/** 反向导入 */
syncRoutes.post('/reverse-import', async (c) => {
  const filter = parseTools(c.req.query() as Record<string, string | string[]>);
  const engine = hubContext.getEngine();
  const results = await engine.reverseImport(filter);
  return c.json({ results });
});

/** 同步历史记录 */
syncRoutes.get('/history', (c) => {
  return c.json({ history: syncHistory });
});

/** 扫描所有工具的可导入内容（导入向导 Step 1-2） */
syncRoutes.get('/scan', async (c) => {
  const engine = hubContext.getEngine();
  const inventories = await engine.scanAll();
  return c.json({ inventories });
});

/** 获取文件内容用于 diff 对比（导入向导 Step 3 冲突预览） */
syncRoutes.get('/diff', async (c) => {
  const sourcePath = c.req.query('sourcePath');
  const hubTargetPath = c.req.query('hubTargetPath');

  if (!sourcePath || !hubTargetPath) {
    return c.json({ error: '缺少 sourcePath 或 hubTargetPath 参数' }, 400);
  }

  const { existsSync, readFileSync } = await import('node:fs');
  const { readHubFile } = await import('../../core/hub-files.js');

  // 安全校验：sourcePath 必须是绝对路径且在用户目录下
  const { homedir } = await import('node:os');
  const { resolve: pathResolve } = await import('node:path');
  const home = pathResolve(homedir());
  const normalizedSource = pathResolve(sourcePath);
  if (!normalizedSource.startsWith(home)) {
    return c.json({ error: 'sourcePath 不在用户目录范围内' }, 403);
  }
  if (!existsSync(normalizedSource)) {
    return c.json({ error: '源文件不存在' }, 404);
  }

  let sourceContent: string;
  try {
    sourceContent = readFileSync(normalizedSource, 'utf-8');
  } catch {
    return c.json({ error: '无法读取源文件' }, 500);
  }

  let hubContent: string | null = null;
  const hubFile = readHubFile(hubTargetPath);
  if (hubFile) {
    hubContent = hubFile.content;
  }

  return c.json({
    sourceContent,
    hubContent,
    sourcePath,
    hubTargetPath,
  });
});

/** 执行导入（导入向导 Step 4） */
syncRoutes.post('/execute-import', async (c) => {
  const body = await c.req.json<ImportRequest>();
  if (!body.items || !Array.isArray(body.items)) {
    return c.json({ error: '缺少 items 字段或格式错误' }, 400);
  }
  const engine = hubContext.getEngine();
  const result = await engine.executeImport(body);
  return c.json(result);
});
