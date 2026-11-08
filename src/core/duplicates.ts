/**
 * 重复治理：确定性分组（add-asset-governance K1）
 *
 * spec: specs/duplicate-governance.spec.md Scenario 1/2/6/7/8
 * 零模型调用：完全重复用归一化哈希，近重复用名称相似度 + 正文 token 集合相似度。
 * 只做分组与保留建议，不写库。
 */

import { createHash } from 'node:crypto';
import type { DoctorAssetKind } from './types.js';
import { contentSimilarity, nameSimilarity } from './text-similarity.js';

export { contentSimilarity, nameSimilarity } from './text-similarity.js';

/** 近重复正文相似度阈值（可在配置中覆盖） */
export const DEFAULT_NEAR_THRESHOLD = 0.85;
/** 灰区下界：低于此值不进入候选 */
export const DEFAULT_GRAY_THRESHOLD = 0.6;
/** 名称相似度门槛：避免"部署"与"回滚"这类不同用途被轻易合并 */
export const NAME_SIMILARITY_THRESHOLD = 0.6;
/** 单页分组上限（Scenario 8） */
export const DEFAULT_MAX_GROUPS = 50;

export interface DuplicateAssetInput {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  name: string;
  description: string;
  content: string;
  lastModified: string;
  /** 来源工具（库内资产通常为 assetplex） */
  sourceTool?: string;
}

export interface DuplicateGroupMember {
  hubRelativePath: string;
  name: string;
  contentLength: number;
  lastModified: string;
  sourceTool?: string;
}

export interface DuplicateGroup {
  id: string;
  kind: 'exact' | 'near' | 'gray';
  assetKind: DoctorAssetKind;
  similarity: number;
  members: DuplicateGroupMember[];
  suggestedKeepPath: string;
  keepReason: string;
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  totalGroups: number;
  groupCount: number;
  mergeableGroupCount: number;
  estimatedReduction: number;
  needsAiJudgement: boolean;
  estimatedAiCalls: number;
  hasMore: boolean;
}

export interface DuplicateScanOptions {
  threshold?: number;
  grayThreshold?: number;
  maxGroups?: number;
}

interface Entry {
  asset: DuplicateAssetInput;
  normalizedContent: string;
  contentTokens: number;
}

/** 正文归一化：去首尾空白、折叠连续空行（Scenario 1 定义） */
export function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim().replace(/\n{3,}/g, '\n\n');
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function contentHash(asset: DuplicateAssetInput): string {
  return createHash('sha256').update(normalizeContent(asset.content)).digest('hex');
}

function identityKey(asset: DuplicateAssetInput): string {
  return `${asset.kind}|${normalizeKey(asset.name)}|${normalizeKey(asset.description)}`;
}

function makeId(kind: string, paths: string[]): string {
  const digest = createHash('sha1').update([...paths].sort().join('|')).digest('hex').slice(0, 10);
  return `dup-${kind}-${digest}`;
}

function suggestKeep(assets: DuplicateAssetInput[]): { path: string; reason: string } {
  const byLength = [...assets].sort((a, b) => normalizeContent(b.content).length - normalizeContent(a.content).length);
  const longest = normalizeContent(byLength[0]?.content ?? '').length;
  const sameLength = byLength.filter((a) => normalizeContent(a.content).length === longest);
  if (sameLength.length === 1 && byLength[0] !== undefined) {
    return { path: byLength[0].hubRelativePath, reason: `正文最完整（${longest} 字符）` };
  }
  const byRecent = [...sameLength].sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified));
  const newest = byRecent[0];
  if (newest === undefined) return { path: assets[0]?.hubRelativePath ?? '', reason: '正文最完整' };
  const newestTime = Date.parse(newest.lastModified);
  const newestCount = sameLength.filter((a) => Date.parse(a.lastModified) === newestTime).length;
  if (newestCount === 1) {
    return { path: newest.hubRelativePath, reason: `正文等长，最近修改（${newest.lastModified}）` };
  }
  const byPath = [...sameLength].sort((a, b) => a.hubRelativePath.localeCompare(b.hubRelativePath));
  const first = byPath[0];
  return { path: first?.hubRelativePath ?? '', reason: '正文与修改时间相同，保留路径排序靠前者' };
}

function toMember(asset: DuplicateAssetInput): DuplicateGroupMember {
  return {
    hubRelativePath: asset.hubRelativePath,
    name: asset.name,
    contentLength: asset.content.length,
    lastModified: asset.lastModified,
    ...(asset.sourceTool === undefined ? {} : { sourceTool: asset.sourceTool }),
  };
}

function averageSimilarity(members: DuplicateAssetInput[], fallback: number): number {
  if (members.length < 2) return fallback;
  let total = 0;
  let count = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      total += contentSimilarity(members[i]?.content ?? '', members[j]?.content ?? '');
      count += 1;
    }
  }
  return count === 0 ? fallback : Math.round((total / count) * 1000) / 1000;
}

