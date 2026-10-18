/**
 * 确定性预检测试（add-asset-doctor E1）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 3（机械项不烧 token、AI 未配置也可见）；
 * proposal D6 确定性优先 + api-contract MechanicalCheckId 闭集。
 * 阈值口径：skill/agent 必填 name+description、command 必填 description、rule/identity 无必填；
 * 正文超长（字符）：skill 10000 / agent 6000 / rule 4000 / identity 8000 / command 2000。
 */

import { describe, it, expect } from 'vitest';
import { runMechanicalChecks } from '../../../src/core/doctor-mechanical.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';

function mechanicalIssues(issues: DiagnosisIssue[]): DiagnosisIssue[] {
  return issues.filter((i) => i.criterion.startsWith('mechanical:'));
}

describe('runMechanicalChecks', () => {
  it('技能缺 frontmatter 块：一条合并的必填字段缺失项（high/fixable），不重复报 description-empty', () => {
    const issues = runMechanicalChecks('skill', '# 标题\n正文内容\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('mechanical:frontmatter-missing-field');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].fixable).toBe(true);
    expect(issues[0].finding).toContain('name');
    expect(issues[0].finding).toContain('description');
  });

  it('agent frontmatter 有 name 但缺 description：仅报缺失 description', () => {
    const issues = runMechanicalChecks('agent', '---\nname: demo-agent\n---\n正文\n');
    expect(mechanicalIssues(issues)).toHaveLength(1);
    expect(issues[0].criterion).toBe('mechanical:frontmatter-missing-field');
    expect(issues[0].finding).toContain('description');
    expect(issues[0].finding).not.toContain('name、');
  });

  it('description 显式为空串/空白：报 description-empty（high/fixable）', () => {
    const issues = runMechanicalChecks('skill', '---\nname: demo-skill\ndescription: ""\n---\n正文\n');
    expect(issues.some((i) => i.criterion === 'mechanical:description-empty')).toBe(true);
    const empty = issues.find((i) => i.criterion === 'mechanical:description-empty');
    expect(empty?.severity).toBe('high');
    expect(empty?.fixable).toBe(true);
  });

  it('正文超类别阈值：报 body-over-length（medium/fixable），未超不报', () => {
    const long = '---\nname: demo-rule\ndescription: ok\n---\n' + '内'.repeat(4001);
    const issues = runMechanicalChecks('rule', long);
    const over = issues.find((i) => i.criterion === 'mechanical:body-over-length');
    expect(over).toBeDefined();
    expect(over?.severity).toBe('medium');
    expect(over?.fixable).toBe(true);

    const short = runMechanicalChecks('rule', '---\nname: demo-rule\ndescription: ok\n---\n简短正文\n');
    expect(short).toHaveLength(0);
  });

  it('全大写强调滥用（≥3 处连续大写词）：报 shouting-rules（low/fixable）', () => {
    const content = [
      '---',
      'name: demo-rule',
      'description: ok',
      '---',
      'NEVER DO THIS first line',
      'ALWAYS CHECK THAT second line',
      'DO NOT SKIP third line',
    ].join('\n');
    const issues = runMechanicalChecks('rule', content);
    const shouting = issues.find((i) => i.criterion === 'mechanical:shouting-rules');
    expect(shouting).toBeDefined();
    expect(shouting?.severity).toBe('low');
    expect(shouting?.fixable).toBe(true);
  });

  it('rule/identity 无必填字段：无 frontmatter 也只查正文/大写，不为凑数报缺失', () => {
    const ruleIssues = runMechanicalChecks('rule', '# 规则标题\n普通正文\n');
    expect(ruleIssues).toHaveLength(0);
    const identityIssues = runMechanicalChecks('identity', '# 我是谁\n普通正文\n');
    expect(identityIssues).toHaveLength(0);
  });

  it('健康技能零问题：字段完备、长度正常、无 shouting', () => {
    const content = '---\nname: demo-skill\ndescription: 一句话触发描述\n---\n' + '正常正文内容\n'.repeat(10);
    expect(runMechanicalChecks('skill', content)).toHaveLength(0);
  });

  it('command 必填 description 但不必填 name', () => {
    const missing = runMechanicalChecks('command', '---\nname: demo-cmd\n---\n正文\n');
    expect(missing.some((i) => i.criterion === 'mechanical:frontmatter-missing-field' && i.finding.includes('description'))).toBe(true);
    const ok = runMechanicalChecks('command', '---\ndescription: 做事\n---\n正文\n');
    expect(ok.filter((i) => i.criterion === 'mechanical:frontmatter-missing-field')).toHaveLength(0);
  });
});
