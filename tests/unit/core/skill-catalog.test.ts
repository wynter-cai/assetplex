/**
 * skill-catalog 单元测试（refactor-skill-catalog T1/T3）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R2）
 * 覆盖：三分组映射五值全覆盖、判定依据优先级、来源判不出 → unknown、
 *      目录聚合（三组之和、unknown 单列、stale 不计入问题数、recent 上限）。
 */
import { describe, it, expect } from 'vitest';
import {
  buildCatalogOverview,
  catalogFieldsOf,
  classifyOriginOrUnknown,
  functionBasisOf,
  provenanceBasisOf,
  toProvenanceGroup,
} from '../../../src/core/skill-catalog.js';
import { filterAndCountSkills } from '../../../src/core/skill-listing.js';
import {
  SKILL_FUNCTIONS,
  type SkillInfo,
  type SkillSources,
} from '../../../src/core/skills-inventory.js';
import type { SkillDiagnosisSummaryView } from '../../../src/core/skill-diagnosis-summary.js';

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/demo/.trae-cn/skills',
  builtinRoot: '/home/demo/.trae-cn/builtin',
  builtinSkillsDir: '/home/demo/.trae-cn/builtin_skills',
  pluginsRoot: '/home/demo/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/demo/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

function makeSkill(overrides: Partial<SkillInfo> & { id: string }): SkillInfo {
  return {
    id: overrides.id,
    name: overrides.id,
    description: '',
    functionCategory: 'other',
    origin: 'personal',
    tool: 'trae',
    sourcePath: `${SOURCES.userSkillsDir}/${overrides.id}/SKILL.md`,
    version: '',
    functionSource: 'keyword',
    variants: [],
    lastModifiedAt: null,
    ...overrides,
  };
}

function view(
  overall: SkillDiagnosisSummaryView['overall'],
  issueCounts: SkillDiagnosisSummaryView['issueCounts'] = { high: 0, medium: 0, low: 0 },
  stale = false,
): SkillDiagnosisSummaryView {
  return {
    overall,
    issueCounts,
    mechanicalOnly: false,
    rulesVersion: 'demo-rules-1',
    model: 'demo-model',
    checkedAt: '2026-10-01T00:00:00.000Z',
    stale,
  };
}

describe('toProvenanceGroup（三分组是视图，不改五值真值）', () => {
  it('五值全覆盖：self→self，builtin/plugin→platform，marketplace/github→imported', () => {
    expect(toProvenanceGroup('self')).toBe('self');
    expect(toProvenanceGroup('builtin')).toBe('platform');
    expect(toProvenanceGroup('plugin')).toBe('platform');
    expect(toProvenanceGroup('marketplace')).toBe('imported');
    expect(toProvenanceGroup('github')).toBe('imported');
  });
});

describe('provenanceBasisOf（目录优先，元数据只在库内溯源时兜底）', () => {
  it('库内技能带收藏溯源前缀 → metadata', () => {
    expect(provenanceBasisOf('vault', 'marketplace:/x/demo-a/SKILL.md')).toBe('metadata');
    expect(provenanceBasisOf('vault', 'plugin:/x/demo-a/SKILL.md')).toBe('metadata');
    expect(provenanceBasisOf('vault', 'github:/x/demo-a/SKILL.md')).toBe('metadata');
  });

  it('库内技能无溯源、或非库内来源 → directory', () => {
    expect(provenanceBasisOf('vault', undefined)).toBe('directory');
    expect(provenanceBasisOf('vault', 'personal:/x/demo-a/SKILL.md')).toBe('directory');
    expect(provenanceBasisOf('personal', 'marketplace:/x/demo-a/SKILL.md')).toBe('directory');
    expect(provenanceBasisOf('builtin', undefined)).toBe('directory');
  });
});

describe('functionBasisOf（手动 / AI / 关键词直映射）', () => {
  it('三档分类来源直映射为依据值', () => {
    expect(functionBasisOf('manual')).toBe('manual');
    expect(functionBasisOf('ai')).toBe('ai');
    expect(functionBasisOf('keyword')).toBe('keyword');
  });
});

