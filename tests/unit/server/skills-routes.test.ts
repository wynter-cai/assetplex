/**
 * 技能分类路由测试
 *
 * spec: skills-taxonomy.spec.md（列表、覆盖 PUT、400/404、持久化）
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { skillsRouteFactory } from '../../../src/server/routes/skills.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillFs, SkillFunction, SkillSources, SkillOverrideStore } from '../../../src/core/skills-inventory.js';

/** 内存可写文件系统（SkillFs + 写方法，供写管理路由注入） */
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

  ensureDir(): void {
    // 内存实现无需动作
  }

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

function makeFs(files: Record<string, string>): MemoryWriteFs {
  return new MemoryWriteFs(files);
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

const sources: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/root/.trae-cn/skills',
  builtinRoot: '/root/.trae-cn/builtin',
  builtinSkillsDir: '/root/.trae-cn/builtin_skills',
  pluginsRoot: '/root/.trae-cn/plugins',
  marketplaceSkillsDir: '/root/.codebuddy/skills-marketplace/skills',
};

function buildApp(fs: MemoryWriteFs, store: SkillOverrideStore = new MemoryStore()): Hono {
  const app = new Hono();
  app.route('/api/skills', skillsRouteFactory({ fs, writeFs: fs, sources, store }));
  return app;
}

