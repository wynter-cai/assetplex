/**
 * AI 智能分类核心纯逻辑测试
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 * 覆盖：显式触发（单条/批量/缺省全量）、缓存命中不调 LLM、同内容复用、
 * 手动覆盖跳过、输出解析校验（闭集外/非 JSON/代码块包裹）、失败隔离、配置缺失。
 */

import { describe, it, expect } from 'vitest';
import {
  classifySkillsWithAi,
  buildClassifyPrompt,
  AiConfigIncompleteError,
  type LlmClient,
} from '../../../src/core/skill-ai-classification.js';
import { hashSkillContent, type AiClassifyCacheStore, type AiClassifyCacheEntry } from '../../../src/core/skill-ai-cache.js';
import type { SkillFs, SkillSources, SkillFunction, SkillOverrideStore } from '../../../src/core/skills-inventory.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';

const SKILL = (name: string, description: string, extra = ''): string =>
  `---\nname: ${name}\ndescription: ${description}${extra}\n---\n# ${name}\n正文内容\n`;

function makeFs(files: Record<string, string>): SkillFs {
  return {
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    listDir: (p) => {
      const prefix = p.endsWith('/') ? p : `${p}/`;
      const names = new Set<string>();
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue;
        const seg = f.slice(prefix.length).split('/')[0];
        if (seg) names.add(seg);
      }
      return Array.from(names).sort();
    },
    dirMtime: () => null,
  };
}

class MemoryOverrideStore implements SkillOverrideStore {
  constructor(public data: Record<string, SkillFunction> = {}) {}
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(map: Record<string, SkillFunction>): void {
    this.data = { ...map };
  }
}

class MemoryCacheStore implements AiClassifyCacheStore {
  data: Record<string, AiClassifyCacheEntry> = {};
  load(): Record<string, AiClassifyCacheEntry> {
    return { ...this.data };
  }
  save(entries: Record<string, AiClassifyCacheEntry>): void {
    this.data = { ...entries };
  }
}

/** 可编程 mock：按输入顺序返回预设响应或抛错（耗尽后重复最后一个），记录调用 */
function makeLlm(responses: Array<string | Error>): LlmClient & { calls: string[] } {
  let i = 0;
  const calls: string[] = [];
  return {
    calls,
    chat(input) {
      calls.push(input.user);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    },
  };
}

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/cb/skills',
};

const CONFIG: AiClassifyConfig = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'lite-model' };
const NOW = () => '2026-10-06T00:00:00.000Z';

