/**
 * 资产查询服务
 *
 * 将 Hub 文件系统中的文件转换为前端所需的 Asset 对象，
 * 支持按类别筛选、关键字搜索。
 *
 * 对应 api-contract: ListAssetsApi, GetAssetApi
 */

import {
  listHubFiles,
  readHubFile,
  HUB_CATEGORIES,
  type HubFileInfo,
  type HubFileCategory,
} from './hub-files.js';

/** 前端资产类别 */
export type AssetCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'memory';

/**
 * 资产类别单一真相清单（taxonomy §六.1：新类别应"加配置"而非散落改代码）。
 * 路由校验/目录映射均从此派生，避免多处 validCategories 漂移。
 */
export const ASSET_CATEGORIES: readonly AssetCategory[] = [
  'identity',
  'skill',
  'rule',
  'mcp',
  'memory',
] as const;

/** 资产来源（Phase 1 统一为 manual，Phase 2 记录真实来源） */
export type AssetSource = 'trae' | 'workbuddy' | 'claude' | 'codex' | 'qoder' | 'manual' | 'merged';

/** 同步状态 */
export type SyncStatus = 'synced' | 'pending' | 'conflict' | 'not_enabled' | 'not_installed';

/** 资产分发状态 */
export interface AssetDistribution {
  toolId: string;
  toolName: string;
  status: SyncStatus;
  toolPath?: string;
  lastSyncedAt?: string;
}

/** Hub 中的资产 */
export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  hubPath: string;
  source: AssetSource;
  lastModifiedAt: string;
  size: number;
  distributions: AssetDistribution[];
}

/** 资产详情（含内容） */
export interface AssetDetail extends Asset {
  content: string;
}

/** 后端目录到前端类别的映射 */
const DIR_TO_CATEGORY: Record<string, AssetCategory> = {
  identity: 'identity',
  skills: 'skill',
  rules: 'rule',
  mcp: 'mcp',
  memory: 'memory',
};

/** 查询参数 */
export interface ListAssetsParams {
  category?: AssetCategory;
  search?: string;
}

/** 查询结果 */
export interface ListAssetsResult {
  items: Asset[];
  total: number;
}

/**
 * 列出 Hub 中的资产
 */
export async function listAssets(params: ListAssetsParams = {}): Promise<ListAssetsResult> {
  const { category, search } = params;

  // 确定要扫描的后端目录
  const categoriesToScan: HubFileCategory[] = category
    ? (() => {
        // 前端类别 → 后端目录名（反向映射）
        const reverse: Record<AssetCategory, HubFileCategory> = {
          identity: 'identity',
          skill: 'skills',
          rule: 'rules',
          mcp: 'mcp',
          memory: 'memory',
        };
        return [reverse[category]];
      })()
    : HUB_CATEGORIES.filter((c) => c in DIR_TO_CATEGORY);

  // 收集所有文件
  const allFiles: Array<{ file: HubFileInfo; category: AssetCategory }> = [];
  for (const hubCat of categoriesToScan) {
    const frontendCat = DIR_TO_CATEGORY[hubCat];
    if (!frontendCat) continue;
    const files = listHubFiles(hubCat);
    for (const f of files) {
      allFiles.push({ file: f, category: frontendCat });
    }
  }

  // 转换为 Asset（只保留入口文件，内部文件与技能子文件不冒充资产）
  const assets: Asset[] = [];
  for (const { file, category } of allFiles) {
    const entry = resolveAssetEntry(file.relativePath, category);
    if (!entry) continue;
    assets.push(hubFileToAsset(file, category, entry.name));
  }

  // 搜索过滤
  const keyword = search?.trim().toLowerCase() ?? '';
  const matched = keyword ? assets.filter((a) => a.name.toLowerCase().includes(keyword)) : assets;

  // 按修改时间倒序
  matched.sort((a, b) => new Date(b.lastModifiedAt).getTime() - new Date(a.lastModifiedAt).getTime());

  return { items: matched, total: matched.length };
}

/**
 * 获取单个资产详情（含内容）
 */
export async function getAsset(hubPath: string): Promise<AssetDetail | null> {
  const fileData = readHubFile(hubPath);
  if (!fileData) return null;

  // 从路径推断类别
  const category = inferCategoryFromPath(hubPath);
  if (!category) return null;

  // 构造一个 HubFileInfo 用于转换
  const file: HubFileInfo = {
    relativePath: hubPath,
    absolutePath: '',
    size: fileData.size,
    modified: fileData.modified,
    isDirectory: false,
  };

  const asset = hubFileToAsset(file, category, resolveAssetEntry(hubPath, category)?.name ?? hubPath);
  return {
    ...asset,
    content: fileData.content,
  };
}

/**
 * 从 Hub 文件路径推断资产类别
 */
function inferCategoryFromPath(hubPath: string): AssetCategory | null {
  const firstSegment = hubPath.split('/')[0];
  return DIR_TO_CATEGORY[firstSegment] ?? null;
}

/**
 * 资产入口文件：一个文件是否算「一项资产」由本函数唯一判定。
 *
 * spec: asset-center-consistency（Scenario 4 技能按名展示 / Scenario 5 内部文件不冒充资产）
 */
export interface AssetEntry {
  /** Hub 内相对路径（即资产 id） */
  hubPath: string;
  /** 展示名：技能取目录名，其余取去扩展名的文件名 */
  name: string;
}

/** `_` / `.` 开头的段一律视为内部文件（_meta.json、_icon、.gitkeep） */
const INTERNAL_SEGMENT = /^[_.]/;

/** 技能入口文件名（大小写不敏感） */
const SKILL_ENTRY_FILE = 'skill.md';

/**
 * 判定 Hub 内相对路径是否为该类别的资产入口文件
 *
 * 返回 null 表示「不是一项资产」：内部文件、技能目录内的子文件均属此列。
 */
export function resolveAssetEntry(relativePath: string, category: AssetCategory): AssetEntry | null {
  const segments = relativePath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  if (segments.some((segment) => INTERNAL_SEGMENT.test(segment))) return null;

  const fileName = segments[segments.length - 1] ?? '';
  if (category === 'skill') return resolveSkillEntry(relativePath, segments, fileName);

  const dot = fileName.lastIndexOf('.');
  return { hubPath: relativePath, name: dot > 0 ? fileName.slice(0, dot) : fileName };
}

/**
 * 技能入口：`skills/<name>/SKILL.md` 算一项，名称取 `<name>`；
 * 兼容历史平铺的 `skills/<name>.md`；目录内其余文件（references/、scripts/、_meta.json）不算资产。
 */
function resolveSkillEntry(
  relativePath: string,
  segments: string[],
  fileName: string,
): AssetEntry | null {
  if (segments.length === 3 && fileName.toLowerCase() === SKILL_ENTRY_FILE) {
    return { hubPath: relativePath, name: segments[1] ?? '' };
  }
  if (segments.length === 2) {
    const dot = fileName.lastIndexOf('.');
    return { hubPath: relativePath, name: dot > 0 ? fileName.slice(0, dot) : fileName };
  }
  return null;
}

/** 将 HubFileInfo 转换为前端 Asset */
function hubFileToAsset(file: HubFileInfo, category: AssetCategory, name: string): Asset {
  return {
    id: file.relativePath,
    name,
    category,
    hubPath: file.relativePath,
    source: 'manual', // Phase 1 默认，Phase 2 从导入记录中读取真实来源
    lastModifiedAt: file.modified,
    size: file.size,
    distributions: [], // 阶段 0 仍为空数组，真实状态改由 GET /api/distributions 提供
  };
}


