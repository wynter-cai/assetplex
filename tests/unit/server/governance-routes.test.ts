/**
 * 治理路由测试（add-asset-governance H3）
 *
 * spec: specs/asset-health-score.spec.md Scenario 3（零资产不显示 0 分）/
 * Scenario 6（每分可下钻、按严重度排序）
 * 全依赖注入：假 Hub 文件、假分发状态、假语义缓存，不碰真实目录与模型。
 */

import { describe, it, expect } from 'vitest';
import {
  createGovernanceRoutes,
  type GovernanceRouteDeps,
} from '../../../src/server/routes/governance.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';
import type { AssetDistributionInfo } from '../../../src/core/distribution-status.js';
import type { HealthDuplicateGroup } from '../../../src/core/governance-health.js';

const GOOD = '---\nname: demo\ndescription: 演示用\n---\n正文\n';
const EMPTY_DESC = '---\nname: demo\ndescription: ""\n---\n正文\n';

function semanticIssue(severity: DiagnosisIssue['severity'], criterion: string): DiagnosisIssue {
  return { severity, criterion, finding: `${criterion} 的发现`, suggestion: '按建议改', fixable: true };
}

interface HarnessOptions {
  files?: Record<string, string | null>;
  semantic?: Record<string, DiagnosisIssue[]>;
  aiConfigured?: boolean;
  distributions?: Record<string, AssetDistributionInfo[]>;
  duplicateGroups?: HealthDuplicateGroup[];
  /** 我的库资产总数（缺省按 files 里非命令/准则条目数） */
  libraryCount?: number;
}

