/**
 * AI-Coding 项目可视化
 *
 * 主数据源：TRAE workspaceStorage/*\/workspace.json（folder=file URI，mtime=最近访问）；
 * 历史补充：~/.trae-cn/worktrees 目录名。富化 AI 工具标记、资产统计、git 信息。
 * 打开操作仅允许白名单内路径，执行器由服务端注入。
 *
 * spec: specs/projects-page.spec.md
 */

// ============ 类型 ============

export interface ProjectToolMarker {
  tool: string;
  marker: string;
  path: string;
}

export interface ProjectAssetStats {
  rules: number;
  skills: number;
  docs: number;
}

export interface ProjectGitInfo {
  isGitRepo: boolean;
  branch: string | null;
  hasUncommittedChanges: boolean;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  lastAccessedAt: string | null;
  exists: boolean;
  tools: ProjectToolMarker[];
  assetStats: ProjectAssetStats;
  git: ProjectGitInfo;
}

/** TRAE workspaceStorage 解析出的真实项目记录 */
export interface WorkspaceRecord {
  path: string;
  name: string;
  lastAccessedAt: string | null;
  historical?: boolean;
}

/** 文件系统抽象（只读） */
export interface ProjectFs {
  read(absolutePath: string): string | null;
  exists(absolutePath: string): boolean;
  isDirectory(absolutePath: string): boolean;
  listDir(absolutePath: string): string[];
  mtime(absolutePath: string): string | null;
}

/** Git 命令执行抽象：返回 stdout；失败/非仓库返回 null */
export type GitRunner = (cwd: string, args: string[]) => string | null;

export interface ProjectSources {
  workspaceStorageDir: string;
  worktreesDir: string;
}

export interface ListProjectsParams {
  existingOnly?: string;
  search?: string;
}

export interface ListProjectsResult {
  items: ProjectInfo[];
  total: number;
  existingCount: number;
}

export const OPEN_TARGETS = ['explorer', 'terminal', 'ide'] as const;
export type OpenTarget = (typeof OPEN_TARGETS)[number];

// ============ file URI 解码 ============

/** file:///d%3A/demo/X → d:/demo/X（node 在 Windows 上接受正斜杠） */
export function decodeFileUri(uri: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    decoded = uri;
  }
  return decoded.replace(/^file:\/\/\/?/, '');
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/**
 * 由路径生成稳定 ID。
 * 保留所有 Unicode 字母/数字（含中文等非 ASCII 名称），
 * 其余字符（斜杠、空格、标点等）折叠为单个连字符。
 */