describe('classifyOriginOrUnknown（判不出不静默改判 builtin）', () => {
  it('已知来源根沿用既有判定', () => {
    expect(classifyOriginOrUnknown(`${SOURCES.userSkillsDir}/demo-a/SKILL.md`, SOURCES)).toBe('personal');
    expect(classifyOriginOrUnknown(`${SOURCES.marketplaceSkillsDir}/demo-a/SKILL.md`, SOURCES)).toBe(
      'marketplace',
    );
    expect(classifyOriginOrUnknown(`${SOURCES.builtinRoot}/code/default/skills/demo-a/SKILL.md`, SOURCES)).toBe(
      'builtin',
    );
  });

  it('任何已知来源根之外 → unknown', () => {
    expect(classifyOriginOrUnknown('/opt/unknown-root/demo-a/SKILL.md', SOURCES)).toBe('unknown');
  });
});

describe('catalogFieldsOf（条目分类依据）', () => {
  it('自建技能：group=self、依据为目录、用途依据取分类来源', () => {
    const fields = catalogFieldsOf(
      { origin: 'personal', source: undefined, sourcePath: `${SOURCES.userSkillsDir}/demo-a/SKILL.md`, functionSource: 'keyword' },
      SOURCES,
    );
    expect(fields).toEqual({
      provenanceGroup: 'self',
      provenanceBasis: 'directory',
      functionBasis: 'keyword',
    });
  });

  it('来源判不出：归入 platform 并显式标记 unknown', () => {
    const fields = catalogFieldsOf(
      {
        origin: 'builtin',
        source: undefined,
        sourcePath: '/opt/unknown-root/demo-a/SKILL.md',
        functionSource: 'ai',
      },
      SOURCES,
    );
    expect(fields.provenanceGroup).toBe('platform');
    expect(fields.provenanceUncertain).toBe('unknown');
    expect(fields.provenanceBasis).toBe('directory');
    expect(fields.functionBasis).toBe('ai');
  });

  it('库内 + 收藏溯源：依据为 metadata', () => {
    const fields = catalogFieldsOf(
      {
        origin: 'vault',
        source: 'marketplace:/x/demo-a/SKILL.md',
        sourcePath: `${SOURCES.vaultSkillsDir}/demo-a/SKILL.md`,
        functionSource: 'manual',
      },
      SOURCES,
    );
    expect(fields.provenanceGroup).toBe('imported');
    expect(fields.provenanceBasis).toBe('metadata');
    expect(fields.functionBasis).toBe('manual');
  });
});

