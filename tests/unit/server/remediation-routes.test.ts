/**
 * 一键整改路由测试（add-asset-governance I2/I3）
 *
 * spec: specs/asset-health-score.spec.md Scenario 7/8/9
 * 断言：计划零写库；执行一次确认后逐项跑、单项失败不中断；整批撤销如实报告失败项。
 */

import { describe, it, expect, vi } from 'vitest';
import { createRemediationRoutes, type RemediationRouteDeps } from '../../../src/server/routes/remediation.js';
import { createMemoryRemediationBatchStore } from '../../../src/server/lib/remediation-batch-store.js';
import type { GovernanceAssetInput } from '../../../src/core/governance-health.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';
import type { DoctorApplyPorts, UndoApplyPorts } from '../../../src/core/doctor-apply.js';

function issue(overrides: Partial<DiagnosisIssue> = {}): DiagnosisIssue {
  return {
    severity: overrides.severity ?? 'high',
    criterion: overrides.criterion ?? 'mechanical:description-empty',
    finding: overrides.finding ?? 'description 为空',
    suggestion: overrides.suggestion ?? '补一句什么时候用它',
    fixable: overrides.fixable ?? true,
  };
}

function asset(path: string, issues: DiagnosisIssue[]): GovernanceAssetInput {
  const name = path.split('/')[1] ?? 'demo-skill';
  return {
    kind: 'skill',
    hubRelativePath: path,
    name,
    mechanicalIssues: issues,
    semanticIssues: [],
    semanticEvaluated: false,
    distributions: [],
  };
}

const files: Record<string, string> = {
  'skills/demo-skill-a/SKILL.md': '---\nname: demo\n---\n正文\n',
  'skills/demo-skill-b/SKILL.md': '---\nname: demo\n---\n正文\n',
};

function harness(overrides: Partial<RemediationRouteDeps> = {}) {
  const assets = [
    asset('skills/demo-skill-a/SKILL.md', [issue()]),
    asset('skills/demo-skill-b/SKILL.md', [issue({ severity: 'medium' })]),
  ];
  const batchStore = createMemoryRemediationBatchStore();
  const writeCalls: Array<{ path: string; content: string }> = [];
  const applyPorts: DoctorApplyPorts = {
    read: (path) => files[path] ?? null,
    backup: (path) => `backup:${path}`,
    write: (path, content) => writeCalls.push({ path, content }),
    defaultTargets: async () => [],
    dispatchTool: async (tool) => ({ tool, action: 'written' }),
  };
  const undoPorts: UndoApplyPorts = {
    readBackup: (ref) => {
      const path = ref.replace(/^backup:/, '');
      return { hubRelativePath: path, content: files[path] ?? '' };
    },
    write: (path, content) => writeCalls.push({ path, content }),
  };

  const deps: RemediationRouteDeps = {
    loadAssets: async () => assets,
    read: (path) => files[path] ?? null,
    prepareDraft: async ({ content, selected }) => ({
      draftContent: `${content}<!-- 修复 ${selected.length} 项 -->\n`,
      cached: false,
    }),
    apply: applyPorts,
    undo: undoPorts,
    batchStore,
    now: () => '2026-11-08T00:00:00.000Z',
    ...overrides,
  };
  const routes = createRemediationRoutes(deps);
  const post = async (path: string, body?: unknown) => {
    const response = await routes.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { post, batchStore, writeCalls };
}

describe('POST /api/governance/remediation/plan — Scenario 7', () => {
  it('只出计划：逐条资产 + 调用估算，零写库', async () => {
    const { post, writeCalls } = harness();
    const { status, body } = await post('/plan', {});
    expect(status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.totalAssets).toBe(2);
    expect(body.batchLimit).toBe(20);
    expect(body.generatedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(writeCalls).toHaveLength(0);
  });

  it('不可修复项给原因，不静默丢弃', async () => {
    const { post } = harness({
      loadAssets: async () => [
        asset('skills/demo-skill-a/SKILL.md', [issue({ fixable: false, criterion: 'criteria:clarity' })]),
      ],
    });
    const { body } = await post('/plan', {});
    expect(body.items).toHaveLength(0);
    expect((body.skipped as Array<Record<string, unknown>>)[0]).toMatchObject({
      reason: '仅建议，需人工判断',
    });
  });

  it('入参非法返回 400', async () => {
    const { post } = harness();
    expect((await post('/plan', { kinds: ['unknown'] })).status).toBe(400);
    expect((await post('/plan', { dimension: 'unknown' })).status).toBe(400);
    expect((await post('/plan', { maxAssets: 1.5 })).status).toBe(400);
  });
});

describe('POST /api/governance/remediation/apply — Scenario 8', () => {
  it('一次确认后逐项执行，返回批次与汇总', async () => {
    const { post, batchStore } = harness({
      apply: {
        read: (path) => files[path] ?? null,
        backup: (path) => `backup:${path}`,
        write: (path, content) => {
          files[path] = content;
        },
        defaultTargets: async () => [],
        dispatchTool: async (tool) => ({ tool, action: 'written' }),
      },
    });

    const { status, body } = await post('/apply', {
      itemIds: ['skill:skills/demo-skill-a/SKILL.md', 'skill:skills/demo-skill-b/SKILL.md'],
      distribute: false,
    });

    expect(status).toBe(200);
    const results = body.results as Array<Record<string, unknown>>;
    expect(results.map((r) => r.status)).toEqual(['fixed', 'fixed']);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.rollbackAvailable).toBe(true);
    expect(typeof body.batchId).toBe('string');

    const record = batchStore.get(body.batchId as string);
    expect(record?.items).toHaveLength(2);
  });

  it('单项失败被隔离，并在汇总中计数', async () => {
    let call = 0;
    const { post } = harness({
      apply: {
        read: (path) => files[path] ?? null,
        backup: (path) => `backup:${path}`,
        write: () => {
          call += 1;
          if (call === 1) throw new Error('写入失败');
        },
        defaultTargets: async () => [],
        dispatchTool: async (tool) => ({ tool, action: 'written' }),
      },
    });

    const { body } = await post('/apply', {
      itemIds: ['skill:skills/demo-skill-a/SKILL.md', 'skill:skills/demo-skill-b/SKILL.md'],
      distribute: false,
    });

    const results = body.results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ status: 'failed', reason: '写入失败' });
    expect(results[1]).toMatchObject({ status: 'fixed' });
    expect(body).toMatchObject({ succeeded: 1, failed: 1, skipped: 0 });
  });

  it('distribute=false 只改库：不触发分发', async () => {
    const dispatchTool = vi.fn(async (tool: string) => ({ tool, action: 'written' as const }));
    const { post } = harness({
      apply: {
        read: (path) => files[path] ?? null,
        backup: (path) => `backup:${path}`,
        write: (path, content) => {
          files[path] = content;
        },
        defaultTargets: async () => [],
        dispatchTool,
      },
    });
    await post('/apply', { itemIds: ['skill:skills/demo-skill-a/SKILL.md'], distribute: false });
    expect(dispatchTool).not.toHaveBeenCalled();
  });

  it('入参非法与未知 itemId 返回 400', async () => {
    const { post } = harness();
    expect((await post('/apply', { itemIds: [], distribute: false })).status).toBe(400);
    expect((await post('/apply', { itemIds: ['x'], distribute: 'no' })).status).toBe(400);
    expect((await post('/apply', { itemIds: ['skill:skills/not-exist/SKILL.md'], distribute: false })).status).toBe(400);
  });
});

