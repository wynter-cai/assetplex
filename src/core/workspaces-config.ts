/**
 * 工作区配置与视图类型（纯逻辑）
 *
 * 配置持久化于本机 workspaces.json；GET/PUT /api/workspaces 的契约类型同源于此。
 * 宽容解析（sanitize，读损坏文件用）与严格合并（merge，处理用户请求）分离。
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */

import { MAX_WORKSPACES, normalizePath } from './workspaces.js';

export interface WorkspacesConfig {
  /** 从 TRAE storage.json 自动发现（默认 true） */
  autoDiscover: boolean;
  /** 手动工作区根（工作区本身或其父目录），规范化绝对路径 */
  roots: string[];
  /** 从自动发现中排除的工作区绝对路径 */
  disabledWorkspaces: string[];
}

export const DEFAULT_WORKSPACES_CONFIG: WorkspacesConfig = {
  autoDiscover: true,
  roots: [],
  disabledWorkspaces: [],
};

/** 配置校验错误（路由层映射为 400） */
export class WorkspaceConfigError extends Error {}

export interface WorkspaceInfo {
  /** 工作区绝对路径 */
  path: string;
  /** 工作区目录名（展示用） */
  name: string;
  source: 'auto' | 'manual';
  skillsDirExists: boolean;
  /** .trae/skills 下含 SKILL.md 的有效技能数 */
  skillCount: number;
  /** 被用户禁用：不参与扫描，仅展示以便重新启用 */
  disabled?: boolean;
}

export interface WorkspacesOverview {
  config: WorkspacesConfig;
  workspaces: WorkspaceInfo[];
  truncated: boolean;
  maxWorkspaces: number;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsolutePathString(value: unknown): value is string {
  return typeof value === 'string' && /^([a-z]:[\\/]|\/)/i.test(value);
}

/** 宽容解析字符串数组：非法元素静默丢弃，非数组返回 undefined（回退默认） */
function sanitizePaths(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === 'string')) return undefined;
  return dedupePaths(value.map((item) => normalizePath(item)));
}

/**
 * 去重（保留首次出现）：Windows 盘符路径按大小写不敏感比较，POSIX 路径精确比较。
 */
function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    const key = /^[a-z]:\//.test(path) ? path.toLowerCase() : path;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

/** 宽容解析配置文件内容：字段级容错，整体非法回默认 */
export function sanitizeWorkspacesConfig(raw: unknown): WorkspacesConfig {
  if (!isObject(raw)) return { ...DEFAULT_WORKSPACES_CONFIG };
  const roots = sanitizePaths(raw.roots);
  const disabledWorkspaces = sanitizePaths(raw.disabledWorkspaces);
  return {
    autoDiscover: typeof raw.autoDiscover === 'boolean' ? raw.autoDiscover : true,
    roots: roots ?? [],
    disabledWorkspaces: disabledWorkspaces ?? [],
  };
}

function strictPaths(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new WorkspaceConfigError(`${field} 必须是字符串数组`);
  }
  const normalized = value.map((item) => normalizePath(item));
  for (const path of normalized) {
    if (!isAbsolutePathString(path)) {
      throw new WorkspaceConfigError(`工作区路径必须是绝对路径：${path}`);
    }
  }
  if (normalized.length > MAX_WORKSPACES) {
    throw new WorkspaceConfigError(`工作区数量超过上限 ${MAX_WORKSPACES}`);
  }
  return dedupePaths(normalized);
}

/**
 * 严格合并用户更新（字段可选，缺省保持原值）。
 * @throws WorkspaceConfigError 任意字段非法（此时不应写存储）
 */
export function mergeWorkspacesConfig(
  patch: unknown,
  current: WorkspacesConfig,
): WorkspacesConfig {
  if (!isObject(patch)) throw new WorkspaceConfigError('请求体必须是 JSON 对象');

  const next: WorkspacesConfig = { ...current };
  if (patch.autoDiscover !== undefined) {
    if (typeof patch.autoDiscover !== 'boolean') {
      throw new WorkspaceConfigError('autoDiscover 必须是布尔值');
    }
    next.autoDiscover = patch.autoDiscover;
  }
  if (patch.roots !== undefined) next.roots = strictPaths(patch.roots, 'roots');
  if (patch.disabledWorkspaces !== undefined) {
    next.disabledWorkspaces = strictPaths(patch.disabledWorkspaces, 'disabledWorkspaces');
  }
  return next;
}
