/**
 * 技能分类路由测试
 *
 * spec: skills-taxonomy.spec.md（列表、覆盖 PUT、400/404、持久化）
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { skillsRouteFactory } from '../../../src/server/routes/skills.js';
import type { SkillFs, SkillFunction, SkillSources, SkillOverrideStore } from '../../../src/core/skills-inventory.js';

function makeFs(files: Record<string, string>): SkillFs {
  return {
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    listDir: (p) => {
      const names = new Set<string>();
      for (const f of Object.keys(files)) {
        if (f.startsWith(p + '/')) {
          const seg = f.slice(p.length + 1).split('/')[0];
          if (seg) names.add(seg);
        }
      }
      return Array.from(names).sort();
    },
    dirMtime: () => null,
  };
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
  userSkillsDir: '/root/.trae-cn/skills',
  builtinRoot: '/root/.trae-cn/builtin',
  builtinSkillsDir: '/root/.trae-cn/builtin_skills',
  pluginsRoot: '/root/.trae-cn/plugins',
  marketplaceSkillsDir: '/root/.codebuddy/skills-marketplace/skills',
};

function buildApp(fs: SkillFs, store: SkillOverrideStore = new MemoryStore()): Hono {
  const app = new Hono();
  app.route('/api/skills', skillsRouteFactory({ fs, sources, store }));
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
    expect(body.skill.functionOverridden).toBe(true);
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