describe('GET /api/skills', () => {
  it('200 返回去重后的技能与两套计数', async () => {
    const fs = makeFs({
      [`${sources.userSkillsDir}/pdf/SKILL.md`]: '---\nname: pdf\ndescription: pdf 文档处理\n---',
      [`${sources.builtinRoot}/code/default/skills/pdf/SKILL.md`]: '---\nname: pdf\ndescription: builtin\n---',
      [`${sources.marketplaceSkillsDir}/browser/SKILL.md`]: '---\nname: browser\ndescription: browser 自动化\n---',
    });
    const res = await buildApp(fs).request('/api/skills');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.countByFunction.writing).toBe(1);
    expect(body.countByOrigin.personal).toBe(1);
    const pdf = body.items.find((s: { name: string }) => s.name === 'pdf');
    expect(pdf.variants).toHaveLength(1);
  });

  it('非法 function 返回 400', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills?function=nope');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/skills/:id/function', () => {
  it('覆盖成功返回更新后的技能且持久化', async () => {
    const fs = makeFs({
      [`${sources.userSkillsDir}/odd/SKILL.md`]: '---\nname: odd\ndescription: 奇怪\n---',
    });
    const store = new MemoryStore();
    const res = await buildApp(fs, store).request('/api/skills/odd/function', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionCategory: 'data' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skill.functionCategory).toBe('data');
    expect(body.skill.functionSource).toBe('manual');
    expect(store.data.odd).toBe('data');

    // 再查列表，覆盖仍然生效
    const list = await buildApp(fs, store).request('/api/skills');
    const listed = (await list.json()).items[0];
    expect(listed.functionCategory).toBe('data');
  });

  it('非法 functionCategory 返回 400', async () => {
    const fs = makeFs({ [`${sources.userSkillsDir}/odd/SKILL.md`]: '---\nname: odd\n---' });
    const res = await buildApp(fs).request('/api/skills/odd/function', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionCategory: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('技能不存在返回 404', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills/ghost/function', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionCategory: 'data' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/skills/function-batch', () => {
  const files = (): Record<string, string> => ({
    [`${sources.userSkillsDir}/a/SKILL.md`]: '---\nname: a\ndescription: 用途一\n---',
    [`${sources.userSkillsDir}/b/SKILL.md`]: '---\nname: b\ndescription: 用途二\n---',
  });

  it('批量更新成功并持久化', async () => {
    const store = new MemoryStore();
    const res = await buildApp(makeFs(files()), store).request('/api/skills/function-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['a', 'b'], functionCategory: 'data' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toHaveLength(2);
    expect(body.missing).toEqual([]);
    expect(body.updated.every((s: { functionSource: string }) => s.functionSource === 'manual')).toBe(true);
    expect(store.data.a).toBe('data');
    expect(store.data.b).toBe('data');
  });

  it('部分 id 已不存在时返回 updated 与 missing', async () => {
    const res = await buildApp(makeFs(files())).request('/api/skills/function-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['a', 'ghost'], functionCategory: 'writing' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated.map((s: { id: string }) => s.id)).toEqual(['a']);
    expect(body.missing).toEqual(['ghost']);
  });

  it('非法 functionCategory 返回 400', async () => {
    const res = await buildApp(makeFs(files())).request('/api/skills/function-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['a'], functionCategory: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  it('ids 缺失或非数组返回 400', async () => {
    const res = await buildApp(makeFs(files())).request('/api/skills/function-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'a', functionCategory: 'data' }),
    });
    expect(res.status).toBe(400);

    const empty = await buildApp(makeFs(files())).request('/api/skills/function-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [], functionCategory: 'data' }),
    });
    expect(empty.status).toBe(400);
  });
});

describe('GET /api/skills/:id', () => {
  it('200 返回技能元信息与 SKILL.md 原文', async () => {
    const raw = '---\nname: pdf\ndescription: pdf 文档处理\n---\n# pdf\n正文';
    const fs = makeFs({ [`${sources.userSkillsDir}/pdf/SKILL.md`]: raw });
    const res = await buildApp(fs).request('/api/skills/pdf');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skill.id).toBe('pdf');
    expect(body.rawContent).toBe(raw);
  });

  it('技能不存在返回 404', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills/ghost');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/skills 新建保险箱技能', () => {
  const headers = { 'Content-Type': 'application/json' };

  it('201 创建成功：frontmatter 落盘且列表立即可见', async () => {
    const fs = makeFs({});
    const res = await buildApp(fs).request('/api/skills', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '周报助手', description: '生成中文周报', content: '# 周报' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.skill.origin).toBe('vault');
    expect(body.skill.id).toBe('周报助手');
    expect(fs.files['/hub/skills/周报助手/SKILL.md']).toContain('description: 生成中文周报');

    const list = await buildApp(fs).request('/api/skills');
    expect((await list.json()).countByOrigin.vault).toBe(1);
  });

  it('重名（跨来源、大小写不敏感）返回 400', async () => {
    const fs = makeFs({ [`${sources.userSkillsDir}/pdf/SKILL.md`]: '---\nname: pdf\ndescription: 已存在\n---' });
    const res = await buildApp(fs).request('/api/skills', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'PDF', content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('非法名称返回 400', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'a/b', content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('请求体非 JSON 或缺 name 返回 400', async () => {
    const app = buildApp(makeFs({}));
    const res1 = await app.request('/api/skills', { method: 'POST', headers, body: 'not-json' });
    expect(res1.status).toBe(400);
    const res2 = await app.request('/api/skills', { method: 'POST', headers, body: JSON.stringify({ content: '' }) });
    expect(res2.status).toBe(400);
  });
});

describe('PUT /api/skills/:id 编辑保险箱技能', () => {
  const headers = { 'Content-Type': 'application/json' };

  function seed(): MemoryWriteFs {
    return makeFs({ [`${sources.vaultSkillsDir}/note/SKILL.md`]: '---\nname: note\ndescription: 旧\n---\n旧正文' });
  }

  it('200 整文件替换成功', async () => {
    const fs = seed();
    const res = await buildApp(fs).request('/api/skills/note', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '---\nname: note\ndescription: 新\n---\n新正文' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skill.description).toBe('新');
    expect(fs.files[`${sources.vaultSkillsDir}/note/SKILL.md`]).toContain('新正文');
  });

  it('404 技能不存在', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills/ghost', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('400 非保险箱技能拒绝编辑', async () => {
    const fs = makeFs({ [`${sources.userSkillsDir}/mine/SKILL.md`]: '---\nname: mine\ndescription: 个人\n---' });
    const res = await buildApp(fs).request('/api/skills/mine', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 content 缺失或非字符串', async () => {
    const res = await buildApp(seed()).request('/api/skills/note', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ nope: 1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/skills/:id 删除保险箱技能', () => {
  function seed(): MemoryWriteFs {
    return makeFs({ [`${sources.vaultSkillsDir}/note/SKILL.md`]: '---\nname: note\ndescription: 旧\n---' });
  }

  it('200 删除后列表消失', async () => {
    const fs = seed();
    const res = await buildApp(fs).request('/api/skills/note', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(fs.files[`${sources.vaultSkillsDir}/note/SKILL.md`]).toBeUndefined();

    const list = await buildApp(fs).request('/api/skills');
    expect((await list.json()).total).toBe(0);
  });

  it('404 技能不存在', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills/ghost', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('400 非保险箱技能拒绝删除', async () => {
    const fs = makeFs({ [`${sources.userSkillsDir}/mine/SKILL.md`]: '---\nname: mine\ndescription: 个人\n---' });
    const res = await buildApp(fs).request('/api/skills/mine', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/skills/curate 沉淀单个技能', () => {
  const headers = { 'Content-Type': 'application/json' };

  it('201 沉淀成功：返回 vault 条目带 source，保险箱落盘', async () => {
    const marketPath = `${sources.marketplaceSkillsDir}/airbnb/SKILL.md`;
    const fs = makeFs({ [marketPath]: '---\nname: airbnb\ndescription: 旅行预订\n---\n# airbnb 正文' });
    const res = await buildApp(fs).request('/api/skills/curate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'airbnb' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.skill.origin).toBe('vault');
    expect(body.skill.source).toBe(`marketplace:${marketPath}`);
    expect(fs.files['/hub/skills/airbnb/SKILL.md']).toContain('source: marketplace:');

    const list = await buildApp(fs).request('/api/skills');
    expect((await list.json()).countByOrigin.vault).toBe(1);
  });

  it('201 改名沉淀：目标目录按 name 创建', async () => {
    const fs = makeFs({
      [`${sources.marketplaceSkillsDir}/airbnb/SKILL.md`]: '---\nname: airbnb\ndescription: 旅行\n---正文',
    });
    const res = await buildApp(fs).request('/api/skills/curate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'airbnb', name: 'airbnb-travel' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.skill.name).toBe('airbnb-travel');
    expect(fs.files['/hub/skills/airbnb-travel/SKILL.md']).toBeDefined();
  });

  it('400 源为保险箱技能拒绝沉淀', async () => {
    const fs = makeFs({ [`${sources.vaultSkillsDir}/mine/SKILL.md`]: '---\nname: mine\ndescription: 自建\n---' });
    const res = await buildApp(fs).request('/api/skills/curate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'mine' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 源技能不存在', async () => {
    const res = await buildApp(makeFs({})).request('/api/skills/curate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'ghost' }),
    });
    expect(res.status).toBe(404);
  });

  it('400 同名冲突', async () => {
    const fs = makeFs({
      [`${sources.marketplaceSkillsDir}/airbnb/SKILL.md`]: '---\nname: airbnb\ndescription: 旅行\n---',
      [`${sources.userSkillsDir}/pdf/SKILL.md`]: '---\nname: pdf\ndescription: 已有\n---',
    });
    const res = await buildApp(fs).request('/api/skills/curate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'airbnb', name: 'pdf' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 缺 id 或请求体非 JSON', async () => {
    const app = buildApp(makeFs({}));
    const res1 = await app.request('/api/skills/curate', { method: 'POST', headers, body: 'not-json' });
    expect(res1.status).toBe(400);
    const res2 = await app.request('/api/skills/curate', { method: 'POST', headers, body: JSON.stringify({ name: 'x' }) });
    expect(res2.status).toBe(400);
  });
});

describe('POST /api/skills/curate-batch 批量沉淀', () => {
  const headers = { 'Content-Type': 'application/json' };

  it('200 部分成功：created 与 failed 分开返回', async () => {
    const fs = makeFs({
      [`${sources.marketplaceSkillsDir}/airbnb/SKILL.md`]: '---\nname: airbnb\ndescription: 旅行\n---正文a',
      [`${sources.vaultSkillsDir}/mine/SKILL.md`]: '---\nname: mine\ndescription: 自建\n---正文b',
    });
    const res = await buildApp(fs).request('/api/skills/curate-batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: ['airbnb', 'mine', 'ghost'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(1);
    expect(body.created[0].name).toBe('airbnb');
    expect(body.created[0].source).toContain('marketplace:');
    expect(body.failed.map((f: { id: string }) => f.id).sort()).toEqual(['ghost', 'mine']);
    expect(fs.files['/hub/skills/airbnb/SKILL.md']).toBeDefined();
  });

  it('400 ids 为空或非数组', async () => {
    const app = buildApp(makeFs({}));
    const res1 = await app.request('/api/skills/curate-batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: [] }),
    });
    expect(res1.status).toBe(400);
    const res2 = await app.request('/api/skills/curate-batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: 'airbnb' }),
    });
    expect(res2.status).toBe(400);
  });
});
