/**
 * arbitration 仲裁引擎单元测试（add-llm-conflict-arbitration B1/B2）
 *
 * spec: specs/conflict-arbitration.spec.md Scenario 2/6 + 内置基线定义
 * - buildArbitrationPrompt：准则为空骨架仍在；准则区与预算披露进 prompt；两侧 6000 截断
 * - parseArbitrationOutput：fenced/杂文容忍；decision 四值闭集；merge 必有草案；非法 throw
 */

import { describe, it, expect } from 'vitest';
import {
  buildArbitrationPrompt,
  parseArbitrationOutput,
  arbitrateConflict,
  ARBITRATION_DECISIONS,
  SIDE_PROMPT_LIMIT,
  type ArbitrateInput,
  type ArbitrateDeps,
} from '../../../src/core/arbitration.js';
import { AiConfigIncompleteError } from '../../../src/core/skill-ai-classification.js';
import { hashCriteria, type CriterionAsset } from '../../../src/core/criteria.js';
import type { ArbitrationCacheEntry, ArbitrationCacheStore } from '../../../src/core/arbitration-cache.js';

describe('buildArbitrationPrompt（B1）', () => {
  it('准则集为空时 system 仍含内置裁决骨架与 JSON 输出契约（内置基线）', () => {
    const { system } = buildArbitrationPrompt({
      category: 'skill',
      left: 'L',
      right: 'R',
      criteriaBlock: '',
      criteriaSkipped: 0,
    });
    for (const d of ARBITRATION_DECISIONS) {
      expect(system).toContain(d);
    }
    expect(system).toContain('JSON');
    // 无准则时不出现准则区标题
    expect(system).not.toContain('裁决准则');
  });

  it('准则区非空时原文进入 system，并附截断披露语句（Scenario 2/5）', () => {
    const { system } = buildAritrationGuard({
      criteriaBlock: '### Token 效率\n只写模型不知道的',
      criteriaSkipped: 2,
    });
    expect(system).toContain('裁决准则');
    expect(system).toContain('### Token 效率');
    expect(system).toContain('2 条准则因预算未参与');
  });

  it('skipped=0 时不渲染截断披露', () => {
    const { system } = buildAritrationGuard({
      criteriaBlock: '### A',
      criteriaSkipped: 0,
    });
    expect(system).not.toContain('未参与');
  });

  it('user 含两侧标签与内容；缺省标签用通用名（Scenario 2/9：仅两侧文本进 prompt）', () => {
    const { user } = buildArbitrationPrompt({
      category: 'rule',
      left: '左边内容',
      right: '右边内容',
      criteriaBlock: '',
      criteriaSkipped: 0,
    });
    expect(user).toContain('左边内容');
    expect(user).toContain('右边内容');
    expect(user).toMatch(/导入版|左侧/);
  });

  it('两侧各截断 6000 字符并显式标注截断（proposal 风险项：超限不裁决）', () => {
    const long = 'a'.repeat(SIDE_PROMPT_LIMIT + 500);
    const { user } = buildArbitrationPrompt({
      category: 'skill',
      left: long,
      right: '短',
      leftLabel: 'TRAE',
      rightLabel: '我的库',
      criteriaBlock: '',
      criteriaSkipped: 0,
    });
    expect(user).toContain('已截断');
    expect(user).not.toContain('a'.repeat(SIDE_PROMPT_LIMIT + 1));
    expect(user).toContain('TRAE');
    expect(user).toContain('我的库');
  });
});

