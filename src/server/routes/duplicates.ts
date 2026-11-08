/**
 * 重复治理路由（add-asset-governance K2/K3/K4/K5）
 *
 * POST /api/governance/duplicates/scan        确定性扫描（零模型调用）
 * POST /api/governance/duplicates/merge-draft 合并草案（零写库，灰区需显式勾选）
 * POST /api/governance/duplicates/apply       写保留项（备份）→ 归档其余 → 可选分发
 * POST /api/governance/duplicates/undo        还原归档成员 + 恢复保留项原文
 *
 * spec: 设计文档/changes/add-asset-governance/specs/duplicate-governance.spec.md
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { deleteHubFile, listHubFiles, writeHubFile, type HubFileCategory } from '../../core/hub-files.js';
import { DOCTOR_ASSET_KINDS, type DoctorAssetKind } from '../../core/types.js';
import { groupDuplicates, type DuplicateGroup, type DuplicateScanResult } from '../../core/duplicates.js';
import { buildDuplicateAssets, contentHashOf, type DuplicateSourceAsset } from '../../core/duplicate-scan.js';
import {
  applyDuplicateMerge,
  buildMergeDraft,
  DuplicateMergeError,
  undoDuplicateMerge,
  type DuplicateMergeBatch,
  type DuplicateMergePorts,
  type MergeDraft,
  type MergeDispatchItem,
  type UndoDuplicateMergePorts,
} from '../../core/duplicate-merge.js';
import { backupHubFileForDoctor } from '../../core/doctor-backup.js';
import { invalidateDistributionIndex } from '../../core/distribution-index.js';
import { loadAiClassifyConfig, isAiConfigComplete, type AiConfigStore } from '../../core/ai-config.js';
import { nodeAiConfigStore } from '../lib/node-ai-classify-store.js';
import { nodeApplyPorts } from './doctor-fix.js';
import { isHubInternalPath } from './doctor.js';
import {
  createNodeDuplicateBatchStore,
  isSafeGroupId,
  type DuplicateMergeBatchStore,
} from '../lib/duplicate-batch-store.js';

export interface DuplicateRouteDeps {
  listAssets(kind: DoctorAssetKind): string[];
  read(hubRelativePath: string): string | null;
  lastModified?(hubRelativePath: string): string;
  aiConfigured?: () => boolean;
  aiConfigStore?: AiConfigStore;
  apply?: DuplicateMergePorts;
  undo?: UndoDuplicateMergePorts;
  batchStore?: DuplicateMergeBatchStore;
  invalidate?: () => void;
  now?: () => string;
}

const KIND_TO_HUB_DIR: Record<DoctorAssetKind, HubFileCategory> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

const DEFAULT_LAST_MODIFIED = '1970-01-01T00:00:00.000Z';

function nodeLastModified(hubRelativePath: string): string {
  try {
    if (!isHubInternalPath(hubRelativePath)) return DEFAULT_LAST_MODIFIED;
    const full = resolve(getHubRoot(), hubRelativePath);
    return statSync(full).mtime.toISOString();
  } catch {
    return DEFAULT_LAST_MODIFIED;
  }
}

function nodeArchive(original: string, archived: string): void {
  const root = getHubRoot();
  const from = resolve(root, original);
  const to = resolve(root, archived);
  if (!from.startsWith(root) || !to.startsWith(root)) throw new Error(`路径越界：${original}`);
  if (!existsSync(from)) throw new Error(`文件不存在：${original}`);
  if (existsSync(to)) throw new Error(`归档目标已存在：${archived}`);
  writeHubFile(archived, readFileSync(from, 'utf-8'));
  deleteHubFile(original);
}

function nodeRestoreArchived(archived: string, original: string): void {
  const root = getHubRoot();
  const from = resolve(root, archived);
  const to = resolve(root, original);
  if (!from.startsWith(root) || !to.startsWith(root)) throw new Error(`路径越界：${archived}`);
  if (!existsSync(from)) throw new Error(`归档缺失：${archived}`);
  writeHubFile(original, readFileSync(from, 'utf-8'));
  deleteHubFile(archived);
}

function createNodeApplyPorts(store: DuplicateMergeBatchStore): DuplicateMergePorts {
  return {
    now: () => new Date(),
    read: (hubRelativePath) => nodeApplyPorts.read(hubRelativePath),
    backup: (hubRelativePath) => backupHubFileForDoctor(hubRelativePath),
    write: (hubRelativePath, content) => writeHubFile(hubRelativePath, content),
    archive: (original, archived) => nodeArchive(original, archived),
    distribute: async (hubRelativePath, targets): Promise<MergeDispatchItem[]> => {
      const resolvedTargets =
        targets !== undefined && targets.length > 0
          ? targets
          : await nodeApplyPorts.defaultTargets(hubRelativePath);
      const items: MergeDispatchItem[] = [];
      for (const tool of resolvedTargets) {
        try {
          const item = await nodeApplyPorts.dispatchTool(tool, hubRelativePath);
          items.push({ tool: item.tool, action: item.action, ...(item.reason === undefined ? {} : { reason: item.reason }) });
        } catch (error) {
          items.push({ tool, action: 'failed', reason: error instanceof Error ? error.message : String(error) });
        }
      }
      return items;
    },
    saveBatch: (batch) => store.save(batch),
  };
}

const nodeUndoPorts: UndoDuplicateMergePorts = {
  restoreArchived: (archived, original) => nodeRestoreArchived(archived, original),
  write: (hubRelativePath, content) => writeHubFile(hubRelativePath, content),
};

function batchStoreFor(deps: Partial<DuplicateRouteDeps>): DuplicateMergeBatchStore {
  return deps.batchStore ?? createNodeDuplicateBatchStore();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCategories(raw: unknown): DoctorAssetKind[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const kinds: DoctorAssetKind[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !(DOCTOR_ASSET_KINDS as readonly string[]).includes(item)) return null;
    if (!kinds.includes(item as DoctorAssetKind)) kinds.push(item as DoctorAssetKind);
  }
  return kinds.length === 0 ? null : kinds;
}

function parseTargets(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string')) return null;
  return raw as string[];
}

interface ScanGroupView {
  id: string;
  kind: 'exact' | 'near' | 'gray';
  category: DoctorAssetKind;
  similarity: number;
  members: Array<{
    hubRelativePath: string;
    name: string;
    toolSources: string[];
    bodyLength: number;
    modifiedAt: string;
    contentHash: string;
  }>;
  suggestedKeep: string;
  reason: string;
}

function toGroupView(group: DuplicateGroup, hashes: Map<string, string>): ScanGroupView {
  return {
    id: group.id,
    kind: group.kind,
    category: group.assetKind,
    similarity: group.similarity,
    members: group.members.map((member) => ({
      hubRelativePath: member.hubRelativePath,
      name: member.name,
      toolSources: member.sourceTool === undefined ? [] : [member.sourceTool],
      bodyLength: member.contentLength,
      modifiedAt: member.lastModified,
      contentHash: hashes.get(member.hubRelativePath) ?? '',
    })),
    suggestedKeep: group.suggestedKeepPath,
    reason: group.keepReason,
  };
}

export function createDuplicateRoutes(deps: DuplicateRouteDeps): Hono {
  const routes = new Hono();
  const now = deps.now ?? (() => new Date().toISOString());
  const aiConfigured =
    deps.aiConfigured ??
    (() => isAiConfigComplete(loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore)));

  /** 收集资产正文 → 确定性分组；扫描零模型调用 */
  function scan(categories?: DoctorAssetKind[]): {
    sources: DuplicateSourceAsset[];
    result: DuplicateScanResult;
    hashes: Map<string, string>;
  } {
    const kinds = categories ?? DOCTOR_ASSET_KINDS;
    const sources: DuplicateSourceAsset[] = [];
    for (const kind of kinds) {
      for (const path of deps.listAssets(kind)) {
        const content = deps.read(path);
        if (content === null) continue;
        sources.push({
          kind,
          hubRelativePath: path,
          content,
          lastModified: (deps.lastModified ?? nodeLastModified)(path),
        });
      }
    }
    const assets = buildDuplicateAssets(sources, categories);
    const result = groupDuplicates(assets);
    const hashes = new Map<string, string>();
    for (const source of sources) hashes.set(source.hubRelativePath, contentHashOf(source.content));
    return { sources, result, hashes };
  }

  /** 按 groupId 重新扫描定位组（groupId 由成员路径哈希生成，稳定可复现） */
  function findGroup(
    groupId: string,
    categories?: DoctorAssetKind[],
  ): { group: DuplicateGroup; sources: DuplicateSourceAsset[]; hashes: Map<string, string> } | null {
    const scanned = scan(categories);
    const group = scanned.result.groups.find((item) => item.id === groupId);
    if (group === undefined) return null;
    return { group, sources: scanned.sources, hashes: scanned.hashes };
  }

  function buildDraftFor(
    group: DuplicateGroup,
    sources: DuplicateSourceAsset[],
    keepPath: string,
    mergedContent: string | undefined,
    allowGray: boolean,
  ): MergeDraft {
    const members = group.members.map((member) => {
      const source = sources.find((item) => item.hubRelativePath === member.hubRelativePath);
      if (source === undefined) throw new DuplicateMergeError('EMPTY_MEMBERS', `成员正文不可读：${member.hubRelativePath}`);
      return { hubRelativePath: member.hubRelativePath, content: source.content };
    });
    return buildMergeDraft({
      groupId: group.id,
      groupKind: group.kind,
      keepPath,
      members,
      ...(mergedContent === undefined ? {} : { mergedContent }),
      ...(allowGray ? { allowGray: true } : {}),
    });
  }

  routes.post('/scan', async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    const categories = parseCategories(body.categories);
    if (categories === null) return c.json({ error: 'categories 必须是资产类别数组' }, 400);
    const threshold = body.similarityThreshold;
    if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0.5 || threshold > 1)) {
      return c.json({ error: 'similarityThreshold 必须是 0.5-1 的数字' }, 400);
    }
    if (body.useAiJudgement !== undefined && typeof body.useAiJudgement !== 'boolean') {
      return c.json({ error: 'useAiJudgement 必须是布尔值' }, 400);
    }
    if (body.useAiJudgement === true && !aiConfigured()) {
      return c.json({ error: '未配置 AI 端点：疑难组只能人工判断，请先在设置中配置' }, 503);
    }

    const scanned = scan(categories);
    const groups = scanned.result.groups.map((group) => toGroupView(group, scanned.hashes));
    const grayCount = groups.filter((group) => group.kind === 'gray').length;
    return c.json({
      groups,
      scannedAssets: scanned.sources.length,
      grayCount,
      aiUsed: false,
      estimatedAiCalls: grayCount,
      generatedAt: now(),
    });
  });

  routes.post('/merge-draft', async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    if (typeof body.groupId !== 'string' || !isSafeGroupId(body.groupId)) {
      return c.json({ error: 'groupId 非法' }, 400);
    }
    if (typeof body.keepPath !== 'string' || body.keepPath === '') {
      return c.json({ error: 'keepPath 必须是非空字符串' }, 400);
    }
    const categories = parseCategories(body.categories);
    if (categories === null) return c.json({ error: 'categories 必须是资产类别数组' }, 400);

    const found = findGroup(body.groupId, categories);
    if (found === null) return c.json({ error: '重复分组不存在或已变化，请重新扫描' }, 404);
    try {
      const draft = buildDraftFor(found.group, found.sources, body.keepPath, undefined, body.allowGray === true);
      return c.json({
        groupId: draft.groupId,
        keepPath: draft.keepPath,
        draftContent: draft.content,
        unifiedDiff: draft.unifiedDiff,
        archivePaths: draft.archivePaths,
        cached: false,
        model: '',
      });
    } catch (err) {
      if (err instanceof DuplicateMergeError) {
        return c.json({ error: err.message, code: err.code }, err.code === 'GRAY_REQUIRES_CONFIRM' ? 400 : 422);
      }
      throw err;
    }
  });

  routes.post('/apply', async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    if (typeof body.groupId !== 'string' || !isSafeGroupId(body.groupId)) {
      return c.json({ error: 'groupId 非法' }, 400);
    }
    if (typeof body.keepPath !== 'string' || body.keepPath === '') {
      return c.json({ error: 'keepPath 必须是非空字符串' }, 400);
    }
    if (typeof body.finalContent !== 'string' || body.finalContent === '') {
      return c.json({ error: 'finalContent 必须是非空字符串（以用户确认版本为准）' }, 400);
    }
    if (typeof body.distribute !== 'boolean') {
      return c.json({ error: 'distribute 必须是布尔值（false=只改库不分发）' }, 400);
    }
    const targets = parseTargets(body.targets);
    if (targets === null) return c.json({ error: 'targets 必须是工具名字符串数组' }, 400);
    if (!Array.isArray(body.archiveMembers) || !body.archiveMembers.every((item) => typeof item === 'string')) {
      return c.json({ error: 'archiveMembers 必须是字符串数组' }, 400);
    }
    const categories = parseCategories(body.categories);
    if (categories === null) return c.json({ error: 'categories 必须是资产类别数组' }, 400);

    const found = findGroup(body.groupId, categories);
    if (found === null) return c.json({ error: '重复分组不存在或已变化，请重新扫描' }, 404);
    let draft: MergeDraft;
    try {
      draft = buildDraftFor(found.group, found.sources, body.keepPath, body.finalContent, body.allowGray === true);
    } catch (err) {
      if (err instanceof DuplicateMergeError) return c.json({ error: err.message, code: err.code }, 422);
      throw err;
    }
    const expected = [...draft.archivePaths].sort();
    const provided = [...(body.archiveMembers as string[])].sort();
    if (expected.length !== provided.length || expected.some((path, index) => path !== provided[index])) {
      return c.json({ error: 'archiveMembers 与本次草案的待归档清单不一致，请重新生成草案' }, 400);
    }

    const date = now().slice(0, 10);
    const store = batchStoreFor(deps);
    const ports = deps.apply ?? createNodeApplyPorts(store);
    const result = await applyDuplicateMerge(
      {
        draft,
        batchId: randomUUID(),
        date,
        distribute: body.distribute,
        ...(targets === undefined ? {} : { targets }),
      },
      ports,
    );
    invalidateDistributionIndex();
    deps.invalidate?.();

    return c.json({
      groupId: draft.groupId,
      keepPath: draft.keepPath,
      backupRef: result.keep.backupRef ?? '',
      archived: result.archived.map((item) => ({
        from: item.path,
        to: item.archivePath,
        status: item.ok ? 'archived' : 'failed',
        ...(item.reason === undefined ? {} : { reason: item.reason }),
      })),
      dispatch: result.dispatch,
      rollbackAvailable: result.keep.written && result.archived.some((item) => item.ok),
    });
  });

  routes.post('/undo', async (c) => {
    const body = await readJson(c.req.raw);
    if (body === null) return c.json({ error: '请求体必须是 JSON' }, 400);
    if (typeof body.groupId !== 'string' || !isSafeGroupId(body.groupId)) {
      return c.json({ error: 'groupId 非法' }, 400);
    }
    const batch: DuplicateMergeBatch | null = batchStoreFor(deps).getByGroup(body.groupId);
    if (batch === null) return c.json({ error: '该组没有可还原的合并记录' }, 404);

    const result = undoDuplicateMerge(batch, deps.undo ?? nodeUndoPorts);
    invalidateDistributionIndex();
    deps.invalidate?.();

    return c.json({
      restored: result.archived.filter((item) => item.ok).map((item) => item.path),
      keepRestored: result.keep.ok,
      failures: result.archived
        .filter((item) => !item.ok)
        .map((item) => ({ hubRelativePath: item.path, reason: item.reason ?? '还原失败' })),
    });
  });

  return routes;
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 默认类别枚举（治理路由注入；测试可直接传 listAssets） */
export function defaultListAssets(kind: DoctorAssetKind): string[] {
  return listHubFiles(KIND_TO_HUB_DIR[kind])
    .filter((file) => !file.isDirectory)
    .filter((file) => (kind === 'skill' ? file.relativePath.endsWith('/SKILL.md') : true))
    .map((file) => file.relativePath);
}
