/**
 * 诊断规则与忽略清单路由（add-diagnosis-rules T5 / T7）
 *
 * GET    /api/diagnosis/rules   规则清单与计数（治理中心分类页、编写指南共用同一份）
 * POST   /api/diagnosis/ignore  忽略一条 finding（按路径 + 规则 + 内容哈希绑定）
 * DELETE /api/diagnosis/ignore  恢复一条被忽略的 finding
 * GET    /api/diagnosis/ignore  只读清单与过期条数（设置页「管理忽略」）
 *
 * 错误约定（api-contract）：400 参数非法 / contentHash 不一致、403 非库内资产、
 * 404 资产或忽略条目不存在、422 规则集加载失败。规则集是产品承诺，缺失时如实报错。
 */

import { Hono } from 'hono';
import { summarizeRuleSet } from '../../core/diagnosis-rules.js';
import {
  addIgnore,
  countExpiredIgnores,
  hashIgnoredContent,
  removeIgnore,
  sanitizeIgnoredFindings,
  type DiagnosisIgnoreStore,
} from '../../core/diagnosis-ignore.js';
import {
  DOCTOR_ASSET_KINDS,
  type DiagnosisRuleSet,
  type DoctorAssetKind,
  type IgnoredFinding,
} from '../../core/types.js';
import { loadRouteRuleSet } from '../lib/rule-registry.js';
import { isHubInternalPath, nodeRead } from './doctor.js';

export interface DiagnosisRouteDeps {
  /** 规则集：缺省按构建产物 / 仓库定义位置加载；显式 null 表示本轮无规则可用 */
  ruleSet?: DiagnosisRuleSet | null;
  /** 忽略清单存储：缺省 Node 实现（~/.assetplex/diagnosis-ignores.json） */
  ignoreStore?: DiagnosisIgnoreStore;
  /** 资产正文读取（忽略生效判定用）；缺省 Node 实现 */
  fs?: { read(hubRelativePath: string): string | null };
  now?: () => string;
}

/** 类别 → Hub 目录前缀（GET /ignore?kind= 过滤用） */
const KIND_HUB_PREFIX: Record<DoctorAssetKind, string> = {
  identity: 'identity/',
  skill: 'skills/',
  rule: 'rules/',
  agent: 'agents/',
  command: 'commands/',
  memory: 'memory/',
};

function isKind(raw: unknown): raw is DoctorAssetKind {
  return typeof raw === 'string' && (DOCTOR_ASSET_KINDS as readonly string[]).includes(raw);
}

interface IgnoreInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  ruleId: string;
  /** 可选：前端回传报告时的哈希，用于防止在旧报告上误忽略 */
  contentHash?: string;
}

function parseIgnoreBody(body: unknown): { input?: IgnoreInput; error?: string; status?: 400 | 403 } {
  if (typeof body !== 'object' || body === null) return { error: '请求体必须是 JSON 对象', status: 400 };
  const p = body as Record<string, unknown>;
  if (!isKind(p['kind'])) return { error: `kind 必须是 ${DOCTOR_ASSET_KINDS.join('/')}`, status: 400 };
  if (typeof p['hubRelativePath'] !== 'string' || p['hubRelativePath'].trim() === '') {
    return { error: 'hubRelativePath 必须是非空字符串', status: 400 };
  }
  if (typeof p['ruleId'] !== 'string' || p['ruleId'].trim() === '') {
    return { error: 'ruleId 必须是非空字符串', status: 400 };
  }
  if (!isHubInternalPath(p['hubRelativePath'])) {
    return { error: '忽略清单只服务库内资产：hubRelativePath 必须是 Hub 内相对路径', status: 403 };
  }
  const contentHash = typeof p['contentHash'] === 'string' && p['contentHash'].trim() !== '' ? p['contentHash'] : undefined;
  return {
    input: {
      kind: p['kind'],
      hubRelativePath: p['hubRelativePath'],
      ruleId: p['ruleId'],
      ...(contentHash === undefined ? {} : { contentHash }),
    },
  };
}

