/**
 * 工作区发现的 Node 桥接层
 *
 * - workspaces.json 配置存取（~/.assetplex/，与 ai-config.json 同风格）
 * - TRAE storage.json 自动发现路径读取（不解析 state.vscdb）
 * - 组装工作区总览（技能目录存在性、技能计数、禁用项展示）
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  MAX_WORKSPACES,
  normalizePath,
  parseTraeStorageJson,
  resolveWorkspaceDirs,
  type WorkspaceFs,
} from '../../core/workspaces.js';
import {
  sanitizeWorkspacesConfig,
  type WorkspaceInfo,
  type WorkspacesConfig,
  type WorkspacesOverview,
} from '../../core/workspaces-config.js';
import { expandHome } from '../../utils/paths.js';

export interface WorkspaceConfigStore {
  load(): WorkspacesConfig;
  save(config: WorkspacesConfig): void;
}

/** 解析 Hub 元数据目录下的文件路径：$ASSETPLEX_DIR/<name> */
function resolveAssetplexFile(name: string): string {
  const hubRoot = process.env.ASSETPLEX_DIR ?? '~/.assetplex';
  return resolve(expandHome(hubRoot), name);
}

export function createNodeWorkspacesConfigStore(
  filePath: string = resolveAssetplexFile('workspaces.json'),
): WorkspaceConfigStore {
  return {
    load(): WorkspacesConfig {
      try {
        if (!existsSync(filePath)) return { autoDiscover: true, roots: [], disabledWorkspaces: [] };
        return sanitizeWorkspacesConfig(JSON.parse(readFileSync(filePath, 'utf-8')));
      } catch {
        return { autoDiscover: true, roots: [], disabledWorkspaces: [] };
      }
    },
    save(config: WorkspacesConfig): void {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    },
  };
}

const STORAGE_REL = join('Trae CN', 'User', 'globalStorage', 'storage.json');

/** 各平台 TRAE CN storage.json 候选位置（按优先级） */
export function traeStorageCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  const candidates: string[] = [];
  if (env.APPDATA) candidates.push(join(env.APPDATA, STORAGE_REL));
  candidates.push(join(homedir(), 'AppData', 'Roaming', STORAGE_REL));
  candidates.push(join(home, 'Library', 'Application Support', STORAGE_REL));
  candidates.push(join(home, '.config', STORAGE_REL));
  return [...new Set(candidates)];
}

/** 读取 TRAE storage.json 并解析工作区路径；找不到/不可读/无记录时带 error 返回 */
export function readAutoWorkspacePaths(
  storagePath?: string,
): { paths: string[]; error?: string } {
  const file = storagePath ?? traeStorageCandidates().find((candidate) => existsSync(candidate));
  if (!file) {
    return { paths: [], error: '未找到 TRAE 工作区记录（storage.json），可在设置中手动添加工作区根' };
  }
  let content = '';
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    return { paths: [], error: `无法读取 TRAE 工作区记录：${file}` };
  }
  const paths = parseTraeStorageJson(content);
  if (paths.length === 0) {
    return { paths: [], error: `TRAE 工作区记录为空或无法解析：${file}` };
  }
  return { paths };
}

export const nodeWorkspaceFs: WorkspaceFs = {
  exists(absolutePath: string): boolean {
    try {
      return existsSync(absolutePath);
    } catch {
      return false;
    }
  },
  isDirectory(absolutePath: string): boolean {
    try {
      return statSync(absolutePath).isDirectory();
    } catch {
      return false;
    }
  },
  listDir(absolutePath: string): string[] {
    try {
      return readdirSync(absolutePath).sort();
    } catch {
      return [];
    }
  },
  realpath(absolutePath: string): string {
    return realpathSync(absolutePath);
  },
};

const TRAE_SKILLS_DIR = '.trae/skills';

/** 统计工作区技能目录下含 SKILL.md 的有效技能数 */
function inspectSkills(workspacePath: string, fs: WorkspaceFs): { exists: boolean; count: number } {
  const skillsDir = `${workspacePath}/${TRAE_SKILLS_DIR}`;
  if (!fs.isDirectory(skillsDir)) return { exists: false, count: 0 };
  let count = 0;
  for (const child of fs.listDir(skillsDir)) {
    const skillDir = `${skillsDir}/${child}`;
    if (fs.isDirectory(skillDir) && fs.exists(`${skillDir}/SKILL.md`)) count += 1;
  }
  return { exists: true, count };
}

function workspaceInfo(
  workspacePath: string,
  source: 'auto' | 'manual',
  disabled: boolean,
  fs: WorkspaceFs,
): WorkspaceInfo {
  const skills = inspectSkills(workspacePath, fs);
  return {
    path: workspacePath,
    name: workspacePath.split('/').filter(Boolean).pop() ?? workspacePath,
    source,
    skillsDirExists: skills.exists,
    skillCount: skills.count,
    ...(disabled ? { disabled: true } : {}),
  };
}

export interface BuildWorkspacesDeps {
  configStore?: WorkspaceConfigStore;
  /** 显式 storage.json 路径（测试注入）；缺省走平台候选 */
  storagePath?: string;
  fs?: WorkspaceFs;
}

export interface WorkspacesOverviewResult extends WorkspacesOverview {
  /** 参与技能扫描的有效工作区目录（喂给 SkillSources.workspaceDirs） */
  workspaceDirs: string[];
}

/** 组装 GET /api/workspaces 所需总览：配置 + 有效/禁用工作区 + 错误提示 */
export function buildWorkspacesOverview(deps: BuildWorkspacesDeps = {}): WorkspacesOverviewResult {
  const configStore = deps.configStore ?? createNodeWorkspacesConfigStore();
  const fs = deps.fs ?? nodeWorkspaceFs;
  const config = configStore.load();

  const errors: string[] = [];
  let autoPaths: string[] = [];
  if (config.autoDiscover) {
    const result = readAutoWorkspacePaths(deps.storagePath);
    autoPaths = result.paths;
    if (result.error) errors.push(result.error);
  }

  const resolved = resolveWorkspaceDirs({
    manualRoots: config.roots,
    autoPaths,
    disabled: config.disabledWorkspaces,
    fs,
  });
  for (const skipped of resolved.skipped) {
    errors.push(`手动工作区不存在或不可访问：${skipped}`);
  }

  const active = resolved.dirs.map((dir) => workspaceInfo(dir.path, dir.source, false, fs));
  const activeKeys = new Set(active.map((info) => normalizePath(info.path)));
  const disabledInfos: WorkspaceInfo[] = [];
  for (const disabledPath of new Set(config.disabledWorkspaces.map((p) => normalizePath(p)))) {
    if (activeKeys.has(disabledPath) || !fs.isDirectory(disabledPath)) continue;
    const isManual = config.roots.some((root) => normalizePath(root) === disabledPath);
    disabledInfos.push(workspaceInfo(disabledPath, isManual ? 'manual' : 'auto', true, fs));
  }
  disabledInfos.sort((a, b) => a.path.localeCompare(b.path));

  return {
    config,
    workspaces: [...active, ...disabledInfos],
    truncated: resolved.truncated,
    maxWorkspaces: MAX_WORKSPACES,
    errors,
    workspaceDirs: active.map((info) => info.path),
  };
}
