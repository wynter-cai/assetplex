/**
 * GitHub 技能布局识别与护栏（纯逻辑，不拉内容、不碰网络）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 1/2/7
 * 决策 D6：识别 `skills/<name>/SKILL.md`、根 `SKILL.md`、subpath 下同规则；技能目录其余文件为附属。
 * 护栏：单文件 512KB、候选数 50、树深度、GitHub 截断——超限截断并如实提示，不整体报错。
 */

import type { GithubTreeEntry } from './github-source.js';

export type { GithubTreeEntry } from './github-source.js';

export const MAX_SKILL_BYTES = 512 * 1024;
export const MAX_CANDIDATES = 50;
export const MAX_DEPTH = 8;

/** 定位到的技能（name/description 由 I4 拉 SKILL.md 后补全） */
export interface GithubLocatedSkill {
  skillPath: string;
  /** 技能目录相对路径（附属归属），根布局为 '' */
  dirPath: string;
  skillSize: number;
  supporting: Array<{ path: string; size: number }>;
  supportingTotal: number;
  /** 超护栏被跳过时的原因，正常省略 */
  skippedReason?: string;
}

export interface IdentifyResult {
  candidates: GithubLocatedSkill[];
  notes: string[];
}

function basename(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 1] ?? p;
}

function normalizeRoot(root: string): string {
  const t = root.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return t === '' ? '' : `${t}/`;
}

/**
 * 从 git 树识别候选技能。
 * @param tree 递归树条目（blob/tree）
 * @param root subpath 技能集合根（'' = 仓库根）
 * @param truncated GitHub 返回的树是否被截断
 */
export function identifyGithubSkills(input: {
  tree: GithubTreeEntry[];
  root: string;
  truncated?: boolean;
}): IdentifyResult {
  const prefix = normalizeRoot(input.root);
  const notes: string[] = [];
  const blobs = input.tree.filter((e) => e.type === 'blob');

  // 1. 找出 SKILL.md（根布局或目录内）
  const located: GithubLocatedSkill[] = [];
  for (const b of blobs) {
    if (!b.path.startsWith(prefix)) continue;
    const rel = b.path.slice(prefix.length);
    if (rel === 'SKILL.md') {
      located.push(mkSkill('SKILL.md', '', b, prefix));
    } else if (rel.endsWith('/SKILL.md')) {
      const dirPath = b.path.slice(0, -'/SKILL.md'.length);
      located.push(mkSkill(b.path, dirPath, b, prefix));
    }
  }

  // 2. 深度与单文件大小护栏
  for (const s of located) {
    const relDepth = s.skillPath.slice(prefix.length).split('/').length;
    if (relDepth > MAX_DEPTH) s.skippedReason = 'over-depth';
    else if (s.skillSize > MAX_SKILL_BYTES) {
      s.skippedReason = 'over-size-limit';
      notes.push(`技能 ${basename(s.dirPath) || '根技能'} 超单文件上限（${MAX_SKILL_BYTES} 字节）已跳过`);
    }
  }

  // 3. 附属文件归属（非 SKILL.md、位于技能目录内；根技能收其余散落文件）
  const skillDirs = new Set(located.filter((s) => s.dirPath !== '').map((s) => s.dirPath));
  const skillMdPaths = new Set(located.map((s) => s.skillPath));
  for (const s of located) {
    const owned = blobs.filter((b) => {
      if (b.path === s.skillPath || skillMdPaths.has(b.path)) return false;
      if (s.dirPath === '') {
        // 根技能：不属于任何独立技能目录的散落文件
        return ![...skillDirs].some((d) => b.path.startsWith(`${d}/`));
      }
      return b.path.startsWith(`${s.dirPath}/`);
    });
    const withSize = owned.map((b) => ({ path: b.path, size: b.size ?? 0 }));
    s.supporting = withSize;
    s.supportingTotal = withSize.reduce((acc, f) => acc + f.size, 0);
  }

  // 4. 候选数上限截断
  located.sort((a, b) => a.skillPath.localeCompare(b.skillPath));
  if (located.length > MAX_CANDIDATES) {
    notes.push(`仅展示前 ${MAX_CANDIDATES} 条候选（共 ${located.length} 个）`);
    located.length = MAX_CANDIDATES;
  }

  if (input.truncated === true) {
    notes.push('仓库过大，GitHub 返回的清单可能不完整');
  }

  return { candidates: located, notes };
}

function mkSkill(
  skillPath: string,
  dirPath: string,
  blob: GithubTreeEntry,
  _prefix: string,
): GithubLocatedSkill {
  return {
    skillPath,
    dirPath,
    skillSize: blob.size ?? 0,
    supporting: [],
    supportingTotal: 0,
  };
}
