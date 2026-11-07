import { describe, it, expect } from 'vitest';
import { FUNCTION_COLORS, functionDotClass } from './skill-colors';
import { FUNCTION_LABELS, FUNCTION_ORDER } from './skill-labels';
import type { SkillFunction } from '@/types/api';

/** spec skill-function-color 色彩编码表的色相 */
const EXPECTED_HUE: Record<SkillFunction, number> = {
  coding: 243,
  writing: 36,
  browser: 199,
  data: 165,
  devops: 12,
  'ai-integration': 285,
  design: 330,
  workflow: 178,
  other: 210,
};

/** 既有语义色色相（destructive / warning / success / info），色点不得落在 ±6° 内 */
const SEMANTIC_HUES = [0, 26, 142, 224];

describe('FUNCTION_COLORS', () => {
  it('九个职能与 FUNCTION_ORDER 完全一致（无遗漏、无多余）', () => {
    expect(Object.keys(FUNCTION_COLORS).sort()).toEqual([...FUNCTION_ORDER].sort());
  });

  it('每个职能都有中文标签可配对（色点不单独传达信息）', () => {
    for (const fn of FUNCTION_ORDER) {
      expect(FUNCTION_LABELS[fn]).toBeTruthy();
    }
  });

  it('token 前缀统一为 --fn- 且互不重复', () => {
    const tokens = FUNCTION_ORDER.map((fn) => FUNCTION_COLORS[fn].token);
    for (const token of tokens) {
      expect(token.startsWith('--fn-')).toBe(true);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('色相与 spec 表一致', () => {
    for (const fn of FUNCTION_ORDER) {
      expect(FUNCTION_COLORS[fn].hue).toBe(EXPECTED_HUE[fn]);
    }
  });

  it('色相避开语义色四区间（0 / 26 / 142 / 224 ±6°）', () => {
    for (const fn of FUNCTION_ORDER) {
      const { hue } = FUNCTION_COLORS[fn];
      for (const semantic of SEMANTIC_HUES) {
        const delta = Math.min(Math.abs(hue - semantic), 360 - Math.abs(hue - semantic));
        expect(delta, `${fn} 的色相 ${hue} 与语义色 ${semantic} 过近`).toBeGreaterThan(6);
      }
    }
  });

  it('色点类名是字面量 bg-fn-*，且九个互不相同', () => {
    const classes = FUNCTION_ORDER.map((fn) => FUNCTION_COLORS[fn].dotClass);
    for (const cls of classes) {
      expect(cls).toMatch(/^bg-fn-[a-z-]+$/);
    }
    expect(new Set(classes).size).toBe(classes.length);
  });
});

describe('functionDotClass', () => {
  it('按职能返回对应类名', () => {
    expect(functionDotClass('coding')).toBe('bg-fn-coding');
    expect(functionDotClass('ai-integration')).toBe('bg-fn-ai-integration');
  });

  it('未分类（undefined）兜底到 other', () => {
    expect(functionDotClass(undefined)).toBe('bg-fn-other');
  });

  it('非法值兜底到 other，不抛错', () => {
    expect(functionDotClass('not-a-function' as SkillFunction)).toBe('bg-fn-other');
  });
});
