/**
 * GET /api/skills/catalog 路由测试（refactor-skill-catalog T5）
 *
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R2）
 * 覆盖：契约字段齐全、与列表同源（total 一致）、unknown 单列、摘要投影与过期、
 *      局部摘要读失败只降级不 500、新增字段不含本机绝对路径。
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

const SKILL = (name: string, description: string, extra = ''): string =>
  `---\nname: ${name}\ndescription: ${description}${extra}\n---\n# ${name}\n正文\n`;

const VAULT = `${SOURCES.vaultSkillsDir}/demo-d/SKILL.md`;
const USER = `${SOURCES.userSkillsDir}/demo-a/SKILL.md`;
const BUILTIN = `${SOURCES.builtinRoot}/code/default/skills/demo-b/SKILL.md`;
const MARKET = `${SOURCES.marketplaceSkillsDir}/demo-c/SKILL.md`;

const FILES: Record<string, string> = {
  [VAULT]: SKILL('demo-d', '数据同步', '\nsource: marketplace:/x/demo-d/SKILL.md'),
  [USER]: SKILL('demo-a', 'code 开发辅助'),
  [BUILTIN]: SKILL('demo-b', '文档写作'),
  [MARKET]: SKILL('demo-c', '表格数据处理'),
};

const MTIMES: Record<string, string> = {
  [VAULT]: '2026-11-05T00:00:00.000Z',
  [USER]: '2026-11-02T00:00:00.000Z',
  [BUILTIN]: '2026-11-10T00:00:00.000Z',
  [MARKET]: '2026-11-07T00:00:00.000Z',
};

/** 内存可写文件系统（SkillFs + 写方法，并支持注入 mtime） */
class MemoryWriteFs implements SkillWriteFs {
  files: Record<string, string>;
  mtimes: Record<string, string>;

