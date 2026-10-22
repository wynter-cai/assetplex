/**
 * GitHub 技能发现 API 路由（add-github-skill-source K1）
 *
 * POST /api/github/discover            源串 → 锁 SHA → 候选清单（进程内缓存，零落盘）
 * POST /api/github/preview             全文预览（零落盘，超长截断标注）
 * POST /api/github/curate              确认入库（整目录写 vault，覆盖前备份，部分成功不回滚）
 * POST /api/github/classify/estimate   打标预算披露（未配置 AI：willCall=0 且不发请求）
 * POST /api/github/classify            逐条九职能打标（写内容哈希缓存，失败隔离）
 *
 * 宪法③：发现/预览/打标全程零磁盘写入；仅 curate 写 vault，绝不反向写工具目录。
 * spec: 设计文档/changes/add-github-skill-source/（三 capability + api-contract.ts）
 */

import { Hono, type Context } from 'hono';
import { relative } from 'node:path';
import {
  discoverGithub,
  createGithubCache,
  type GithubCache,
  type GithubHttpClient,
} from '../../core/github-discover.js';
import { previewGithubSkill, curateGithubSkills, type GithubCurateItem } from '../../core/github-curate.js';
import { classifyGithubCandidates, estimateGithubClassification } from '../../core/github-classify.js';
import { loadAiClassifyConfig, type AiConfigStore } from '../../core/ai-config.js';
import type { AiClassifyCacheStore } from '../../core/skill-ai-cache.js';
import type { LlmClient } from '../../core/skill-ai-classification.js';
import type { SkillWriteFs } from '../../core/skill-write.js';
import type { SkillSources, SkillOverrideStore } from '../../core/skills-inventory.js';
import { getHubRoot } from '../../utils/paths.js';
import { backupHubFileForDoctor } from '../../core/doctor-backup.js';
import { nodeSkillWriteFs } from '../lib/node-skill-write-fs.js';
import { nodeSkillOverrideStore } from '../lib/node-skill-override-store.js';
import { nodeAiConfigStore, nodeAiCacheStore } from '../lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../lib/openai-llm-client.js';
import { createGithubHttpClient } from '../lib/github-http-client.js';
import { toGithubErrorResponse } from '../lib/github-error.js';
import { toApiSkill } from '../lib/skill-api.js';
import { defaultSkillSources } from './skills.js';

/** 全文预览正文展示上限（超出截断并标注，避免超大文件直传前端） */
const MAX_PREVIEW_CHARS = 200_000;

export interface GithubRouteDeps {
  client: GithubHttpClient;
  cache: GithubCache;
  writeFs: SkillWriteFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  aiCache: AiClassifyCacheStore;
  aiConfigStore: AiConfigStore;
  /** 缺省按 AI 配置现场构造 OpenAI 兼容客户端，测试注入 mock */
  llmClient?: LlmClient;
  /** 覆盖前备份：缺省接 doctor-backup（Hub 相对路径），测试注入 spy */
  backup?: (absSkillMdPath: string) => string;
}

async function readJson(c: Context): Promise<{ ok: true; data: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, data: await c.req.json() };
  } catch {
    return { ok: false, res: c.json({ error: '请求体必须是 JSON' }, 400) };
  }
}

function errResponse(c: Context, err: unknown): Response {
  const { status, body } = toGithubErrorResponse(err);
  return c.json(body, status as 400 | 404 | 500);
}

