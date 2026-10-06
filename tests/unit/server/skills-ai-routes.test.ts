/**
 * AI 智能分类路由集成测试
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 * 覆盖：配置保存/脱敏读取/缺项校验、分类触发（成功/跳过手动/失败隔离）、
 * 分类结果经盘点生效（aiLookup 集成）、配置未就绪 400。
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { skillsRouteFactory } from '../../../src/server/routes/skills.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type {
  SkillFs,
  SkillFunction,
  SkillSources,
  SkillOverrideStore,
} from '../../../src/core/skills-inventory.js';
import type { AiConfigStore } from '../../../src/core/ai-config.js';
import type { AiClassifyCacheStore, AiClassifyCacheEntry } from '../../../src/core/skill-ai-cache.js';
import type { LlmClient } from '../../../src/core/skill-ai-classification.js';

/** 内存可写文件系统（SkillFs + 写方法） */
class MemoryWriteFs implements SkillWriteFs {
  files: Record<string, string>;
  constructor(files: Record<string, string> = {}) {
    this.files = files;
  }
  read(p: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.files, p) ? this.files[p] : null;
  }
  listDir(p: string): string[] {
    const names = new Set<string>();
    for (const f of Object.keys(this.files)) {
      if (f.startsWith(p + '/')) {
        const seg = f.slice(p.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }
  dirMtime(): string | null {
    return null;
  }
  exists(p: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, p);
  }
  ensureDir(): void {}
  writeFile(p: string, content: string): void {
    this.files[p] = content;
  }
  removeDir(p: string): void {
    const prefix = p + '/';
    for (const key of Object.keys(this.files)) {
      if (key.startsWith(prefix)) delete this.files[key];
    }
  }
}

class MemoryStore implements SkillOverrideStore {
  data: Record<string, SkillFunction> = {};
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(m: Record<string, SkillFunction>): void {
    this.data = { ...m };
  }
}

class MemoryAiConfigStore implements AiConfigStore {
  data: { baseUrl?: string; apiKey?: string; model?: string } = {};
  load() {
    return { ...this.data };
  }
  save(config: { baseUrl: string; apiKey: string; model: string }): void {
    this.data = { ...config };
  }
}

class MemoryAiCacheStore implements AiClassifyCacheStore {
  data: Record<string, AiClassifyCacheEntry> = {};
  load(): Record<string, AiClassifyCacheEntry> {
    return { ...this.data };
  }
  save(entries: Record<string, AiClassifyCacheEntry>): void {
    this.data = { ...entries };
  }
}

/** 可编程 mock LLM（耗尽后重复最后一个响应） */
function makeLlm(responses: Array<string | Error>): LlmClient & { calls: number } {
  let i = 0;
  return {
    calls: 0,
    chat() {
      this.calls += 1;
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve(r);
    },
  };
}

const sources: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/root/.trae-cn/skills',
  builtinRoot: '/root/.trae-cn/builtin',
  builtinSkillsDir: '/root/.trae-cn/builtin_skills',
  pluginsRoot: '/root/.trae-cn/plugins',
  marketplaceSkillsDir: '/root/.codebuddy/skills-marketplace/skills',
};

const SKILL_MD = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;

interface AppOptions {
  files?: Record<string, string>;
  config?: { baseUrl?: string; apiKey?: string; model?: string };
  llm?: LlmClient & { calls: number };
}

function buildApp(opts: AppOptions = {}) {
  const fs = new MemoryWriteFs(opts.files ?? {});
  const aiConfigStore = new MemoryAiConfigStore();
  if (opts.config) aiConfigStore.data = { ...opts.config };
  const aiCacheStore = new MemoryAiCacheStore();
  const llm = opts.llm ?? makeLlm(['{"category":"workflow"}']);
  const app = new Hono();
  app.route('/api/skills', skillsRouteFactory({
    fs,
    writeFs: fs,
    sources,
    store: new MemoryStore(),
    aiConfigStore,
    aiCacheStore,
    llmClient: llm,
  }));
  return { app, aiConfigStore, aiCacheStore, llm };
}

