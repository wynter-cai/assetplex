/**
 * 盘点洞察（add-zero-config-onboarding T4）
 *
 * 从现有 scanAll() 的 ToolInventory 聚合三类事实（spec Requirement 3）：
 * - duplicateGroups：同一资产出现在 ≥2 个已安装工具
 * - versionMismatchGroups：重复组内，可比对副本的内容哈希不止一种
 * - coverageGroups：只在部分已安装工具中存在（只陈述事实，不作「应该有」判断）
 *
 * 哈希由调用方注入：文本 sha1(内容)；二进制/超大文件 sha1(size+mtime+前8KB)；
 * 读取失败返回 undefined（不参与版本比对，但仍计入副本与数量）。
 */

import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync, readFileSync, statSync } from 'node:fs';
import { isBinaryFile } from './binary-detect.js';
import type { ToolInventory } from './types.js';
import type { SyncEngine } from './sync-engine.js';

/** 内容哈希读取器：无法读取时返回 undefined */
export type ContentHashReader = (absolutePath: string) => string | undefined;

/** 单个副本（供结果页「查看详情」展开） */
export interface InsightCopy {
  tool: string;
  /** 工具侧绝对路径（本机路径，仅本地展示） */
  path: string;
  size: number;
  modified: string;
  /** 内容哈希前 12 位；无法读取时缺省 */
  contentHash?: string;
}

/** 洞察分组（单条） */
export interface OnboardingInsightGroup {
  category: string;
  /** 人类可读名（目标路径去扩展名） */
  name: string;
  hubTargetPath: string;
  /** 出现该资产的工具（按扫描顺序） */
  tools: string[];
  /** 组内不同哈希数量；缺哈希的副本不参与 */
  distinctVersions: number;
  /** 参与比对的副本数（有哈希的条目数） */
  comparedCopies: number;
  /** 每个副本的落点与版本，供用户展开看清「到底哪里重复了」 */
  copies: InsightCopy[];
}

export interface OnboardingInsights {
  duplicateGroups: OnboardingInsightGroup[];
  versionMismatchGroups: OnboardingInsightGroup[];
  coverageGroups: OnboardingInsightGroup[];
  installedTools: string[];
}

/** 文本默认 256KB 上限：超过按大文件走 head 哈希，避免盘点阶段读爆内存 */
const MAX_TEXT_BYTES = 256 * 1024;

/** Node 默认实现（spec api-contract：文本 sha1(内容)，二进制/超大 sha1(size+mtime+前8KB)） */
export function nodeContentHash(absolutePath: string): string | undefined {
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) return undefined;
    if (stat.size > MAX_TEXT_BYTES || isBinaryFile(absolutePath)) {
      const fd = openSync(absolutePath, 'r');
      try {
        const head = Buffer.alloc(Math.min(8 * 1024, stat.size));
        readSync(fd, head, 0, head.length, 0);
        return sha1(`${stat.size}:${stat.mtimeMs}:${sha1(head)}`);
      } finally {
        closeSync(fd);
      }
    }
    return sha1(readFileSync(absolutePath));
  } catch {
    return undefined;
  }
}

function sha1(data: Buffer | string): string {
  return createHash('sha1').update(data).digest('hex');
}

/** 目标路径去扩展名的可读名（'identity/profile.md' → 'profile'） */
function readableName(hubTargetPath: string): string {
  const base = hubTargetPath.split('/').pop() ?? hubTargetPath;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

interface MutableGroup {
  category: string;
  name: string;
  hubTargetPath: string;
  tools: string[];
  hashes: string[];
  copies: InsightCopy[];
}

/**
 * 聚合洞察。installedTools 只含已安装工具；未安装工具既不计副本也不参与覆盖比较。
 */
export function buildOnboardingInsights(
  inventories: ToolInventory[],
  readHash: ContentHashReader,
): OnboardingInsights {
  const installedTools = inventories.filter((t) => t.installed).map((t) => t.toolName);
  const groups = new Map<string, MutableGroup>();

  for (const inventory of inventories) {
    if (!inventory.installed) continue;
    for (const entry of inventory.items) {
      const copy: InsightCopy = {
        tool: inventory.toolName,
        path: entry.absolutePath,
        size: entry.size,
        modified: entry.modified,
      };
      const existing = groups.get(entry.hubTargetPath);
      if (existing) {
        if (!existing.tools.includes(inventory.toolName)) existing.tools.push(inventory.toolName);
        const hash = readHash(entry.absolutePath);
        if (hash !== undefined) {
          existing.hashes.push(hash);
          copy.contentHash = hash.slice(0, 12);
        }
        existing.copies.push(copy);
        continue;
      }
      const hash = readHash(entry.absolutePath);
      if (hash !== undefined) copy.contentHash = hash.slice(0, 12);
      groups.set(entry.hubTargetPath, {
        category: entry.category,
        name: readableName(entry.hubTargetPath),
        hubTargetPath: entry.hubTargetPath,
        tools: [inventory.toolName],
        hashes: hash !== undefined ? [hash] : [],
        copies: [copy],
      });
    }
  }

  const toGroup = (g: MutableGroup): OnboardingInsightGroup => ({
    category: g.category,
    name: g.name,
    hubTargetPath: g.hubTargetPath,
    tools: g.tools,
    distinctVersions: new Set(g.hashes).size,
    comparedCopies: g.hashes.length,
    copies: g.copies,
  });

  const all = Array.from(groups.values());
  const duplicateGroups = all.filter((g) => g.tools.length >= 2).map(toGroup);
  const versionMismatchGroups = duplicateGroups.filter(
    (g) => g.comparedCopies >= 2 && g.distinctVersions > 1,
  );
  const coverageGroups =
    installedTools.length >= 2
      ? all.filter((g) => g.tools.length < installedTools.length).map(toGroup)
      : [];

  return { duplicateGroups, versionMismatchGroups, coverageGroups, installedTools };
}

/** 扫描响应（insights=1 时才带 insights 键，缺省与旧行为完全一致） */
export interface ScanInventoryResponse {
  inventories: ToolInventory[];
  insights?: OnboardingInsights;
}

/** 组装扫描响应：路由薄壳直接调用，测试用假 engine 注入 */
export async function buildScanInventoryResponse(
  engine: Pick<SyncEngine, 'scanAll'>,
  wantInsights: boolean,
  readHash: ContentHashReader = nodeContentHash,
): Promise<ScanInventoryResponse> {
  const inventories = await engine.scanAll();
  if (!wantInsights) return { inventories };
  return { inventories, insights: buildOnboardingInsights(inventories, readHash) };
}