/** 确定性分组入口 */
export function groupDuplicates(
  assets: DuplicateAssetInput[],
  options: DuplicateScanOptions = {},
): DuplicateScanResult {
  const threshold = options.threshold ?? DEFAULT_NEAR_THRESHOLD;
  const grayThreshold = options.grayThreshold ?? DEFAULT_GRAY_THRESHOLD;
  const maxGroups = options.maxGroups ?? DEFAULT_MAX_GROUPS;

  const entries = assets.map((asset): Entry => ({
    asset,
    normalizedContent: normalizeContent(asset.content),
    contentTokens: normalizeContent(asset.content).length,
  }));

  const assigned = new Set<string>();
  const groups: Array<{ kind: 'exact' | 'near' | 'gray'; assetKind: DoctorAssetKind; members: DuplicateAssetInput[]; similarity: number }> = [];

  const bucketize = (keyOf: (entry: Entry) => string, kindLabel: 'exact'): void => {
    const buckets = new Map<string, DuplicateAssetInput[]>();
    for (const entry of entries) {
      if (assigned.has(entry.asset.hubRelativePath)) continue;
      const key = keyOf(entry);
      const list = buckets.get(key);
      if (list === undefined) buckets.set(key, [entry.asset]);
      else list.push(entry.asset);
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      for (const asset of list) assigned.add(asset.hubRelativePath);
      groups.push({ kind: kindLabel, assetKind: list[0]?.kind ?? 'skill', members: list, similarity: 1 });
    }
  };

  bucketize((entry) => `${entry.asset.kind}|${contentHash(entry.asset)}`, 'exact');
  bucketize((entry) => identityKey(entry.asset), 'exact');

  // 近重复 / 灰区：同类别两两比对，联合成簇
  const parent = new Map<string, string>();
  const find = (path: string): string => {
    let current = path;
    while (parent.get(current) !== undefined && parent.get(current) !== current) {
      current = parent.get(current) ?? current;
    }
    return current;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const remaining = entries.filter((entry) => !assigned.has(entry.asset.hubRelativePath));
  const pairKind = new Map<string, 'near' | 'gray'>();
  const pairSim = new Map<string, number>();
  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const left = remaining[i];
      const right = remaining[j];
      if (left === undefined || right === undefined || left.asset.kind !== right.asset.kind) continue;
      if (nameSimilarity(left.asset.name, right.asset.name) < NAME_SIMILARITY_THRESHOLD) continue;
      const sim = contentSimilarity(left.asset.content, right.asset.content);
      if (sim < grayThreshold) continue;
      const key = [left.asset.hubRelativePath, right.asset.hubRelativePath].sort().join('|');
      pairKind.set(key, sim >= threshold ? 'near' : 'gray');
      pairSim.set(key, sim);
      union(left.asset.hubRelativePath, right.asset.hubRelativePath);
    }
  }

  const clusters = new Map<string, DuplicateAssetInput[]>();
  for (const entry of remaining) {
    const root = find(entry.asset.hubRelativePath);
    const list = clusters.get(root);
    if (list === undefined) clusters.set(root, [entry.asset]);
    else list.push(entry.asset);
  }

  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    let allNear = true;
    const paths = members.map((m) => m.hubRelativePath).sort();
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const key = [paths[i], paths[j]].join('|');
        if (pairKind.get(key) !== 'near') allNear = false;
      }
    }
    const fallback = Math.min(...[...pairSim.values()].filter((v) => v > 0), threshold);
    groups.push({
      kind: allNear ? 'near' : 'gray',
      assetKind: members[0]?.kind ?? 'skill',
      members,
      similarity: averageSimilarity(members, Number.isFinite(fallback) ? fallback : 0),
    });
  }

  const materialized: DuplicateGroup[] = groups.map((group) => {
    const keep = suggestKeep(group.members);
    return {
      id: makeId(group.kind, group.members.map((m) => m.hubRelativePath)),
      kind: group.kind,
      assetKind: group.assetKind,
      similarity: group.similarity,
      members: group.members.map(toMember),
      suggestedKeepPath: keep.path,
      keepReason: keep.reason,
    };
  });

  const severity = (kind: DuplicateGroup['kind']): number => (kind === 'exact' ? 0 : kind === 'near' ? 1 : 2);
  materialized.sort((a, b) => severity(a.kind) - severity(b.kind) || b.members.length - a.members.length);

  const mergeable = materialized.filter((g) => g.kind !== 'gray');
  const gray = materialized.filter((g) => g.kind === 'gray');
  const estimatedReduction = mergeable.reduce((sum, g) => sum + g.members.length - 1, 0);
  const shown = materialized.slice(0, maxGroups);

  return {
    groups: shown,
    totalGroups: materialized.length,
    groupCount: shown.length,
    mergeableGroupCount: mergeable.length,
    estimatedReduction,
    needsAiJudgement: gray.length > 0,
    estimatedAiCalls: gray.length,
    hasMore: materialized.length > maxGroups,
  };
}
