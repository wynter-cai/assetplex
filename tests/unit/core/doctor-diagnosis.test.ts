/**
 * 诊断引擎测试（add-asset-doctor E2/E3/E4；add-diagnosis-rules 起改走规则化语义链路）
 *
 * spec: 设计文档/changes/add-diagnosis-rules/specs/diagnosis-rules.spec.md Requirement 2 / 3 / 7
 * 全 DI：假 fs / 规则集 / 内存缓存 / mock LLM，不碰真实文件与网络（同仲裁测试惯例）。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { diagnoseAsset, DiagnosisAssetError, type DiagnoseDeps } from '../../../src/core/doctor.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import { hashIgnoredContent } from '../../../src/core/diagnosis-ignore.js';
import type { DiagnosisRuleSet, IgnoredFinding } from '../../../src/core/types.js';

const RULE_SET = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;

const DEMO_CONTENT = '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';

/** 合法增量输出：候选里真实存在的 llm 规则编号 + 可定位片段 */
function llmFinding(ruleId = 'SK-06', snippet = '正文内容', line = 5): string {
  return JSON.stringify({
    findings: [
      {
        ruleId,
        severity: 'medium',
        confidence: 'high',
        finding: '正文含模型已知的通用解释',
        impact: '浪费上下文',
        suggestion: '删除通用解释段',
        evidence: [{ line, snippet }],
      },
    ],
  });
}

function fullConfig(overrides: Partial<AiClassifyConfig> = {}): AiClassifyConfig {
  return { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...overrides };
}

function memoryCache(): DoctorCacheStore & { size(): number } {
  let data: Record<string, never> = {};
  return {
    load: () => ({ ...data }) as Record<string, never>,
    save: (entries) => {
      data = { ...entries } as Record<string, never>;
    },
    size: () => Object.keys(data).length,
  };
}

interface HarnessOptions {
  config?: Partial<AiClassifyConfig> | null;
  content?: string;
  llmOutput?: string;
  cache?: DoctorCacheStore;
  ruleSet?: DiagnosisRuleSet | null;
  ignores?: IgnoredFinding[];
}

function harness(opts: HarnessOptions = {}) {
  const calls: { system: string; user: string }[] = [];
  const content = opts.content ?? DEMO_CONTENT;
  const config = opts.config === null ? null : fullConfig(opts.config ?? {});
  const llm: LlmClient = {
    chat: async (input) => {
      calls.push(input);
      return opts.llmOutput ?? llmFinding();
    },
  };
  const deps: DiagnoseDeps = {
    fs: { read: () => content },
    cache: opts.cache ?? memoryCache(),
    llm,
    config,
    ruleSet: 'ruleSet' in opts ? (opts.ruleSet ?? null) : RULE_SET,
    ...(opts.ignores === undefined ? {} : { ignores: opts.ignores }),
    now: () => '2026-10-18T12:00:00.000Z',
  };
  return { calls, deps };
}

const skillPath = 'skills/demo-skill/SKILL.md';

