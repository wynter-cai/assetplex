/**
 * skill-provenance 单元测试
 *
 * spec: 设计文档/changes/refactor-skill-origin-taxonomy/specs/skill-origin-taxonomy.spec.md
 * 覆盖：deriveProvenance 出处四值推导（内部 origin 六值 → 纯出处）、deriveInLibrary 库状态推导。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  deriveProvenance,
  deriveInLibrary,
  deriveScope,
  SKILL_PROVENANCES,
  SKILL_ASSET_SCOPES,
  type SkillProvenance,
} from '../../src/core/skill-provenance.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('deriveProvenance 出处推导', () => {
  it('vault 无 source → self（库内自建）', () => {
    expect(deriveProvenance('vault')).toBe('self');
    expect(deriveProvenance('vault', undefined)).toBe('self');
  });

  it('vault source=marketplace:* → marketplace（库内沉淀自市场的技能出处记市场）', () => {
    expect(deriveProvenance('vault', 'marketplace:/x/airbnb/SKILL.md')).toBe('marketplace');
  });

  it('vault source=plugin:* → plugin', () => {
    expect(deriveProvenance('vault', 'plugin:/x/plug/SKILL.md')).toBe('plugin');
  });

  it('vault source=github:* → github（add-github-skill-source D5）', () => {
    expect(deriveProvenance('vault', 'github:owner/repo@abc123:skills/foo/SKILL.md')).toBe('github');
  });

  it('vault source 其他前缀 → self', () => {
    expect(deriveProvenance('vault', 'personal:/home/pdf/SKILL.md')).toBe('self');
    expect(deriveProvenance('vault', 'project:/d/ws/SKILL.md')).toBe('self');
  });

  it('personal → self', () => {
    expect(deriveProvenance('personal')).toBe('self');
  });

  it('project → self', () => {
    expect(deriveProvenance('project')).toBe('self');
  });

  it('plugin → plugin', () => {
    expect(deriveProvenance('plugin')).toBe('plugin');
  });

  it('marketplace → marketplace', () => {
    expect(deriveProvenance('marketplace')).toBe('marketplace');
  });

  it('builtin → builtin', () => {
    expect(deriveProvenance('builtin')).toBe('builtin');
  });

  it('未知 origin → builtin 兜底并 console.warn 警示', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deriveProvenance('weird-origin' as SkillProvenance & string)).toBe('builtin');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('weird-origin');
  });
});

describe('deriveInLibrary 库状态推导', () => {
  it('vault → true，其余来源 → false', () => {
    expect(deriveInLibrary('vault')).toBe(true);
    expect(deriveInLibrary('personal')).toBe(false);
    expect(deriveInLibrary('project')).toBe(false);
    expect(deriveInLibrary('plugin')).toBe(false);
    expect(deriveInLibrary('marketplace')).toBe(false);
    expect(deriveInLibrary('builtin')).toBe(false);
  });
});

describe('SKILL_PROVENANCES 常量', () => {
  it('恰好五值且互斥穷尽（github 为第五值）', () => {
    expect(SKILL_PROVENANCES).toHaveLength(5);
    expect(SKILL_PROVENANCES).toEqual(['self', 'marketplace', 'plugin', 'builtin', 'github']);
  });
});

// refactor-skill-asset-first-view：资产/环境视图口径
// spec: 设计文档/changes/refactor-skill-asset-first-view/specs/asset-first-view.spec.md（定义节）
describe('deriveScope 资产/环境推导', () => {
  it('已入库无论出处均为资产（入库市场沉淀也是资产）', () => {
    expect(deriveScope('marketplace', true)).toBe('asset');
    expect(deriveScope('plugin', true)).toBe('asset');
    expect(deriveScope('builtin', true)).toBe('asset');
    expect(deriveScope('self', true)).toBe('asset');
    expect(deriveScope('github', true)).toBe('asset');
  });

  it('未入库且出处 self → 资产（个人/项目自建也是资产）', () => {
    expect(deriveScope('self', false)).toBe('asset');
  });

  it('未入库且出处非 self → 环境', () => {
    expect(deriveScope('marketplace', false)).toBe('environment');
    expect(deriveScope('plugin', false)).toBe('environment');
    expect(deriveScope('builtin', false)).toBe('environment');
  });

  it('SKILL_ASSET_SCOPES 恰好两值', () => {
    expect(SKILL_ASSET_SCOPES).toEqual(['asset', 'environment']);
  });
});
