/**
 * 分发状态判定（只读，逐资产）
 *
 * spec: asset-distribution-truth（判定规则优先级 1-8）
 *
 * 把适配器声明的映射关系（resolveHubItems）转成覆盖面，再对单个资产
 * 按优先级判定状态。算不出来时返回 null（省略条目），绝不伪造成「未分发」。
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, normalize } from 'node:path';
import type { ToolAdapter } from './adapters/base.js';
import type { HubConfig } from './config.js';

/** 分发状态闭集（与 src/core/assets.ts 的 SyncStatus 一致，禁止扩张） */
export type DistributionStatus = 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed';

/** 单资产在单工具中的分发信息 */
export interface AssetDistributionInfo {
  toolId: string;
  toolName: string;
  status: DistributionStatus;
  targetPath?: string;
  detail?: string;
}

/** 项目级工具摘要（不进单资产索引，proposal D3） */
export interface ProjectToolInfo {
  toolId: string;
  toolName: string;
  /** 已接入项目数（0 表示尚未配置项目） */
  projectCount: number;
}

/** 参与索引的工具 */
export interface DistributionToolInput {
  adapter: ToolAdapter;
  enabled: boolean;
}

/** 参与索引的资产（来自 assets 层） */
export interface DistributionAssetInput {
  id: string;
  hubPath: string;
  category: string;
}

/** 聚合文件策略的目标文件名（内容里出现 Hub 相对路径才算已同步） */
const AGGREGATE_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);
/** 会被聚合进 AGENTS.md / CLAUDE.md 的类别 */
const AGGREGATED_CATEGORIES = new Set(['identity', 'rule', 'preference']);

interface DirMapping {
  hubDir: string;
  hubAbs: string;
  targetPath: string;
}
interface FileMapping {
  hubRel: string;
  hubAbs: string;
  targetPath: string;
}
interface AggregateMapping {
  targetPath: string;
}
type ToolState = 'active' | 'not_enabled' | 'not_installed';

/** 某工具的覆盖面：整工具状态 + 目录/文件/聚合三类映射 + 项目数 */
export interface ToolCoverage {
  toolId: string;
  toolName: string;
  state: ToolState;
  dirs: DirMapping[];
  files: FileMapping[];
  aggregates: AggregateMapping[];
  projectCount: number;
}

