/**
 * 技能诊断摘要纯逻辑（refactor-skill-catalog T4）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1.2/R1.3/R5.4）
 * 摘要只用于展示：校验脏数据、增量合并、按当前内容哈希判定过期，绝不参与诊断结论。
 */
import { describe, it, expect } from 'vitest';
import {
  computeSkillContentHash,
  isDiagnosisSummaryStale,
  mergeDiagnosisSummary,
  sanitizeDiagnosisSummaries,
  sanitizeDiagnosisSummary,
  toDiagnosisSummaryView,
  type SkillDiagnosisSummary,
} from '../../../src/core/skill-diagnosis-summary.js';

function record(overrides: Partial<SkillDiagnosisSummary> = {}): SkillDiagnosisSummary {
  return {
    hubRelativePath: 'skills/demo-a/SKILL.md',
    contentHash: 'hash-1',
    overall: 'needs-attention',
    issueCounts: { high: 1, medium: 2, low: 3 },
    mechanicalOnly: false,
    rulesVersion: 'demo-rules-1',
    model: 'demo-model',
    checkedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeSkillContentHash', () => {
  it('同内容同哈希、异内容异哈希', () => {
    expect(computeSkillContentHash('# demo')).toBe(computeSkillContentHash('# demo'));
    expect(computeSkillContentHash('# demo')).not.toBe(computeSkillContentHash('# demo2'));
  });
});

describe('sanitizeDiagnosisSummary（脏数据按条过滤）', () => {
  it('合法条目原样通过', () => {
    expect(sanitizeDiagnosisSummary(record())).toEqual(record());
  });

  it('overall 闭集外 → null', () => {
    expect(sanitizeDiagnosisSummary(record({ overall: 'critical' as never }))).toBeNull();
  });

  it('计数非非负整数 → null', () => {
    expect(sanitizeDiagnosisSummary(record({ issueCounts: { high: -1, medium: 0, low: 0 } }))).toBeNull();
    expect(sanitizeDiagnosisSummary(record({ issueCounts: { high: 1.5, medium: 0, low: 0 } }))).toBeNull();
    expect(
      sanitizeDiagnosisSummary({ ...record(), issueCounts: { high: 1, medium: 0 } }),
    ).toBeNull();
  });

  it('路径为空或绝对路径 → null（摘要不落本机绝对路径）', () => {
    expect(sanitizeDiagnosisSummary(record({ hubRelativePath: '' }))).toBeNull();
    expect(sanitizeDiagnosisSummary(record({ hubRelativePath: '/hub/skills/demo-a/SKILL.md' }))).toBeNull();
    expect(sanitizeDiagnosisSummary(record({ hubRelativePath: 'D:/hub/skills/demo-a/SKILL.md' }))).toBeNull();
  });

  it('缺字段与非法类型 → null', () => {
    expect(sanitizeDiagnosisSummary(null)).toBeNull();
    expect(sanitizeDiagnosisSummary('demo')).toBeNull();
    expect(sanitizeDiagnosisSummary({ ...record(), mechanicalOnly: 'yes' })).toBeNull();
    expect(sanitizeDiagnosisSummary({ ...record(), checkedAt: '' })).toBeNull();
  });
});

describe('sanitizeDiagnosisSummaries', () => {
  it('整表过滤：脏条目不进结果', () => {
    const cleaned = sanitizeDiagnosisSummaries({
      'skills/demo-a/SKILL.md': record(),
      'skills/demo-b/SKILL.md': record({ hubRelativePath: 'skills/demo-b/SKILL.md', overall: 'nope' }),
      'skills/demo-c/SKILL.md': 'demo',
    });
    expect(Object.keys(cleaned)).toEqual(['skills/demo-a/SKILL.md']);
  });

  it('非对象输入返回空表', () => {
    expect(sanitizeDiagnosisSummaries(null)).toEqual({});
    expect(sanitizeDiagnosisSummaries([])).toEqual({});
  });
});

describe('mergeDiagnosisSummary（部分写入不丢既有条目）', () => {
  it('按 hubRelativePath 覆盖并保留其他条目', () => {
    const base = sanitizeDiagnosisSummaries({
      'skills/demo-a/SKILL.md': record(),
      'skills/demo-b/SKILL.md': record({ hubRelativePath: 'skills/demo-b/SKILL.md', overall: 'healthy' }),
    });
    const next = mergeDiagnosisSummary(base, record({ overall: 'at-risk' }));

    expect(next['skills/demo-a/SKILL.md'].overall).toBe('at-risk');
    expect(next['skills/demo-b/SKILL.md'].overall).toBe('healthy');
    expect(base['skills/demo-a/SKILL.md'].overall).toBe('needs-attention');
  });

  it('非法条目抛错（由调用方计入 rejected）', () => {
    expect(() => mergeDiagnosisSummary({}, record({ overall: 'nope' as never }))).toThrow(/诊断摘要/);
  });
});

describe('stale 判定与展示投影', () => {
  it('内容哈希一致 → 未过期', () => {
    expect(isDiagnosisSummaryStale(record(), 'hash-1')).toBe(false);
    expect(toDiagnosisSummaryView(record(), 'hash-1').stale).toBe(false);
  });

  it('内容已变 → 过期', () => {
    expect(isDiagnosisSummaryStale(record(), 'hash-2')).toBe(true);
    expect(toDiagnosisSummaryView(record(), 'hash-2').stale).toBe(true);
  });

  it('当前内容读不到（null）→ 保守判过期', () => {
    expect(isDiagnosisSummaryStale(record(), null)).toBe(true);
  });

  it('投影不含哈希与路径', () => {
    const projection = toDiagnosisSummaryView(record(), 'hash-1');
    expect(projection).toEqual({
      overall: 'needs-attention',
      issueCounts: { high: 1, medium: 2, low: 3 },
      mechanicalOnly: false,
      rulesVersion: 'demo-rules-1',
      model: 'demo-model',
      checkedAt: '2026-11-01T00:00:00.000Z',
      stale: false,
    });
    expect(Object.prototype.hasOwnProperty.call(projection, 'contentHash')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(projection, 'hubRelativePath')).toBe(false);
  });
});