describe('buildCatalogOverview（看板聚合）', () => {
  const skills = (): SkillInfo[] => [
    makeSkill({ id: 'demo-a', origin: 'personal', functionCategory: 'coding', lastModifiedAt: '2026-11-01T00:00:00.000Z' }),
    makeSkill({
      id: 'demo-b',
      origin: 'builtin',
      sourcePath: `${SOURCES.builtinRoot}/code/default/skills/demo-b/SKILL.md`,
      functionCategory: 'writing',
      lastModifiedAt: '2026-11-10T00:00:00.000Z',
    }),
    makeSkill({
      id: 'demo-c',
      origin: 'plugin',
      sourcePath: `${SOURCES.pluginsRoot}/demo-org/demo-plugin/1.0.0/skills/demo-c/SKILL.md`,
      functionCategory: 'coding',
    }),
    makeSkill({
      id: 'demo-d',
      origin: 'vault',
      source: 'marketplace:/x/demo-d/SKILL.md',
      sourcePath: `${SOURCES.vaultSkillsDir}/demo-d/SKILL.md`,
      functionCategory: 'data',
      lastModifiedAt: '2026-11-05T00:00:00.000Z',
    }),
    makeSkill({
      id: 'demo-e',
      origin: 'builtin',
      sourcePath: '/opt/unknown-root/demo-e/SKILL.md',
      functionCategory: 'other',
      lastModifiedAt: '2026-11-12T00:00:00.000Z',
    }),
    makeSkill({
      id: 'demo-f',
      origin: 'vault',
      source: 'plugin:/x/demo-f/SKILL.md',
      sourcePath: `${SOURCES.vaultSkillsDir}/demo-f/SKILL.md`,
      functionCategory: 'writing',
      lastModifiedAt: '2026-11-08T00:00:00.000Z',
    }),
  ];

  function overviewOf(
    all: SkillInfo[],
    params: { scope?: 'asset' | 'environment' | 'all' },
    summaries: Record<string, SkillDiagnosisSummaryView> = {},
  ) {
    const facets = filterAndCountSkills(all, params, SKILL_FUNCTIONS);
    return buildCatalogOverview({
      listing: {
        items: facets.items,
        total: facets.scopedTotal,
        countByFunction: facets.countByFunction,
        countByProvenance: facets.countByProvenance,
      },
      sources: SOURCES,
      summaries,
      aiClassify: { aiConfigured: true, pending: 1, cacheHits: 0, needCall: 1 },
      generatedAt: '2026-11-15T00:00:00.000Z',
    });
  }

  it('scope=asset：三组之和等于资产总数，且 total 与列表一致', () => {
    const all = skills();
    const facets = filterAndCountSkills(all, { scope: 'asset' }, SKILL_FUNCTIONS);
    const overview = overviewOf(all, { scope: 'asset' });

    expect(overview.total).toBe(facets.scopedTotal);
    expect(overview.total).toBe(3); // demo-a(自建) + demo-d(导入) + demo-f(平台自带，库内)
    expect(overview.groups.provenance.map((g) => g.key)).toEqual(['self', 'platform', 'imported']);
    const sum = overview.groups.provenance.reduce((acc, g) => acc + g.count, 0);
    expect(sum).toBe(overview.total);
    expect(overview.scope).toBe('asset');
    expect(overview.generatedAt).toBe('2026-11-15T00:00:00.000Z');
  });

  it('用途九类按既有顺序输出且计数沿用分面语义', () => {
    const overview = overviewOf(skills(), { scope: 'asset' });
    expect(overview.groups.function.map((g) => g.key)).toEqual(SKILL_FUNCTIONS);
    const byKey = new Map(overview.groups.function.map((g) => [g.key, g.count]));
    expect(byKey.get('coding')).toBe(1);
    expect(byKey.get('writing')).toBe(1);
    expect(byKey.get('data')).toBe(1);
    expect(byKey.get('other')).toBe(0);
  });

  it('来源判不出计入 platform 组并单列 unknown 计数', () => {
    const overview = overviewOf(skills(), {});
    const platform = overview.groups.provenance.find((g) => g.key === 'platform');
    // demo-b(内置) + demo-c(插件) + demo-f(库内插件来源) + demo-e(来源待确认)
    expect(platform?.count).toBe(4);
    expect(overview.countByProvenanceGroup).toEqual({ self: 1, platform: 3, imported: 1, unknown: 1 });
  });

  it('三组 latestModifiedAt 取组内最大值（无有效时间为 null）', () => {
    const overview = overviewOf(skills(), { scope: 'asset' });
    const self = overview.groups.provenance.find((g) => g.key === 'self');
    const platform = overview.groups.provenance.find((g) => g.key === 'platform');
    const imported = overview.groups.provenance.find((g) => g.key === 'imported');
    expect(self?.latestModifiedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(platform?.latestModifiedAt).toBe('2026-11-08T00:00:00.000Z');
    expect(imported?.latestModifiedAt).toBe('2026-11-05T00:00:00.000Z');
  });

  it('stale 摘要不计入问题数与结论分布，未体检显示 unchecked', () => {
    const overview = overviewOf(skills(), { scope: 'asset' }, {
      'demo-a': view('healthy'),
      'demo-f': view('needs-attention', { high: 1, medium: 2, low: 0 }),
      'demo-d': view('at-risk', { high: 5, medium: 0, low: 0 }, true),
    });

    expect(overview.diagnosis).toEqual({
      checked: 2,
      stale: 1,
      unchecked: 0,
      atRisk: 0,
      needsAttention: 1,
      healthy: 1,
      issues: { high: 1, medium: 2, low: 0 },
    });
    const platform = overview.groups.provenance.find((g) => g.key === 'platform');
    expect(platform?.diagnosis).toEqual({
      unchecked: 0,
      stale: 0,
      healthy: 0,
      needsAttention: 1,
      atRisk: 0,
    });
    const imported = overview.groups.provenance.find((g) => g.key === 'imported');
    expect(imported?.diagnosis.stale).toBe(1);
  });

  it('recent 最多 5 条、按时间倒序且排除 null', () => {
    const all: SkillInfo[] = Array.from({ length: 7 }, (_, i) =>
      makeSkill({
        id: `demo-${i}`,
        lastModifiedAt: i === 0 ? null : `2026-11-0${i}T00:00:00.000Z`,
      }),
    );
    const overview = overviewOf(all, { scope: 'asset' });
    expect(overview.recent).toHaveLength(5);
    expect(overview.recent.map((r) => r.id)).toEqual(['demo-6', 'demo-5', 'demo-4', 'demo-3', 'demo-2']);
    expect(overview.recent[0]).toEqual({
      id: 'demo-6',
      name: 'demo-6',
      provenance: 'self',
      provenanceGroup: 'self',
      lastModifiedAt: '2026-11-06T00:00:00.000Z',
    });
  });
});
