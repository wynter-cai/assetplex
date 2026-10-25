/**
 * 资产入口文件判定测试
 *
 * spec: asset-center-consistency（Scenario 4 技能按技能名展示 / Scenario 5 内部文件不冒充资产）
 * 关联: fix-trust-and-consistency tasks H3
 */

import { describe, it, expect } from 'vitest';
import { resolveAssetEntry, type AssetCategory } from '../../../src/core/assets.js';

function nameOf(path: string, category: AssetCategory): string | null {
  return resolveAssetEntry(path, category)?.name ?? null;
}

describe('资产入口文件判定', () => {
  it('技能取目录名作为资产名（不再出现多张 SKILL 卡片）', () => {
    expect(nameOf('skills/demo-skill/SKILL.md', 'skill')).toBe('demo-skill');
    expect(nameOf('skills/another-skill/SKILL.md', 'skill')).toBe('another-skill');
    // 入口文件大小写不敏感
    expect(nameOf('skills/demo-skill/skill.md', 'skill')).toBe('demo-skill');
  });

  it('技能目录内的子文件不算独立资产', () => {
    expect(resolveAssetEntry('skills/demo-skill/references/guide.md', 'skill')).toBeNull();
    expect(resolveAssetEntry('skills/demo-skill/scripts/run.sh', 'skill')).toBeNull();
    expect(resolveAssetEntry('skills/demo-skill/_meta.json', 'skill')).toBeNull();
    expect(resolveAssetEntry('skills/demo-skill/README.md', 'skill')).toBeNull();
  });

  it('兼容历史平铺的技能文件', () => {
    expect(nameOf('skills/legacy-skill.md', 'skill')).toBe('legacy-skill');
  });

  it('内部前缀（_ 与 .）在任何类别下都不算资产', () => {
    expect(resolveAssetEntry('rules/_draft.md', 'rule')).toBeNull();
    expect(resolveAssetEntry('identity/.hidden.md', 'identity')).toBeNull();
    expect(resolveAssetEntry('mcp/_cache/mcp.sources.json', 'mcp')).toBeNull();
  });

  it('其余类别取去扩展名的文件名', () => {
    expect(nameOf('identity/profile.md', 'identity')).toBe('profile');
    expect(nameOf('rules/demo-rule.md', 'rule')).toBe('demo-rule');
    expect(nameOf('mcp/mcp.sources.json', 'mcp')).toBe('mcp.sources');
    expect(nameOf('identity/profile.auto.md', 'identity')).toBe('profile.auto');
  });

  it('空路径与异常输入不会被当成资产', () => {
    expect(resolveAssetEntry('', 'rule')).toBeNull();
    expect(resolveAssetEntry('///', 'rule')).toBeNull();
  });

  it('hubPath 原样回显，保证 id 与详情接口一致', () => {
    const entry = resolveAssetEntry('skills/demo-skill/SKILL.md', 'skill');
    expect(entry?.hubPath).toBe('skills/demo-skill/SKILL.md');
  });
});
