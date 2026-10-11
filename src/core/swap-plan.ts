/**
 * swap 预览展开辅助
 *
 * 把 SyncEngine.plan 的 (item, target) 单元展开为文件级预览条目，
 * 并做冲突判定与指纹计算。纯函数，供 core/swap.ts 编排使用。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { HubConfig } from './config.js';
import type { HubItemType, SyncPlanItem, SyncStrategy } from './types.js';
import { getHubRoot } from '../utils/paths.js';
import { extractEnvVars, interpolateEnv } from '../transforms/env-interpolation.js';
import { listFilesRecursive } from './swap-fs.js';
import type { WriteUnit } from './swap-exec.js';
import type {
  CategorySupport,
  SwapCategory,
  SwapCategoryGroup,
  SwapConflictStatus,
  SwapPreview,
  SwapPreviewItem,
} from './swap-types.js';
import { SWAP_CATEGORIES } from './swap-types.js';

/** 类别 → Hub 内目录名(单复数与 hub-files 布局一致) */
export const CATEGORY_HUB_DIR: Record<SwapCategory, string> = {
  identity: 'identity',
  rule: 'rules',
  skill: 'skills',
  mcp: 'mcp',
  memory: 'memory',
  agent: 'agents',
};

/** HubItemType 是否属于切换六类 */
export function asSwapCategory(type: HubItemType): SwapCategory | null {
  return (SWAP_CATEGORIES as readonly string[]).includes(type) ? (type as SwapCategory) : null;
}

/** 把路径统一为 Hub 根相对的 posix 风格 */
export function hubRelativeOf(absPath: string): string {
  return relative(getHubRoot(), absPath).split(sep).join('/');
}

/** 目标策略归一化:hybrid 在预览中按 copy 呈现 */
export function toPreviewStrategy(strategy: SyncStrategy): SwapPreviewItem['strategy'] {
  if (strategy === 'hybrid') return 'copy';
  return strategy;
}

/**
 * 期望落盘内容:源文件若含 ${VAR}，按插值后的结果比对
 * (workbuddy 等适配器 apply 时写的是插值输出，直接比原始源会永远 differs)
 */
export function expectedBuffer(sourcePath: string): Buffer {
  const raw = readFileSync(sourcePath, 'utf-8');
  if (extractEnvVars(raw).length > 0) {
    return Buffer.from(interpolateEnv(raw).output, 'utf-8');
  }
  return Buffer.from(raw, 'utf-8');
}

/** 冲突判定:目标不存在→none；字节一致→exists；不同→differs */
export function computeConflict(sourcePath: string, targetPath: string): SwapConflictStatus {
  if (!existsSync(targetPath)) return 'none';
  try {
    return readFileSync(targetPath).equals(expectedBuffer(sourcePath)) ? 'exists' : 'differs';
  } catch {
    // 目标是目录或不可读:保守判 differs(需显式确认覆盖)
    return 'differs';
  }
}

/** 深拷贝配置并强制目标工具 enabled，使 SyncEngine.plan 不因未启用而短路 */
export function configWithToolEnabled(config: HubConfig, tool: string): HubConfig {
  const tools = { ...(config.tools as unknown as Record<string, Record<string, unknown>>) };
  tools[tool] = { ...(tools[tool] ?? {}), enabled: true };
  return { ...config, tools: tools as unknown as HubConfig['tools'] };
}

/** 把一个计划项(文件或目录)展开为文件级条目 */
export function expandPlanItem(
  planItem: SyncPlanItem,
  category: SwapCategory,
  support: CategorySupport,
): WriteUnit['entries'] {
  const { item, target } = planItem;
  const out: WriteUnit['entries'] = [];

  const makePreview = (hubRelativePath: string, sourcePath: string, targetPath: string): SwapPreviewItem => {
    const conflict = computeConflict(sourcePath, targetPath);
    return {
      category,
      hubRelativePath,
      targetPath,
      strategy: toPreviewStrategy(target.strategy),
      conflict,
      defaultOverwrite: conflict !== 'differs',
      support,
    };
  };

  if (target.isDirectory) {
    if (!existsSync(item.absolutePath)) return out;
    for (const file of listFilesRecursive(item.absolutePath)) {
      const targetPath = join(target.targetPath, relative(item.absolutePath, file));
      out.push({ preview: makePreview(hubRelativeOf(file), file, targetPath), sourcePath: file });
    }
    return out;
  }

  if (!existsSync(item.absolutePath)) return out;
  out.push({
    preview: makePreview(hubRelativeOf(item.absolutePath), item.absolutePath, target.targetPath),
    sourcePath: item.absolutePath,
  });
  return out;
}

/** 预览指纹:路径集合+冲突状态，任一变即视为过期 */
export function fingerprintOf(preview: SwapPreview): string {
  return JSON.stringify(
    preview.groups.map((g) => ({
      c: g.category,
      s: g.support.supported,
      i: g.items.map((p) => [p.hubRelativePath, p.targetPath, p.conflict]),
    })),
  );
}

/** 不支持类别的分组占位:整组标 skip，库内文件数计入 skipped */
export function unsupportedGroup(category: SwapCategory, fileCount: number): SwapCategoryGroup {
  const support: CategorySupport = { supported: false, reason: `此工具不支持${category}类别，已跳过` };
  return {
    category,
    support,
    items: [],
    counts: { total: 0, new: 0, willOverwrite: 0, unchanged: 0, skipped: fileCount },
  };
}