describe('GET/PUT /api/skills/ai-classify/config', () => {
  it('未配置时读取返回空配置（hasApiKey=false，无错误）', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/skills/ai-classify/config');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ baseUrl: '', model: '', hasApiKey: false });
  });

  it('保存成功返回脱敏视图，读取不回传 apiKey 明文', async () => {
    const { app } = buildApp();
    const put = await app.request('/api/skills/ai-classify/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret', model: 'lite' }),
    });
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'lite', hasApiKey: true });
    expect(JSON.stringify(putBody)).not.toContain('sk-secret');

    const get = await app.request('/api/skills/ai-classify/config');
    expect(JSON.stringify(await get.json())).not.toContain('sk-secret');
  });

  it('apiKey 缺省时保留已存值', async () => {
    const { app } = buildApp({
      config: { baseUrl: 'https://old.com/v1', apiKey: 'sk-keep', model: 'old-model' },
    });
    const res = await app.request('/api/skills/ai-classify/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://new.com/v1', model: 'new-model' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.baseUrl).toBe('https://new.com/v1');
    expect(body.hasApiKey).toBe(true);
  });

  it('缺 model 返回 400 且不写入', async () => {
    const { app, aiConfigStore } = buildApp();
    const res = await app.request('/api/skills/ai-classify/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://a.com/v1', apiKey: 'sk-x', model: '' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/model/);
    expect(aiConfigStore.data.model).toBeUndefined();
  });

  it('非法 baseUrl 返回 400', async () => {
    const { app } = buildApp();
    const res = await app.request('/api/skills/ai-classify/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'not-a-url', apiKey: 'sk-x', model: 'm' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/baseUrl/);
  });
});

describe('POST /api/skills/ai-classify', () => {
  const files = (): Record<string, string> => ({
    [`${sources.userSkillsDir}/airbnb/SKILL.md`]: SKILL_MD('airbnb', '订房助手'),
    [`${sources.userSkillsDir}/pdf/SKILL.md`]: SKILL_MD('pdf', 'pdf 文档'),
  });
  const READY_CONFIG = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'lite-model' };

  it('配置未就绪时返回 400 且不调 LLM', async () => {
    const { app, llm } = buildApp({ files: files() });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['airbnb'] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/配置/);
    expect(llm.calls).toBe(0);
  });

  it('分类成功：200 部分成功语义，结果写入缓存，functionSource 为 ai', async () => {
    const { app, aiCacheStore } = buildApp({ files: files(), config: READY_CONFIG });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['airbnb'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classified).toHaveLength(1);
    expect(body.classified[0].functionCategory).toBe('workflow');
    expect(body.classified[0].functionSource).toBe('ai');
    expect(body.failed).toEqual([]);
    expect(Object.keys(aiCacheStore.data)).toHaveLength(1);
  });

  it('分类后盘点自动应用 AI 结果（aiLookup 集成）', async () => {
    const { app } = buildApp({ files: files(), config: READY_CONFIG });
    await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['airbnb'] }),
    });
    const list = await app.request('/api/skills');
    const items = (await list.json()).items as Array<{ id: string; functionSource: string; functionCategory: string }>;
    const airbnb = items.find((s) => s.id === 'airbnb');
    expect(airbnb?.functionCategory).toBe('workflow');
    expect(airbnb?.functionSource).toBe('ai');
    const pdf = items.find((s) => s.id === 'pdf');
    expect(pdf?.functionSource).toBe('keyword');
  });

  it('ids 缺省时对全部非手动覆盖技能分类', async () => {
    const { app, llm } = buildApp({ files: files(), config: READY_CONFIG });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.classified).toHaveLength(2);
    expect(llm.calls).toBe(2);
  });

  it('手动覆盖技能进 skipped，不消耗 LLM 调用', async () => {
    const { app, llm } = buildApp({ files: files(), config: READY_CONFIG });
    // 先手动覆盖 pdf
    await app.request('/api/skills/pdf/function', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionCategory: 'data' }),
    });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['airbnb', 'pdf'] }),
    });
    const body = await res.json();
    expect(body.skipped).toEqual([{ id: 'pdf', name: 'pdf' }]);
    expect(body.classified).toHaveLength(1);
    expect(llm.calls).toBe(1);
  });

  it('LLM 输出非法时计入 failed，不影响其余，缓存不写入', async () => {
    const { app, aiCacheStore } = buildApp({
      files: files(),
      config: READY_CONFIG,
      llm: makeLlm(['{"category":"travel"}', '{"category":"writing"}']),
    });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['airbnb', 'pdf'] }),
    });
    const body = await res.json();
    expect(body.classified.map((s: { id: string }) => s.id)).toEqual(['pdf']);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].id).toBe('airbnb');
    expect(body.failed[0].error).toMatch(/不合法/);
    expect(Object.keys(aiCacheStore.data)).toHaveLength(1);
  });

  it('ids 非法返回 400', async () => {
    const { app } = buildApp({ config: READY_CONFIG });
    const res = await app.request('/api/skills/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
  });
});