describe('parseArbitrationOutput（B2，Scenario 6 全部非法形态）', () => {
  it('纯 JSON：keep-left 正常解析', () => {
    const r = parseArbitrationOutput('{"decision":"keep-left","rationale":"导入版更新"}');
    expect(r).toEqual({ decision: 'keep-left', rationale: '导入版更新' });
  });

  it('fenced ```json 包裹容忍', () => {
    const r = parseArbitrationOutput('```json\n{"decision":"keep-right","rationale":"现有版更贴合"}\n```');
    expect(r.decision).toBe('keep-right');
  });

  it('JSON 前后杂文容忍（取最外层大括号）', () => {
    const r = parseArbitrationOutput('好的，结果如下：{"decision":"manual-review","rationale":"差异复杂"} 供参考');
    expect(r.decision).toBe('manual-review');
  });

  it('merge 带 mergedContent 解析成功并透出草案', () => {
    const r = parseArbitrationOutput(
      JSON.stringify({ decision: 'merge', rationale: '互补', mergedContent: '合并后的全文' }),
    );
    expect(r.mergedContent).toBe('合并后的全文');
  });

  it('无法解析为 JSON → throw', () => {
    expect(() => parseArbitrationOutput('我觉得保留左边比较好')).toThrow();
  });

  it('decision 不在四值闭集 → throw', () => {
    expect(() => parseArbitrationOutput('{"decision":"keep-both","rationale":"x"}')).toThrow(/闭集|不合法/);
  });

  it('merge 缺 mergedContent → throw（不产生半成品建议）', () => {
    expect(() => parseArbitrationOutput('{"decision":"merge","rationale":"x"}')).toThrow(/草案/);
  });

  it('merge 的 mergedContent 为空串 → throw', () => {
    expect(() =>
      parseArbitrationOutput('{"decision":"merge","rationale":"x","mergedContent":"  "}'),
    ).toThrow(/草案/);
  });

  it('keep-right 附带 mergedContent 时忽略草案字段', () => {
    const r = parseArbitrationOutput(
      '{"decision":"keep-right","rationale":"x","mergedContent":"不该出现"}',
    );
    expect(r.mergedContent).toBeUndefined();
  });

  it('rationale 缺失回退空串（不过度约束模型）', () => {
    const r = parseArbitrationOutput('{"decision":"manual-review"}');
    expect(r.rationale).toBe('');
  });
});

/** 组装仅准则区差异的公共入参，减少重复 */
function buildAritrationGuard(input: { criteriaBlock: string; criteriaSkipped: number }): {
  system: string;
  user: string;
} {
  return buildArbitrationPrompt({
    category: 'skill',
    left: 'L',
    right: 'R',
    ...input,
  });
}

