/**
 * GitHub 发现路由测试（add-github-skill-source K1）
 *
 * fake GithubHttpClient + 内存 fs/store/cache/config 注入，单测不碰网络；
 * 断言错误码映射（400/404/422/500）、非法源串零请求、入库 provenance=github、未配置打标零请求。
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { githubRouteFactory, type GithubRouteDeps } from '../../../src/server/routes/github.js';
import { createGithubCache } from '../../../src/core/github-discover.js';
import type { GithubHttpClient, GithubRawResponse } from '../../../src/core/github-source.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillSources, SkillOverrideStore, SkillFunction } from '../../../src/core/skills-inventory.js';
import type { AiClassifyCacheStore, AiClassifyCacheEntry } from '../../../src/core/skill-ai-cache.js';
import type { AiConfigStore } from '../../../src/core/ai-config.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const SHA = 'deadbeef';
const COMMITS = `${API}/repos/acme/skills/commits/HEAD`;
const TREE = `${API}/repos/acme/skills/git/trees/${SHA}?recursive=1`;
const FOO_MD = '---\nname: foo\ndescription: Foo\n---\n\n正文foo';

class MemoryWriteFs implements SkillWriteFs {
  files = new Map<string, string>();
  read(p: string): string | null {
    return this.files.get(p) ?? null;
  }
  listDir(p: string): string[] {
    const base = p.replace(/\/+$/, '');
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(`${base}/`)) names.add(key.slice(base.length + 1).split('/')[0]);
    }
    return Array.from(names).sort();
  }
  dirMtime(): string | null {
    return null;
  }
  exists(p: string): boolean {
    return this.files.has(p);
  }
  ensureDir(): void {}
  writeFile(p: string, c: string): void {
    this.files.set(p, c);
  }
  removeDir(p: string): void {
    const prefix = `${p.replace(/\/+$/, '')}/`;
    for (const k of [...this.files.keys()]) if (k.startsWith(prefix)) this.files.delete(k);
  }
}

class MemoryOverride implements SkillOverrideStore {
  data: Record<string, SkillFunction> = {};
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(m: Record<string, SkillFunction>): void {
    this.data = { ...m };
  }
}

class MemoryAiCache implements AiClassifyCacheStore {
  data: Record<string, AiClassifyCacheEntry> = {};
  load(): Record<string, AiClassifyCacheEntry> {
    return { ...this.data };
  }
  save(entries: Record<string, AiClassifyCacheEntry>): void {
    this.data = { ...entries };
  }
}

function configStore(config: Partial<AiClassifyConfig> | null): AiConfigStore {
  return {
    load: () => config ?? {},
    save: () => undefined,
  };
}

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/u/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

const treeBody = JSON.stringify({
  tree: [
    { path: 'skills', type: 'tree' },
    { path: 'skills/foo/SKILL.md', type: 'blob', size: 120 },
    { path: 'skills/foo/references/a.md', type: 'blob', size: 30 },
    { path: 'skills/foo/logo.png', type: 'blob', size: 999 },
  ],
  truncated: false,
});

interface ClientOpts {
  commitsStatus?: number;
}
function makeClient(opts: ClientOpts = {}): { client: GithubHttpClient; requests: string[] } {
  const requests: string[] = [];
  const routes: Record<string, GithubRawResponse> = {
    [COMMITS]: { status: opts.commitsStatus ?? 200, headers: {}, text: JSON.stringify({ sha: SHA }) },
    [TREE]: { status: 200, headers: {}, text: treeBody },
    [`${RAW}/acme/skills/${SHA}/skills/foo/SKILL.md`]: { status: 200, headers: {}, text: FOO_MD },
    [`${RAW}/acme/skills/${SHA}/skills/foo/references/a.md`]: { status: 200, headers: {}, text: 'ref A' },
    [`${RAW}/acme/skills/${SHA}/skills/foo/logo.png`]: { status: 200, headers: {}, text: '‰PNG‰' },
  };
  return {
    client: {
      async request(url) {
        requests.push(url);
        return routes[url] ?? { status: 404, headers: {}, text: '{}' };
      },
    },
    requests,
  };
}

function buildApp(overrides: Partial<GithubRouteDeps> = {}): { app: Hono; fs: MemoryWriteFs } {
  const fs = (overrides.writeFs as MemoryWriteFs | undefined) ?? new MemoryWriteFs();
  const deps: GithubRouteDeps = {
    client: overrides.client ?? makeClient().client,
    cache: overrides.cache ?? createGithubCache(),
    writeFs: fs,
    sources: overrides.sources ?? SOURCES,
    store: overrides.store ?? new MemoryOverride(),
    aiCache: overrides.aiCache ?? new MemoryAiCache(),
    aiConfigStore: overrides.aiConfigStore ?? configStore({ baseUrl: 'https://llm.test/v1', apiKey: 'k', model: 'm' }),
    backup: overrides.backup,
    llmClient: overrides.llmClient,
  };
  return { app: githubRouteFactory(deps), fs };
}

async function post(app: Hono, path: string, body: unknown) {
  const res = await app.request(`/api/github${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function mount(app: Hono): Hono {
  const root = new Hono();
  root.route('/api/github', app);
  return root;
}

describe('POST /discover', () => {
  it('合法源串 → 候选清单 + 锁定 SHA', async () => {
    const { app } = buildApp();
    const { status, json } = await post(mount(app), '/discover', { source: 'acme/skills' });
    expect(status).toBe(200);
    expect(json.repo).toBe('acme/skills');
    expect(json.sha).toBe(SHA);
    expect(json.candidates.map((x: { name: string }) => x.name)).toEqual(['foo']);
  });

  it('非法源串 → 400 且零网络请求', async () => {
    const { client, requests } = makeClient();
    const { app } = buildApp({ client });
    const { status } = await post(mount(app), '/discover', { source: 'not-a-repo' });
    expect(status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it('仓库不可公开访问（commits 404）→ 404', async () => {
    const { client } = makeClient({ commitsStatus: 404 });
    const { app } = buildApp({ client });
    const { status } = await post(mount(app), '/discover', { source: 'acme/skills' });
    expect(status).toBe(404);
  });

  it('限额（commits 403 + retry-after）→ 422 含 retryAfterMinutes', async () => {
    const requests: string[] = [];
    const client: GithubHttpClient = {
      async request(url) {
        requests.push(url);
        return { status: 403, headers: { 'retry-after': '120' }, text: '{}' };
      },
    };
    const { app } = buildApp({ client });
    const { status, json } = await post(mount(app), '/discover', { source: 'acme/skills' });
    expect(status).toBe(422);
    expect(json.retryAfterMinutes).toBe(2);
  });
});

describe('POST /preview', () => {
  it('全文预览：正文 + 附属清单（sizeBytes），零落盘', async () => {
    const { app, fs } = buildApp();
    const { status, json } = await post(mount(app), '/preview', { repo: 'acme/skills', sha: SHA, skillPath: 'skills/foo/SKILL.md' });
    expect(status).toBe(200);
    expect(json.name).toBe('foo');
    expect(json.content).toContain('正文foo');
    expect(json.contentTruncated).toBe(false);
    expect(json.supportingFiles.find((f: { path: string }) => f.path === 'skills/foo/logo.png').binary).toBe(true);
    expect(fs.files.size).toBe(0);
  });

  it('候选不存在 → 404', async () => {
    const { app } = buildApp();
    const { status } = await post(mount(app), '/preview', { repo: 'acme/skills', sha: SHA, skillPath: 'skills/ghost/SKILL.md' });
    expect(status).toBe(404);
  });
});

describe('POST /curate', () => {
  it('确认入库：写 vault 整目录，provenance=github，二进制跳过', async () => {
    const { app, fs } = buildApp();
    const { status, json } = await post(mount(app), '/curate', { repo: 'acme/skills', sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] });
    expect(status).toBe(200);
    expect(json.created[0].id).toBe('foo');
    expect(json.created[0].provenance).toBe('github');
    expect(fs.files.has('/hub/skills/foo/SKILL.md')).toBe(true);
    expect(fs.files.has('/hub/skills/foo/references/a.md')).toBe(true);
    expect(fs.files.has('/hub/skills/foo/logo.png')).toBe(false);
    expect(json.suggestDoctor).toBe(true);
  });

  it('items 为空 → 400', async () => {
    const { app } = buildApp();
    const { status } = await post(mount(app), '/curate', { repo: 'acme/skills', sha: SHA, items: [] });
    expect(status).toBe(400);
  });

  it('库内同名默认跳过，不写不改', async () => {
    const fs = new MemoryWriteFs();
    fs.files.set('/hub/skills/foo/SKILL.md', '---\nname: foo\ndescription: 旧\n---\n\n旧内容');
    const { client, requests } = makeClient();
    const { app } = buildApp({ writeFs: fs, client });
    const { status, json } = await post(mount(app), '/curate', { repo: 'acme/skills', sha: SHA, items: [{ skillPath: 'skills/foo/SKILL.md' }] });
    expect(status).toBe(200);
    expect(json.skipped[0].name).toBe('foo');
    expect(json.created).toHaveLength(0);
    expect(fs.files.get('/hub/skills/foo/SKILL.md')).toContain('旧内容');
    expect(requests.some((u) => u.startsWith(RAW))).toBe(false);
  });
});

describe('POST /classify/estimate 与 /classify', () => {
  it('estimate 已配置：willCall=候选数（缓存空）', async () => {
    const { app } = buildApp();
    const { status, json } = await post(mount(app), '/classify/estimate', { repo: 'acme/skills', sha: SHA, skillPaths: ['skills/foo/SKILL.md'] });
    expect(status).toBe(200);
    expect(json).toEqual({ total: 1, cacheHits: 0, willCall: 1, aiConfigured: true });
  });

  it('estimate 未配置：willCall=0 且零请求', async () => {
    const { client, requests } = makeClient();
    const { app } = buildApp({ client, aiConfigStore: configStore(null) });
    const { status, json } = await post(mount(app), '/classify/estimate', { repo: 'acme/skills', sha: SHA, skillPaths: ['skills/foo/SKILL.md'] });
    expect(status).toBe(200);
    expect(json).toEqual({ total: 1, cacheHits: 0, willCall: 0, aiConfigured: false });
    expect(requests.filter((u) => u.startsWith(RAW))).toHaveLength(0);
  });

  it('classify 打标：注入 fake llm → coding', async () => {
    const llmClient = { chat: async () => '{"category":"coding"}' };
    const { app } = buildApp({ llmClient });
    const { status, json } = await post(mount(app), '/classify', { repo: 'acme/skills', sha: SHA, skillPaths: ['skills/foo/SKILL.md'] });
    expect(status).toBe(200);
    expect(json.tags[0].function).toBe('coding');
    expect(json.called).toBe(1);
  });

  it('classify 未配置 AI → 400', async () => {
    const { app } = buildApp({ aiConfigStore: configStore(null) });
    const { status } = await post(mount(app), '/classify', { repo: 'acme/skills', sha: SHA, skillPaths: ['skills/foo/SKILL.md'] });
    expect(status).toBe(400);
  });
});
