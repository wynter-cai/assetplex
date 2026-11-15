/**
 * 规则注册表加载与校验（add-diagnosis-rules T1）
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 1.4 / 6.4；api-contract 错误约定（422 规则集加载失败）。
 * 夹具全部中性命名，不引用真实资产。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  RuleSetError,
  parseRuleRegistry,
  loadRuleRegistryFromFile,
  resolveRuleSetFile,
  DEFAULT_RULES_RELATIVE_PATH,
} from '../../../src/core/diagnosis-rules.js';

const DEMO_YAML = [
  'version: "1.0.0"',
  'updatedAt: "2026-11-15"',
  'severityScale:',
  '  high: "P0：安全或功能失效"',
  'categories:',
  '  skill: "技能"',
  'rules:',
  '  - id: SK-01',
  '    category: skill',
  '    severity: high',
  '    mode: static',
  '    signal: "缺少 SKILL.md"',
  '    recommendation: "补文件"',
  '    source: "demo.md §1"',
  '  - id: SEC-01',
  '    category: cross',
  '    appliesTo: ["skill", "rule"]',
  '    severity: high',
  '    mode: static',
  '    signal: "命中密钥前缀"',
  '    recommendation: "移除并轮换"',
  '    source: "demo.md §2"',
].join('\n');

describe('parseRuleRegistry', () => {
  it('合法规则集：版本与规则透传，非 cross 规则 appliesTo 缺省为自身类别', () => {
    const { ruleSet, warnings } = parseRuleRegistry(DEMO_YAML);
    expect(warnings).toEqual([]);
    expect(ruleSet.version).toBe('1.0.0');
    expect(ruleSet.updatedAt).toBe('2026-11-15');
    expect(ruleSet.rules).toHaveLength(2);
    const sk = ruleSet.rules[0];
    expect(sk.id).toBe('SK-01');
    expect(sk.mode).toBe('static');
    expect(sk.appliesTo).toEqual(['skill']);
    const sec = ruleSet.rules[1];
    expect(sec.category).toBe('cross');
    expect(sec.appliesTo).toEqual(['skill', 'rule']);
  });

  it('缺 signal 的规则被跳过并告警，其余规则照常可用（Scenario 1.4）', () => {
    const text = DEMO_YAML.replace('    signal: "缺少 SKILL.md"\n', '');
    const { ruleSet, warnings } = parseRuleRegistry(text);
    expect(ruleSet.rules.map((r) => r.id)).toEqual(['SEC-01']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('SK-01');
    expect(warnings[0]).toContain('signal');
  });

  it('severity / mode / category 不在闭集内的规则跳过，不整份失败', () => {
    const text = DEMO_YAML.replace('    severity: high\n', '    severity: fatal\n').replace(
      '    mode: static\n',
      '    mode: guess\n',
    );
    const { ruleSet, warnings } = parseRuleRegistry(text);
    expect(ruleSet.rules.map((r) => r.id)).toEqual(['SEC-01']);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('重复 id：仅保留第一条，重复条目拒绝并告警', () => {
    const dup = [
      '  - id: SK-01',
      '    category: skill',
      '    severity: low',
      '    mode: static',
      '    signal: "重复定义的信号"',
      '    recommendation: "重复定义"',
      '    source: "demo.md §3"',
    ].join('\n');
    const { ruleSet, warnings } = parseRuleRegistry(`${DEMO_YAML}\n${dup}`);
    expect(ruleSet.rules.filter((r) => r.id === 'SK-01')).toHaveLength(1);
    expect(ruleSet.rules).toHaveLength(2);
    expect(warnings.some((w) => w.includes('重复'))).toBe(true);
  });

  it('跨资产规则缺 appliesTo 或 appliesTo 含未知类别 → 跳过并告警', () => {
    const text = DEMO_YAML.replace('    appliesTo: ["skill", "rule"]\n', '');
    expect(parseRuleRegistry(text).ruleSet.rules.map((r) => r.id)).toEqual(['SK-01']);
    const bad = DEMO_YAML.replace('    appliesTo: ["skill", "rule"]', '    appliesTo: ["skill", "spaceship"]');
    expect(parseRuleRegistry(bad).warnings.some((w) => w.includes('SEC-01'))).toBe(true);
  });

  it('版本缺失或为空 → RuleSetError（路由映射 422）', () => {
    expect(() => parseRuleRegistry(DEMO_YAML.replace('version: "1.0.0"\n', ''))).toThrow(RuleSetError);
    expect(() => parseRuleRegistry(DEMO_YAML.replace('version: "1.0.0"', 'version: ""'))).toThrow(/version/);
  });

  it('没有 rules 段或全部规则非法 → RuleSetError', () => {
    expect(() => parseRuleRegistry('version: "1.0.0"\nupdatedAt: "2026-11-15"\n')).toThrow(/rules/);
    expect(() => parseRuleRegistry('version: "1.0.0"\nrules:\n  - id: SK-01\n')).toThrow(RuleSetError);
  });
});

describe('内置规则集文件（diagnosis-rules.yaml）', () => {
  const filePath = resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH);

  it('resolveRuleSetFile 能定位规则集（构建产物优先，开发态回落到仓库定义位置）', () => {
    const resolved = resolveRuleSetFile();
    expect(resolved).not.toBeNull();
    expect(resolved?.endsWith('diagnosis-rules.yaml')).toBe(true);
    expect(loadRuleRegistryFromFile(resolved as string).ruleSet.rules).toHaveLength(71);
  });

  it('71 条规则全部合法：45 条 static + 26 条 llm，零告警，版本 1.0.0', () => {
    const { ruleSet, warnings } = loadRuleRegistryFromFile(filePath);
    expect(warnings).toEqual([]);
    expect(ruleSet.version).toBe('1.0.0');
    expect(ruleSet.rules).toHaveLength(71);
    expect(ruleSet.rules.filter((r) => r.mode === 'static')).toHaveLength(45);
    expect(ruleSet.rules.filter((r) => r.mode === 'llm')).toHaveLength(26);
    // 编号唯一
    expect(new Set(ruleSet.rules.map((r) => r.id)).size).toBe(71);
    // 跨资产规则都带非空 appliesTo，类别专属规则 appliesTo 与 category 一致
    for (const rule of ruleSet.rules) {
      expect(rule.appliesTo, rule.id).toBeDefined();
      expect((rule.appliesTo ?? []).length, rule.id).toBeGreaterThan(0);
      if (rule.category !== 'cross') expect(rule.appliesTo).toEqual([rule.category]);
    }
  });
});
