/**
 * 用户规则加载 / 合并 / 保存前校验测试（refactor-governance-center T7）
 *
 * spec: governance-center.spec.md Scenario 5.3–5.7；拍板 D16（同编号覆盖内置、坏规则跳过告警）。
 * 纯逻辑；文件内容由测试注入，不碰真实 Hub 目录。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import {
  buildRuleListView,
  mergeUserRules,
  toRuleLoadWarnings,
  validateUserRuleFile,
} from '../../../src/core/diagnosis-user-rules.js';

const BUILTIN = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;

function ruleYaml(entries: string): string {
  return `version: "9.9.9"\nupdatedAt: "2026-11-15"\nrules:\n${entries}`;
}

const NEW_RULE = `  - id: USER-01
    category: skill
    severity: low
    mode: static
    signal: "演示：用户自定义信号"
    recommendation: "演示：按需调整"
    source: "用户规则"
`;

const OVERRIDE_SK03 = `  - id: SK-03
    category: skill
    severity: high
    mode: static
    signal: "覆盖后的 description 触发子句检查"
    recommendation: "覆盖后的改法"
    source: "用户规则"
`;

const BAD_RULE = `  - category: skill
    severity: high
    mode: static
    signal: "缺 id"
    recommendation: "x"
    source: "x"
`;

describe('toRuleLoadWarnings', () => {
  it('按文案归类原因并提取规则编号，未识别归 unparsable', () => {
    expect(toRuleLoadWarnings(['规则 SK-03 缺少 signal，已跳过'], 'a.yaml')[0]).toEqual({
      originLabel: 'a.yaml',
      ruleId: 'SK-03',
      reason: 'missing-field',
    });
    expect(toRuleLoadWarnings(['规则 X 编号重复，重复条目已跳过'], 'a.yaml')[0]?.reason).toBe('duplicate-id');
    expect(toRuleLoadWarnings(['规则 X category「bad」不在闭集内，已跳过'], 'a.yaml')[0]?.reason).toBe(
      'invalid-category',
    );
    expect(toRuleLoadWarnings(['完全看不懂的告警'], 'a.yaml')[0]).toEqual({
      originLabel: 'a.yaml',
      ruleId: null,
      reason: 'unparsable',
    });
  });
});

describe('mergeUserRules', () => {
  it('同编号覆盖内置并标记 overridesBuiltin，其余追加', () => {
    const merged = mergeUserRules(BUILTIN, [
      { path: 'diagnosis-rules/demo.yaml', text: ruleYaml(OVERRIDE_SK03 + NEW_RULE) },
    ]);

    expect(merged.ruleSet?.rules).toHaveLength(BUILTIN.rules.length + 1);
    const sk03 = merged.ruleSet?.rules.find((rule) => rule.id === 'SK-03');
    expect(sk03?.signal).toBe('覆盖后的 description 触发子句检查');
    expect(merged.overriddenRuleIds).toEqual(['SK-03']);
    expect(merged.origins.get('SK-03')).toEqual({
      origin: 'user',
      overridesBuiltin: true,
      originLabel: 'diagnosis-rules/demo.yaml',
    });
    expect(merged.origins.get('USER-01')?.overridesBuiltin).toBe(false);
    expect(merged.userCount).toBe(2);
    expect(merged.builtinCount).toBe(BUILTIN.rules.length);
  });

  it('单条坏规则跳过并告警，其余规则照常生效', () => {
    const merged = mergeUserRules(BUILTIN, [
      { path: 'diagnosis-rules/mixed.yaml', text: ruleYaml(BAD_RULE + NEW_RULE) },
    ]);
    expect(merged.ruleSet?.rules.some((rule) => rule.id === 'USER-01')).toBe(true);
    expect(merged.warnings.some((warning) => warning.reason === 'missing-field')).toBe(true);
    expect(merged.warnings.every((warning) => warning.originLabel === 'diagnosis-rules/mixed.yaml')).toBe(true);
  });

  it('整个文件不可解析只跳过该文件，内置规则不受影响', () => {
    const merged = mergeUserRules(BUILTIN, [
      { path: 'diagnosis-rules/broken.yaml', text: '这: [不是: 规则' },
      { path: 'diagnosis-rules/good.yaml', text: ruleYaml(NEW_RULE) },
    ]);
    expect(merged.ruleSet?.rules.some((rule) => rule.id === 'USER-01')).toBe(true);
    expect(merged.warnings.some((warning) => warning.reason === 'unparsable')).toBe(true);
    expect(merged.loadedFiles).toBe(1);
  });

  it('内置缺失时只用用户规则；两边都空则 ruleSet 为 null', () => {
    const onlyUser = mergeUserRules(null, [{ path: 'diagnosis-rules/a.yaml', text: ruleYaml(NEW_RULE) }]);
    expect(onlyUser.ruleSet?.version).toBe('user');
    expect(onlyUser.ruleSet?.rules).toHaveLength(1);
    expect(mergeUserRules(null, []).ruleSet).toBeNull();
  });
});

describe('buildRuleListView', () => {
  it('补齐 sources / userRules / loadPolicy 与每条规则的来源标记', () => {
    const merged = mergeUserRules(BUILTIN, [{ path: 'diagnosis-rules/a.yaml', text: ruleYaml(OVERRIDE_SK03) }]);
    const view = buildRuleListView(merged, 'diagnosis-rules');

    expect(view?.sources).toEqual({
      builtinCount: BUILTIN.rules.length,
      userCount: 1,
      overriddenRuleIds: ['SK-03'],
    });
    expect(view?.userRules.directory).toBe('diagnosis-rules');
    expect(view?.userRules.loaded).toBe(1);
    expect(view?.loadPolicy).toBe('category-on-demand');
    expect(view?.rules.find((rule) => rule.id === 'SK-03')?.origin).toBe('user');
    expect(view?.rules.find((rule) => rule.id === 'SK-01')?.origin).toBe('builtin');
    expect(view?.counts.skill).toBeGreaterThan(0);
  });
});

describe('validateUserRuleFile', () => {
  it('合法文件 ok=true 并统计生效条数；覆盖内置给出告警', () => {
    const result = validateUserRuleFile(ruleYaml(OVERRIDE_SK03 + NEW_RULE), 'diagnosis-rules/a.yaml', BUILTIN);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.effectiveRules).toBe(2);
    expect(result.warnings.some((warning) => warning.ruleId === 'SK-03')).toBe(true);
  });

  it('缺字段只告警不算失败（保存后该条会被跳过）', () => {
    const result = validateUserRuleFile(ruleYaml(BAD_RULE + NEW_RULE), 'diagnosis-rules/a.yaml', BUILTIN);
    expect(result.ok).toBe(true);
    expect(result.effectiveRules).toBe(1);
    expect(result.warnings.some((warning) => warning.reason === 'missing-field')).toBe(true);
  });

  it('整文件不可解析 / 没有有效规则 → ok=false 并给错误', () => {
    expect(validateUserRuleFile('这: [不是: 规则', 'diagnosis-rules/a.yaml', BUILTIN).ok).toBe(false);
    const empty = validateUserRuleFile(ruleYaml(BAD_RULE), 'diagnosis-rules/a.yaml', BUILTIN);
    expect(empty.ok).toBe(false);
    expect(empty.errors[0]?.message).toContain('全部规则非法');
  });
});
