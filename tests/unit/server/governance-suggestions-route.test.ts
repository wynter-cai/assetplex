/**
 * GET /api/governance/suggestions 测试（add-asset-governance L2）
 *
 * spec: specs/proactive-guidance.spec.md Scenario 3/4/7
 * 本地生成、零模型调用；每条建议必须带既有流程入口。
 */

import { describe, it, expect, vi } from 'vitest';
import { createGovernanceRoutes, type GovernanceRouteDeps } from '../../../src/server/routes/governance.js';
import type { DuplicateSummaryForSuggestion } from '../../../src/core/governance-suggestions.js';

const GOOD = '---\nname: demo\ndescription: 演示用\n---\n正文\n';
const EMPTY_DESC = '---\nname: demo\ndescription: ""\n---\n正文\n';

function harness(options: { files?: Record<string, string>; aiConfigured?: boolean; duplicates?: DuplicateSummaryForSuggestion } = {}) {
  const files = options.files ?? { 'skills/demo/SKILL.md': EMPTY_DESC };
  const semantic = vi.fn(() => ({ semanticIssues: [], evaluated: true }));
  const deps: GovernanceRouteDeps = {
    listAssets: (kind) => Object.keys(files).filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`)),
    read: (path) => files[path] ?? null,
    distributions: () => [],
    aiConfigured: () => options.aiConfigured ?? false,
    semantic,
    duplicateGroups: () => [],
    duplicateSummary: () => options.duplicates ?? { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 0 },
    libraryCount: () => Object.keys(files).length,
    now: () => '2026-11-08T00:00:00.000Z',
  };
  const routes = createGovernanceRoutes(deps);
  const get = async (path: string) => {
    const response = await routes.request(path);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { get, semantic };
}

describe('GET /api/governance/suggestions', () => {
  it('返回可执行建议与首屏引导，每条带入口（Scenario 4）', async () => {
    const { get } = harness({
      files: { 'skills/demo/SKILL.md': EMPTY_DESC, 'skills/demo-b/SKILL.md': GOOD },
      duplicates: { mergeableGroupCount: 1, mergeableAssetCount: 1, grayGroupCount: 0 },
    });
    const { status, body } = await get('/suggestions');
    expect(status).toBe(200);
    const suggestions = body.suggestions as Array<Record<string, unknown>>;
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (const item of suggestions) {
      expect(item).toMatchObject({ executable: true });
      expect((item.action as Record<string, unknown>).route).toEqual(expect.any(String));
      expect(item.scale).toMatchObject({ assets: expect.any(Number), estimatedCalls: expect.any(Number) });
    }
    expect(body.firstRun).toMatchObject({ primary: { label: '帮我收拾' } });
  });

  it('无可做之事返回空建议与固定文案（Scenario 3）', async () => {
    const { get } = harness({
      files: { 'skills/demo/SKILL.md': GOOD },
      duplicates: { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 0 },
      aiConfigured: true,
    });
    const { body } = await get('/suggestions');
    expect(body.suggestions).toEqual([]);
    expect(body.emptyMessage).toBe('状态良好，暂无需要处理的事项');
  });

  it('AI 未配置给出口径说明，且不调用任何语义来源（Scenario 7）', async () => {
    const { get, semantic } = harness({
      files: { 'skills/demo/SKILL.md': EMPTY_DESC },
      duplicates: { mergeableGroupCount: 1, mergeableAssetCount: 1, grayGroupCount: 0 },
      aiConfigured: false,
    });
    const { body } = await get('/suggestions');
    expect(body.aiConfigured).toBe(false);
    const info = body.info as Array<Record<string, unknown>>;
    expect(info).toHaveLength(1);
    expect(String(info[0]?.text)).toContain('配置 AI');
    expect(semantic).not.toHaveBeenCalled();
  });

  it('零资产库不展示分数结论（firstRun 为空）', async () => {
    const { get } = harness({ files: {}, duplicates: { mergeableGroupCount: 0, mergeableAssetCount: 0, grayGroupCount: 0 } });
    const { body } = await get('/suggestions');
    expect(body.firstRun).toBeNull();
  });
});
