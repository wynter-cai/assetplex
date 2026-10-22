/**
 * 技能发现前端共享工具与状态机类型（add-github-skill-source L1）
 *
 * 本地校验镜像后端 asset-name/源串规则的前置子集（即时反馈；服务端 curate 仍兜底）。
 * 四步状态机：input（输入源）→ candidates（候选清单）→ confirm（确认入库）→ result（结果）。
 */

import type { GithubCandidate, GithubCurateAction } from '@/types/api';

export type DiscoverStep = 'input' | 'candidates' | 'confirm' | 'result';

/** 单条候选的用户决策（勾选 / 目标名 / 冲突动作） */
export interface CandidateDecision {
  selected: boolean;
  /** 目标库名（默认候选名，可改名） */
  name: string;
  /** 同名已存在时生效，缺省 skip */
  action: GithubCurateAction;
}

const ILLEGAL_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/** 本地校验目标库名，返回错误信息；合法返回 null（镜像 asset-name.ts 前置子集） */
export function validateSkillNameLocal(name: string): string | null {
  if (name.trim() === '') return '名称不能为空';
  if (name === '.' || name === '..') return `名称不合法：${name}`;
  const illegal = ILLEGAL_CHARS.find((ch) => name.includes(ch));
  if (illegal !== undefined) return `名称含非法字符 ${illegal}`;
  if (name.endsWith('.') || name.endsWith(' ')) return `名称不能以点或空格结尾：${name}`;
  return null;
}

/** 源串输入是否具备发起发现的最小形态（owner/repo）；严格校验仍由服务端解析 */
export function looksLikeGithubSource(source: string): boolean {
  const trimmed = source.trim();
  if (trimmed === '') return false;
  const withoutRef = trimmed.split('@')[0] ?? trimmed;
  const segments = withoutRef.split('/').filter((s) => s !== '');
  return segments.length >= 2;
}

/** 由候选初始化默认决策 */
export function defaultDecision(candidate: GithubCandidate): CandidateDecision {
  return { selected: true, name: candidate.name, action: 'skip' };
}