  constructor(files: Record<string, string> = {}, mtimes: Record<string, string> = {}) {
    this.files = files;
    this.mtimes = mtimes;
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

  dirMtime(p: string): string | null {
    return this.mtimes[p] ?? null;
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
    const prefix = `${p}/`;
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
  save(map: Record<string, SkillFunction>): void {
    this.data = { ...map };
  }
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

/** 摘要读失败：模拟存储损坏 / 权限异常 */
class ThrowingSummaryStore implements SkillDiagnosisSummaryStore {
  load(): Record<string, SkillDiagnosisSummary> {
    throw new Error('摘要存储不可读');
  }
  save(): void {
    // 不写入
  }
}

const aiConfigStore: AiConfigStore = {
  load: () => ({ baseUrl: 'http://127.0.0.1:9', apiKey: 'demo-key', model: 'demo-model' }),
  save: () => undefined,
};

function buildApp(summaryStore?: SkillDiagnosisSummaryStore): Hono {
  const fs = new MemoryWriteFs({ ...FILES }, { ...MTIMES });
  const app = new Hono();
  app.route(
    '/api/skills',
    skillsRouteFactory({
      fs,
      writeFs: fs,
      sources: SOURCES,
      store: new MemoryStore(),
      aiConfigStore,
      aiCacheStore: { load: () => ({}), save: () => undefined },
      summaryStore,
    }),
  );
  return app;
}

function summary(overrides: Partial<SkillDiagnosisSummary>): SkillDiagnosisSummary {
  return {
    hubRelativePath: 'skills/demo-a/SKILL.md',
    contentHash: computeSkillContentHash(FILES[USER]),
    overall: 'healthy',
    issueCounts: { high: 0, medium: 0, low: 0 },
    mechanicalOnly: false,
    rulesVersion: 'demo-rules-1',
    model: 'demo-model',
    checkedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/skills/catalog', () => {
  it('200 返回契约字段：三组 + 九类 + 计数 + recent + diagnosis + aiClassify', async () => {
    const res = await buildApp().request('/api/skills/catalog?scope=asset');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.scope).toBe('asset');
    expect(typeof body.generatedAt).toBe('string');
    expect(body.total).toBe(2); // demo-a(自建) + demo-d(库内)
    expect(body.groups.provenance.map((g: { key: string }) => g.key)).toEqual([
      'self',
      'platform',
      'imported',
    ]);
    expect(body.groups.function).toHaveLength(9);
    expect(body.countByProvenanceGroup).toEqual({ self: 1, platform: 0, imported: 1, unknown: 0 });
    expect(body.recent).toHaveLength(2);
    expect(body.diagnosis).toMatchObject({ checked: 0, stale: 0, unchecked: 2 });
    expect(body.aiClassify).toEqual({ aiConfigured: true, pending: 2, cacheHits: 0, needCall: 2 });
    expect(body.partial).toBeUndefined();

    const entry = body.items.find((s: { id: string }) => s.id === 'demo-a');
    expect(entry).toMatchObject({
      provenance: 'self',
      provenanceGroup: 'self',
      provenanceBasis: 'directory',
      functionBasis: 'keyword',
      lastModifiedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(entry.provenanceUncertain).toBeUndefined();
    expect(entry.diagnosis).toBeUndefined();
  });

  it('与 GET /api/skills 同源：同筛选下 total 一致，用途计数排除自身维度', async () => {
    const app = buildApp();
    const list = await (await app.request('/api/skills?scope=asset&function=coding')).json();
    const catalog = await (await app.request('/api/skills/catalog?scope=asset&function=coding')).json();

    expect(catalog.total).toBe(list.total);
    expect(catalog.items).toHaveLength(1);
    const byKey = new Map(catalog.groups.function.map((g: { key: string; count: number }) => [g.key, g.count]));
    expect(byKey.get('coding')).toBe(1);
    expect(byKey.get('data')).toBe(1);
    const functionSum = catalog.groups.function.reduce(
      (acc: number, g: { count: number }) => acc + g.count,
      0,
    );
    expect(functionSum).toBe(catalog.total);
  });

  it('来源三分组之和等于总数，且「来源待确认」有独立计数位', async () => {
    const body = await (await buildApp().request('/api/skills/catalog')).json();

    expect(body.countByProvenanceGroup).toEqual({ self: 1, platform: 1, imported: 2, unknown: 0 });
    const groupSum = body.groups.provenance.reduce(
      (acc: number, g: { count: number }) => acc + g.count,
      0,
    );
    expect(groupSum).toBe(body.total);
  });

  it('诊断摘要投影：未过期带结论，内容变化标 stale 且不计入问题数', async () => {
    const freshStore = new MemorySummaryStore({
      'skills/demo-d/SKILL.md': summary({
        hubRelativePath: 'skills/demo-d/SKILL.md',
        contentHash: computeSkillContentHash(FILES[VAULT]),
      }),
    });
    const freshBody = await (
      await buildApp(freshStore).request('/api/skills/catalog?scope=asset')
    ).json();
    const fresh = freshBody.items.find((s: { id: string }) => s.id === 'demo-d');
    expect(fresh.diagnosis).toEqual({
      overall: 'healthy',
      issueCounts: { high: 0, medium: 0, low: 0 },
      mechanicalOnly: false,
      rulesVersion: 'demo-rules-1',
      model: 'demo-model',
      checkedAt: '2026-11-01T00:00:00.000Z',
      stale: false,
    });
    expect(freshBody.diagnosis).toMatchObject({ checked: 1, stale: 0, unchecked: 1, healthy: 1 });

    const staleStore = new MemorySummaryStore({
      'skills/demo-d/SKILL.md': summary({
        hubRelativePath: 'skills/demo-d/SKILL.md',
        contentHash: 'stale-hash',
        overall: 'at-risk',
        issueCounts: { high: 3, medium: 0, low: 0 },
      }),
    });
    const staleBody = await (
      await buildApp(staleStore).request('/api/skills/catalog?scope=asset')
    ).json();
    const expired = staleBody.items.find((s: { id: string }) => s.id === 'demo-d');
    expect(expired.diagnosis.stale).toBe(true);
    expect(expired.diagnosis.overall).toBe('at-risk');

    expect(staleBody.diagnosis).toMatchObject({
      checked: 0,
      stale: 1,
      unchecked: 1,
      atRisk: 0,
      issues: { high: 0, medium: 0, low: 0 },
    });
  });

  it('摘要存储读失败：200 + partial 标记，列表条目不缺', async () => {
    const res = await buildApp(new ThrowingSummaryStore()).request('/api/skills/catalog?scope=asset');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.partial).toEqual({ diagnosisUnavailable: true });
    expect(body.items).toHaveLength(2);
    expect(body.groups.provenance).toHaveLength(3);
  });

  it('非法筛选参数返回 400（与列表同口径）', async () => {
    const res = await buildApp().request('/api/skills/catalog?provenance=nope');
    expect(res.status).toBe(400);
  });

  it('新增字段不含本机绝对路径（既有 path 字段维持现状）', async () => {
    const body = await (await buildApp().request('/api/skills/catalog?scope=asset')).json();
    const payload = JSON.stringify({
      groups: body.groups,
      recent: body.recent,
      diagnosis: body.diagnosis,
      countByProvenanceGroup: body.countByProvenanceGroup,
    });
    expect(payload).not.toContain('/hub/');
    expect(payload).not.toContain('/home/demo');
    expect(body.recent[0]).not.toHaveProperty('path');
  });
});

describe('GET /api/skills 的最近更新字段（T2 验收）', () => {
  it('条目新增 lastModifiedAt，旧字段保持不变', async () => {
    const body = await (await buildApp().request('/api/skills?scope=asset')).json();
    const entry = body.items.find((s: { id: string }) => s.id === 'demo-a');

    expect(entry.lastModifiedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(entry).toMatchObject({
      id: 'demo-a',
      provenance: 'self',
      inLibrary: false,
      path: USER,
      variants: 0,
      functionSource: 'keyword',
    });
    expect(entry.path).toBe(USER);
  });
});