describe('arbitrateConflict（B3，Scenario 2/7/8）', () => {
  const config = { baseUrl: 'https://demo.local/v1', apiKey: 'k', model: 'demo-model' };
  const criterion: CriterionAsset = {
    slug: 'token-economy',
    relativePath: 'criteria/token-economy.md',
    name: 'Token 效率',
    description: '',
    priority: 5,
    enabled: true,
    appliesTo: ['all'],
    body: '只写模型不知道的',
  };

  interface Harness {
    deps: ArbitrateDeps;
    llmCalls: { system: string; user: string }[];
    cacheEntries: () => number;
    setFiles: (files: Record<string, string | null>) => void;
    setLlmOutput: (out: string | (() => Promise<string>)) => void;
  }

  function harness(): Harness {
    let files: Record<string, string | null> = { 'L.md': '左边', 'R.md': '右边' };
    let llmOutput: string | (() => Promise<string>) = '{"decision":"keep-left","rationale":"导入版更新"}';
    const llmCalls: { system: string; user: string }[] = [];
    let data: Record<string, ArbitrationCacheEntry> = {};
    const cache: ArbitrationCacheStore = {
      load: () => ({ ...data }),
      save: (entries) => {
        data = { ...entries };
      },
    };
    const deps: ArbitrateDeps = {
      fs: { read: (p) => files[p] ?? null },
      getCriteria: () => [criterion],
      cache,
      llm: {
        chat: async (input) => {
          llmCalls.push(input);
          return typeof llmOutput === 'function' ? llmOutput() : llmOutput;
        },
      },
      config,
      now: () => '2026-10-18T00:00:00.000Z',
    };
    return {
      deps,
      llmCalls,
      cacheEntries: () => Object.keys(data).length,
      setFiles: (f) => {
        files = f;
      },
      setLlmOutput: (o) => {
        llmOutput = o;
      },
    };
  }

  const input: ArbitrateInput = { category: 'skill', leftPath: 'L.md', rightPath: 'R.md' };

  it('未配置 AI 端点→AiConfigIncompleteError，不调模型（Scenario 8）', async () => {
    const h = harness();
    h.deps.config = undefined;
    await expect(arbitrateConflict(input, h.deps)).rejects.toBeInstanceOf(AiConfigIncompleteError);
    expect(h.llmCalls).toHaveLength(0);
  });

  it('首次仲裁：调模型一次，返回披露字段并写缓存（Scenario 2/7）', async () => {
    const h = harness();
    const r = await arbitrateConflict(input, h.deps);
    expect(h.llmCalls).toHaveLength(1);
    expect(r).toEqual({
      decision: 'keep-left',
      rationale: '导入版更新',
      criteriaUsed: ['token-economy'],
      criteriaSkipped: 0,
      cached: false,
      model: 'demo-model',
      generatedAt: '2026-10-18T00:00:00.000Z',
    });
    expect(h.cacheEntries()).toBe(1);
  });

  it('同内容同准则集二次仲裁命中缓存：不调模型、cached=true（Scenario 7）', async () => {
    const h = harness();
    await arbitrateConflict(input, h.deps);
    const r2 = await arbitrateConflict(input, h.deps);
    expect(h.llmCalls).toHaveLength(1);
    expect(r2.cached).toBe(true);
    expect(r2.decision).toBe('keep-left');
  });

  it('任一侧内容变化→缓存自然失效重调模型（Scenario 7）', async () => {
    const h = harness();
    await arbitrateConflict(input, h.deps);
    h.setFiles({ 'L.md': '左边变了', 'R.md': '右边' });
    await arbitrateConflict(input, h.deps);
    expect(h.llmCalls).toHaveLength(2);
  });

  it('准则集变化→缓存失效（Scenario 7：key 含准则集哈希）', async () => {
    const h = harness();
    await arbitrateConflict(input, h.deps);
    h.deps.getCriteria = () => [{ ...criterion, body: '正文变了' }];
    await arbitrateConflict(input, h.deps);
    expect(h.llmCalls).toHaveLength(2);
    // 新准则集哈希参与 key 计算（不直接断言 key，断行为即可）
    expect(hashCriteria([{ ...criterion, body: '正文变了' }])).not.toBe(hashCriteria([criterion]));
  });

  it('merge 建议透传草案；进 prompt 的 user 含两侧内容（Scenario 2/3/9）', async () => {
    const h = harness();
    h.setLlmOutput(
      '{"decision":"merge","rationale":"互补","mergedContent":"合并全文"}',
    );
    const r = await arbitrateConflict({ ...input, leftLabel: 'TRAE', rightLabel: '我的库' }, h.deps);
    expect(r.mergedContent).toBe('合并全文');
    expect(h.llmCalls[0].user).toContain('左边');
    expect(h.llmCalls[0].user).toContain('TRAE');
    expect(h.llmCalls[0].system).toContain('Token 效率');
  });

  it('模型输出非法→throw 且不写缓存（Scenario 6 失败隔离，下次重调）', async () => {
    const h = harness();
    h.setLlmOutput('我觉得保留左边');
    await expect(arbitrateConflict(input, h.deps)).rejects.toThrow(/JSON/);
    expect(h.cacheEntries()).toBe(0);
  });

  it('左或右文件读不到→报错含路径（路由层映射 404）', async () => {
    const h = harness();
    h.setFiles({ 'L.md': null, 'R.md': '右边' });
    await expect(arbitrateConflict(input, h.deps)).rejects.toThrow(/L\.md/);
  });

  it('准则全部停用→准则区为空，内置基线仍仲裁，criteriaUsed=[]（内置基线）', async () => {
    const h = harness();
    h.deps.getCriteria = () => [{ ...criterion, enabled: false }];
    const r = await arbitrateConflict(input, h.deps);
    expect(r.criteriaUsed).toEqual([]);
    expect(h.llmCalls[0].system).not.toContain('裁决准则');
  });
});