describe('diagnoseAsset 规则化链路', () => {
  it('静态 + AI 增量合成报告：findings / coverage / rulesVersion / rejected 齐全', async () => {
    const h = harness();
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.rulesVersion).toBe('1.0.0');
    expect(report.aiEvaluated).toBe(true);
    expect(report.rejected).toBe(0);
    expect(report.cached).toBe(false);
    expect(report.mechanicalOnly).toBe(false);
    expect(report.model).toBe('demo-model');
    expect(report.coverage.evaluatedRules).toBe(15 + 7);
    expect(report.coverage.skippedReasons).toEqual([]);
    // 语义结论来自候选规则，且片段能在正文定位
    const ai = report.findings.find((finding) => finding.ruleId === 'SK-06');
    expect(ai?.source).toBe('llm');
    expect(ai?.evidence[0]?.snippet).toBe('正文内容');
    // 旧 issues 由 findings 投影，修复流仍可用
    expect(report.issues.some((issue) => issue.criterion === 'SK-06')).toBe(true);
    expect(report.criteriaUsed).toEqual([]);
  });

  it('发送层只发片段与候选规则：不含全文之外的绝对路径与长正文', async () => {
    const h = harness({ content: `---\nname: demo-skill\ndescription: 演示\n---\n${'长'.repeat(3000)}\n` });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    const user = h.calls[0]?.user ?? '';
    expect(user).toContain('【候选规则】');
    expect(user).not.toContain('长'.repeat(3000));
  });

  it('内容与规则集未变二次诊断命中缓存：不调模型且 cached=true', async () => {
    const cache = memoryCache();
    await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, harness({ cache }).deps);
    const second = harness({ cache });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, second.deps);

    expect(report.cached).toBe(true);
    expect(report.aiEvaluated).toBe(true);
    expect(second.calls).toHaveLength(0);
  });

  it('规则集版本升级 → 缓存自然失效重新调用', async () => {
    const cache = memoryCache();
    await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, harness({ cache }).deps);
    const upgraded: DiagnosisRuleSet = { ...RULE_SET, version: '9.9.9' };
    const second = harness({ cache, ruleSet: upgraded });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, second.deps);

    expect(report.cached).toBe(false);
    expect(second.calls).toHaveLength(1);
  });

  it('AI 未配置：只跑静态项 mechanicalOnly=true 且不发请求', async () => {
    const h = harness({ config: null, content: '无 frontmatter 的技能正文\n' });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.mechanicalOnly).toBe(true);
    expect(report.aiEvaluated).toBe(false);
    expect(h.calls).toHaveLength(0);
    expect(report.issues.some((issue) => issue.criterion === 'mechanical:frontmatter-missing-field')).toBe(true);
  });

  it('静态 high 命中不被模型结论冲淡：overall 至少 needs-attention', async () => {
    const h = harness({ content: '无 frontmatter 的技能正文\n', llmOutput: '{"findings":[]}' });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.findings.some((finding) => finding.severity === 'high')).toBe(true);
    expect(report.overall).not.toBe('healthy');
  });

  it('模型输出不可用：不抛错，静态结论保留，rejected 计数且不落缓存', async () => {
    const cache = memoryCache();
    const h = harness({ cache, llmOutput: '我觉得没啥问题' });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.rejected).toBeGreaterThan(0);
    expect(report.findings.every((finding) => finding.source === 'rule')).toBe(true);
    expect(cache.size()).toBe(0);
  });

  it('模型编造片段（原文定位不到）整条丢弃，静态结论不受影响', async () => {
    const h = harness({ llmOutput: llmFinding('SK-06', '这句话正文里没有', 2) });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.findings.some((finding) => finding.source === 'llm')).toBe(false);
    expect(report.rejected).toBe(1);
    expect(report.aiEvaluated).toBe(true);
  });

  it('资产文件读不到：throw DiagnosisAssetError（路由映射 404）', async () => {
    const h = harness();
    h.deps.fs = { read: () => null };
    await expect(diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/gone/SKILL.md' }, h.deps)).rejects.toThrow(
      DiagnosisAssetError,
    );
  });

  it('规则集未加载：findings 为空、coverage 全零，静态机械结论照常可用', async () => {
    const h = harness({ ruleSet: null });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);

    expect(report.findings).toEqual([]);
    expect(report.rulesVersion).toBe('');
    expect(report.coverage).toEqual({ evaluatedRules: 0, skippedRules: 0, skippedReasons: [] });
    expect(h.calls).toHaveLength(0);
    expect(report.aiEvaluated).toBe(false);
  });
});

describe('diagnoseAsset 忽略清单', () => {
  const content = '---\nname: Demo_Skill\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';

  function ignoreEntry(contentHash: string): IgnoredFinding {
    return { ruleId: 'SK-02', hubRelativePath: skillPath, contentHash, ignoredAt: '2026-11-01T00:00:00.000Z' };
  }

  it('同内容再次诊断：命中被标记为已忽略，且不再进入旧 issues', async () => {
    const h = harness({ content, ignores: [ignoreEntry(hashIgnoredContent(content))] });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    const finding = report.findings.find((item) => item.ruleId === 'SK-02');

    expect(finding?.ignored).toBe(true);
    expect(report.issues.some((issue) => issue.criterion === 'SK-02')).toBe(false);
  });

  it('内容变更后忽略失效，仍命中则重新提示', async () => {
    const h = harness({ content, ignores: [ignoreEntry('旧哈希')] });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    const finding = report.findings.find((item) => item.ruleId === 'SK-02');

    expect(finding?.ignored).toBe(false);
    expect(report.issues.some((issue) => issue.criterion === 'SK-02')).toBe(true);
  });
});
