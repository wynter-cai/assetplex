/**
 * 医生修复与分发路由测试（add-asset-doctor F2/F3）
 *
 * spec: specs/fix-and-distribute.spec.md Scenario 1/2/3/4/5/6/7 + api-contract 错误约定。
 * 关键断言：草案阶段零写库（Scenario 1）；apply 依次备份→写库→分发（D4）；
 * 分发逐工具如实聚合（Scenario 4）。全 DI，不碰真实文件与网络。
 */

import { describe, it, expect } from 'vitest';
import { createDoctorFixRoutes } from '../../../src/server/routes/doctor-fix.js';
import type { DoctorApplyPorts, DoctorDispatchItem, UndoApplyPorts } from '../../../src/core/doctor-apply.js';
import type { FixDraftCacheEntry, FixDraftCacheStore } from '../../../src/core/doctor-fix.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import { type CriterionAsset } from '../../../src/core/criteria.js';
import type { AiConfigStore, AiClassifyConfig } from '../../../src/core/ai-config.js';
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

const SKILL_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
const PATH = 'skills/demo-skill/SKILL.md';

/** 诊断输出：1 条 fixable 模型 issue（frontmatter 完整 → 无机械项，index 0 即模型项） */
const diagOutput = JSON.stringify({
  overall: 'needs-attention',
  issues: [
    { severity: 'medium', criterion: 'token-economy', finding: '正文有冗余', suggestion: '删除冗余段', fixable: true },
    { severity: 'low', criterion: 'token-economy', finding: '命名可更清晰', suggestion: '仅建议', fixable: false },
  ],
});
const draftOutput = JSON.stringify({
  draftContent: '---\nname: demo-skill\ndescription: 演示\n---\n精简正文\n',
  changeNotes: [{ issueIndex: 0, note: '删除了冗余段' }],
});

interface Harness {
  routes: { fetch(input: Request): Promise<Response> };
  writes: Array<{ path: string; content: string }>;
  dispatchCalls: Array<{ tool: string; path: string }>;
  files: Record<string, string>;
}

function harness(
  opts: {
    config?: Partial<AiClassifyConfig> | null;
    content?: string;
    dispatchResults?: Record<string, DoctorDispatchItem>;
    backups?: Record<string, { hubRelativePath: string; content: string }>;
  } = {},
): Harness {
  const files: Record<string, string> = { [PATH]: opts.content ?? SKILL_CONTENT };
  const writes: Array<{ path: string; content: string }> = [];
  const dispatchCalls: Array<{ tool: string; path: string }> = [];
  let draftData: Record<string, FixDraftCacheEntry> = {};
  let diagData: Record<string, never> = {};
  const storeData: Partial<AiClassifyConfig> | null =
    opts.config === null
      ? null
      : { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...opts.config };
  const aiConfigStore: AiConfigStore = {
    load: () => (storeData === null ? {} : { ...storeData }),
    save: () => undefined,
  };
  const fixCache: FixDraftCacheStore = {
    load: () => ({ ...draftData }),
    save: (entries) => {
      draftData = { ...entries };
    },
  };
  const doctorCache: DoctorCacheStore = {
    load: () => ({ ...diagData }) as Record<string, never>,
    save: (entries) => {
      diagData = { ...entries } as Record<string, never>;
    },
  };
  const llm: LlmClient = {
    chat: async (input) => (input.user.includes('【资产原文】') ? draftOutput : diagOutput),
  };
  const applyPorts: DoctorApplyPorts = {
    read: (p) => files[p] ?? null,
    backup: () => 'backup-1',
    write: (p, content) => {
      writes.push({ path: p, content });
      files[p] = content;
    },
    defaultTargets: async () => ['toolA'],
    dispatchTool: async (tool, p) => {
      dispatchCalls.push({ tool, path: p });
      return opts.dispatchResults?.[tool] ?? { tool, action: 'written', swapId: `swap-${tool}` };
    },
  };
  const undoPorts: UndoApplyPorts = {
    readBackup: (ref) => opts.backups?.[ref] ?? null,
    write: (p, content) => {
      writes.push({ path: p, content });
      files[p] = content;
    },
  };
  const routes = createDoctorFixRoutes({
    fs: { read: (p: string) => files[p] ?? null },
    getCriteria: () => [demoCriterion],
    doctorCache,
    fixCache,
    llmClient: llm,
    aiConfigStore,
    apply: applyPorts,
    undo: undoPorts,
    now: () => '2026-10-18T00:00:00.000Z',
  });
  return { routes, writes, dispatchCalls, files };
}

