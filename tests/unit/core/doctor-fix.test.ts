/**
 * 修复草案引擎测试（add-asset-doctor F1）
 *
 * spec: specs/fix-and-distribute.spec.md Scenario 1/7/9；proposal D2（信任红线：草案阶段零落盘）。
 * 全 DI：假 fs / 准则 / 内存缓存 / mock LLM，不碰真实文件与网络（同诊断测试惯例）。
 */

import { describe, it, expect } from 'vitest';
import {
  buildFixDraftPrompt,
  parseFixDraftOutput,
  generateFixDraft,
  FixDraftOutputError,
  FixDraftTruncatedError,
  FixDraftUnavailableError,
  type FixDraftCacheEntry,
  type FixDraftCacheStore,
  type FixDraftDeps,
  type SelectedFixIssue,
} from '../../../src/core/doctor-fix.js';
import { DiagnosisAssetError } from '../../../src/core/doctor.js';
import type { DiagnosisIssue } from '../../../src/core/types.js';
import type { CriterionAsset } from '../../../src/core/criteria.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';

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

const skillIssue: DiagnosisIssue = {
  severity: 'high',
  criterion: 'mechanical:frontmatter-missing-field',
  finding: 'frontmatter 缺失必填字段：description',
  suggestion: '在 frontmatter 补上 description 触发描述',
  fixable: true,
};

const modelIssue: DiagnosisIssue = {
  severity: 'medium',
  criterion: 'token-economy',
  finding: '正文重复陈述模型已知的通用知识',
  suggestion: '删除基础概念解释段',
  fixable: true,
};

const validDraft = JSON.stringify({
  draftContent: '---\nname: demo-skill\ndescription: 演示技能\n---\n正文内容\n',
  changeNotes: [{ issueIndex: 0, note: '在 frontmatter 补写了 description' }],
});

const selected = (indexes: number[]): SelectedFixIssue[] =>
  indexes.map((index) => ({ index, issue: index === 0 ? skillIssue : modelIssue }));

// ================= buildFixDraftPrompt =================

describe('buildFixDraftPrompt', () => {
  it('系统契约：全文草案 + 逐问题说明 + 不越界修改', () => {
    const { system } = buildFixDraftPrompt({
      kind: 'skill',
      content: '原文',
      criteriaBlock: '',
      selected: selected([0]),
    });
    expect(system).toContain('draftContent');
    expect(system).toContain('changeNotes');
    expect(system).toContain('issueIndex');
    expect(system).toContain('原样保留');
    // 准则区为空时不出现准则标题（同诊断 Scenario 6 口径）
    expect(system).not.toContain('裁决准则');
  });

  it('user 含资产全文与选定问题清单（编号=报告下标），准则区非空才注入', () => {
    const { user } = buildFixDraftPrompt({
      kind: 'skill',
      content: '---\nname: demo-skill\n---\n正文内容\n',
      criteriaBlock: '### Token 效率\n只写模型不知道的',
      selected: selected([0, 1]),
    });
    expect(user).toContain('正文内容');
    expect(user).toContain('frontmatter 缺失必填字段：description');
    expect(user).toContain('删除基础概念解释段');
    expect(user).toContain('issueIndex');
    const { system } = buildFixDraftPrompt({
      kind: 'skill',
      content: '原文',
      criteriaBlock: '### Token 效率\n只写模型不知道的',
      selected: selected([0]),
    });
    expect(system).toContain('裁决准则');
    expect(system).toContain('Token 效率');
  });

  it('内容超上限标记 contentTruncated=true（拒绝发生在 generate 层）', () => {
    const long = '内'.repeat(6001);
    const r = buildFixDraftPrompt({ kind: 'skill', content: long, criteriaBlock: '', selected: selected([0]) });
    expect(r.contentTruncated).toBe(true);
    const r2 = buildFixDraftPrompt({ kind: 'skill', content: '短', criteriaBlock: '', selected: selected([0]) });
    expect(r2.contentTruncated).toBe(false);
  });
});

// ================= parseFixDraftOutput =================

describe('parseFixDraftOutput', () => {
  it('合法输出透传（含 fenced 容忍）', () => {
    const parsed = parseFixDraftOutput(validDraft);
    expect(parsed.draftContent).toContain('description: 演示技能');
    expect(parsed.changeNotes).toEqual([{ issueIndex: 0, note: '在 frontmatter 补写了 description' }]);
    const fenced = parseFixDraftOutput('说明\n```json\n' + validDraft + '\n```\n完毕');
    expect(fenced.draftContent).toContain('description: 演示技能');
  });

  it('changeNotes 缺失宽容为 []；非法条目过滤', () => {
    const bare = parseFixDraftOutput('{"draftContent":"新内容"}');
    expect(bare.changeNotes).toEqual([]);
    const dirty = parseFixDraftOutput(
      '{"draftContent":"新内容","changeNotes":[{"issueIndex":0,"note":"好"},{"issueIndex":"x","note":"坏"},{"note":"缺下标"}]}',
    );
    expect(dirty.changeNotes).toEqual([{ issueIndex: 0, note: '好' }]);
  });

  it('draftContent 缺失/空/非串/非 JSON → throw「草案失败」', () => {
    const bad = [
      '我觉得改好了',
      '{"changeNotes":[]}',
      '{"draftContent":""}',
      '{"draftContent":123}',
    ];
    for (const text of bad) {
      expect(() => parseFixDraftOutput(text), text).toThrow(FixDraftOutputError);
    }
    expect(() => parseFixDraftOutput(' nope')).toThrow(/草案失败/);
  });
});