export function githubRouteFactory(deps: GithubRouteDeps): Hono {
  const routes = new Hono();
  const { client, cache, writeFs, sources, store, aiCache, aiConfigStore } = deps;

  /** 源串发现 → 候选清单（Scenario 4 非法源串 400 不发网络；限额 422；仓库不可访问 404） */
  routes.post('/discover', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.res;
    const source = (parsed.data as { source?: unknown }).source;
    if (typeof source !== 'string' || source.trim() === '') {
      return c.json({ error: 'source 必须是非空字符串' }, 400);
    }
    const force = (parsed.data as { force?: unknown }).force === true;
    try {
      const result = await discoverGithub(source, { client, cache, force });
      return c.json(result);
    } catch (err) {
      return errResponse(c, err);
    }
  });

  /** 全文预览（零落盘；正文超阈值截断标注，附属清单 sizeBytes + binary） */
  routes.post('/preview', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data as { repo?: unknown; sha?: unknown; skillPath?: unknown };
    if (typeof body.repo !== 'string' || typeof body.sha !== 'string' || typeof body.skillPath !== 'string') {
      return c.json({ error: 'repo、sha、skillPath 必须是字符串' }, 400);
    }
    try {
      const p = await previewGithubSkill({ repo: body.repo, sha: body.sha, skillPath: body.skillPath }, { client, sources, store });
      const truncated = p.content.length > MAX_PREVIEW_CHARS;
      return c.json({
        skillPath: body.skillPath,
        name: p.name,
        description: p.description,
        content: truncated ? p.content.slice(0, MAX_PREVIEW_CHARS) : p.content,
        contentTruncated: truncated,
        supportingFiles: p.supportingFiles.map((f) => ({ path: f.path, sizeBytes: f.size, binary: f.binary })),
      });
    } catch (err) {
      return errResponse(c, err);
    }
  });

  /** 确认入库（唯一落盘端点：写 vault；空 items 400；批量部分成功不回滚） */
  routes.post('/curate', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data as { repo?: unknown; sha?: unknown; items?: unknown };
    if (typeof body.repo !== 'string' || typeof body.sha !== 'string' || !Array.isArray(body.items)) {
      return c.json({ error: 'repo、sha 必须是字符串，items 必须是数组' }, 400);
    }
    const items = body.items as GithubCurateItem[];
    if (items.some((it) => typeof it.skillPath !== 'string')) {
      return c.json({ error: 'items[].skillPath 必须是字符串' }, 400);
    }
    try {
      const r = await curateGithubSkills(
        { repo: body.repo, sha: body.sha, items },
        { fs: writeFs, sources, store, client, backup: deps.backup ?? hubBackup },
      );
      return c.json({
        created: r.created.map(toApiSkill),
        skipped: r.skipped,
        failed: r.failed,
        backupRefs: r.backupRefs,
        suggestDoctor: r.suggestDoctor,
      });
    } catch (err) {
      return errResponse(c, err);
    }
  });

  /** 打标预算披露（读 AI 配置；未配置 willCall=0 且 core 不发请求） */
  routes.post('/classify/estimate', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data as { repo?: unknown; sha?: unknown; skillPaths?: unknown };
    if (typeof body.repo !== 'string' || typeof body.sha !== 'string' || !Array.isArray(body.skillPaths)) {
      return c.json({ error: 'repo、sha 必须是字符串，skillPaths 必须是数组' }, 400);
    }
    const config = loadAiClassifyConfig(aiConfigStore);
    try {
      const estimate = await estimateGithubClassification(
        { repo: body.repo, sha: body.sha, skillPaths: body.skillPaths as string[] },
        { client, cache: aiCache, config },
      );
      return c.json(estimate);
    } catch (err) {
      return errResponse(c, err);
    }
  });

  /** 逐条打标（写内容哈希缓存；未配置 AI 400；失败隔离） */
  routes.post('/classify', async (c) => {
    const parsed = await readJson(c);
    if (!parsed.ok) return parsed.res;
    const body = parsed.data as { repo?: unknown; sha?: unknown; skillPaths?: unknown };
    if (typeof body.repo !== 'string' || typeof body.sha !== 'string' || !Array.isArray(body.skillPaths)) {
      return c.json({ error: 'repo、sha 必须是字符串，skillPaths 必须是数组' }, 400);
    }
    const config = loadAiClassifyConfig(aiConfigStore);
    const llm = deps.llmClient ?? createOpenAiLlmClient(config);
    try {
      const r = await classifyGithubCandidates(
        { repo: body.repo, sha: body.sha, skillPaths: body.skillPaths as string[] },
        { client, cache: aiCache, llm, config },
      );
      return c.json({ tags: r.tags, called: r.called });
    } catch (err) {
      return errResponse(c, err);
    }
  });

  return routes;
}

/** 覆盖备份：绝对 vault 路径转 Hub 相对路径，复用 doctor-backup 备份区（保留 3 次） */
function hubBackup(absSkillMdPath: string): string {
  const rel = relative(getHubRoot(), absSkillMdPath).replace(/\\/g, '/');
  return backupHubFileForDoctor(rel);
}

/** 默认路由（真实 GitHub 客户端 + 进程内缓存 + 写库/备份/打标基建） */
export const githubRoutes = githubRouteFactory({
  client: createGithubHttpClient(),
  cache: createGithubCache(),
  writeFs: nodeSkillWriteFs,
  sources: defaultSkillSources(),
  store: nodeSkillOverrideStore,
  aiCache: nodeAiCacheStore,
  aiConfigStore: nodeAiConfigStore,
});
