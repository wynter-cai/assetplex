/**
 * criteria 裁决准则元资产单元测试（add-llm-conflict-arbitration A2）
 *
 * spec: specs/criteria-meta-asset.spec.md Scenario 2/4/5 数据面
 * criteria.ts 走 hub-files 真实 fs 封装，测试用 ASSETPLEX_DIR 指向临时目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseCriterionFile,
  serializeCriterionFile,
  listCriteria,
  hashCriteria,
  assembleCriteriaPromptBlock,
  type CriterionAsset,
} from '../../../src/core/criteria.js';

function makeAsset(overrides: Partial<CriterionAsset> = {}): CriterionAsset {
  return {
    slug: 'demo',
    relativePath: 'criteria/demo.md',
    name: '示例准则',
    description: '一句话用途',
    priority: 10,
    enabled: true,
    appliesTo: ['all'],
    body: '准则正文',
    ...overrides,
  };
}

describe('parseCriterionFile：frontmatter 解析', () => {
  it('完整字段解析（含 appliesTo 数组与 source）', () => {
    const asset = parseCriterionFile(
      'criteria/progressive.md',
      [
        '---',
        'name: 渐进披露',
        'description: skill 细节应放二级文件',
        'priority: 5',
        'enabled: false',
        'appliesTo: [skill, agent]',
        'source: Anthropic Agent Skills 指南',
        '---',
        '正文第一段',
        '正文第二段',
      ].join('\n'),
    );
    expect(asset.slug).toBe('progressive');
    expect(asset.name).toBe('渐进披露');
    expect(asset.priority).toBe(5);
    expect(asset.enabled).toBe(false);
    expect(asset.appliesTo).toEqual(['skill', 'agent']);
    expect(asset.source).toBe('Anthropic Agent Skills 指南');
    expect(asset.body).toBe('正文第一段\n正文第二段');
  });

  it('缺省与容错：无 frontmatter 时正文完整保留、字段回退默认', () => {
    const asset = parseCriterionFile('criteria/raw.md', '纯文本没有任何 frontmatter');
    expect(asset.name).toBe('raw');
    expect(asset.priority).toBe(100);
    expect(asset.enabled).toBe(true);
    expect(asset.appliesTo).toEqual(['all']);
    expect(asset.body).toBe('纯文本没有任何 frontmatter');
  });

  it('priority 非法值回退 100；enabled 仅 false 字面量关闭', () => {
    const bad = parseCriterionFile('criteria/x.md', '---\npriority: 高\nenabled: yes\n---\n正文');
    expect(bad.priority).toBe(100);
    expect(bad.enabled).toBe(true);
  });

  it('值内含冒号不误切（source 带 URL）', () => {
    const asset = parseCriterionFile('criteria/y.md', '---\nsource: https://a.com:8080/doc\n---\n正文');
    expect(asset.source).toBe('https://a.com:8080/doc');
  });
});

describe('serializeCriterionFile：写回与往返', () => {
  it('序列化后再解析字段一致（往返）', () => {
    const original = makeAsset({ appliesTo: ['skill'], source: '某指南', priority: 3 });
    const reparsed = parseCriterionFile(original.relativePath, serializeCriterionFile(original));
    expect(reparsed.name).toBe(original.name);
    expect(reparsed.priority).toBe(3);
    expect(reparsed.enabled).toBe(true);
    expect(reparsed.appliesTo).toEqual(['skill']);
    expect(reparsed.source).toBe('某指南');
    expect(reparsed.body).toBe(original.body);
  });

  it('正文中的 --- 分隔线不被 frontmatter 解析吞掉', () => {
    const asset = makeAsset({ body: '上半\n---\n下半' });
    const parsed = parseCriterionFile(asset.relativePath, serializeCriterionFile(asset));
    expect(parsed.body).toBe('上半\n---\n下半');
  });
});

describe('listCriteria：库内读取与排序（Scenario 5 前置）', () => {
  let hubRoot: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    hubRoot = mkdtempSync(join(tmpdir(), 'criteria-test-'));
    originalEnv = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubRoot;
    mkdirSync(join(hubRoot, 'criteria'), { recursive: true });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalEnv;
    rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('按 priority 升序、同优先级按 slug 字典序', () => {
    writeFileSync(join(hubRoot, 'criteria', 'b-low.md'), '---\nname: B\npriority: 20\n---\nx');
    writeFileSync(join(hubRoot, 'criteria', 'a-first.md'), '---\nname: A\npriority: 5\n---\nx');
    writeFileSync(join(hubRoot, 'criteria', 'c-tie.md'), '---\nname: C\npriority: 5\n---\nx');

    const slugs = listCriteria().map((c) => c.slug);
    expect(slugs).toEqual(['a-first', 'c-tie', 'b-low']);
  });

  it('目录不存在返回空数组', () => {
    rmSync(join(hubRoot, 'criteria'), { recursive: true, force: true });
    expect(listCriteria()).toEqual([]);
  });

  it('非 .md 文件忽略', () => {
    writeFileSync(join(hubRoot, 'criteria', 'note.txt'), 'ignored');
    writeFileSync(join(hubRoot, 'criteria', 'real.md'), '---\nname: R\n---\nx');
    expect(listCriteria().map((c) => c.slug)).toEqual(['real']);
  });
});

describe('hashCriteria：组装与缓存锚点', () => {
  it('同一准则集哈希稳定；内容或增删改变哈希', () => {
    const a = makeAsset({ slug: 'a' });
    const b = makeAsset({ slug: 'b', priority: 2 });
    const h1 = hashCriteria([a, b]);
    expect(hashCriteria([a, b])).toBe(h1);
    expect(hashCriteria([a])).not.toBe(h1);
    expect(hashCriteria([a, { ...b, body: '改过的正文' }])).not.toBe(h1);
  });

  it('与入参顺序无关（内部规范化）', () => {
    const a = makeAsset({ slug: 'a' });
    const b = makeAsset({ slug: 'b' });
    expect(hashCriteria([b, a])).toBe(hashCriteria([a, b]));
  });
});

describe('assembleCriteriaPromptBlock：类别匹配 + 预算截断（Scenario 5）', () => {
  const entry = (slug: string, body: string, overrides: Partial<CriterionAsset> = {}): CriterionAsset =>
    makeAsset({ slug, name: slug, body, ...overrides });

  it('空准则集：block 为空、used 空、skipped 0', () => {
    expect(assembleCriteriaPromptBlock([], 'skill')).toEqual({ block: '', used: [], skipped: 0 });
  });

  it('appliesTo 匹配：all 通配参与，指定其化类别的不参与', () => {
    const c1 = entry('wild', 'x', { appliesTo: ['all'] });
    const c2 = entry('skill-only', 'y', { appliesTo: ['skill'] });
    const c3 = entry('agent-only', 'z', { appliesTo: ['agent'] });

    const forSkill = assembleCriteriaPromptBlock([c1, c2, c3], 'skill');
    // 同 priority 按 slug 字典序（Scenario 5 排序契约）：skill-only < wild
    expect(forSkill.used).toEqual(['skill-only', 'wild']);
    expect(forSkill.skipped).toBe(0);
    expect(forSkill.block).toContain('wild');
    expect(forSkill.block).not.toContain('agent-only');
  });

  it('enabled=false 不参与（Scenario 4）', () => {
    const off = entry('disabled', 'x', { enabled: false });
    const result = assembleCriteriaPromptBlock([off], 'skill');
    expect(result.used).toEqual([]);
    expect(result.skipped).toBe(0); // 停用≠被预算舍去，不计入披露
  });

  it('按序取入至预算耗尽，余量计入 skipped；单条超预算整条舍去', () => {
    const a = entry('a', 'A'.repeat(100), { priority: 1 });
    const b = entry('b', 'B'.repeat(100), { priority: 2 });
    const fat = entry('fat', 'F'.repeat(5000), { priority: 3 });
    const last = entry('last', 'L'.repeat(100), { priority: 4 });

    const result = assembleCriteriaPromptBlock([a, b, fat, last], 'skill', 300);
    expect(result.used).toEqual(['a', 'b']);
    expect(result.skipped).toBe(2); // fat 超预算 + last 无余量
    expect(result.block).not.toContain('F'.repeat(10));
  });

  it('同优先级按 slug 字典序取入（与 listCriteria 排序契约一致）', () => {
    const z = entry('z', 'Z'.repeat(100), { priority: 5 });
    const a = entry('a', 'A'.repeat(100), { priority: 5 });
    const result = assembleCriteriaPromptBlock([z, a], 'skill', 150);
    expect(result.used).toEqual(['a']);
  });
});