function parsePathParams(rawPath: string | undefined, rawRuleId: string | undefined):
  | { hubRelativePath: string; ruleId: string }
  | { error: string; status: 400 | 403 } {
  if (rawPath === undefined || rawPath.trim() === '') return { error: 'hubRelativePath 必须是非空字符串', status: 400 };
  if (rawRuleId === undefined || rawRuleId.trim() === '') return { error: 'ruleId 必须是非空字符串', status: 400 };
  if (!isHubInternalPath(rawPath)) {
    return { error: '忽略清单只服务库内资产：hubRelativePath 必须是 Hub 内相对路径', status: 403 };
  }
  return { hubRelativePath: rawPath, ruleId: rawRuleId };
}

export function createDiagnosisRoutes(deps: DiagnosisRouteDeps = {}): Hono {
  const routes = new Hono();
  const registry = loadRouteRuleSet(deps.ruleSet);
  const fs = deps.fs ?? nodeRead;
  const now = deps.now ?? (() => new Date().toISOString());
  const store = deps.ignoreStore;

  const loadItems = (): IgnoredFinding[] => (store === undefined ? [] : sanitizeIgnoredFindings(store.load()));

  routes.get('/rules', (c) => {
    if (registry.error !== null) return c.json({ error: registry.error.message }, 422);
    if (registry.ruleSet === null) {
      return c.json({ error: '规则集未加载：未找到 diagnosis-rules.yaml' }, 422);
    }
    return c.json(summarizeRuleSet(registry.ruleSet));
  });

  routes.post('/ignore', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    const parsed = parseIgnoreBody(body);
    if (parsed.input === undefined) {
      return c.json({ error: parsed.error ?? '请求体不合法' }, parsed.status ?? 400);
    }
    if (registry.error !== null) return c.json({ error: registry.error.message }, 422);
    if (registry.ruleSet === null) {
      return c.json({ error: '规则集未加载：无法校验规则编号' }, 422);
    }
    const input = parsed.input;
    if (!registry.ruleSet.rules.some((rule) => rule.id === input.ruleId)) {
      return c.json({ error: `ruleId「${input.ruleId}」不在规则集内` }, 400);
    }

    const content = fs.read(input.hubRelativePath);
    if (content === null) return c.json({ error: `资产不存在：${input.hubRelativePath}` }, 404);
    const currentHash = hashIgnoredContent(content);
    if (input.contentHash !== undefined && input.contentHash !== currentHash) {
      return c.json({ error: 'contentHash 与当前内容不一致：请重新诊断后再忽略' }, 400);
    }

    const ignored: IgnoredFinding = {
      ruleId: input.ruleId,
      hubRelativePath: input.hubRelativePath,
      contentHash: currentHash,
      ignoredAt: now(),
    };
    store?.save(addIgnore(loadItems(), ignored));
    // 忽略按 ruleId 整条生效：该规则在该资产上的命中全部不再提示，故剩余恒为 0
    return c.json({ ignored, remainingForRule: 0 });
  });

  routes.delete('/ignore', (c) => {
    const parsed = parsePathParams(c.req.query('hubRelativePath'), c.req.query('ruleId'));
    if ('error' in parsed) return c.json({ error: parsed.error }, parsed.status);

    const { items, restored } = removeIgnore(loadItems(), parsed.hubRelativePath, parsed.ruleId);
    if (!restored) {
      return c.json({ error: `忽略条目不存在：${parsed.ruleId} @ ${parsed.hubRelativePath}` }, 404);
    }
    store?.save(items);
    return c.json({ ruleId: parsed.ruleId, hubRelativePath: parsed.hubRelativePath, restored: true });
  });

  routes.get('/ignore', (c) => {
    const rawKind = c.req.query('kind');
    if (rawKind !== undefined && rawKind !== '' && !isKind(rawKind)) {
      return c.json({ error: `kind 必须是 ${DOCTOR_ASSET_KINDS.join('/')}` }, 400);
    }
    const items = loadItems();
    const filtered =
      rawKind === undefined || rawKind === ''
        ? items
        : items.filter((item) => item.hubRelativePath.startsWith(KIND_HUB_PREFIX[rawKind]));
    return c.json({ items: filtered, expired: countExpiredIgnores(filtered, (path) => fs.read(path)) });
  });

  return routes;
}
