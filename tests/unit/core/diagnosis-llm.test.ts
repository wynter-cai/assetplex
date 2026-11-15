/**
 * AI 增量执行器（add-diagnosis-rules T4）
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 2.2（闭集）/ 2.3（静态高危保留）/
 * 2.4（接收范围受限）/ 3.3（片段必须可定位）/ 7.2（预算与超时降级）。
 */

import { describe, it, expect } from 'vitest';
import {
  buildIncrementalPrompt,
  candidateRules,
  mergeIncrementalFindings,
  parseIncrementalOutput,
  runIncrementalChecks,
  INCREMENTAL_CHAR_BUDGET,
} from '../../../src/core/diagnosis-llm.js';
import { readDocument } from '../../../src/core/diagnosis-evidence.js';
import { computeDoctorCacheKey } from '../../../src/core/doctor-cache.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import type { DiagnosisRuleSet, RuleFinding } from '../../../src/core/types.js';

const CONTENT = [
  '---',
  'name: Demo_Skill',
  'description: Use when 用户要导出 CSV。',
  '---',
  '这是一段只用于演示的正文，包含一句不可外发的私有说明。',
  'SECRET_MARKER_SHOULD_NOT_BE_SENT',
].join('\n');

const RULE_SET: DiagnosisRuleSet = {
  version: '1.0.0',
  updatedAt: '2026-01-01',
  rules: [
    {
      id: 'SK-01',
      category: 'skill',
      severity: 'high',
      mode: 'static',
      signal: 'name 不是 kebab-case，可能导致调用失败',
      recommendation: '改为 kebab-case',
      source: '演示出处',
    },
    {
      id: 'SK-11',
      category: 'skill',
      severity: 'medium',
      mode: 'llm',
      signal: 'description 过于笼统，缺少触发条件',
      recommendation: '补充 Use when 触发场景',
      source: '演示出处',
    },
    {
      id: 'CON-01',
      category: 'cross',
      appliesTo: ['skill'],
      severity: 'low',
      mode: 'llm',
      signal: '正文含前后矛盾的指令',
      recommendation: '合并冲突指令',
      source: '演示出处',
    },
    {
      id: 'RU-03',
      category: 'rule',
      severity: 'medium',
      mode: 'llm',
      signal: '规则缺少适用范围',
      recommendation: '补适用范围',
      source: '演示出处',
    },
  ],
};

function staticFinding(ruleId = 'SK-01'): RuleFinding {
  return {
    id: `${ruleId}:skills/demo/SKILL.md:2:0`,
    ruleId,
    category: 'skill',
    severity: 'high',
    confidence: 'high',
    source: 'rule',
    title: 'name 不是 kebab-case',
    finding: 'name 含下划线',
    impact: '',
    suggestion: '改为 kebab-case',
    evidence: [{ hubRelativePath: 'skills/demo/SKILL.md', line: 2, snippet: 'name: Demo_Skill' }],
    insufficientEvidence: false,
    fixable: true,
    ignored: false,
  };
}

const INPUT = {
  kind: 'skill' as const,
  hubRelativePath: 'skills/demo/SKILL.md',
  content: CONTENT,
  staticFindings: [staticFinding()],
  ruleSet: RULE_SET,
};

const VALID_OUTPUT = JSON.stringify({
  findings: [
    {
      ruleId: 'SK-11',
      severity: 'medium',
      confidence: 'high',
      finding: 'description 只说用途，没有触发条件',
      impact: '模型难以判断何时该用',
      suggestion: '补 Use when 场景',
      evidence: [{ line: 3, snippet: 'description: Use when 用户要导出 CSV。' }],
    },
  ],
});

describe('候选规则（Scenario 2.2 / 2.4）', () => {
  it('只取 mode=llm 且适用于该资产类别的规则（含 cross.appliesTo）', () => {
    const ids = candidateRules(RULE_SET, 'skill').map((rule) => rule.id);
    expect(ids).toEqual(['SK-11', 'CON-01']);
    expect(ids).not.toContain('SK-01');
    expect(ids).not.toContain('RU-03');
  });

  it('prompt 只含路径、命中片段与候选规则；不含全文、不含其他资产', () => {
    const prompt = buildIncrementalPrompt(INPUT);
    expect(prompt.user).toContain('skills/demo/SKILL.md');
    expect(prompt.user).toContain('name: Demo_Skill');
    expect(prompt.user).toContain('SK-11');
    expect(prompt.user).toContain('CON-01');
    expect(prompt.user).toContain('description 过于笼统');
    // 正文中未被静态命中的部分（含私有标记）不得进入请求
    expect(prompt.user).not.toContain('SECRET_MARKER_SHOULD_NOT_BE_SENT');
    expect(prompt.user).not.toMatch(/[A-Za-z]:\\\\/);
    expect(prompt.system).toContain('不得自造 ruleId');
    expect(prompt.sentChars).toBe(prompt.user.length);
  });
});