describe('POST /api/governance/remediation/undo — Scenario 9', () => {
  it('按 batchId 逐项恢复库内旧版', async () => {
    const { post, writeCalls, batchStore } = harness();
    const applied = await post('/apply', {
      itemIds: ['skill:skills/demo-skill-a/SKILL.md', 'skill:skills/demo-skill-b/SKILL.md'],
      distribute: false,
    });
    writeCalls.length = 0;

    const { status, body } = await post('/undo', { batchId: applied.body.batchId });
    expect(status).toBe(200);
    expect(body.restored).toEqual(['skills/demo-skill-a/SKILL.md', 'skills/demo-skill-b/SKILL.md']);
    expect(body.failures).toEqual([]);
    expect(writeCalls).toHaveLength(2);
    expect(batchStore.get(applied.body.batchId as string)?.items.every((i) => i.status === 'fixed')).toBe(true);
  });

  it('撤销失败如实报告哪几项未恢复', async () => {
    const store = createMemoryRemediationBatchStore();
    const { post } = harness({ batchStore: store });
    const applied = await post('/apply', {
      itemIds: ['skill:skills/demo-skill-a/SKILL.md', 'skill:skills/demo-skill-b/SKILL.md'],
      distribute: false,
    });

    const undoRoutes = createRemediationRoutes({
      loadAssets: async () => [],
      read: () => null,
      undo: {
        readBackup: (ref) => {
          if (ref.includes('demo-skill-b')) return null;
          return { hubRelativePath: 'skills/demo-skill-a/SKILL.md', content: '旧版' };
        },
        write: () => undefined,
      },
      batchStore: store,
    });
    const response = await undoRoutes.request('/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: applied.body.batchId }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.restored).toEqual(['skills/demo-skill-a/SKILL.md']);
    expect(body.failures).toEqual([
      expect.objectContaining({ hubRelativePath: 'skills/demo-skill-b/SKILL.md' }),
    ]);
  });

  it('未知 batchId 返回 404，入参非法返回 400', async () => {
    const { post } = harness();
    expect((await post('/undo', { batchId: 'not-a-real-batch' })).status).toBe(404);
    expect((await post('/undo', {})).status).toBe(400);
  });
});