function makeId(path: string): string {
  return path
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

// ============ TRAE workspaceStorage ============

/**
 * 解析 workspaceStorage 下所有 workspace.json。
 * 同一真实路径只保留最近访问（mtime 最大）的记录；坏数据跳过。
 */
export function readTraeWorkspaces(fs: ProjectFs, storageDir: string): WorkspaceRecord[] {
  const byPath = new Map<string, WorkspaceRecord>();

  for (const hash of fs.listDir(storageDir)) {
    const file = `${storageDir}/${hash}/workspace.json`;
    const raw = fs.read(file);
    if (raw === null) continue;

    let parsed: { folder?: unknown };
    try {
      parsed = JSON.parse(raw) as { folder?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.folder !== 'string' || !parsed.folder.startsWith('file:')) continue;

    const path = decodeFileUri(parsed.folder);
    if (!path) continue;
    const mtime = fs.mtime(file);

    const existing = byPath.get(path);
    if (!existing || (mtime !== null && (existing.lastAccessedAt === null || mtime > existing.lastAccessedAt))) {
      byPath.set(path, { path, name: basename(path), lastAccessedAt: mtime });
    }
  }

  return Array.from(byPath.values());
}

// ============ worktrees 历史补充 ============

/**
 * 合并 workspace 真实记录与 worktrees 历史名称。
 * 名称与真实项目同名（忽略大小写）的 worktree 不重复；
 * 无真实路径的名称成为 historical 条目（exists=false）。
 */
export function mergeProjectRecords(
  workspaces: WorkspaceRecord[],
  fs: ProjectFs,
  worktreesDir: string,
): WorkspaceRecord[] {
  const merged: WorkspaceRecord[] = [...workspaces];
  const realNames = new Set(workspaces.map((w) => w.name.toLowerCase()));

  for (const name of fs.listDir(worktreesDir)) {
    if (realNames.has(name.toLowerCase())) continue;
    const dirPath = `${worktreesDir}/${name}`;
    if (!fs.isDirectory(dirPath)) continue;
    merged.push({
      path: name,
      name,
      lastAccessedAt: fs.mtime(dirPath),
      historical: true,
    });
  }
  return merged;
}

// ============ AI 工具标记 ============

const TOOL_MARKER_FILES: Array<{ name: string; tool: string; kind: 'dir' | 'file'; label: string }> = [
  { name: '.trae', tool: 'trae', kind: 'dir', label: '.trae 目录' },
  { name: '.claude', tool: 'claude', kind: 'dir', label: '.claude 目录' },
  { name: '.codebuddy', tool: 'codebuddy', kind: 'dir', label: '.codebuddy 目录' },
  { name: 'AGENTS.md', tool: 'AGENTS.md', kind: 'file', label: 'AGENTS.md 文件' },
  { name: '.cursorrules', tool: 'cursor', kind: 'file', label: '.cursorrules 文件' },
];

/** 只检测项目根层标记；node_modules 等依赖目录天然不参与（不递归） */
export function detectToolMarkers(fs: ProjectFs, projectPath: string): ProjectToolMarker[] {
  const markers: ProjectToolMarker[] = [];
  for (const candidate of TOOL_MARKER_FILES) {
    const full = `${projectPath}/${candidate.name}`;
    const present = candidate.kind === 'dir' ? fs.isDirectory(full) : fs.exists(full);
    if (present) {
      markers.push({ tool: candidate.tool, marker: candidate.label, path: candidate.name });
    }
  }
  return markers;
}

// ============ 资产统计 ============

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.idea', '.vscode']);
const MAX_WALK_DEPTH = 6;

/**
 * 受限深度遍历项目，统计：
 * - rules：rules/ 目录下的 .md
 * - skills：任意 SKILL.md
 * - docs：其余 .md
 * 跳过依赖/构建目录。
 */
export function collectAssetStats(fs: ProjectFs, projectPath: string): ProjectAssetStats {
  const stats: ProjectAssetStats = { rules: 0, skills: 0, docs: 0 };

  const walk = (dir: string, depth: number, underRules: boolean): void => {
    if (depth > MAX_WALK_DEPTH) return;
    for (const entry of fs.listDir(dir)) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      const full = `${dir}/${entry}`;
      if (fs.isDirectory(full)) {
        walk(full, depth + 1, underRules || entry === 'rules');
      } else if (entry.toLowerCase().endsWith('.md')) {
        if (entry === 'SKILL.md') stats.skills += 1;
        else if (underRules) stats.rules += 1;
        else stats.docs += 1;
      }
    }
  };

  walk(projectPath, 0, false);
  return stats;
}

// ============ Git ============

/** 通过注入的 git 执行器读取分支与未提交状态；非仓库返回空信息 */
export function readGitInfo(projectPath: string, runner: GitRunner): ProjectGitInfo {
  const branchRaw = runner(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchRaw === null) {
    return { isGitRepo: false, branch: null, hasUncommittedChanges: false };
  }
  const branch = branchRaw.trim() || null;
  const statusRaw = runner(projectPath, ['status', '--porcelain']);
  const hasUncommittedChanges = statusRaw !== null && statusRaw.trim().length > 0;
  return { isGitRepo: true, branch, hasUncommittedChanges };
}

// ============ 聚合 ============

const EMPTY_STATS: ProjectAssetStats = { rules: 0, skills: 0, docs: 0 };
const EMPTY_GIT: ProjectGitInfo = { isGitRepo: false, branch: null, hasUncommittedChanges: false };

function toProjectInfo(record: WorkspaceRecord, fs: ProjectFs, gitRunner: GitRunner): ProjectInfo {
  const exists = !record.historical && fs.isDirectory(record.path);
  return {
    id: makeId(record.path),
    name: record.name,
    path: record.path,
    lastAccessedAt: record.lastAccessedAt,
    exists,
    tools: exists ? detectToolMarkers(fs, record.path) : [],
    assetStats: exists ? collectAssetStats(fs, record.path) : { ...EMPTY_STATS },
    git: exists ? readGitInfo(record.path, gitRunner) : { ...EMPTY_GIT },
  };
}

export function listProjects(input: {
  fs: ProjectFs;
  sources: ProjectSources;
  gitRunner: GitRunner;
  params?: ListProjectsParams;
}): ListProjectsResult {
  const { fs, sources, gitRunner, params = {} } = input;

  const workspaces = readTraeWorkspaces(fs, sources.workspaceStorageDir);
  const records = mergeProjectRecords(workspaces, fs, sources.worktreesDir);

  let items = records.map((r) => toProjectInfo(r, fs, gitRunner));

  // 最近访问倒序；无访问时间的排最后
  items.sort((a, b) => {
    if (!a.lastAccessedAt) return 1;
    if (!b.lastAccessedAt) return -1;
    return b.lastAccessedAt.localeCompare(a.lastAccessedAt);
  });

  const existingCount = items.filter((p) => p.exists).length;

  if (params.existingOnly === 'true') items = items.filter((p) => p.exists);
  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    items = items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
    );
  }

  return { items, total: records.length, existingCount };
}

// ============ 打开白名单校验 ============

/**
 * 校验打开请求：id 必须在本次扫描清单中、target 合法、目录仍存在。
 * 任何不满足都抛错（路由映射为 400/404），防止任意路径执行。
 */
export function validateOpenRequest(
  id: string,
  target: string,
  scanned: ProjectInfo[],
): { path: string; target: OpenTarget } {
  if (!(OPEN_TARGETS as readonly string[]).includes(target)) {
    throw new Error(`非法 target：${target}，仅支持 ${OPEN_TARGETS.join(' / ')}`);
  }
  const project = scanned.find((p) => p.id === id);
  if (!project) {
    throw new Error(`项目不存在：${id}`);
  }
  if (!project.exists) {
    throw new Error(`项目目录已删除或不在原位置：${project.path}`);
  }
  return { path: project.path, target: target as OpenTarget };
}