// ================= generateFixDraft =================

function memoryDraftCache(): FixDraftCacheStore & { size(): number } {
  let data: Record<string, FixDraftCacheEntry> = {};
  return {
    load: () => ({ ...data }),
    save: (entries) => {
      data = { ...entries };
    },
    size: () => Object.keys(data).length,
  };
}

interface Harness {
  calls: { system: string; user: string }[];
  deps: FixDraftDeps;
}

function harness(opts: {
  config?: Partial<AiClassifyConfig> | null;
  content?: string;
  criteria?: CriterionAsset[];
  llmOutput?: string;
  cache?: FixDraftCacheStore;
} = {}): Harness {
  const calls: { system: string; user: string }[] = [];
  const content = opts.content ?? '---\nname: demo-skill\n---\n正文内容\n';
  const config = opts.config === null ? null : fullConfig(opts.config ?? {});
  const llm: LlmClient = {
    chat: async (input) => {
      calls.push(input);
      return opts.llmOutput ?? validDraft;
    },
  };
  return {
    calls,
    deps: {
      fs: { read: () => content },
      getCriteria: () => opts.criteria ?? [demoCriterion],
      cache: opts.cache ?? memoryDraftCache(),
      llm,
      ...(config === null ? { config: null } : { config }),
      now: () => '2026-10-18T12:00:00.000Z',
    },
  };
}

const input = (indexes: number[]) => ({
  kind: 'skill' as const,
  hubRelativePath: 'skills/demo-skill/SKILL.md',
  selected: selected(indexes),
});

describe('generateFixDraft', () => {
  it('正常产出草案：全文 + 逐问题说明 + 模型与时间戳（Scenario 1 数据面）', async () => {
    const h = harness();
    const result = await generateFixDraft(input([0]), h.deps);
    expect(result.draftContent).toContain('description: 演示技能');
    expect(result.changeNotes).toEqual([{ issueIndex: 0, note: '在 frontmatter 补写了 description' }]);
    expect(result.cached).toBe(false);
    expect(result.contentTruncated).toBe(false);
    expect(result.model).toBe('demo-model');
    expect(h.calls).toHaveLength(1);
  });

  it('同内容同问题二次生成命中缓存：不再调模型且 cached=true', async () => {
    const cache = memoryDraftCache();
    const h1 = harness({ cache });
    await generateFixDraft(input([0]), h1.deps);
    const h2 = harness({ cache });
    const result = await generateFixDraft(input([0]), h2.deps);
    expect(result.cached).toBe(true);
    expect(h2.calls).toHaveLength(0);
  });

  it('问题集不同 → 缓存 key 不同，重新调用', async () => {
    const cache = memoryDraftCache();
    const h1 = harness({ cache });
    await generateFixDraft(input([0]), h1.deps);
    const h2 = harness({ cache });
    const result = await generateFixDraft(input([1]), h2.deps);
    expect(result.cached).toBe(false);
    expect(h2.calls).toHaveLength(1);
  });

  it('超长资产拒绝生成：不调模型（Scenario 7 / tasks F1 → 路由 400）', async () => {
    const h = harness({ content: '内'.repeat(6001) });
    await expect(generateFixDraft(input([0]), h.deps)).rejects.toThrow(FixDraftTruncatedError);
    expect(h.calls).toHaveLength(0);
  });

  it('AI 未配置：FixDraftUnavailableError 不发请求（草案必须走模型）', async () => {
    const h = harness({ config: null });
    await expect(generateFixDraft(input([0]), h.deps)).rejects.toThrow(FixDraftUnavailableError);
    expect(h.calls).toHaveLength(0);
  });

  it('资产读不到 → DiagnosisAssetError（路由映射 404）', async () => {
    const h = harness();
    h.deps.fs = { read: () => null };
    await expect(generateFixDraft(input([0]), h.deps)).rejects.toThrow(DiagnosisAssetError);
  });

  it('模型非法输出：throw「草案失败」且不落缓存（失败隔离）', async () => {
    const cache = memoryDraftCache();
    const h = harness({ cache, llmOutput: '直接改好了，你看' });
    await expect(generateFixDraft(input([0]), h.deps)).rejects.toThrow(FixDraftOutputError);
    expect(cache.size()).toBe(0);
  });
});
