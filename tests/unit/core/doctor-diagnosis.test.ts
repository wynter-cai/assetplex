/**
 * 诊断引擎测试（add-asset-doctor E2/E3/E4）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 2/4/6/7/8；proposal D1/D3/D6。
 * 全 DI：假 fs / 准则 / 内存缓存 / mock LLM，不碰真实文件与网络（同仲裁测试惯例）。
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  buildDiagnosisPrompt,
  parseDiagnosisOutput,
  diagnoseAsset,
  DiagnosisOutputError,
  DiagnosisAssetError,
  type DiagnoseDeps,
} from '../../../src/core/doctor.js';
import type { CriterionAsset } from '../../../src/core/criteria.js';
import type { DoctorCacheStore } from '../../../src/core/doctor-cache.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';
import { loadRuleRegistryFromFile, DEFAULT_RULES_RELATIVE_PATH } from '../../../src/core/diagnosis-rules.js';
import { hashIgnoredContent } from '../../../src/core/diagnosis-ignore.js';
import type { DiagnosisRuleSet, IgnoredFinding } from '../../../src/core/types.js';

const RULE_SET = loadRuleRegistryFromFile(resolve(process.cwd(), DEFAULT_RULES_RELATIVE_PATH)).ruleSet;

const demoCriterion: CriterionAsset = {
  slug: 'token-economy',
  relativePath: 'criteria/token-economy.md',
  name: 'Token 效率',
  description: '',
  priority: 5,
  enabled: true,
  appliesTo: ['all'],
  body: '只写模型不知道的',
};

function fullConfig(overrides: Partial<AiClassifyConfig> = {}): AiClassifyConfig {
  return { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model', ...overrides };
}

const validOutput = JSON.stringify({
  overall: 'needs-attention',
  issues: [
    {
      severity: 'medium',
      criterion: 'token-economy',
      finding: '正文重复陈述模型已知的通用知识',
      suggestion: '删除基础概念解释段',
      fixable: true,
    },
  ],
});

// ================= E2: buildDiagnosisPrompt =================

describe('buildDiagnosisPrompt', () => {
  it('内置基线骨架恒在：单资产审视 + JSON 契约 + 不凑数约束', () => {
    const { system } = buildDiagnosisPrompt({
      kind: 'skill',
      content: '正文',
      criteriaBlock: '',
      mechanicalFindings: [],
    });
    expect(system).toContain('overall');
    expect(system).toContain('issues');
    expect(system).toContain('healthy');
    expect(system).toContain('未发现问题时返回空 issues');
    // 准则区为空时不出现准则标题（Scenario 6：仅内置基线）
    expect(system).not.toContain('裁决准则');
  });

  it('准则区非空才注入；机械项清单进 user 防重复报告', () => {
    const { user } = buildDiagnosisPrompt({
      kind: 'rule',
      content: '正文',
      criteriaBlock: '### Token 效率\n只写模型不知道的',
      mechanicalFindings: ['frontmatter 缺失必填字段：description'],
    });
    expect(user).toContain('机械检查已确认的问题');
    expect(user).toContain('frontmatter 缺失必填字段：description');
    const { system } = buildDiagnosisPrompt({
      kind: 'rule',
      content: '正文',
      criteriaBlock: '### Token 效率\n只写模型不知道的',
      mechanicalFindings: [],
    });
    expect(system).toContain('裁决准则');
    expect(system).toContain('Token 效率');
  });

  it('内容超 6000 截断并标注 contentTruncated=true，短内容不截', () => {
    const long = '内'.repeat(6001);
    const r1 = buildDiagnosisPrompt({ kind: 'skill', content: long, criteriaBlock: '', mechanicalFindings: [] });
    expect(r1.contentTruncated).toBe(true);
    expect(r1.user).toContain('已截断');
    const r2 = buildDiagnosisPrompt({ kind: 'skill', content: '短正文', criteriaBlock: '', mechanicalFindings: [] });
    expect(r2.contentTruncated).toBe(false);
    expect(r2.user).toContain('短正文');
  });
});

// ================= E3: parseDiagnosisOutput =================

describe('parseDiagnosisOutput', () => {
  it('合法输出：overall + issues 完整透传（含 fenced 容忍）', () => {
    const parsed = parseDiagnosisOutput(validOutput);
    expect(parsed.overall).toBe('needs-attention');
    expect(parsed.issues[0].criterion).toBe('token-economy');
    const fenced = parseDiagnosisOutput('说明文字\n```json\n' + validOutput + '\n```\n完毕');
    expect(fenced.overall).toBe('needs-attention');
  });

  it('healthy + 空 issues 合法：不编造问题凑数（Scenario 2）', () => {
    const parsed = parseDiagnosisOutput('{"overall":"healthy","issues":[]}');
    expect(parsed.overall).toBe('healthy');
    expect(parsed.issues).toHaveLength(0);
  });

  it('非法形态一律 throw DiagnosisOutputError（Scenario 8）', () => {
    const bad = [
      '我觉得挺好的', // 非 JSON
      '{"overall":"很好","issues":[]}', // overall 闭集外
      '{"overall":"healthy"}', // 缺 issues
      '{"overall":"healthy","issues":[{"severity":"致命","criterion":"x","finding":"f","suggestion":"s","fixable":true}]}', // severity 闭集外
      '{"overall":"healthy","issues":[{"severity":"low","criterion":"x"}]}', // issue 缺必填
    ];
    for (const text of bad) {
      expect(() => parseDiagnosisOutput(text), text).toThrow(DiagnosisOutputError);
    }
    expect(() => parseDiagnosisOutput('{"overall":"unknown","issues":[]}')).toThrow(/诊断失败/);
  });

  it('fixable 缺失宽容为 false，不炸', () => {
    const parsed = parseDiagnosisOutput(
      '{"overall":"needs-attention","issues":[{"severity":"low","criterion":"c","finding":"f","suggestion":"s"}]}',
    );
    expect(parsed.issues[0].fixable).toBe(false);
  });
});

// ================= E4: diagnoseAsset =================

function memoryCache(): DoctorCacheStore & { size(): number } {
  let data: Record<string, never> = {};
  return {
    load: () => ({ ...data }) as Record<string, never>,
    save: (entries) => { data = { ...entries } as Record<string, never>; },
    size: () => Object.keys(data).length,
  };
}

interface HarnessDeps {
  calls: { system: string; user: string }[];
  deps: DiagnoseDeps;
}

function harness(opts: {
  config?: Partial<AiClassifyConfig> | null;
  content?: string;
  criteria?: CriterionAsset[];
  llmOutput?: string;
  cache?: DoctorCacheStore;
  ruleSet?: DiagnosisRuleSet | null;
  ignores?: IgnoredFinding[];
} = {}): HarnessDeps {
  const calls: { system: string; user: string }[] = [];
  const content = opts.content ?? '---\nname: demo-skill\ndescription: 演示\n---\n正文内容\n';
  const config = opts.config === null ? null : fullConfig(opts.config ?? {});
  const llm: LlmClient = {
    chat: async (input) => {
      calls.push(input);
      return opts.llmOutput ?? validOutput;
    },
  };
  return {
    calls,
    deps: {
      fs: { read: () => content },
      getCriteria: () => opts.criteria ?? [demoCriterion],
      cache: opts.cache ?? memoryCache(),
      llm,
      ...(config === null ? { config: null } : { config }),
      ruleSet: opts.ruleSet ?? null,
      ...(opts.ignores === undefined ? {} : { ignores: opts.ignores }),
      now: () => '2026-10-18T12:00:00.000Z',
    },
  };
}

describe('diagnoseAsset', () => {
  it('产出完整报告：机械项与模型项合并、准则披露、cached=false', async () => {
    const h = harness();
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h.deps);
    expect(report.kind).toBe('skill');
    expect(report.overall).toBe('needs-attention');
    expect(report.issues.some((i) => i.criterion === 'token-economy')).toBe(true);
    expect(report.criteriaUsed).toEqual(['token-economy']);
    expect(report.cached).toBe(false);
    expect(report.mechanicalOnly).toBe(false);
    expect(report.model).toBe('demo-model');
    expect(report.generatedAt).toBe('2026-10-18T12:00:00.000Z');
  });

  it('内容/准则未变二次诊断命中缓存：不调模型且 cached=true（Scenario 4）', async () => {
    const cache = memoryCache();
    const h1 = harness({ cache });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h1.deps);
    const h2 = harness({ cache });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h2.deps);
    expect(report.cached).toBe(true);
    expect(h2.calls).toHaveLength(0);
  });

  it('准则集变化 → 缓存自然失效重新调用', async () => {
    const cache = memoryCache();
    const h1 = harness({ cache });
    await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h1.deps);
    const otherCriterion: CriterionAsset = { ...demoCriterion, slug: 'rule-topic', name: '规则单主题', body: '一条规则只管一件事' };
    const h2 = harness({ cache, criteria: [otherCriterion] });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h2.deps);
    expect(report.cached).toBe(false);
    expect(h2.calls).toHaveLength(1);
  });

  it('AI 未配置：只跑机械项 mechanicalOnly=true 不发请求（Scenario 7）', async () => {
    const h = harness({ config: null, content: '无 frontmatter 的技能正文\n' });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h.deps);
    expect(report.mechanicalOnly).toBe(true);
    expect(h.calls).toHaveLength(0);
    expect(report.issues.some((i) => i.criterion === 'mechanical:frontmatter-missing-field')).toBe(true);
  });

  it('机械 high 项不被模型 healthy 覆盖：合并后 overall 至少 needs-attention', async () => {
    const h = harness({
      content: '无 frontmatter 的坏技能正文\n',
      llmOutput: '{"overall":"healthy","issues":[]}',
    });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h.deps);
    expect(report.issues.filter((i) => i.criterion.startsWith('mechanical:')).length).toBeGreaterThan(0);
    expect(report.overall).not.toBe('healthy');
  });

  it('模型非法输出：throw「诊断失败」，不落缓存（Scenario 8 失败隔离）', async () => {
    const cache = memoryCache();
    const h = harness({ cache, llmOutput: '看起来没啥问题' });
    await expect(
      diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h.deps),
    ).rejects.toThrow(/诊断失败/);
    expect(cache.size()).toBe(0);
  });

  it('资产文件读不到：throw DiagnosisAssetError（路由映射 404）', async () => {
    const h = harness();
    h.deps.fs = { read: () => null };
    await expect(
      diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/gone/SKILL.md' }, h.deps),
    ).rejects.toThrow(DiagnosisAssetError);
  });

  it('准则为空仍可诊断：内置基线产出报告，criteriaUsed=[]（Scenario 6）', async () => {
    const h = harness({ criteria: [] });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' }, h.deps);
    expect(report.criteriaUsed).toEqual([]);
    expect(h.calls[0].system).not.toContain('裁决准则');
  });
});

// ================= T3: 报告契约扩展（findings / coverage / rulesVersion） =================

describe('diagnoseAsset 规则报告', () => {
  const skillPath = 'skills/demo-skill/SKILL.md';

  it('报告携带 findings / coverage / rulesVersion / aiEvaluated / rejected', async () => {
    const h = harness({ ruleSet: RULE_SET });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    expect(report.rulesVersion).toBe('1.0.0');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.aiEvaluated).toBe(true);
    expect(report.rejected).toBe(0);
    expect(report.coverage.evaluatedRules).toBe(15 + 7);
    expect(report.coverage.skippedReasons).toEqual([]);
    expect(report.findings.every((finding) => finding.source === 'rule')).toBe(true);
  });

  it('AI 未配置：静态 findings 完整、语义规则计入 skippedReasons，aiEvaluated=false', async () => {
    const h = harness({ config: null, ruleSet: RULE_SET });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    expect(report.aiEvaluated).toBe(false);
    expect(report.mechanicalOnly).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.coverage.evaluatedRules).toBe(15);
    expect(report.coverage.skippedReasons).toEqual([{ mode: 'llm', reason: 'no-ai-config', count: 7 }]);
    expect(h.calls).toHaveLength(0);
  });

  it('有证据的规则命中投影进旧 issues（criterion=ruleId），旧字段不缺失', async () => {
    const content = '---\nname: Demo_Skill\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';
    const h = harness({ ruleSet: RULE_SET, content });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    expect(report.issues.some((issue) => issue.criterion === 'SK-02')).toBe(true);
    expect(report.issues.some((issue) => issue.criterion === 'token-economy')).toBe(true);
  });

  it('无证据的缺失类结论不进旧 issues，且标 insufficientEvidence、不可修复（Scenario 3.2）', async () => {
    const content = '---\nname: demo-memory\ndescription: 演示\n---\n记忆正文\n';
    const h = harness({ ruleSet: RULE_SET, content, config: null });
    const report = await diagnoseAsset({ kind: 'memory', hubRelativePath: 'memory/demo.md' }, h.deps);
    const ownerFinding = report.findings.find((finding) => finding.ruleId === 'MEM-04');
    expect(ownerFinding).toBeDefined();
    expect(ownerFinding?.insufficientEvidence).toBe(true);
    expect(ownerFinding?.evidence).toEqual([]);
    expect(ownerFinding?.fixable).toBe(false);
    expect(report.issues.some((issue) => issue.criterion === 'MEM-04')).toBe(false);
  });

  it('静态 high 命中不被模型 healthy 覆盖（Scenario 2.3）', async () => {
    const h = harness({ ruleSet: RULE_SET, content: '无 frontmatter 的技能正文\n', llmOutput: '{"overall":"healthy","issues":[]}' });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    expect(report.findings.some((finding) => finding.severity === 'high')).toBe(true);
    expect(report.overall).not.toBe('healthy');
  });

  it('规则集未加载：findings 为空、rulesVersion 空串、coverage 全零，旧链路照常可用', async () => {
    const h = harness();
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    expect(report.findings).toEqual([]);
    expect(report.rulesVersion).toBe('');
    expect(report.coverage).toEqual({ evaluatedRules: 0, skippedRules: 0, skippedReasons: [] });
    expect(report.issues.some((issue) => issue.criterion === 'token-economy')).toBe(true);
  });
});

// ================= T5: 忽略清单生效与失效（Scenario 4.2 / 4.3） =================

describe('diagnoseAsset 忽略清单', () => {
  const skillPath = 'skills/demo-skill/SKILL.md';
  const content = '---\nname: Demo_Skill\ndescription: Use when 用户要导出 CSV。\n---\n正文\n';

  function ignoreEntry(contentHash: string): IgnoredFinding {
    return { ruleId: 'SK-02', hubRelativePath: skillPath, contentHash, ignoredAt: '2026-11-01T00:00:00.000Z' };
  }

  it('同内容再次诊断：命中被标记为已忽略，且不再进入旧 issues', async () => {
    const h = harness({
      ruleSet: RULE_SET,
      content,
      ignores: [ignoreEntry(hashIgnoredContent(content))],
    });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    const finding = report.findings.find((item) => item.ruleId === 'SK-02');

    expect(finding?.ignored).toBe(true);
    expect(report.issues.some((issue) => issue.criterion === 'SK-02')).toBe(false);
  });

  it('内容变更后忽略失效，仍命中则重新提示', async () => {
    const h = harness({ ruleSet: RULE_SET, content, ignores: [ignoreEntry('旧哈希')] });
    const report = await diagnoseAsset({ kind: 'skill', hubRelativePath: skillPath }, h.deps);
    const finding = report.findings.find((item) => item.ruleId === 'SK-02');

    expect(finding?.ignored).toBe(false);
    expect(report.issues.some((issue) => issue.criterion === 'SK-02')).toBe(true);
  });
});
