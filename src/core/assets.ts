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
export type AssetCategory = 'identity' | 'skill' | 'rule' | 'mcp';

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

  // 转换为 Asset
  let assets = allFiles.map(({ file, category }) => hubFileToAsset(file, category));

  // 搜索过滤
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    assets = assets.filter((a) => a.name.toLowerCase().includes(q));
  }

  // 按修改时间倒序
  assets.sort((a, b) => new Date(b.lastModifiedAt).getTime() - new Date(a.lastModifiedAt).getTime());

  return { items: assets, total: assets.length };
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

  const asset = hubFileToAsset(file, category);
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
 * 将 HubFileInfo 转换为前端 Asset
 */
function hubFileToAsset(file: HubFileInfo, category: AssetCategory): Asset {
  const name = extractName(file.relativePath, category);
  return {
    id: file.relativePath,
    name,
    category,
    hubPath: file.relativePath,
    source: 'manual', // Phase 1 默认，Phase 2 从导入记录中读取真实来源
    lastModifiedAt: file.modified,
    size: file.size,
    distributions: [], // Phase 1 空数组，Phase 2 连接页实现时填充
  };
}

/**
 * 从相对路径提取资产名称（不含扩展名和目录前缀）
 */
function extractName(relativePath: string, _category: AssetCategory): string {
  // 取最后一段，去掉扩展名
  const basename = relativePath.split('/').pop() ?? relativePath;
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 ? basename.substring(0, dotIndex) : basename;
}
