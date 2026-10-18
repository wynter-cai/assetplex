/**
 * 冲突仲裁路由（add-llm-conflict-arbitration B4）
 *
 * POST /api/arbitration  一次 LLM 仲裁建议（advisory-only：只读两侧文件+调模型，
 *                        永不写盘；采纳动作由导入向导走既有 overwrite/merge/skip）
 *
 * 错误约定（api-contract）：400 请求体非法或 AI 配置不全 / 404 两侧文件读取失败 /
 * 422 模型输出非法（"仲裁失败：<原因>"）/ 500 其他（网络等）。
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/conflict-arbitration.spec.md
 */

import { Hono } from 'hono';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import {
  arbitrateConflict,
  ArbitrationFileError,
  ArbitrationOutputError,
  ARBITRATION_CATEGORIES,
  type ArbitrationCategory,
} from '../../core/arbitration.js';
import type { CriterionAsset } from '../../core/criteria.js';
import { listCriteria } from '../../core/criteria.js';
import { loadAiClassifyConfig, type AiConfigStore } from '../../core/ai-config.js';
import { AiConfigIncompleteError, type LlmClient } from '../../core/skill-ai-classification.js';
import type { ArbitrationCacheStore } from '../../core/arbitration-cache.js';
import { nodeAiConfigStore, nodeArbitrationCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';

export interface ArbitrationRouteDeps {
  /** 两侧内容读取；缺省 Node 实现（导入向导的源路径在 Hub 外，绝对路径直读） */
  fs?: { read(path: string): string | null };
  getCriteria?: () => CriterionAsset[];
  cache?: ArbitrationCacheStore;
  /** 缺省按当前配置构造 OpenAI 兼容客户端（与 AI 分类同一 LlmClient，Scenario 9） */
  llmClient?: LlmClient;
  aiConfigStore?: AiConfigStore;
  now?: () => string;
}

/**
 * 默认文件读取：绝对路径直读（导入向导的工具侧源文件）；
 * 相对路径视为 Hub 内路径（hubTargetPath），解析到 hubRoot 并拒绝越界（C1 前置）
 */
function resolveReadPath(path: string): string | null {
  if (isAbsolute(path)) return path;
  const hubRoot = getHubRoot();
  const full = resolve(hubRoot, path);
  if (full !== hubRoot && !full.startsWith(hubRoot + sep)) return null;
  return full;
}

const nodeRead = {
  read: (path: string): string | null => {
    try {
      const full = resolveReadPath(path);
      if (full === null || !existsSync(full)) return null;
      return readFileSync(full, 'utf-8');
    } catch {
      return null;
    }
  },
};

/** 请求体校验：合法返回待仲裁输入，非法返回错误文案 */
function parseArbitrationBody(body: unknown): { input?: { category: ArbitrationCategory; leftPath: string; rightPath: string; leftLabel?: string; rightLabel?: string }; error?: string } {
  if (typeof body !== 'object' || body === null) return { error: '请求体必须是 JSON 对象' };
  const p = body as Record<string, unknown>;
  if (
    typeof p.category !== 'string' ||
    !(ARBITRATION_CATEGORIES as readonly string[]).includes(p.category)
  ) {
    return { error: `category 必须是 ${ARBITRATION_CATEGORIES.join('/')}` };
  }
  if (typeof p.leftPath !== 'string' || p.leftPath.trim() === '') {
    return { error: 'leftPath 必须是非空字符串' };
  }
  if (typeof p.rightPath !== 'string' || p.rightPath.trim() === '') {
    return { error: 'rightPath 必须是非空字符串' };
  }
  if (p.leftLabel !== undefined && typeof p.leftLabel !== 'string') {
    return { error: 'leftLabel 必须是字符串或缺省' };
  }
  if (p.rightLabel !== undefined && typeof p.rightLabel !== 'string') {
    return { error: 'rightLabel 必须是字符串或缺省' };
  }
  return {
    input: {
      category: p.category as ArbitrationCategory,
      leftPath: p.leftPath,
      rightPath: p.rightPath,
      ...(typeof p.leftLabel === 'string' ? { leftLabel: p.leftLabel } : {}),
      ...(typeof p.rightLabel === 'string' ? { rightLabel: p.rightLabel } : {}),
    },
  };
}

export function createArbitrationRoutes(deps: ArbitrationRouteDeps = {}): Hono {
  const routes = new Hono();

  routes.post('/', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = parseArbitrationBody(body);
    if (parsed.error !== undefined || parsed.input === undefined) {
      return c.json({ error: parsed.error ?? '请求体不合法' }, 400);
    }

    const aiConfigStore = deps.aiConfigStore ?? nodeAiConfigStore;
    const config = loadAiClassifyConfig(aiConfigStore);
    const llm = deps.llmClient ?? createOpenAiLlmClient(config);

    try {
      const outcome = await arbitrateConflict(parsed.input, {
        fs: deps.fs ?? nodeRead,
        getCriteria: deps.getCriteria ?? listCriteria,
        cache: deps.cache ?? nodeArbitrationCacheStore,
        llm,
        config,
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
      return c.json(outcome);
    } catch (err) {
      if (err instanceof AiConfigIncompleteError) return c.json({ error: err.message }, 400);
      if (err instanceof ArbitrationFileError) return c.json({ error: err.message }, 404);
      if (err instanceof ArbitrationOutputError) return c.json({ error: err.message }, 422);
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  return routes;
}
