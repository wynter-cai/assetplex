/**
 * 质量中心概览接口测试（refactor-governance-center T2）
 *
 * 只读聚合：聚类、排序、待处理总数与首页同源，问题项补深链与来源。
 */

import { describe, it, expect } from 'vitest';
import { createGovernanceRoutes, type GovernanceRouteDeps } from '../../../src/server/routes/governance.js';
import { hashIgnoredContent, type DiagnosisIgnoreStore } from '../../../src/core/diagnosis-ignore.js';
import type { DiagnosisIssue, IgnoredFinding } from '../../../src/core/types.js';

const GOOD = '---\nname: demo\nversion: "1"\ndescription: 演示用\n---\n正文\n';
const EMPTY_DESC = '---\nname: demo\nversion: "1"\ndescription: ""\n---\n正文\n';

function harness(
  opts: { files?: Record<string, string>; aiConfigured?: boolean; ignoreStore?: DiagnosisIgnoreStore } = {},
) {
  const files = opts.files ?? {};
  const semantic = new Map<string, DiagnosisIssue[]>();
  const deps: GovernanceRouteDeps = {
    listAssets: (kind) =>
      Object.keys(files).filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`)),
    read: (path) => files[path] ?? null,
    distributions: () => [],
    aiConfigured: () => opts.aiConfigured ?? false,
    ...(opts.aiConfigured === true
      ? {
          semantic: (input: { hubRelativePath: string }) => ({
            semanticIssues: semantic.get(input.hubRelativePath) ?? [],
            evaluated: true,
          }),
        }
      : {}),
    duplicateGroups: () => [],
    libraryCount: () => Object.keys(files).length,
    now: () => '2026-11-15T00:00:00.000Z',
    remediation: { recordActivity: () => {} },
    duplicates: { recordActivity: () => {} },
    ...(opts.ignoreStore === undefined ? {} : { ignoreStore: opts.ignoreStore }),
  };
  const routes = createGovernanceRoutes(deps);
  const get = async (path: string) => {
    const response = await routes.request(path);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { get, semantic };
}

interface OverviewBody {
  clusters: Array<{
    key: string;
    title: string;
    keySource: string;
    ruleId: string | null;
    assetCount: number;
    impactScore: number;
    samples: Array<{ deepLink: string }>;
  }>;
  pendingTotal: number;
  sortRule: string;
  coverage: { rulesVersion: string; semanticEvaluated: boolean; ignoredCount: number };
  generatedAt: string;
  cached: boolean;
}

describe('GET /api/governance/overview', () => {
  it('同一机械问题跨两个技能合并为一条聚类，样例带深链', async () => {
    const { get } = harness({
      files: {
        'skills/demo-a/SKILL.md': EMPTY_DESC,
        'skills/demo-b/SKILL.md': EMPTY_DESC,
        'skills/demo-c/SKILL.md': GOOD,
      },
    });
    const { status, body } = await get('/overview');
    expect(status).toBe(200);
    const overview = body as unknown as OverviewBody;
    const descriptionCluster = overview.clusters.find((cluster) => cluster.title.includes('description'));
    expect(descriptionCluster).toBeDefined();
    expect(descriptionCluster?.assetCount).toBe(2);
    expect(descriptionCluster?.keySource).toBe('title');
    expect(descriptionCluster?.ruleId).toBeNull();
    expect(descriptionCluster?.samples[0].deepLink).toMatch(/^\/vault\/skill\?asset=skills%2Fdemo-/);
  });

  it('待处理总数与首页待办同源（且不小于聚类条数）', async () => {
    const { get } = harness({
      files: {
        'skills/demo-a/SKILL.md': EMPTY_DESC,
        'identity/demo.md': EMPTY_DESC,
      },
    });
    const overview = (await get('/overview')).body as unknown as OverviewBody;
    const issues = (
      await get('/issues?dimension=completeness&limit=100')
    ).body as unknown as { total: number };
    expect(overview.pendingTotal).toBeGreaterThanOrEqual(overview.clusters.length);
    expect(overview.pendingTotal).toBeGreaterThan(0);
    expect(issues.total).toBeGreaterThan(0);
    expect(overview.sortRule).toBe('impact-desc-calls-asc');
    expect(overview.cached).toBe(false);
    expect(overview.generatedAt).toBe('2026-11-15T00:00:00.000Z');
  });

  it('零资产：不造聚类、不报错，覆盖度按未知披露', async () => {
    const { get } = harness();
    const { status, body } = await get('/overview');
    expect(status).toBe(200);
    const overview = body as unknown as OverviewBody;
    expect(overview.clusters).toEqual([]);
    expect(overview.pendingTotal).toBe(0);
    expect(overview.coverage.semanticEvaluated).toBe(false);
    expect(overview.coverage.ignoredCount).toBe(0);
  });

  it('refresh 参数非法 → 400', async () => {
    const { get } = harness();
    expect((await get('/overview?refresh=2')).status).toBe(400);
  });

  it('已忽略条数据实取生效条目：内容变更的过期条目不冒充已忽略', async () => {
    const files = { 'skills/demo-a/SKILL.md': GOOD };
    const active: IgnoredFinding = {
      ruleId: 'SK-02',
      hubRelativePath: 'skills/demo-a/SKILL.md',
      contentHash: hashIgnoredContent(GOOD),
      ignoredAt: '2026-11-01T00:00:00.000Z',
    };
    const expired: IgnoredFinding = { ...active, ruleId: 'SK-03', contentHash: '旧哈希' };
    const { get } = harness({
      files,
      ignoreStore: { load: () => [active, expired], save: () => {} },
    });
    const overview = (await get('/overview')).body as unknown as OverviewBody;
    expect(overview.coverage.ignoredCount).toBe(1);
  });
});

describe('GET /api/governance/issues 扩展字段', () => {
  it('逐项补 keySource / confidence / source / ignored / evidence / deepLink', async () => {
    const { get } = harness({ files: { 'skills/demo-a/SKILL.md': EMPTY_DESC } });
    const body = (await get('/issues?dimension=completeness&limit=10')).body as unknown as {
      items: Array<Record<string, unknown>>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toMatchObject({
      ruleId: null,
      keySource: 'title',
      confidence: 'medium',
      source: 'rule',
      ignored: false,
      evidence: [],
    });
    expect(body.items[0].deepLink).toMatch(/^\/vault\/skill\?asset=/);
  });
});