async function postJson(routes: Harness['routes'], path: string, body: unknown): Promise<{ status: number; json: () => Promise<Record<string, unknown>> }> {
  const res = await routes.fetch(
    new Request(`http://local${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: () => res.json() as Promise<Record<string, unknown>> };
}

describe('POST /api/doctor/fix-draft', () => {
  it('正常产出草案且库内零变化（Scenario 1：草案阶段零写库）', async () => {
    const h = harness();
    const res = await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [0] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draftContent).toContain('精简正文');
    expect(body.changeNotes).toEqual([{ issueIndex: 0, note: '删除了冗余段' }]);
    expect(body.cached).toBe(false);
    expect(h.writes).toHaveLength(0);
    expect(h.files[PATH]).toBe(SKILL_CONTENT);
  });

  it('issueIndexes 为空 / 越界 / 指向不可修复项 → 400', async () => {
    const h = harness();
    expect((await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [] })).status).toBe(400);
    expect((await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [9] })).status).toBe(400);
    const res = await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [1] });
    expect(res.status).toBe(400);
    expect(((await res.json()).error as string)).toContain('不可修复');
  });

  it('路径越界 403 / 文件缺失 404', async () => {
    const h = harness();
    expect((await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: 'd:/elsewhere/x.md', issueIndexes: [0] })).status).toBe(403);
    expect((await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: 'skills/gone/SKILL.md', issueIndexes: [0] })).status).toBe(404);
  });

  it('AI 未配置 → 400（草案必须走模型，区别于诊断降级）', async () => {
    const h = harness({ config: null });
    const res = await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [0] });
    expect(res.status).toBe(400);
  });

  it('超长资产 → 400（Scenario 7：草案只对被审视内容负责）', async () => {
    const h = harness({ content: '内'.repeat(6001) });
    const res = await postJson(h.routes, '/fix-draft', { kind: 'skill', hubRelativePath: PATH, issueIndexes: [0] });
    expect(res.status).toBe(400);
    expect(((await res.json()).error as string)).toContain('审视上限');
  });
});

describe('POST /api/doctor/apply', () => {
  it('只改库不分发（Scenario 6）：备份→写库，dispatch 空数组', async () => {
    const h = harness();
    const res = await postJson(h.routes, '/apply', {
      kind: 'skill',
      hubRelativePath: PATH,
      finalContent: '最终内容\n',
      distribute: false,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.backupRef).toBe('backup-1');
    expect(body.dispatch).toEqual([]);
    expect(body.rollbackAvailable).toBe(false);
    expect(h.writes).toEqual([{ path: PATH, content: '最终内容\n' }]);
    expect(h.dispatchCalls).toHaveLength(0);
  });

  it('分发聚合（Scenario 4）：逐工具结果与 swapId 透传，rollbackAvailable 判定', async () => {
    const h = harness({
      dispatchResults: {
        toolA: { tool: 'toolA', action: 'written', swapId: 'swap-A' },
        toolB: { tool: 'toolB', action: 'failed', reason: '写入失败' },
      },
    });
    const res = await postJson(h.routes, '/apply', {
      kind: 'skill',
      hubRelativePath: PATH,
      finalContent: '最终内容\n',
      distribute: true,
      targets: ['toolA', 'toolB'],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatch).toEqual([
      { tool: 'toolA', action: 'written', swapId: 'swap-A' },
      { tool: 'toolB', action: 'failed', reason: '写入失败' },
    ]);
    expect(body.rollbackAvailable).toBe(true);
    expect(h.dispatchCalls).toEqual([
      { tool: 'toolA', path: PATH },
      { tool: 'toolB', path: PATH },
    ]);
  });

  it('请求体守卫：finalContent 空 / distribute 非布尔 / 越界路径 / kind 非法 → 400/403', async () => {
    const h = harness();
    expect((await postJson(h.routes, '/apply', { kind: 'skill', hubRelativePath: PATH, finalContent: '', distribute: false })).status).toBe(400);
    expect((await postJson(h.routes, '/apply', { kind: 'skill', hubRelativePath: PATH, finalContent: 'x', distribute: 'yes' })).status).toBe(400);
    expect((await postJson(h.routes, '/apply', { kind: 'mcp', hubRelativePath: PATH, finalContent: 'x', distribute: false })).status).toBe(400);
    expect((await postJson(h.routes, '/apply', { kind: 'skill', hubRelativePath: '../escape.md', finalContent: 'x', distribute: false })).status).toBe(403);
    expect(h.writes).toHaveLength(0);
  });

  it('资产已不存在 → 404（ApplyAssetError，零写入）', async () => {
    const h = harness();
    const res = await postJson(h.routes, '/apply', {
      kind: 'skill',
      hubRelativePath: 'skills/gone/SKILL.md',
      finalContent: 'x\n',
      distribute: false,
    });
    expect(res.status).toBe(404);
    expect(h.writes).toHaveLength(0);
  });
});

describe('POST /api/doctor/undo', () => {
  it('按 backupRef 撤销：库内恢复旧版（Scenario 3）', async () => {
    const h = harness({ backups: { 'backup-1': { hubRelativePath: PATH, content: SKILL_CONTENT } } });
    const res = await postJson(h.routes, '/undo', { backupRef: 'backup-1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ restored: true, hubRelativePath: PATH });
    expect(h.writes).toEqual([{ path: PATH, content: SKILL_CONTENT }]);
  });

  it('备份缺失 → 404；backupRef 非法 → 400', async () => {
    const h = harness();
    expect((await postJson(h.routes, '/undo', { backupRef: 'gone' })).status).toBe(404);
    expect((await postJson(h.routes, '/undo', { backupRef: 123 })).status).toBe(400);
    expect((await postJson(h.routes, '/undo', {})).status).toBe(400);
  });
});