function harness(opts: HarnessOptions = {}) {
  const files = opts.files ?? {};
  const semanticMap = opts.semantic ?? {};
  let reads = 0;
  const deps: GovernanceRouteDeps = {
    listAssets: (kind) => Object.keys(files).filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`)),
    read: (path) => {
      reads += 1;
      return files[path] ?? null;
    },
    distributions: (path) => (opts.distributions ?? {})[path] ?? [],
    aiConfigured: () => opts.aiConfigured ?? false,
    ...(opts.aiConfigured === true
      ? {
          semantic: (input: { hubRelativePath: string }) => ({
            semanticIssues: semanticMap[input.hubRelativePath] ?? [],
            evaluated: true,
          }),
        }
      : {}),
    duplicateGroups: () => opts.duplicateGroups ?? [],
    // 我的库口径：命令与准则不是资产，不计入
    libraryCount: () =>
      opts.libraryCount ??
      Object.keys(files).filter((path) => !path.startsWith('commands/') && !path.startsWith('criteria/')).length,
    now: () => '2026-11-08T00:00:00.000Z',
    // 子路由的活动留痕不写真实 Hub（add-activity-log T8）
    remediation: { recordActivity: () => {} },
    duplicates: { recordActivity: () => {} },
  };
  const routes = createGovernanceRoutes(deps);
  const get = async (path: string) => {
    const response = await routes.request(path);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { get, reads: () => reads };
}

describe('GET /api/governance/health', () => {
  it('Scenario 3：零资产返回 200、grade=empty、score=0（前端据此不展示分数）', async () => {
    const { get } = harness();
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({ grade: 'empty', score: 0, totalAssets: 0, qualityMode: 'mechanical-only' });
    expect(body.computedAt).toBe('2026-11-08T00:00:00.000Z');
  });

  it('totalAssets 按「我的库」口径收敛（含 mcp/agent，命令不计）', async () => {
    const { get } = harness({
      files: { 'skills/demo/SKILL.md': GOOD },
      libraryCount: 12,
    });
    const { body } = await get('/health');
    expect(body.totalAssets).toBe(12);
    // 参与评分的仍只有可诊断的文档资产，数字口径与评分范围分开
    const dims = body.dimensions as Array<{ id: string; evaluatedAssets: number }>;
    expect(dims.find((d) => d.id === 'completeness')?.evaluatedAssets).toBe(1);
  });

  it('返回四维构成与 topIssues（每维最多 5 条）', async () => {
    const { get } = harness({
      files: {
        'identity/profile.md': GOOD,
        'skills/demo-skill-a/SKILL.md': EMPTY_DESC,
        'skills/demo-skill-b/SKILL.md': GOOD,
      },
      aiConfigured: true,
    });
    const { status, body } = await get('/health');
    expect(status).toBe(200);
    expect(body.totalAssets).toBe(3);
    expect(body.qualityMode).toBe('mechanical+ai');
    const dimensions = body.dimensions as Array<Record<string, unknown>>;
    expect(dimensions.map((d) => d.id)).toEqual(['completeness', 'quality', 'distribution', 'uniqueness']);
    for (const dimension of dimensions) {
      expect((dimension.topIssues as unknown[]).length).toBeLessThanOrEqual(5);
    }
    const completeness = dimensions.find((d) => d.id === 'completeness');
    expect(completeness?.applicability).toBe('applicable');
    expect(completeness?.issueCount).toBe(1);
  });

  it('AI 未配置：qualityMode=mechanical-only，不触发语义来源', async () => {
    const { get } = harness({
      files: { 'skills/demo-skill-a/SKILL.md': GOOD },
      aiConfigured: false,
    });
    const { body } = await get('/health');
    expect(body.qualityMode).toBe('mechanical-only');
  });
});

describe('GET /api/governance/health — 缓存与刷新（Scenario 10）', () => {
  const files = { 'identity/profile.md': GOOD, 'skills/demo-skill-a/SKILL.md': EMPTY_DESC };

  it('默认读缓存：第二次请求不再重新读资产，cached=true', async () => {
    const { get, reads } = harness({ files });
    const first = await get('/health');
    expect(first.body.cached).toBe(false);
    const readsAfterFirst = reads();
    const second = await get('/health');
    expect(second.body.cached).toBe(true);
    expect(reads()).toBe(readsAfterFirst);
    expect(second.body.score).toBe(first.body.score);
  });

  it('refresh=1 强制重算：绕过缓存并重新读取资产', async () => {
    const { get, reads } = harness({ files });
    await get('/health');
    const readsAfterFirst = reads();
    const refreshed = await get('/health?refresh=1');
    expect(refreshed.body.cached).toBe(false);
    expect(reads()).toBeGreaterThan(readsAfterFirst);
  });

  it('refresh 取值只允许 0/1，其他返回 400', async () => {
    const { get } = harness({ files });
    expect((await get('/health?refresh=2')).status).toBe(400);
  });

  it('问题清单与健康分共用缓存，不重复读盘', async () => {
    const { get, reads } = harness({ files });
    await get('/health');
    const readsAfterHealth = reads();
    await get('/issues?dimension=quality');
    expect(reads()).toBe(readsAfterHealth);
  });
});

describe('GET /api/governance/issues（Scenario 6：下钻）', () => {
  const files = {
    'identity/profile.md': GOOD,
    'skills/demo-skill-a/SKILL.md': EMPTY_DESC,
    'skills/demo-skill-b/SKILL.md': GOOD,
  };
  const semantic = {
    'skills/demo-skill-a/SKILL.md': [semanticIssue('medium', 'criteria:clarity'), semanticIssue('low', 'criteria:tone')],
  };

  it('按 high → medium → low 排序，含资产定位信息', async () => {
    const { get } = harness({ files, semantic, aiConfigured: true });
    const { status, body } = await get('/issues?dimension=quality');
    expect(status).toBe(200);
    const items = body.items as Array<Record<string, unknown>>;
    expect(body.total).toBe(3);
    expect(items.map((i) => i.severity)).toEqual(['high', 'medium', 'low']);
    expect(items[0]).toMatchObject({
      assetName: 'demo-skill-a',
      hubRelativePath: 'skills/demo-skill-a/SKILL.md',
      kind: 'skill',
      fixable: true,
    });
  });

  it('severityFloor=medium 过滤掉 low', async () => {
    const { get } = harness({ files, semantic, aiConfigured: true });
    const { body } = await get('/issues?dimension=quality&severityFloor=medium');
    expect(body.total).toBe(2);
    expect((body.items as Array<Record<string, unknown>>).every((i) => i.severity !== 'low')).toBe(true);
  });

  it('limit/offset 分页', async () => {
    const { get } = harness({ files, semantic, aiConfigured: true });
    const { body } = await get('/issues?dimension=quality&limit=1&offset=1');
    expect(body.total).toBe(3);
    const items = body.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe('medium');
  });

  it('完整性维度只列必填字段类问题', async () => {
    const { get } = harness({ files, semantic, aiConfigured: true });
    const { body } = await get('/issues?dimension=completeness');
    expect(body.total).toBe(1);
    expect((body.items as Array<Record<string, unknown>>)[0].severity).toBe('high');
  });

  it('唯一性问题来自重复分组，且不可自动修复', async () => {
    const { get } = harness({
      files,
      aiConfigured: true,
      duplicateGroups: [
        {
          id: 'demo-dup',
          kind: 'exact',
          members: [
            { hubRelativePath: 'skills/demo-skill-a/SKILL.md', name: 'demo-skill-a', kind: 'skill' },
            { hubRelativePath: 'skills/demo-skill-b/SKILL.md', name: 'demo-skill-b', kind: 'skill' },
          ],
        },
      ],
    });
    const { body } = await get('/issues?dimension=uniqueness');
    expect(body.total).toBe(1);
    expect((body.items as Array<Record<string, unknown>>)[0]).toMatchObject({
      fixable: false,
      assetName: 'demo-skill-b',
    });
  });

  it('入参非法返回 400（缺维度 / 维度不在闭集 / 严重度非法 / 分页非法）', async () => {
    const { get } = harness();
    expect((await get('/issues')).status).toBe(400);
    expect((await get('/issues?dimension=unknown')).status).toBe(400);
    expect((await get('/issues?dimension=quality&severityFloor=critical')).status).toBe(400);
    expect((await get('/issues?dimension=quality&limit=0')).status).toBe(400);
    expect((await get('/issues?dimension=quality&limit=101')).status).toBe(400);
    expect((await get('/issues?dimension=quality&offset=-1')).status).toBe(400);
  });
});
