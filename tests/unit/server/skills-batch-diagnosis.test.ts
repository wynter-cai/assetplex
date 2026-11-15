/**
 * 技能子集诊断预估与摘要回写测试（refactor-skill-catalog T6 / T7）
 *
 * spec: skill-catalog.spec.md R4 / R5 / R7.3；
 * 断言：不可诊断项逐条给原因、AI 未配置 willCall=0、上限标记、部分成功语义、
 * 哈希由服务端计算（前端回传被忽略）、越界条目拒绝且不整体失败。
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { skillsRouteFactory } from '../../../src/server/routes/skills.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillFs, SkillFunction, SkillSources, SkillOverrideStore } from '../../../src/core/skills-inventory.js';
import {
  computeSkillContentHash,
  type SkillDiagnosisSummary,
  type SkillDiagnosisSummaryStore,
} from '../../../src/core/skill-diagnosis-summary.js';
import type { AiConfigStore } from '../../../src/core/ai-config.js';

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/demo/.trae-cn/skills',
  builtinRoot: '/home/demo/.trae-cn/builtin',
  builtinSkillsDir: '/home/demo/.trae-cn/builtin_skills',
  pluginsRoot: '/home/demo/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/demo/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

const SKILL = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n正文\n`;

const VAULT = `${SOURCES.vaultSkillsDir}/demo-d/SKILL.md`;
const VAULT_B = `${SOURCES.vaultSkillsDir}/demo-e/SKILL.md`;
const USER = `${SOURCES.userSkillsDir}/demo-a/SKILL.md`;

const FILES: Record<string, string> = {
  [VAULT]: SKILL('demo-d', '数据同步'),
  [VAULT_B]: SKILL('demo-e', '文档写作'),
  [USER]: SKILL('demo-a', 'code 开发辅助'),
};

class MemoryFs implements SkillWriteFs {
  files: Record<string, string>;
  constructor(files: Record<string, string>) {
    this.files = { ...files };
  }
  read(p: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.files, p) ? this.files[p] : null;
  }
  listDir(p: string): string[] {
    const names = new Set<string>();
    for (const f of Object.keys(this.files)) {
      if (f.startsWith(`${p}/`)) {
        const seg = f.slice(p.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }
  dirMtime(): string | null {
    return '2026-11-05T00:00:00.000Z';
  }
  exists(p: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.files, p);
  }
  ensureDir(): void {}
  writeFile(p: string, content: string): void {
    this.files[p] = content;
  }
  removeDir(p: string): void {
    for (const key of Object.keys(this.files)) if (key.startsWith(`${p}/`)) delete this.files[key];
  }
}

class MemoryStore implements SkillOverrideStore {
  load(): Record<string, SkillFunction> {
    return {};
  }
  save(): void {}
}

class MemorySummaryStore implements SkillDiagnosisSummaryStore {
  data: Record<string, SkillDiagnosisSummary>;
  constructor(initial: Record<string, SkillDiagnosisSummary> = {}) {
    this.data = initial;
  }
  load(): Record<string, SkillDiagnosisSummary> {
    return { ...this.data };
  }
  save(records: Record<string, SkillDiagnosisSummary>): void {
    this.data = { ...records };
  }
}

const AI_CONFIGURED: AiConfigStore = {
  load: () => ({ baseUrl: 'http://127.0.0.1:9', apiKey: 'demo-key', model: 'demo-model' }),
  save: () => undefined,
};
const AI_EMPTY: AiConfigStore = { load: () => ({}), save: () => undefined };

function summary(content: string, overrides: Partial<SkillDiagnosisSummary> = {}): SkillDiagnosisSummary {
  return {
    hubRelativePath: 'skills/demo-d/SKILL.md',
    contentHash: computeSkillContentHash(content),
    overall: 'needs-attention',
    issueCounts: { high: 0, medium: 2, low: 1 },
    mechanicalOnly: false,
    rulesVersion: '1.0.0',
    model: 'demo-model',
    checkedAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

function buildApp(options: {
  fs?: MemoryFs;
  summaryStore?: MemorySummaryStore;
  aiConfigStore?: AiConfigStore;
} = {}): Hono {
  const fs = options.fs ?? new MemoryFs(FILES);
  const app = new Hono();
  app.route(
    '/api/skills',
    skillsRouteFactory({
      fs,
      writeFs: fs,
      sources: SOURCES,
      store: new MemoryStore(),
      aiConfigStore: options.aiConfigStore ?? AI_CONFIGURED,
      aiCacheStore: { load: () => ({}), save: () => undefined },
      summaryStore: options.summaryStore ?? new MemorySummaryStore(),
    }),
  );
  return app;
}

async function post(app: Hono, path: string, method: string, body: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/skills/diagnose/estimate', () => {
  it('混合选择：可诊断 / 未入库 / 不存在 / 文件缺失逐条给原因（R4.3 / R4.5）', async () => {
    const fs = new MemoryFs(FILES);
    delete fs.files[VAULT_B];
    const store = new MemorySummaryStore({ 'skills/demo-d/SKILL.md': summary(FILES[VAULT]) });
    const app = buildApp({ fs, summaryStore: store });

    const { status, body } = await post(app, '/api/skills/diagnose/estimate', 'POST', {
      ids: ['demo-d', 'demo-e', 'demo-a', 'nope', 'demo-d'],
    });

    expect(status).toBe(200);
    expect(body.total).toBe(4);
    expect(body.diagnosable).toBe(1);
    expect(body.cacheHits).toBe(1);
    expect(body.willCall).toBe(0);
    expect(body.overSelectionLimit).toBe(false);
    expect(body.confirmRequired).toBe(false);
    expect(body.unDiagnosable).toEqual([
      { id: 'demo-e', name: 'demo-e', reason: 'not-found' },
      { id: 'demo-a', name: 'demo-a', reason: 'not-in-library' },
      { id: 'nope', name: 'nope', reason: 'not-found' },
    ]);
    expect(body.targets).toEqual([{ id: 'demo-d', name: 'demo-d', hubRelativePath: 'skills/demo-d/SKILL.md' }]);
  });

  it('未配置 AI：willCall=0、mechanicalOnly=true（R4.5 / R7.3）', async () => {
    const app = buildApp({ aiConfigStore: AI_EMPTY });
    const { body } = await post(app, '/api/skills/diagnose/estimate', 'POST', { ids: ['demo-d'] });
    expect(body.aiConfigured).toBe(false);
    expect(body.mechanicalOnly).toBe(true);
    expect(body.willCall).toBe(0);
    expect(body.cacheHits).toBe(0);
  });

  it('超过选择上限 / 预计调用超阈值时给出标记，不静默截断（R4.6）', async () => {
    const app = buildApp();
    const ids = Array.from({ length: 101 }, (_, index) => `ghost-${index}`);
    const { body } = await post(app, '/api/skills/diagnose/estimate', 'POST', { ids });
    expect(body.total).toBe(101);
    expect(body.overSelectionLimit).toBe(true);
    expect(body.limits).toEqual({ maxSelection: 100, confirmThreshold: 50, maxCalls: 200 });
  });

  it('ids 为空或非数组 → 400', async () => {
    const app = buildApp();
    expect((await post(app, '/api/skills/diagnose/estimate', 'POST', { ids: [] })).status).toBe(400);
    expect((await post(app, '/api/skills/diagnose/estimate', 'POST', {})).status).toBe(400);
  });
});

describe('PUT /api/skills/diagnosis-summary', () => {
  it('服务端按当前正文算哈希写入，前端回传的 contentHash 被忽略（R5.4）', async () => {
    const store = new MemorySummaryStore();
    const app = buildApp({ summaryStore: store });
    const { status, body } = await post(app, '/api/skills/diagnosis-summary', 'PUT', {
      items: [
        {
          id: 'demo-d',
          overall: 'needs-attention',
          issueCounts: { high: 0, medium: 2, low: 1 },
          mechanicalOnly: false,
          rulesVersion: '1.0.0',
          model: 'demo-model',
          checkedAt: '2026-11-15T00:00:00.000Z',
          contentHash: '伪造的哈希',
          hubRelativePath: 'skills/evil/SKILL.md',
        },
      ],
    });

    expect(status).toBe(200);
    expect(body).toEqual({ saved: 1, rejected: [] });
    const saved = store.data['skills/demo-d/SKILL.md'];
    expect(saved?.contentHash).toBe(computeSkillContentHash(FILES[VAULT]));
    expect(saved?.hubRelativePath).toBe('skills/demo-d/SKILL.md');
  });

  it('部分成功：未入库 / 不存在 / 闭集外 overall 进 rejected，其余照常写入（R5.4）', async () => {
    const store = new MemorySummaryStore();
    const app = buildApp({ summaryStore: store });
    const good = {
      overall: 'healthy',
      issueCounts: { high: 0, medium: 0, low: 0 },
      mechanicalOnly: true,
      rulesVersion: '1.0.0',
      model: '',
      checkedAt: '2026-11-15T00:00:00.000Z',
    };
    const { body } = await post(app, '/api/skills/diagnosis-summary', 'PUT', {
      items: [
        { id: 'demo-d', ...good },
        { id: 'demo-a', ...good },
        { id: 'nope', ...good },
        { id: 'demo-e', ...good, overall: '不合法' },
      ],
    });

    expect(body.saved).toBe(1);
    expect(body.rejected).toEqual([
      { id: 'demo-a', reason: 'not-in-library' },
      { id: 'nope', reason: 'not-found' },
      { id: 'demo-e', reason: 'invalid' },
    ]);
  });

  it('写入后目录接口能读到摘要；正文变更后自动过期（R1.3 / R5.4）', async () => {
    const fs = new MemoryFs(FILES);
    const store = new MemorySummaryStore();
    const app = buildApp({ fs, summaryStore: store });
    await post(app, '/api/skills/diagnosis-summary', 'PUT', {
      items: [
        {
          id: 'demo-d',
          overall: 'needs-attention',
          issueCounts: { high: 0, medium: 2, low: 0 },
          mechanicalOnly: false,
          rulesVersion: '1.0.0',
          model: 'demo-model',
          checkedAt: '2026-11-15T00:00:00.000Z',
        },
      ],
    });

    const catalog = await app.request('/api/skills/catalog');
    const catalogBody = (await catalog.json()) as {
      items: Array<{ id: string; diagnosis?: { stale: boolean } }>;
    };
    expect(catalogBody.items.find((item) => item.id === 'demo-d')?.diagnosis?.stale).toBe(false);

    fs.files[VAULT] = `${fs.files[VAULT]}改动\n`;
    const staleCatalog = (await (await app.request('/api/skills/catalog')).json()) as {
      items: Array<{ id: string; diagnosis?: { stale: boolean } }>;
    };
    expect(staleCatalog.items.find((item) => item.id === 'demo-d')?.diagnosis?.stale).toBe(true);
  });

  it('全部被拒时不写存储；items 非数组 → 400', async () => {
    const store = new MemorySummaryStore();
    const app = buildApp({ summaryStore: store });
    const { body } = await post(app, '/api/skills/diagnosis-summary', 'PUT', {
      items: [{ id: 'nope', overall: 'healthy' }],
    });
    expect(body.saved).toBe(0);
    expect(store.data).toEqual({});
    expect((await post(app, '/api/skills/diagnosis-summary', 'PUT', { items: 'x' })).status).toBe(400);
  });
});
