/**
 * 忽略清单路由（add-diagnosis-rules T5）
 *
 * 错误约定见 api-contract：400 参数非法 / contentHash 不一致、403 非库内资产、
 * 404 资产或忽略条目不存在、422 规则集加载失败。
 */

import { describe, it, expect } from 'vitest';
import { createDiagnosisRoutes } from '../../../src/server/routes/diagnosis.js';
import { hashIgnoredContent } from '../../../src/core/diagnosis-ignore.js';
import type { DiagnosisRuleSet, IgnoredFinding } from '../../../src/core/types.js';

const RULE_SET: DiagnosisRuleSet = {
  version: '9.9.9',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-04',
      category: 'skill',
      severity: 'medium',
      mode: 'static',
      signal: '演示信号',
      recommendation: '演示改法',
      source: '演示出处',
    },
  ],
};

const CONTENT = '演示正文';
const HASH = hashIgnoredContent(CONTENT);
const PATH = 'skills/demo/SKILL.md';

interface HarnessOptions {
  ruleSet?: DiagnosisRuleSet | null;
  files?: Record<string, string>;
  items?: IgnoredFinding[];
}

function harness(options: HarnessOptions = {}) {
  let items = [...(options.items ?? [])];
  const files = options.files ?? { [PATH]: CONTENT };
  const routes = createDiagnosisRoutes({
    ruleSet: options.ruleSet === undefined ? RULE_SET : options.ruleSet,
    ignoreStore: {
      load: () => items,
      save: (next) => {
        items = [...next];
      },
    },
    fs: { read: (path) => files[path] ?? null },
    now: () => '2026-11-15T12:00:00.000Z',
  });
  return {
    items: () => items,
    request: async (path: string, init?: RequestInit) => {
      const response = await routes.request(path, init);
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    post: (body: unknown) =>
      routes
        .request('/ignore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        .then(async (response) => ({
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        })),
  };
}

describe('POST /api/diagnosis/ignore', () => {
  it('写入忽略条目并返回 ignoredAt 与剩余命中数', async () => {
    const h = harness();
    const { status, body } = await h.post({
      kind: 'skill',
      hubRelativePath: PATH,
      ruleId: 'SK-04',
      contentHash: HASH,
    });

    expect(status).toBe(200);
    expect(body['ignored']).toEqual({
      ruleId: 'SK-04',
      hubRelativePath: PATH,
      contentHash: HASH,
      ignoredAt: '2026-11-15T12:00:00.000Z',
    });
    expect(body['remainingForRule']).toBe(0);
    expect(h.items()).toHaveLength(1);
  });

  it('未回传 contentHash 时按当前内容哈希写入', async () => {
    const h = harness();
    const { status, body } = await h.post({ kind: 'skill', hubRelativePath: PATH, ruleId: 'SK-04' });

    expect(status).toBe(200);
    expect((body['ignored'] as IgnoredFinding).contentHash).toBe(HASH);
  });

  it('contentHash 与当前内容不一致返回 400（防误忽略）', async () => {
    const h = harness();
    const { status } = await h.post({
      kind: 'skill',
      hubRelativePath: PATH,
      ruleId: 'SK-04',
      contentHash: '旧哈希',
    });

    expect(status).toBe(400);
    expect(h.items()).toHaveLength(0);
  });

  it('kind 非法返回 400', async () => {
    const h = harness();
    const { status } = await h.post({ kind: 'mcp', hubRelativePath: PATH, ruleId: 'SK-04' });
    expect(status).toBe(400);
  });

  it('绝对路径返回 403（医生只服务库内资产）', async () => {
    const h = harness();
    const { status } = await h.post({
      kind: 'skill',
      hubRelativePath: 'C:\\Users\\demo\\skills\\x.md',
      ruleId: 'SK-04',
    });
    expect(status).toBe(403);
  });

  it('ruleId 不在规则集内返回 400', async () => {
    const h = harness();
    const { status } = await h.post({ kind: 'skill', hubRelativePath: PATH, ruleId: 'SK-99' });
    expect(status).toBe(400);
  });

  it('资产不存在返回 404', async () => {
    const h = harness({ files: {} });
    const { status } = await h.post({ kind: 'skill', hubRelativePath: PATH, ruleId: 'SK-04' });
    expect(status).toBe(404);
  });

  it('规则集加载失败返回 422', async () => {
    const h = harness({ ruleSet: null });
    const { status } = await h.post({ kind: 'skill', hubRelativePath: PATH, ruleId: 'SK-04' });
    expect(status).toBe(422);
  });
});

describe('DELETE /api/diagnosis/ignore', () => {
  it('恢复已存在条目返回 restored=true 并从清单移除', async () => {
    const h = harness({
      items: [{ ruleId: 'SK-04', hubRelativePath: PATH, contentHash: HASH, ignoredAt: '2026-11-01T00:00:00.000Z' }],
    });
    const { status, body } = await h.request(
      `/ignore?hubRelativePath=${encodeURIComponent(PATH)}&ruleId=SK-04`,
      { method: 'DELETE' },
    );

    expect(status).toBe(200);
    expect(body).toEqual({ ruleId: 'SK-04', hubRelativePath: PATH, restored: true });
    expect(h.items()).toHaveLength(0);
  });

  it('忽略条目不存在返回 404', async () => {
    const h = harness();
    const { status } = await h.request(
      `/ignore?hubRelativePath=${encodeURIComponent(PATH)}&ruleId=SK-04`,
      { method: 'DELETE' },
    );
    expect(status).toBe(404);
  });

  it('缺少参数返回 400', async () => {
    const h = harness();
    const { status } = await h.request('/ignore?hubRelativePath=skills%2Fdemo%2FSKILL.md', { method: 'DELETE' });
    expect(status).toBe(400);
  });
});

describe('GET /api/diagnosis/ignore', () => {
  it('返回清单与过期条数', async () => {
    const h = harness({
      items: [
        { ruleId: 'SK-04', hubRelativePath: PATH, contentHash: HASH, ignoredAt: '2026-11-01T00:00:00.000Z' },
        { ruleId: 'SK-05', hubRelativePath: PATH, contentHash: '旧哈希', ignoredAt: '2026-11-01T00:00:00.000Z' },
      ],
    });
    const { status, body } = await h.request('/ignore?kind=skill');

    expect(status).toBe(200);
    expect(body['items']).toHaveLength(2);
    expect(body['expired']).toBe(1);
  });

  it('kind 非法返回 400', async () => {
    const h = harness();
    const { status } = await h.request('/ignore?kind=mcp');
    expect(status).toBe(400);
  });
});
