/**
 * 资产名称校验与 frontmatter 拼装单元测试
 *
 * spec: add-skill-curation（source 来源标识字段）
 * 注：validateAssetName / buildAssetMarkdown 基础行为由 skill-write.test.ts 覆盖，
 * 此处聚焦 frontmatter 的 source 扩展字段。
 */
import { describe, it, expect } from 'vitest';
import { buildAssetMarkdown } from '../../../src/core/asset-name.js';

describe('buildAssetMarkdown frontmatter source 字段', () => {
  it('带 source 时写入 frontmatter 第三行', () => {
    const md = buildAssetMarkdown({
      name: 'airbnb',
      description: '旅行预订技能',
      content: '# airbnb\n正文',
      source: 'marketplace:/x/airbnb/SKILL.md',
    });
    expect(md).toContain('name: airbnb');
    expect(md).toContain('description: 旅行预订技能');
    expect(md).toContain('source: marketplace:/x/airbnb/SKILL.md');
    // frontmatter 结构完整：source 在 --- 闭合之前
    const frontmatter = md.split('---')[1] ?? '';
    expect(frontmatter).toContain('source: marketplace:/x/airbnb/SKILL.md');
  });

  it('不带 source 时不产生 source 行（自建技能）', () => {
    const md = buildAssetMarkdown({ name: 'mine', description: '自建', content: 'x' });
    expect(md).not.toContain('source:');
  });

  it('source 为空字符串时同样不产生 source 行', () => {
    const md = buildAssetMarkdown({ name: 'mine', description: '', content: 'x', source: '' });
    expect(md).not.toContain('source:');
  });

  it('正文与描述不受 source 影响', () => {
    const md = buildAssetMarkdown({
      name: 'a',
      description: '第一行\n第二行',
      content: '\n# 标题',
      source: 'plugin:/p/s/SKILL.md',
    });
    expect(md).toContain('description: 第一行 第二行');
    expect(md.endsWith('\n# 标题')).toBe(true);
  });
});