/** 路径统一为可比较形式（Windows 大小写不敏感） */
function pathKey(path: string): string {
  const normalized = normalize(path).replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** 链接是否指向期望的真实路径 */
function linksTo(linkPath: string, expected: string): boolean {
  try {
    return pathKey(realpathSync(linkPath)) === pathKey(realpathSync(expected));
  } catch {
    return false;
  }
}

function sameContent(a: string, b: string): boolean {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

/** 文件系统探针：默认走 node:fs；测试可注入，避免受 Windows symlink 权限影响 */
export interface FsProbe {
  exists(path: string): boolean;
  isSymlink(path: string): boolean;
  linksTo(linkPath: string, expected: string): boolean;
  sameContent(a: string, b: string): boolean;
  readText(path: string): string | null;
}

/** 真实文件系统探针 */
export const nodeFsProbe: FsProbe = {
  exists: (path) => existsSync(path),
  isSymlink: (path) => isSymlink(path),
  linksTo: (linkPath, expected) => linksTo(linkPath, expected),
  sameContent: (a, b) => sameContent(a, b),
  readText: (path) => {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return null;
    }
  },
};

/** 规则 5/7/8：单文件映射 */
export function fileStatus(mapping: FileMapping, probe: FsProbe = nodeFsProbe): DistributionStatus {
  if (!probe.exists(mapping.targetPath)) return 'pending';
  if (probe.isSymlink(mapping.targetPath)) {
    return probe.linksTo(mapping.targetPath, mapping.hubAbs) ? 'synced' : 'conflict';
  }
  return probe.sameContent(mapping.targetPath, mapping.hubAbs) ? 'synced' : 'conflict';
}

/** 规则 4/7/8：目录映射（逐资产落到目录内相对路径） */
export function dirStatus(
  mapping: DirMapping,
  relInDir: string,
  probe: FsProbe = nodeFsProbe,
): DistributionStatus {
  if (!probe.exists(mapping.targetPath)) return 'pending';
  // 整个目录已是链接：指向 Hub 目录即全目录同步
  if (probe.isSymlink(mapping.targetPath)) {
    return probe.linksTo(mapping.targetPath, mapping.hubAbs) ? 'synced' : 'conflict';
  }
  const targetFile = join(mapping.targetPath, relInDir);
  if (!probe.exists(targetFile)) return 'pending';
  if (probe.isSymlink(targetFile)) {
    return probe.linksTo(targetFile, join(mapping.hubAbs, relInDir)) ? 'synced' : 'conflict';
  }
  return probe.sameContent(targetFile, join(mapping.hubAbs, relInDir)) ? 'synced' : 'conflict';
}

/** 规则 6：聚合文件里出现 Hub 相对路径才算同步 */
export function aggregateStatus(
  mapping: AggregateMapping,
  hubRel: string,
  probe: FsProbe = nodeFsProbe,
): DistributionStatus {
  if (!probe.exists(mapping.targetPath)) return 'pending';
  const content = probe.readText(mapping.targetPath);
  return content !== null && content.includes(hubRel) ? 'synced' : 'pending';
}

/** 由适配器声明的映射关系推导某工具的覆盖面（规则 1-3 在此处理） */
export async function buildCoverage(
  tool: DistributionToolInput,
  hubConfig: HubConfig,
  hubRoot: string,
): Promise<ToolCoverage> {
  const coverage: ToolCoverage = {
    toolId: tool.adapter.name,
    toolName: tool.adapter.displayName,
    state: 'active',
    dirs: [],
    files: [],
    aggregates: [],
    projectCount: 0,
  };
  if (!tool.enabled) {
    coverage.state = 'not_enabled';
    return coverage;
  }
  const status = await tool.adapter.detect();
  if (!status.installed) {
    coverage.state = 'not_installed';
    return coverage;
  }

  for (const { item, target } of tool.adapter.resolveHubItems(hubConfig, hubRoot)) {
    // 规则 3：项目级工具不产生单资产条目，只统计项目数
    if (target.strategy === 'per-project') {
      if (basename(target.targetPath) === 'AGENTS.md') coverage.projectCount += 1;
      continue;
    }
    const rel = item.relativePath;
    if (!rel) continue; // 适配器未声明 Hub 侧关联，无法归因
    if (AGGREGATE_FILES.has(basename(rel))) {
      coverage.aggregates.push({ targetPath: target.targetPath });
      continue;
    }
    if (target.isDirectory) {
      coverage.dirs.push({
        hubDir: rel.replace(/\/+$/, ''),
        hubAbs: item.absolutePath,
        targetPath: target.targetPath,
      });
      continue;
    }
    coverage.files.push({ hubRel: rel, hubAbs: item.absolutePath, targetPath: target.targetPath });
  }
  return coverage;
}

/** 单资产在某工具里的状态；null = 该工具不接收此类资产 */
export function statusForAsset(
  coverage: ToolCoverage,
  asset: DistributionAssetInput,
  probe: FsProbe = nodeFsProbe,
): AssetDistributionInfo | null {
  const base = { toolId: coverage.toolId, toolName: coverage.toolName };
  if (coverage.state === 'not_enabled') return { ...base, status: 'not_enabled' };
  if (coverage.state === 'not_installed') return { ...base, status: 'not_installed' };

  const file = coverage.files.find((mapping) => mapping.hubRel === asset.hubPath);
  if (file) {
    return { ...base, status: fileStatus(file, probe), targetPath: file.targetPath };
  }

  const dir = coverage.dirs.find((mapping) => asset.hubPath.startsWith(`${mapping.hubDir}/`));
  if (dir) {
    const relInDir = asset.hubPath.slice(dir.hubDir.length + 1);
    return {
      ...base,
      status: dirStatus(dir, relInDir, probe),
      targetPath: join(dir.targetPath, relInDir),
    };
  }

  const aggregate = coverage.aggregates[0];
  if (aggregate && AGGREGATED_CATEGORIES.has(asset.category)) {
    return {
      ...base,
      status: aggregateStatus(aggregate, asset.hubPath, probe),
      targetPath: aggregate.targetPath,
    };
  }

  // 该工具不接收此类资产：不产生条目，避免被误读为「未分发」
  return null;
}
