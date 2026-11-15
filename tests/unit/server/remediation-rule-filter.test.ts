/**
 * 一键整改按规则过滤测试（refactor-governance-center T6）
 *
 * spec: governance-center.spec.md Scenario 4.1 / 4.2；
 * 断言：规则过滤只影响可修复项（不可修复项永不进计划）、20 上限不因过滤放大、
 * 未命中规则不出现在计划；只改库不分发路径仍可执行并拿到 batchId 供整批撤销。
 */

import { describe, it, expect } from 'vitest';
import { createRemediationRoutes } from '../../../src/server/routes/remediation.js';
import { createMemoryRemediationBatchStore } from '../../../src/server/lib/remediation-batch-store.js';
import type { GovernanceAssetInput } from '../../../src/core/governance-health.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';
import type { DoctorApplyPorts, UndoApplyPorts } from '../../../src/core/doctor-apply.js';

function issue(criterion: string, fixable = true): DiagnosisIssue {
  return { severity: 'medium', criterion, finding: `${criterion} 命中`, suggestion: '按建议改', fixable };
}

function asset(path: string, issues: DiagnosisIssue[]): GovernanceAssetInput {
  return {
    kind: 'skill',
    hubRelativePath: path,
    name: path.split('/')[1] ?? 'demo',
    mechanicalIssues: issues,
    semanticIssues: [],
    semanticEvaluated: false,
    distributions: [],
  };
}

function harness(assets: GovernanceAssetInput[]) {
  const batchStore = createMemoryRemediationBatchStore();
  const writes: string[] = [];
  const applyPorts: DoctorApplyPorts = {
    read: () => '---\nname: demo\n---\n正文\n',
    backup: (path) => `backup:${path}`,
    write: (path) => writes.push(path),
    defaultTargets: async () => [],
    dispatchTool: async (tool) => ({ tool, action: 'written' }),
  };
  const undoPorts: UndoApplyPorts = {
    readBackup: (ref) => ({ hubRelativePath: ref.replace(/^backup:/, ''), content: '旧正文' }),
    write: (path) => writes.push(path),
  };
  const routes = createRemediationRoutes({
    loadAssets: async () => assets,
    read: () => '---\nname: demo\n---\n正文\n',
    prepareDraft: async ({ content }) => ({ draftContent: `${content}改` , cached: false }),
    apply: applyPorts,
    undo: undoPorts,
    batchStore,
    recordActivity: () => {},
    now: () => '2026-11-15T00:00:00.000Z',
  });
  const post = async (path: string, body: unknown) => {
    const response = await routes.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { post, writes };
}

describe('整改计划按规则过滤', () => {
  it('只保留命中规则的项：卡片上的 issueIndexes / ruleIds 与过滤结果一致', async () => {
    const { post } = harness([
      asset('skills/demo-a/SKILL.md', [issue('SK-03'), issue('SK-08'), issue('SK-04', false)]),
    ]);
    const { body } = await post('/plan', { ruleIds: ['SK-03'] });
    const items = body.items as Array<{ issueIndexes: number[]; ruleIds: string[] }>;

    expect(items).toHaveLength(1);
    expect(items[0]?.issueIndexes).toEqual([0]);
    expect(items[0]?.ruleIds).toEqual(['SK-03']);
    // 不可修复项即使命中规则也不进计划
    expect((body.items as Array<{ ruleIds: string[] }>)[0]?.ruleIds).not.toContain('SK-04');
  });

  it('未命中任何规则 → 空计划，skipped 说明原因且不编造条目', async () => {
    const { post } = harness([asset('skills/demo-a/SKILL.md', [issue('SK-03')])]);
    const { body } = await post('/plan', { ruleIds: ['SK-99'] });

    expect(body.items).toEqual([]);
    expect(body.totalAssets).toBe(0);
    expect(body.nonBatchableCount).toBe(1);
  });

  it('20 上限不因过滤放大：25 个命中资产仍只出 20 条并提示分批', async () => {
    const assets = Array.from({ length: 25 }, (_, index) =>
      asset(`skills/demo-${index}/SKILL.md`, [issue('SK-03')]),
    );
    const { post } = harness(assets);
    const { body } = await post('/plan', { ruleIds: ['SK-03'] });

    expect((body.items as unknown[]).length).toBe(20);
    expect(body.truncated).toBe(true);
    expect(body.batchLimit).toBe(20);
    expect(body.kindDistribution).toEqual({ skill: 20 });
  });

  it('apply 用同一规则过滤重建计划：itemId 命中即执行，落库后返回 batchId 供整批撤销', async () => {
    const h = harness([asset('skills/demo-a/SKILL.md', [issue('SK-03')])]);
    const plan = await h.post('/plan', { ruleIds: ['SK-03'] });
    const itemId = (plan.body.items as Array<{ id: string }>)[0]?.id ?? '';

    const applied = await h.post('/apply', { itemIds: [itemId], distribute: false, ruleIds: ['SK-03'] });
    expect(applied.status).toBe(200);
    expect(applied.body.succeeded).toBe(1);
    expect(typeof applied.body.batchId).toBe('string');
    expect(h.writes).toContain('skills/demo-a/SKILL.md');

    // 过滤不一致 → 未知 itemId，拒绝执行
    const mismatch = await h.post('/apply', { itemIds: [itemId], distribute: false, ruleIds: ['SK-99'] });
    expect(mismatch.status).toBe(400);
  });
});
