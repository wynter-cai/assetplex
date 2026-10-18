/**
 * 仲裁路由测试（add-llm-conflict-arbitration B4）
 *
 * spec: specs/conflict-arbitration.spec.md Scenario 2/6/7/8；api-contract 错误约定
 * 全依赖注入：假 fs / 准则 / 内存缓存 / mock LLM / 内存 aiConfigStore，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { createArbitrationRoutes } from '../../../src/server/routes/arbitration.js';
import type { AiConfigStore, AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { ArbitrationCacheEntry, ArbitrationCacheStore } from '../../../src/core/arbitration-cache.js';
import type { CriterionAsset } from '../../../src/core/criteria.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';

const demoCriterion: CriterionAsset = {
  slug: 'token-economy',
  relativePath: 'criteria/token-economy.md',
  name: 'Token 效率',
  description: '',
  priority: 5,
  enabled: true,
  appliesTo: ['all'],
  body: '只写模型不知道的',
};

function fullConfig(overrides: Partial<AiClassifyConfig> = {}): AiClassifyConfig {
  return { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...overrides };
}

interface Harness {
  calls: { system: string; user: string }[];
  routes: ReturnType<typeof createArbitrationRoutes>;
  post: (body: unknown) => Promise<{ status: number; json: () => Promise<Record<string, unknown>> }>;
}

function harness(opts: {
  config?: Partial<AiClassifyConfig> | null;
  files?: Record<string, string | null>;
  llmOutput?: string;
} = {}): Harness {
  const calls: { system: string; user: string }[] = [];
  const files = opts.files ?? { 'd:/demo/left.md': '左边', 'd:/demo/right.md': '右边' };
  let data: Record<string, ArbitrationCacheEntry> = {};
  const storeData = opts.config === null ? {} : fullConfig(opts.config ?? {});
  const aiConfigStore: AiConfigStore = {
    load: () => ({ ...storeData }),
    save: () => undefined,
  };
  const cache: ArbitrationCacheStore = {
    load: () => ({ ...data }),
    save: (entries) => {
      data = { ...entries };
    },
  };
  const llm: LlmClient = {
    chat: async (input) => {
      calls.push(input);
      return opts.llmOutput ?? '{"decision":"keep-left","rationale":"导入版更新"}';
    },
  };
  const routes = createArbitrationRoutes({
    fs: { read: (p) => files[p] ?? null },
    getCriteria: () => [demoCriterion],
    cache,
    llmClient: llm,
    aiConfigStore,
    now: () => '2026-10-18T00:00:00.000Z',
  });
  const post = async (body: unknown) => {
    const res = await routes.fetch(
      new Request('http://local/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: () => res.json() as Promise<Record<string, unknown>> };
  };
  return { calls, routes, post };
}

const validBody = { category: 'skill', leftPath: 'd:/demo/left.md', rightPath: 'd:/demo/right.md' };

describe('POST /api/arbitration', () => {
  it('成功仲裁返回完整 ArbitrationResponse（决策/理由/准则披露/cached/model）', async () => {
    const h = harness();
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      decision: 'keep-left',
      rationale: '导入版更新',
      criteriaUsed: ['token-economy'],
      criteriaSkipped: 0,
      cached: false,
      model: 'demo-model',
      generatedAt: '2026-10-18T00:00:00.000Z',
    });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].system).toContain('Token 效率');
  });

  it('同冲突二次请求命中缓存：cached=true 且不再调模型（Scenario 7）', async () => {
    const h = harness();
    await h.post(validBody);
    const res = await h.post(validBody);
    expect(res.status).toBe(200);
    expect((await res.json()).cached).toBe(true);
    expect(h.calls).toHaveLength(1);
  });

  it('merge 决策透传 mergedContent 草案（Scenario 3 前端采纳来源）', async () => {
    const h = harness({ llmOutput: '{"decision":"merge","rationale":"互补","mergedContent":"合并稿"}' });
    const body = await h.post(validBody).then((r) => r.json());
    expect(body.decision).toBe('merge');
    expect(body.mergedContent).toBe('合并稿');
  });

  it('未配置 AI 端点→400 含配置提示，不调模型（Scenario 8）', async () => {
    const h = harness({ config: null });
    const res = await h.post(validBody);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('配置');
    expect(h.calls).toHaveLength(0);
  });

  it('文件读不到→404 含路径（api-contract 错误约定）', async () => {
    const h = harness({ files: { 'd:/demo/left.md': null } });
    const res = await h.post(validBody);
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).toContain('left.md');
  });

  it('模型输出非法→422「仲裁失败：…」，手动路径不受影响（Scenario 6）', async () => {
    const h = harness({ llmOutput: '我觉得保留左边吧' });
    const res = await h.post(validBody);
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain('仲裁失败');
  });

  it('请求体校验：类别闭集外/路径缺失/非 JSON 一律 400', async () => {
    const h = harness();
    expect((await h.post({ ...validBody, category: 'preference' })).status).toBe(400);
    expect((await h.post({ ...validBody, leftPath: 42 })).status).toBe(400);
    expect((await h.post({ category: 'skill' })).status).toBe(400);
    const badJson = await h.routes.fetch(
      new Request('http://local/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json' }),
    );
    expect(badJson.status).toBe(400);
  });

  it('可选标签 leftLabel/rightLabel 进 prompt（非字符串 400）', async () => {
    const h = harness();
    const res = await h.post({ ...validBody, leftLabel: 'TRAE', rightLabel: '我的库' });
    expect(res.status).toBe(200);
    expect(h.calls[0].user).toContain('TRAE');
    expect(h.calls[0].user).toContain('我的库');
    const h2 = harness();
    expect((await h2.post({ ...validBody, leftLabel: 7 })).status).toBe(400);
  });
});