function baseFiles(): Record<string, string> {
  return {
    [`${SOURCES.userSkillsDir}/airbnb/SKILL.md`]: SKILL('airbnb', '订房助手'),
    [`${SOURCES.userSkillsDir}/stock/SKILL.md`]: SKILL('stock', '股票数据 xlsx 表格'),
    [`${SOURCES.userSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', 'pdf 文档处理'),
  };
}

interface DepsOverrides {
  files?: Record<string, string>;
  overrides?: Record<string, SkillFunction>;
  llm?: LlmClient;
  config?: AiClassifyConfig | null;
  cache?: AiClassifyCacheStore;
}

function makeDeps(ov: DepsOverrides = {}) {
  const llm = ov.llm ?? makeLlm(['{"category":"workflow"}']);
  return {
    fs: makeFs(ov.files ?? baseFiles()),
    sources: SOURCES,
    store: new MemoryOverrideStore(ov.overrides ?? {}),
    cache: ov.cache ?? new MemoryCacheStore(),
    llm,
    config: ov.config === null ? undefined : (ov.config ?? CONFIG),
    now: NOW,
  };
}

describe('buildClassifyPrompt', () => {
  it('system 提示词包含 9 分类闭集与只输出 JSON 的约束', () => {
    const { system } = buildClassifyPrompt({ name: 'x', description: 'y', rawContent: 'z' });
    for (const c of ['coding', 'writing', 'browser', 'data', 'devops', 'ai-integration', 'design', 'workflow', 'other']) {
      expect(system).toContain(c);
    }
    expect(system).toContain('{"category"');
  });

  it('user 消息含技能名与描述，正文超长时截断', () => {
    const longBody = 'a'.repeat(5000);
    const { user } = buildClassifyPrompt({ name: 'airbnb', description: '订房', rawContent: longBody });
    expect(user).toContain('airbnb');
    expect(user).toContain('订房');
    expect(user.length).toBeLessThan(3000);
  });
});

describe('classifySkillsWithAi', () => {
  it('单条分类成功：调 LLM 一次、写缓存、functionSource 变 ai', async () => {
    const deps = makeDeps();
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(deps.llm.calls).toHaveLength(1);
    expect(result.classified).toHaveLength(1);
    expect(result.classified[0].id).toBe('airbnb');
    expect(result.classified[0].functionCategory).toBe('workflow');
    expect(result.classified[0].functionSource).toBe('ai');
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.cacheHits).toBe(0);
  });

  it('缓存命中时不调 LLM，cacheHits 计数', async () => {
    const cache = new MemoryCacheStore();
    cache.data[hashSkillContent(SKILL('airbnb', '订房助手'))] = {
      category: 'workflow',
      model: 'lite-model',
      classifiedAt: '2026-10-05T00:00:00.000Z',
    };
    const deps = makeDeps({ cache });
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(deps.llm.calls).toHaveLength(0);
    expect(result.cacheHits).toBe(1);
    expect(result.classified[0].functionCategory).toBe('workflow');
    expect(result.classified[0].functionSource).toBe('ai');
  });

  it('内容相同但路径迁移（模拟沉淀）时按 hash 命中缓存，不调 LLM', async () => {
    // 沉淀场景：marketplace 源已分类，vault 副本字节相同 → 同 hash 直接命中
    const same = SKILL('airbnb', '订房助手');
    const files: Record<string, string> = {
      [`${SOURCES.marketplaceSkillsDir}/airbnb/SKILL.md`]: same,
    };
    const cache = new MemoryCacheStore();
    const deps = makeDeps({ files, cache });
    await classifySkillsWithAi({ ids: ['airbnb'] }, deps);
    expect(deps.llm.calls).toHaveLength(1);

    // 模拟沉淀：同内容出现在 vault 路径，marketplace 路径消失（盘点合并后主条目指向 vault）
    delete files[`${SOURCES.marketplaceSkillsDir}/airbnb/SKILL.md`];
    files[`${SOURCES.vaultSkillsDir}/airbnb/SKILL.md`] = same;
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(deps.llm.calls).toHaveLength(1);
    expect(result.cacheHits).toBe(1);
    expect(result.classified[0].functionCategory).toBe('workflow');
    expect(result.classified[0].functionSource).toBe('ai');
  });

  it('手动覆盖的技能被跳过且不调 LLM（AI 永不覆盖手动）', async () => {
    const deps = makeDeps({ overrides: { pdf: 'data' } });
    const result = await classifySkillsWithAi({ ids: ['airbnb', 'pdf'] }, deps);

    expect(deps.llm.calls).toHaveLength(1);
    expect(result.skipped).toEqual([{ id: 'pdf', name: 'pdf' }]);
    expect(result.classified).toHaveLength(1);
  });

  it('ids 缺省时目标为全部非手动覆盖技能', async () => {
    const deps = makeDeps({ overrides: { pdf: 'data' } });
    const result = await classifySkillsWithAi({}, deps);

    expect(deps.llm.calls).toHaveLength(2);
    expect(result.classified).toHaveLength(2);
    expect(result.classified.map((s) => s.id).sort()).toEqual(['airbnb', 'stock']);
  });

  it('ids 含不存在的技能时计入 failed，不影响其余', async () => {
    const deps = makeDeps();
    const result = await classifySkillsWithAi({ ids: ['airbnb', 'ghost'] }, deps);

    expect(result.classified).toHaveLength(1);
    expect(result.failed).toEqual([{ id: 'ghost', name: 'ghost', error: expect.stringContaining('不存在') }]);
  });

  it('LLM 输出闭集外分类：该条 failed，缓存不写入', async () => {
    const deps = makeDeps({ llm: makeLlm(['{"category":"travel"}']) });
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(result.failed).toEqual([{ id: 'airbnb', name: 'airbnb', error: expect.stringContaining('不合法') }]);
    expect(result.classified).toEqual([]);
    expect(Object.keys((deps.cache as MemoryCacheStore).data)).toHaveLength(0);
  });

  it('LLM 输出非 JSON：该条 failed', async () => {
    const deps = makeDeps({ llm: makeLlm(['我认为这是 workflow 类技能']) });
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(result.failed).toEqual([{ id: 'airbnb', name: 'airbnb', error: expect.stringContaining('解析') }]);
  });

  it('LLM 输出代码块包裹的 JSON 可解析', async () => {
    const deps = makeDeps({ llm: makeLlm(['```json\n{"category":"coding"}\n```']) });
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(result.classified[0].functionCategory).toBe('coding');
    expect(result.failed).toEqual([]);
  });

  it('LLM 网络错误部分成功：失败不中断其余，缓存无失败条目', async () => {
    const deps = makeDeps({
      llm: makeLlm([new Error('connect ECONNREFUSED'), '{"category":"data"}']),
    });
    const result = await classifySkillsWithAi({ ids: ['airbnb', 'stock'] }, deps);

    expect(result.classified.map((s) => s.id)).toEqual(['stock']);
    expect(result.failed).toEqual([{ id: 'airbnb', name: 'airbnb', error: 'connect ECONNREFUSED' }]);
    expect(Object.keys((deps.cache as MemoryCacheStore).data)).toHaveLength(1);
  });

  it('配置不完整时抛 AiConfigIncompleteError，不调 LLM', async () => {
    const deps = makeDeps({ config: { baseUrl: 'https://a.com', apiKey: '', model: 'm' } });
    await expect(classifySkillsWithAi({ ids: ['airbnb'] }, deps)).rejects.toBeInstanceOf(AiConfigIncompleteError);
    expect(deps.llm.calls).toHaveLength(0);
  });

  it('config 未传入时同样抛 AiConfigIncompleteError', async () => {
    const deps = makeDeps({ config: null });
    await expect(classifySkillsWithAi({ ids: ['airbnb'] }, deps)).rejects.toBeInstanceOf(AiConfigIncompleteError);
  });

  it('内容变更后重新分类：按新 hash 调 LLM 并新增缓存条目', async () => {
    const files = baseFiles();
    const deps = makeDeps({ files });
    await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    files[`${SOURCES.userSkillsDir}/airbnb/SKILL.md`] = SKILL('airbnb', '订房助手（改版）');
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(deps.llm.calls).toHaveLength(2);
    expect(result.cacheHits).toBe(0);
    expect(result.classified[0].functionCategory).toBe('workflow');
  });

  it('写入缓存的条目含模型名与分类时间', async () => {
    const cache = new MemoryCacheStore();
    const deps = makeDeps({ cache });
    await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    const entry = Object.values(cache.data)[0];
    expect(entry.category).toBe('workflow');
    expect(entry.model).toBe('lite-model');
    expect(entry.classifiedAt).toBe('2026-10-06T00:00:00.000Z');
  });

  it('分类成功后缓存中存在对应 hash 条目（盘点侧按 hash 消费）', async () => {
    const cache = new MemoryCacheStore();
    const deps = makeDeps({ cache });
    const result = await classifySkillsWithAi({ ids: ['airbnb'] }, deps);

    expect(result.classified[0].functionSource).toBe('ai');
    const hashed = hashSkillContent(SKILL('airbnb', '订房助手'));
    expect(cache.data[hashed]?.category).toBe('workflow');
  });
});

describe('createAiLookup（缓存 → 盘点回调组装）', () => {
  const RAW = SKILL('airbnb', '订房助手');

  it('hash 命中返回缓存分类，未命中返回 null', async () => {
    const { createAiLookup } = await import('../../../src/core/skill-ai-classification.js');
    const cache = new MemoryCacheStore();
    cache.data[hashSkillContent(RAW)] = { category: 'workflow', model: 'lite', classifiedAt: 't' };
    const lookup = createAiLookup(cache);

    expect(lookup(RAW)).toBe('workflow');
    expect(lookup(SKILL('other', '别的技能'))).toBeNull();
  });

  it('内容变更后旧缓存不再命中', async () => {
    const { createAiLookup } = await import('../../../src/core/skill-ai-classification.js');
    const cache = new MemoryCacheStore();
    cache.data[hashSkillContent(RAW)] = { category: 'workflow', model: 'lite', classifiedAt: 't' };
    const lookup = createAiLookup(cache);

    expect(lookup(SKILL('airbnb', '订房助手（改版）'))).toBeNull();
  });
});