describe('输出解析（Scenario 2.2 / 3.3）', () => {
  const context = {
    candidates: candidateRules(RULE_SET, 'skill'),
    hubRelativePath: 'skills/demo/SKILL.md',
    doc: readDocument(CONTENT),
  };

  it('合法条目转成带原文证据的 finding；行号按原文重定位', () => {
    const { findings, rejected } = parseIncrementalOutput(VALID_OUTPUT, context);
    expect(rejected).toBe(0);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'SK-11',
      source: 'llm',
      category: 'skill',
      severity: 'medium',
      confidence: 'high',
      insufficientEvidence: false,
      fixable: true,
      ignored: false,
    });
    expect(findings[0]?.evidence[0]).toEqual({
      hubRelativePath: 'skills/demo/SKILL.md',
      line: 3,
      snippet: 'description: Use when 用户要导出 CSV。',
    });
  });

  it('非候选 / 自造编号整条丢弃并计入 rejected', () => {
    const output = JSON.stringify({
      findings: [
        { ruleId: 'FAKE-99', severity: 'high', confidence: 'high', finding: 'x', suggestion: 'y', evidence: [{ line: 2, snippet: 'name: Demo_Skill' }] },
        { ruleId: 'SK-01', severity: 'high', confidence: 'high', finding: 'x', suggestion: 'y', evidence: [{ line: 2, snippet: 'name: Demo_Skill' }] },
      ],
    });
    const { findings, rejected } = parseIncrementalOutput(output, context);
    expect(findings).toEqual([]);
    expect(rejected).toBe(2);
  });

  it('编造片段（原文找不到）整条丢弃', () => {
    const output = JSON.stringify({
      findings: [
        { ruleId: 'SK-11', severity: 'medium', confidence: 'high', finding: 'x', suggestion: 'y', evidence: [{ line: 99, snippet: '这句原文里根本没有' }] },
      ],
    });
    const { findings, rejected } = parseIncrementalOutput(output, context);
    expect(findings).toEqual([]);
    expect(rejected).toBe(1);
  });

  it('结构缺失或闭集外取值整条丢弃；整体非法不抛错', () => {
    const bad = JSON.stringify({ findings: [{ ruleId: 'SK-11', severity: 'critical', confidence: 'high', finding: 'x', suggestion: 'y', evidence: [] }] });
    expect(parseIncrementalOutput(bad, context)).toEqual({ findings: [], rejected: 1 });
    expect(parseIncrementalOutput('不是 JSON', context)).toEqual({ findings: [], rejected: 1 });
  });
});

describe('静态高危不被覆盖（Scenario 2.3）', () => {
  it('同 ruleId 的 AI 结论只补充影响与改法，不替换静态结论', () => {
    const llmFinding: RuleFinding = {
      ...staticFinding(),
      id: 'llm-1',
      source: 'llm',
      severity: 'low',
      impact: 'AI 补充的影响',
      suggestion: 'AI 补充的改法',
    };
    const merged = mergeIncrementalFindings([staticFinding()], [llmFinding]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe('rule');
    expect(merged[0]?.severity).toBe('high');
    expect(merged[0]?.impact).toBe('AI 补充的影响');
    expect(merged[0]?.suggestion).toBe('AI 补充的改法');
  });

  it('新规则结论追加在静态结论之后', () => {
    const llmFinding: RuleFinding = { ...staticFinding('SK-11'), id: 'llm-2', source: 'llm' };
    const merged = mergeIncrementalFindings([staticFinding()], [llmFinding]);
    expect(merged.map((item) => item.ruleId)).toEqual(['SK-01', 'SK-11']);
  });
});

describe('执行与降级（Scenario 7.2）', () => {
  function llmOf(output: string | Error, calls: string[] = []): LlmClient {
    return {
      chat: async (input) => {
        calls.push(input.user);
        if (output instanceof Error) throw output;
        return output;
      },
    };
  }

  it('成功：返回合并后的 findings 与候选数', async () => {
    const calls: string[] = [];
    const result = await runIncrementalChecks(INPUT, { llm: llmOf(VALID_OUTPUT, calls) });
    expect(calls).toHaveLength(1);
    expect(result.candidateCount).toBe(2);
    expect(result.rejected).toBe(0);
    expect(result.skippedReason).toBeNull();
    expect(result.findings.map((item) => item.ruleId)).toEqual(['SK-01', 'SK-11']);
  });

  it('超预算：不发请求，如实返回 budget', async () => {
    const calls: string[] = [];
    const result = await runIncrementalChecks(INPUT, { llm: llmOf(VALID_OUTPUT, calls), charBudget: 10 });
    expect(calls).toHaveLength(0);
    expect(result.skippedReason).toBe('budget');
    expect(result.findings.map((item) => item.ruleId)).toEqual(['SK-01']);
  });

  it('超时 / 网络失败：不发第二请求，静态结论保留', async () => {
    const result = await runIncrementalChecks(INPUT, { llm: llmOf(new Error('timeout')) });
    expect(result.skippedReason).toBe('timeout');
    expect(result.findings.map((item) => item.ruleId)).toEqual(['SK-01']);
  });

  it('默认预算足够容纳单条资产的片段与候选清单', () => {
    expect(buildIncrementalPrompt(INPUT).sentChars).toBeLessThan(INCREMENTAL_CHAR_BUDGET);
  });
});

describe('缓存 key 含 rulesVersion（Scenario 6.2）', () => {
  const base = { kind: 'skill' as const, content: CONTENT, criteriaHash: 'c', model: 'demo' };
  it('规则集版本变化 → key 变化，缓存自然失效', () => {
    const v1 = computeDoctorCacheKey({ ...base, rulesVersion: '1.0.0' });
    const v2 = computeDoctorCacheKey({ ...base, rulesVersion: '1.1.0' });
    expect(v1).not.toBe(v2);
  });
});
