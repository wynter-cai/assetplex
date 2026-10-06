/**
 * 工作区发现纯逻辑
 *
 * 解析 TRAE CN 记录的工作区路径、展开手动根、合并去重、上限保护。
 * 文件系统访问通过注入的 WorkspaceFs，纯逻辑不依赖 Node 与 server。
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */

/** 工作区数量上限：超过后截断，手动配置优先保留 */
export const MAX_WORKSPACES = 100;

export interface WorkspaceFs {
  /** 列直接子条目名（文件与目录混排由 isDirectory 区分）；缺失目录返回空数组 */
  listDir(absolutePath: string): string[];
  /** 路径是否为存在的目录 */
  isDirectory(absolutePath: string): boolean;
  /** 文件或目录是否存在 */
  exists(absolutePath: string): boolean;
  /** 解析真实路径（符号链接/联接归一）；实现可省略，省略时按规范化路径比较 */
  realpath?(absolutePath: string): string;
}

export interface ResolvedWorkspace {
  /** 规范化后的工作区绝对路径（posix 分隔形式） */
  path: string;
  source: 'auto' | 'manual';
}

export interface ResolveWorkspacesInput {
  manualRoots: string[];
  autoPaths: string[];
  disabled: string[];
  fs: WorkspaceFs;
  /** 覆盖默认上限（测试/配置用） */
  maxWorkspaces?: number;
}

export interface ResolveWorkspacesResult {
  dirs: ResolvedWorkspace[];
  truncated: boolean;
  /** 无效或不可访问的手动根（用于向用户提示）；自动路径无效静默丢弃 */
  skipped: string[];
}

// ============ TRAE storage.json 解析 ============

const FILE_URI_PREFIX = 'file:///';

/** 统一为 posix 风格：反斜杠转正斜杠、折叠重复分隔符、去尾部分隔符、盘符小写 */
export function normalizePath(input: string): string {
  let p = input.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
  p = p.replace(/^([A-Za-z]):/, (_m, drive: string) => `${drive.toLowerCase()}:`);
  return p;
}

/** 是否绝对路径（Windows 盘符或 POSIX 根） */
function isAbsolutePath(p: string): boolean {
  return /^([a-z]:\/|\/)/i.test(p);
}

/** file:/// URI → 本机绝对路径；无法解析返回 null */
function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith(FILE_URI_PREFIX)) return null;
  let rest = uri.slice(FILE_URI_PREFIX.length);

  // Windows 盘符：file:///d%3A/... 或 file:///d:/...
  const encodedDrive = /^([A-Za-z])%3[Aa](?:\/(?=.)|$)/.exec(rest);
  const plainDrive = /^([A-Za-z]):(?:\/(?=.)|$)/.exec(rest);
  const driveMatch = encodedDrive ?? plainDrive;
  if (driveMatch) {
    rest = `${driveMatch[1].toLowerCase()}:/${rest.slice(driveMatch[0].length)}`;
  } else {
    rest = `/${rest}`;
  }

  try {
    rest = decodeURIComponent(rest);
  } catch {
    return null;
  }
  const normalized = normalizePath(rest);
  return isAbsolutePath(normalized) ? normalized : null;
}

/** 收集对象中所有字符串型 file URI（含嵌套数组的 folderUri/folder 字段） */
function collectUris(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(FILE_URI_PREFIX)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUris(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key.startsWith(FILE_URI_PREFIX)) out.add(key);
      collectUris(record[key], out);
    }
  }
}

/**
 * 解析 TRAE CN storage.json 文本，提取去重后的工作区绝对路径。
 * 覆盖 backupWorkspaces.folders、windowsState（lastActiveWindow/openedWindows）、
 * profileAssociations.workspaces 三个区段。非法 JSON / 无区段返回空数组。
 */
export function parseTraeStorageJson(content: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];

  const uris = new Set<string>();
  const root = data as Record<string, unknown>;
  collectUris(root.backupWorkspaces, uris);
  collectUris(root.windowsState, uris);
  collectUris(root.profileAssociations, uris);

  const paths = new Set<string>();
  for (const uri of uris) {
    const converted = fileUriToPath(uri);
    if (converted) paths.add(converted);
  }
  return [...paths];
}

// ============ 工作区组装 ============

const TRAE_SKILLS_REL = '.trae/skills';

/** 规范化候选路径并解析真实路径（失败回落规范化路径） */
function canonicalize(path: string, fs: WorkspaceFs): string {
  const normalized = normalizePath(path);
  if (typeof fs.realpath !== 'function') return normalized;
  try {
    return normalizePath(fs.realpath(normalized));
  } catch {
    return normalized;
  }
}

/** 判断目录下是否存在 .trae/skills 子目录 */
function hasTraeSkills(dir: string, fs: WorkspaceFs): boolean {
  return fs.isDirectory(`${dir}/${TRAE_SKILLS_REL}`);
}

/**
 * 展开一个手动根：根本身是工作区时收录；同时一级子目录中含 .trae/skills 的收录。
 * 根不存在/非绝对路径返回 null（计入 skipped）。
 */
function expandManualRoot(
  rawRoot: string,
  fs: WorkspaceFs,
): { dirs: string[] } | { invalid: true } {
  const root = normalizePath(rawRoot);
  if (!isAbsolutePath(root) || !fs.isDirectory(root)) return { invalid: true };

  const dirs: string[] = [];
  if (hasTraeSkills(root, fs)) dirs.push(root);
  for (const child of fs.listDir(root)) {
    const childDir = `${root}/${child}`;
    if (fs.isDirectory(childDir) && hasTraeSkills(childDir, fs)) dirs.push(childDir);
  }
  return { dirs };
}

/**
 * 合并手动根与自动发现的工作区：去重（manual 优先）、禁用过滤、
 * 不可访问路径剔除、数量上限截断（手动优先保留）、稳定排序。
 */
export function resolveWorkspaceDirs(input: ResolveWorkspacesInput): ResolveWorkspacesResult {
  const { manualRoots, autoPaths, disabled, fs } = input;
  const maxWorkspaces = input.maxWorkspaces ?? MAX_WORKSPACES;

  const disabledKeys = new Set(disabled.map((d) => canonicalize(d, fs)));
  const byKey = new Map<string, ResolvedWorkspace>();
  const skipped: string[] = [];

  const add = (rawPath: string, source: 'auto' | 'manual'): void => {
    const normalized = normalizePath(rawPath);
    if (!isAbsolutePath(normalized)) {
      if (source === 'manual') skipped.push(normalized);
      return;
    }
    if (!fs.isDirectory(normalized) || !hasTraeSkills(normalized, fs)) {
      if (source === 'manual') skipped.push(normalized);
      return;
    }
    const key = canonicalize(normalized, fs);
    if (disabledKeys.has(key)) return;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { path: normalized, source });
    } else if (source === 'manual' && current.source === 'auto') {
      // 同一物理目录手动与自动同时命中：手动优先
      byKey.set(key, { path: normalized, source: 'manual' });
    }
  };

  for (const root of manualRoots) {
    const expanded = expandManualRoot(root, fs);
    if ('invalid' in expanded) {
      skipped.push(normalizePath(root));
      continue;
    }
    for (const dir of expanded.dirs) add(dir, 'manual');
  }
  for (const path of autoPaths) add(path, 'auto');

  const sorted = [...byKey.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  return {
    dirs: sorted.slice(0, maxWorkspaces),
    truncated: sorted.length > maxWorkspaces,
    skipped: [...new Set(skipped)].sort(),
  };
}
