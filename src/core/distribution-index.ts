/**
 * 分发状态索引（编排 + 缓存，只读）
 *
 * spec: asset-distribution-truth
 * 关联: fix-trust-and-consistency proposal D1 / D2 / D3
 *
 * 判定细则在 distribution-status.ts；本文件只负责：
 * 遍历工具 → 收集条目 → 单工具失败隔离 → 30 秒缓存与主动失效。
 */

import type { HubConfig } from './config.js';
import {
  buildCoverage,
  nodeFsProbe,
  statusForAsset,
  type AssetDistributionInfo,
  type DistributionAssetInput,
  type DistributionStatus,
  type DistributionToolInput,
  type FsProbe,
  type ProjectToolInfo,
} from './distribution-status.js';

export type {
  AssetDistributionInfo,
  DistributionAssetInput,
  DistributionStatus,
  DistributionToolInput,
  ProjectToolInfo,
};

/** 索引载荷（不含缓存标记） */
export interface DistributionIndexPayload {
  generatedAt: string;
  /** 有工具计算失败或条目降级时为 true */
  partial: boolean;
  failedTools: string[];
  /** key = 资产 id（Hub 相对路径），value = 各工具状态 */
  index: Record<string, AssetDistributionInfo[]>;
  projectTools: ProjectToolInfo[];
}

/** 带缓存标记的响应（GET /api/distributions） */
export interface DistributionIndexResponse extends DistributionIndexPayload {
  cached: boolean;
}

/** 组装索引所需的外部依赖（测试与 server 层注入） */
export interface DistributionIndexDeps {
  tools: DistributionToolInput[];
  hubConfig: HubConfig;
  hubRoot: string;
  assets: DistributionAssetInput[];
  /** 文件系统探针，默认真实 fs（测试可注入以覆盖 symlink 分支） */
  probe?: FsProbe;
}

/** 缓存有效期 */
const CACHE_TTL_MS = 30_000;

/** 计算索引（无缓存，供测试与内部复用） */
export async function buildDistributionIndex(deps: DistributionIndexDeps): Promise<DistributionIndexPayload> {
  const index: Record<string, AssetDistributionInfo[]> = {};
  for (const asset of deps.assets) index[asset.id] = [];

  const failedTools: string[] = [];
  const projectTools: ProjectToolInfo[] = [];

  for (const tool of deps.tools) {
    let coverage;
    try {
      coverage = await buildCoverage(tool, deps.hubConfig, deps.hubRoot);
    } catch {
      // 单工具失败隔离：整体不报 500，记入 failedTools
      failedTools.push(tool.adapter.name);
      continue;
    }
    if (coverage.projectCount > 0) {
      projectTools.push({
        toolId: coverage.toolId,
        toolName: coverage.toolName,
        projectCount: coverage.projectCount,
      });
    }
    for (const asset of deps.assets) {
      let info: AssetDistributionInfo | null;
      try {
        info = statusForAsset(coverage, asset, deps.probe ?? nodeFsProbe);
      } catch {
        continue; // 诚实降级：算不出来就不给条目
      }
      if (!info) continue;
      index[asset.id].push(info);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    partial: failedTools.length > 0,
    failedTools,
    index,
    projectTools,
  };
}

let cache: { at: number; payload: DistributionIndexPayload } | null = null;

/** 失效缓存（sync / swap / doctor apply 成功后调用） */
export function invalidateDistributionIndex(): void {
  cache = null;
}

/**
 * 取索引（默认 30 秒缓存，refresh 强刷）
 *
 * @param loader 依赖加载器：server 层注入真实适配器、配置与资产清单
 */
export async function getDistributionIndex(
  options: { refresh?: boolean } = {},
  loader: () => Promise<DistributionIndexDeps>,
): Promise<DistributionIndexResponse> {
  const now = Date.now();
  if (!options.refresh && cache && now - cache.at < CACHE_TTL_MS) {
    return { ...cache.payload, cached: true };
  }
  const payload = await buildDistributionIndex(await loader());
  cache = { at: now, payload };
  return { ...payload, cached: false };
}

/** 供测试复位缓存（生产由 invalidateDistributionIndex 覆盖） */
export function resetDistributionIndexCache(): void {
  cache = null;
}
