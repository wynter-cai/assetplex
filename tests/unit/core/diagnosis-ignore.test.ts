/**
 * 忽略清单核心逻辑（add-diagnosis-rules T5）
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 4.2（内容变更后失效）/ 4.3（忽略必须透明）
 */

import { describe, it, expect } from 'vitest';
import {
  addIgnore,
  applyIgnores,
  countActiveIgnores,
  countExpiredIgnores,
  hashIgnoredContent,
  removeIgnore,
  sanitizeIgnoredFindings,
} from '../../../src/core/diagnosis-ignore.js';
import type { IgnoredFinding, RuleFinding } from '../../../src/core/types.js';

function finding(ruleId: string, ignored = false): RuleFinding {
  return {
    id: `${ruleId}:skills/demo/SKILL.md:1:0`,
    ruleId,
    category: 'skill',
    severity: 'medium',
    confidence: 'high',
    source: 'rule',
    title: '演示规则',
    finding: '演示问题',
    impact: '',
    suggestion: '演示建议',
    evidence: [],
    insufficientEvidence: true,
    fixable: false,
    ignored,
  };
}

function ignoredEntry(ruleId: string, contentHash: string, hubRelativePath = 'skills/demo/SKILL.md'): IgnoredFinding {
  return { ruleId, hubRelativePath, contentHash, ignoredAt: '2026-11-15T00:00:00.000Z' };
}

const FILES: Record<string, string> = {
  'skills/demo/SKILL.md': '同内容',
};

function read(path: string): string | null {
  return FILES[path] ?? null;
}

describe('sanitizeIgnoredFindings', () => {
  it('丢弃结构不完整的条目，并按 ruleId + 路径去重保留后写入的一条', () => {
    const raw = [
      ignoredEntry('SK-04', 'a'),
      { ruleId: '', hubRelativePath: 'x', contentHash: 'b', ignoredAt: 't' },
      { ruleId: 'SK-05', hubRelativePath: 'skills/demo/SKILL.md' },
      ignoredEntry('SK-04', 'c'),
      null,
    ];
    const items = sanitizeIgnoredFindings(raw);

    expect(items).toHaveLength(1);
    expect(items[0]?.ruleId).toBe('SK-04');
    expect(items[0]?.contentHash).toBe('c');
  });

  it('非数组输入返回空清单，不抛错', () => {
    expect(sanitizeIgnoredFindings({})).toEqual([]);
    expect(sanitizeIgnoredFindings(null)).toEqual([]);
  });
});

describe('applyIgnores', () => {
  const content = '正文';
  const hash = hashIgnoredContent(content);
  const context = { hubRelativePath: 'skills/demo/SKILL.md', contentHash: hash };

  it('相同内容再次诊断：命中规则被标记为已忽略', () => {
    const findings = applyIgnores([finding('SK-04')], context, [ignoredEntry('SK-04', hash)]);
    expect(findings[0]?.ignored).toBe(true);
  });

  it('内容变更后（哈希不同）忽略失效，重新提示', () => {
    const findings = applyIgnores([finding('SK-04')], context, [ignoredEntry('SK-04', '旧哈希')]);
    expect(findings[0]?.ignored).toBe(false);
  });

  it('只忽略同路径同规则，不影响其他规则与其他资产', () => {
    const findings = applyIgnores(
      [finding('SK-04'), finding('SK-05')],
      context,
      [ignoredEntry('SK-04', hash), ignoredEntry('SK-05', hash, 'skills/other/SKILL.md')],
    );
    expect(findings[0]?.ignored).toBe(true);
    expect(findings[1]?.ignored).toBe(false);
  });

  it('无忽略清单时原样返回', () => {
    const input = [finding('SK-04')];
    expect(applyIgnores(input, context, [])).toEqual(input);
  });
});

describe('addIgnore / removeIgnore', () => {
  it('同一规则同路径重复忽略只保留一条（新时间覆盖旧记录）', () => {
    const first = addIgnore([], ignoredEntry('SK-04', 'a'));
    const second = addIgnore(first, { ...ignoredEntry('SK-04', 'b'), ignoredAt: '2026-11-16T00:00:00.000Z' });

    expect(second).toHaveLength(1);
    expect(second[0]?.contentHash).toBe('b');
    expect(second[0]?.ignoredAt).toBe('2026-11-16T00:00:00.000Z');
  });

  it('恢复不存在的条目返回 restored=false，且清单不变', () => {
    const items = [ignoredEntry('SK-04', 'a')];
    const result = removeIgnore(items, 'skills/demo/SKILL.md', 'SK-99');
    expect(result.restored).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('恢复已存在条目返回 restored=true', () => {
    const result = removeIgnore([ignoredEntry('SK-04', 'a')], 'skills/demo/SKILL.md', 'SK-04');
    expect(result.restored).toBe(true);
    expect(result.items).toEqual([]);
  });
});

describe('过期与生效计数', () => {
  const hash = hashIgnoredContent(FILES['skills/demo/SKILL.md'] as string);
  const items = [
    ignoredEntry('SK-01', hash),
    ignoredEntry('SK-02', '旧哈希'),
    ignoredEntry('SK-03', '任意哈希', 'skills/deleted/SKILL.md'),
  ];

  it('内容变更或资产被删除计入过期', () => {
    expect(countExpiredIgnores(items, read)).toBe(2);
  });

  it('内容未变更计入生效', () => {
    expect(countActiveIgnores(items, read)).toBe(1);
  });
});
