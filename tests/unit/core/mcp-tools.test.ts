/**
 * MCP 工具处理逻辑测试（add-asset-governance J2/J3）
 *
 * spec: specs/mcp-entry.spec.md Scenario 1/3/4/5/7/9
 * 夹具一律中性示例名（demo-rule / example-skill），不照搬本机真实资产。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createMcpToolHandlers,
  ASSET_CONTENT_LIMIT,
  type McpToolDeps,
  type McpHealthSource,
} from '../../../src/core/mcp-tools.js';
import { createPendingChangeStore } from '../../../src/core/mcp-pending.js';
import { McpToolError } from '../../../src/core/mcp-errors.js';
import type { GovernanceHealth, HealthIssueRef } from '../../../src/core/governance-health.js';

const HEALTH: GovernanceHealth = {
  score: 78,
  grade: 'good',
  totalAssets: 3,
  dimensions: [
    { id: 'completeness', label: '完整性', applicability: 'applicable', weight: 30, effectiveWeight: 30, score: 80, evaluatedAssets: 3, issueCount: 2, topIssues: [] },
    { id: 'quality', label: '规范性', applicability: 'applicable', weight: 30, effectiveWeight: 30, score: 70, evaluatedAssets: 3, issueCount: 1, topIssues: [] },
    { id: 'distribution', label: '分发一致性', applicability: 'applicable', weight: 25, effectiveWeight: 25, score: 90, evaluatedAssets: 3, issueCount: 0, topIssues: [] },
    { id: 'uniqueness', label: '唯一性', applicability: 'not-applicable', weight: 15, effectiveWeight: 0, score: null, evaluatedAssets: 0, issueCount: 0, topIssues: [] },
  ],
  qualityMode: 'mechanical-only',
  computedAt: '2026-11-08T00:00:00.000Z',
  cached: true,
};

const ISSUES: HealthIssueRef[] = [
  { id: 'i-1', severity: 'medium', title: '缺描述', kind: 'rule', hubRelativePath: 'rules/a.md', assetName: 'a', fixable: true },
  { id: 'i-2', severity: 'high', title: '正文过长', kind: 'rule', hubRelativePath: 'rules/b.md', assetName: 'b', fixable: false },
  { id: 'i-3', severity: 'low', title: '分发冲突', kind: 'skill', hubRelativePath: 'skills/c.md', assetName: 'c', fixable: true },
  { id: 'i-4', severity: 'low', title: '重复项', kind: 'skill', hubRelativePath: 'skills/d.md', assetName: 'd', fixable: false },
];

function makeDeps(overrides: Partial<McpToolDeps> = {}): McpToolDeps {
  const files = new Map<string, string>([
    ['rules/demo-rule.md', '# Demo rule\n'],
    ['identity/profile.md', '# Identity\n\n- 先给结论\n'],
  ]);
  let seq = 0;
  const pending = createPendingChangeStore({ now: () => 1000, idFactory: () => `p-${++seq}` });
  const distribute = vi.fn(async () => [{ tool: 'trae-cn', action: 'written' as const }]);

  const deps: McpToolDeps = {
    isHubInternalPath: (p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..'),
    fileExists: (p) => files.has(p),
    readIdentity: () =>
      files.has('identity/profile.md')
        ? { content: files.get('identity/profile.md') ?? '', hubRelativePath: 'identity/profile.md', updatedAt: '2026-11-08T00:00:00.000Z' }
        : null,
    listAssets: ({ kind, limit }) => {
      const all = [
        { name: 'demo-rule', kind: 'rule' as const, hubRelativePath: 'rules/demo-rule.md', diagnosisOverall: 'unknown' as const, distribution: [] },
        { name: 'example-skill', kind: 'skill' as const, hubRelativePath: 'skills/example-skill/SKILL.md', diagnosisOverall: 'healthy' as const, distribution: [{ toolId: 'trae-cn', status: 'synced' as const }] },
      ];
      const filtered = kind === undefined ? all : all.filter((a) => a.kind === kind);
      return limit === undefined ? filtered : filtered.slice(0, limit);
    },
    readAsset: (p) => files.get(p) ?? null,
    health: (): McpHealthSource => ({ health: HEALTH, issues: ISSUES }),
    diagnose: async ({ useAi }) => ({
      overall: 'needs-attention',
      issues: [{ severity: 'medium', criterion: 'mechanical:description-empty', finding: '无描述', suggestion: '补 description', fixable: true }],
      mechanicalOnly: useAi !== true,
      aiUsed: useAi === true,
    }),
    pending,
    commit: {
      backup: (p) => `backups/${p.replace(/\//g, '_')}-1`,
      write: (p, content) => {
        files.set(p, content);
      },
      distribute,
    },
    ...overrides,
  };
  Object.assign(deps, { _files: files, _distribute: distribute } as Record<string, unknown>);
  return deps;
}

function filesOf(deps: McpToolDeps): Map<string, string> {
  return (deps as unknown as { _files: Map<string, string> })._files;
}

async function expectError(promise: Promise<unknown> | (() => unknown), code: string): Promise<McpToolError> {
  let caught: unknown;
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(McpToolError);
  expect((caught as McpToolError).code).toBe(code);
  return caught as McpToolError;
}

describe('MCP 只读工具', () => {
  it('identity_get 返回正文、路径、版本哈希与更新时间', () => {
    const tools = createMcpToolHandlers(makeDeps());
    const result = tools.identityGet();
    expect(result.content).toContain('先给结论');
    expect(result.hubRelativePath).toBe('identity/profile.md');
    expect(result.versionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.updatedAt).toBeTruthy();
  });

  it('identity_get 缺失时返回结构化 NOT_FOUND，不抛裸异常', async () => {
    const tools = createMcpToolHandlers(makeDeps({ readIdentity: () => null }));
    const err = await expectError(() => tools.identityGet(), 'NOT_FOUND');
    expect(err.hint).toContain('身份');
  });

  it('assets_list 支持按类别过滤与 limit，返回 total', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    expect((await tools.assetsList({})).total).toBe(2);
    expect((await tools.assetsList({ kind: 'skill' })).items).toHaveLength(1);
    expect((await tools.assetsList({ limit: 1 })).items).toHaveLength(1);
  });

  it('assets_list 对未诊断资产标记 unknown，不伪造 healthy', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    expect((await tools.assetsList({ kind: 'rule' })).items[0]?.diagnosisOverall).toBe('unknown');
  });

  it('asset_get 超出上限时截断并标注 truncated', () => {
    const long = 'x'.repeat(ASSET_CONTENT_LIMIT + 100);
    const deps = makeDeps({
      readAsset: (p) => (p === 'rules/long.md' ? long : null),
    });
    const tools = createMcpToolHandlers(deps);
    const result = tools.assetGet({ kind: 'rule', hubRelativePath: 'rules/long.md' });
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBe(ASSET_CONTENT_LIMIT);
  });

  it('asset_get 拒绝越界路径与环境条目（mcp/）', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    await expectError(() => tools.assetGet({ kind: 'rule', hubRelativePath: '../../etc/passwd' }), 'OUT_OF_HUB');
    await expectError(() => tools.assetGet({ kind: 'rule', hubRelativePath: 'mcp/mcp.sources.json' }), 'OUT_OF_HUB');
  });

  it('health_get 返回四维摘要与前三条问题，零模型调用', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    const result = await tools.healthGet();
    expect(result.score).toBe(78);
    expect(result.dimensions).toHaveLength(4);
    expect(result.topIssues).toHaveLength(3);
    expect(result.topIssues[0]?.severity).toBe('high');
    expect(result.qualityMode).toBe('mechanical-only');
  });

  it('asset_diagnose 默认只跑机械项（mechanicalOnly=true, aiUsed=false）', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    const result = await tools.assetDiagnose({ kind: 'rule', hubRelativePath: 'rules/demo-rule.md' });
    expect(result.mechanicalOnly).toBe(true);
    expect(result.aiUsed).toBe(false);
  });

  it('asset_diagnose 显式 useAi=true 且未配置 AI 时返回 AI_UNAVAILABLE', async () => {
    const deps = makeDeps({
      diagnose: async () => {
        throw new McpToolError('AI_UNAVAILABLE', 'AI 端点未配置', '在 HUB 设置中配置 OpenAI 兼容端点后重试');
      },
    });
    const tools = createMcpToolHandlers(deps);
    await expectError(() => tools.assetDiagnose({ kind: 'rule', hubRelativePath: 'rules/demo-rule.md', useAi: true }), 'AI_UNAVAILABLE');
  });
});

describe('MCP 两段式写入', () => {
  it('propose 只产草稿与 diff，不改库内文件', () => {
    const deps = makeDeps();
    const tools = createMcpToolHandlers(deps);
    const result = tools.assetPropose({
      kind: 'rule',
      mode: 'update',
      hubRelativePath: 'rules/demo-rule.md',
      content: '# Demo rule\n\n先给结论。\n',
      rationale: '记住偏好',
    });

    expect(result.pendingChangeId).toBe('p-1');
    expect(result.unifiedDiff).toContain('+++ b/rules/demo-rule.md');
    expect(result.unifiedDiff).toContain('+先给结论。');
    expect(filesOf(deps).get('rules/demo-rule.md')).toBe('# Demo rule\n');
    expect(result.expiresAt).toBeTruthy();
  });

  it('propose create 自动生成安全路径，并用 /dev/null 说明新建', () => {
    const tools = createMcpToolHandlers(makeDeps());
    const result = tools.assetPropose({
      kind: 'rule',
      mode: 'create',
      content: '---\nname: 先给结论\n---\n\n正文\n',
    });
    expect(result.hubRelativePath).toBe('rules/先给结论.md');
    expect(result.unifiedDiff).toContain('--- /dev/null');
  });

  it('propose 拒绝：越界路径、环境条目、update 目标不存在、create 目标已存在', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    await expectError(
      () => tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: '/etc/passwd', content: 'x' }),
      'OUT_OF_HUB',
    );
    await expectError(
      () => tools.assetPropose({ kind: 'rule', mode: 'create', hubRelativePath: 'mcp/mcp.sources.json', content: 'x' }),
      'OUT_OF_HUB',
    );
    await expectError(
      () => tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/missing.md', content: 'x' }),
      'NOT_FOUND',
    );
    await expectError(
      () => tools.assetPropose({ kind: 'rule', mode: 'create', hubRelativePath: 'rules/demo-rule.md', content: 'x' }),
      'INVALID_INPUT',
    );
  });

  it('commit 凭 id 落盘：写前备份，默认不分发', async () => {
    const deps = makeDeps();
    const tools = createMcpToolHandlers(deps);
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/demo-rule.md', content: '# 新内容\n' });
    const result = await tools.assetCommit({ pendingChangeId: proposal.pendingChangeId });

    expect(result.saved).toBe(true);
    expect(result.backupRef).toBe('backups/rules_demo-rule.md-1');
    expect(filesOf(deps).get('rules/demo-rule.md')).toBe('# 新内容\n');
    expect(result.dispatch).toEqual([]);
  });

  it('commit 后 id 被消费，重复提交被拒绝（需重新 propose）', async () => {
    const tools = createMcpToolHandlers(makeDeps());
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/demo-rule.md', content: '# 新\n' });
    await tools.assetCommit({ pendingChangeId: proposal.pendingChangeId });
    await expectError(() => tools.assetCommit({ pendingChangeId: proposal.pendingChangeId }), 'NOT_FOUND');
  });

  it('commit 显式 distribute=true 才触碰工具目录，并逐工具回报', async () => {
    const deps = makeDeps();
    const tools = createMcpToolHandlers(deps);
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/demo-rule.md', content: '# 新\n' });
    const result = await tools.assetCommit({ pendingChangeId: proposal.pendingChangeId, distribute: true, targets: ['trae-cn'] });
    expect(result.dispatch).toEqual([{ tool: 'trae-cn', action: 'written' }]);
    expect((deps as unknown as { _distribute: { mock: { calls: unknown[] } } })._distribute.mock.calls).toHaveLength(1);
  });

  it('commit 过期草稿返回 STALE_PENDING，文件零变化', async () => {
    let clock = 1000;
    let seq = 0;
    const pending = createPendingChangeStore({ now: () => clock, idFactory: () => `p-${++seq}` });
    const deps = makeDeps({ pending });
    const tools = createMcpToolHandlers(deps);
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/demo-rule.md', content: '# 新\n' });

    clock += 10 * 60 * 1000 + 1;
    await expectError(() => tools.assetCommit({ pendingChangeId: proposal.pendingChangeId }), 'STALE_PENDING');
    expect(filesOf(deps).get('rules/demo-rule.md')).toBe('# Demo rule\n');
  });

  it('commit 前再次校验路径（草稿被篡改也不越界）', async () => {
    const deps = makeDeps();
    const tools = createMcpToolHandlers(deps);
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'update', hubRelativePath: 'rules/demo-rule.md', content: '# 新\n' });
    // 模拟缓存被手改：把目标改成 Hub 外路径
    const entry = deps.pending.get(proposal.pendingChangeId);
    (entry as unknown as { hubRelativePath: string }).hubRelativePath = '../escape.md';

    await expectError(() => tools.assetCommit({ pendingChangeId: proposal.pendingChangeId }), 'OUT_OF_HUB');
    expect(filesOf(deps).get('../escape.md')).toBeUndefined();
  });

  it('MCP 写入后立即读回同一数据源（与 HUB 强一致）', async () => {
    const deps = makeDeps();
    const tools = createMcpToolHandlers(deps);
    const proposal = tools.assetPropose({ kind: 'rule', mode: 'create', content: '---\nname: 新偏好\n---\n\n内容\n' });
    await tools.assetCommit({ pendingChangeId: proposal.pendingChangeId });
    const readBack = tools.assetGet({ kind: 'rule', hubRelativePath: proposal.hubRelativePath });
    expect(readBack.content).toContain('新偏好');
  });
});
