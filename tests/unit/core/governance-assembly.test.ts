/**
 * 健康分数据装配测试（add-asset-governance H2）
 *
 * spec: specs/asset-health-score.spec.md Scenario 1/5
 * 装配层只做「读文件 + 跑机械检查 + 合并分发状态 + 合并语义诊断」，不重复实现检查逻辑。
 * 全部依赖注入，不碰真实 Hub。
 */

import { describe, it, expect } from 'vitest';
import {
  assembleGovernanceHealth,
  type GovernanceAssemblyDeps,
} from '../../../src/core/governance-assembly.js';
import type { AssetDistributionInfo } from '../../../src/core/distribution-status.js';
import type { DiagnosisIssue, DoctorAssetKind } from '../../../src/core/types.js';

const EMPTY_DESC = '---\nname: demo\ndescription: ""\n---\n正文\n';
const GOOD = '---\nname: demo\ndescription: 演示用\n---\n正文\n';

function dist(status: AssetDistributionInfo['status']): AssetDistributionInfo {
  return { toolId: 'demo-tool', toolName: 'Demo Tool', status };
}

interface HarnessOptions {
  files?: Record<string, string | null>;
  failKinds?: DoctorAssetKind[];
  semantic?: GovernanceAssemblyDeps['semantic'];
  aiConfigured?: boolean;
  distributions?: Record<string, AssetDistributionInfo[]>;
}

function harness(opts: HarnessOptions = {}) {
  const files = opts.files ?? {};
  const failKinds = new Set(opts.failKinds ?? []);
  const deps: GovernanceAssemblyDeps = {
    listAssets: (kind) => {
      if (failKinds.has(kind)) throw new Error(`目录不可读：${kind}`);
      return Object.keys(files).filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`));
    },
    read: (path) => files[path] ?? null,
    distributions: (path) => (opts.distributions ?? {})[path] ?? [],
    ...(opts.semantic === undefined ? {} : { semantic: opts.semantic }),
    aiConfigured: opts.aiConfigured ?? false,
    now: () => '2026-11-08T00:00:00.000Z',
  };
  return { deps };
}

describe('assembleGovernanceHealth — Scenario 1：复用机械检查', () => {
  it('缺 description 的技能被识别为完整性/规范性问题，不新增检查逻辑', () => {
    const { deps } = harness({
      files: {
        'skills/demo-skill-a/SKILL.md': EMPTY_DESC,
        'skills/demo-skill-b/SKILL.md': GOOD,
      },
    });
    const { health } = assembleGovernanceHealth(deps);

    expect(health.totalAssets).toBe(2);
    const completeness = health.dimensions.find((d) => d.id === 'completeness');
    expect(completeness?.issueCount).toBe(1);
    expect(completeness?.topIssues[0]).toMatchObject({
      assetName: 'demo-skill-a',
      severity: 'high',
      fixable: true,
    });
    const quality = health.dimensions.find((d) => d.id === 'quality');
    expect(quality?.issueCount).toBe(1);
  });

  it('读不到正文的资产标记 dataMissing，计入总数但不参与评分', () => {
    const { deps } = harness({
      files: {
        'skills/demo-skill-a/SKILL.md': GOOD,
        'skills/demo-skill-b/SKILL.md': null,
      },
    });
    const { health, assets } = assembleGovernanceHealth(deps);
    expect(health.totalAssets).toBe(2);
    expect(assets.find((a) => a.hubRelativePath === 'skills/demo-skill-b/SKILL.md')?.dataMissing).toBe(true);
    expect(health.dimensions.find((d) => d.id === 'completeness')?.evaluatedAssets).toBe(1);
  });

  it('分发状态按资产合并进评分输入', () => {
    const { deps } = harness({
      files: { 'skills/demo-skill-a/SKILL.md': GOOD },
      distributions: { 'skills/demo-skill-a/SKILL.md': [dist('conflict')] },
    });
    const { health } = assembleGovernanceHealth(deps);
    const distribution = health.dimensions.find((d) => d.id === 'distribution');
    expect(distribution?.applicability).toBe('applicable');
    expect(distribution?.score).toBe(0);
    expect(distribution?.topIssues[0].severity).toBe('high');
  });
});

describe('assembleGovernanceHealth — Scenario 5：AI 未配置明说未评估', () => {
  it('aiConfigured=false：不调用语义诊断，qualityMode=mechanical-only', () => {
    let calls = 0;
    const { deps } = harness({
      files: { 'skills/demo-skill-a/SKILL.md': GOOD },
      aiConfigured: false,
      semantic: () => {
        calls += 1;
        return { semanticIssues: [], evaluated: true };
      },
    });
    const { health } = assembleGovernanceHealth(deps);
    expect(calls).toBe(0);
    expect(health.qualityMode).toBe('mechanical-only');
  });

  it('aiConfigured=true 且缓存有语义结论：qualityMode=mechanical+ai', () => {
    const semanticIssue: DiagnosisIssue = {
      severity: 'medium',
      criterion: 'criteria:clarity',
      finding: '触发时机描述含糊',
      suggestion: '补一句何时使用',
      fixable: true,
    };
    const { deps } = harness({
      files: { 'skills/demo-skill-a/SKILL.md': GOOD },
      aiConfigured: true,
      semantic: () => ({ semanticIssues: [semanticIssue], evaluated: true }),
    });
    const { health } = assembleGovernanceHealth(deps);
    expect(health.qualityMode).toBe('mechanical+ai');
    expect(health.dimensions.find((d) => d.id === 'quality')?.issueCount).toBe(1);
  });
});

describe('assembleGovernanceHealth — 边界', () => {
  it('空库：grade=empty，接口不报错', () => {
    const { deps } = harness();
    const { health } = assembleGovernanceHealth(deps);
    expect(health.totalAssets).toBe(0);
    expect(health.grade).toBe('empty');
  });

  it('某类别目录不可读：内容类维度标 data-missing，不伪造分数', () => {
    const { deps } = harness({
      files: { 'skills/demo-skill-a/SKILL.md': GOOD },
      failKinds: ['rule'],
    });
    const { health } = assembleGovernanceHealth(deps);
    for (const id of ['completeness', 'quality', 'uniqueness'] as const) {
      const dimension = health.dimensions.find((d) => d.id === id);
      expect(dimension?.applicability).toBe('data-missing');
      expect(dimension?.score).toBeNull();
    }
    expect(health.totalAssets).toBe(1);
  });

  it('重复分组透传给唯一性维度', () => {
    const { deps } = harness({
      files: {
        'skills/demo-skill-a/SKILL.md': GOOD,
        'skills/demo-skill-b/SKILL.md': GOOD,
      },
    });
    const withDuplicates: GovernanceAssemblyDeps = {
      ...deps,
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
    };
    const { health } = assembleGovernanceHealth(withDuplicates);
    expect(health.dimensions.find((d) => d.id === 'uniqueness')?.issueCount).toBe(1);
  });
});
