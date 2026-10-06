/**
 * 技能列表筛选与分面计数（纯函数）
 *
 * spec: 设计文档/changes/refactor-skill-origin-taxonomy/specs/skill-origin-taxonomy.spec.md
 *
 * 分面语义：items 随全部筛选过滤；各计数排除自身维度、随其余筛选与搜索联动重算
 * （spec 场景：状态=我的库时出处 chips 联动为库内构成）。
 */

import {
  deriveInLibrary,
  deriveProvenance,
  LIBRARY_STATUSES,
  SKILL_PROVENANCES,
  type LibraryStatus,
  type SkillProvenance,
} from './skill-provenance.js';
import type { SkillFunction, SkillInfo } from './skills-inventory.js';

/** 列表筛选参数（function/provenance/status/search） */
export interface SkillListParams {
  function?: SkillFunction;
  /** 出处过滤（四值：self/marketplace/plugin/builtin） */
  provenance?: SkillProvenance;
  /** 库状态过滤（in=我的库 / out=未入库，缺省=全部） */
  status?: LibraryStatus;
  search?: string;
}

/** 分面计数结果 */
export interface SkillFacetCounts {
  countByFunction: Record<SkillFunction, number>;
  /** 出处计数（随 status/search 联动，不含 provenance 自身维度） */
  countByProvenance: Record<SkillProvenance, number>;
  /** 状态计数（随 provenance/search 联动，不含 status 自身维度） */
  countByStatus: { in: number; out: number };
}

/** 校验列表筛选参数，非法值抛错（路由捕获后转 400） */
export function validateSkillListParams(
  params: SkillListParams,
  functions: readonly SkillFunction[],
): void {
  if (params.function && !functions.includes(params.function)) {
    throw new Error(`无效职能：${params.function}，支持：${functions.join(', ')}`);
  }
  if (params.provenance && !SKILL_PROVENANCES.includes(params.provenance)) {
    throw new Error(`无效来源：${params.provenance}，支持：${SKILL_PROVENANCES.join(', ')}`);
  }
  if (params.status && !LIBRARY_STATUSES.includes(params.status)) {
    throw new Error(`无效库状态：${params.status}，支持：${LIBRARY_STATUSES.join(', ')}`);
  }
}

/** 按筛选参数过滤技能集合并计算分面计数 */
export function filterAndCountSkills(
  all: SkillInfo[],
  params: SkillListParams,
  functions: readonly SkillFunction[],
): { items: SkillInfo[] } & SkillFacetCounts {
  const matchesFunction = (s: SkillInfo): boolean =>
    !params.function || s.functionCategory === params.function;
  const matchesProvenance = (s: SkillInfo): boolean =>
    !params.provenance || deriveProvenance(s.origin, s.source) === params.provenance;
  const matchesStatus = (s: SkillInfo): boolean =>
    !params.status || deriveInLibrary(s.origin) === (params.status === 'in');
  const q = params.search?.trim().toLowerCase();
  const matchesSearch = (s: SkillInfo): boolean =>
    !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);

  const countByFunction = emptyCounts(functions);
  const countByProvenance = emptyCounts(SKILL_PROVENANCES);
  const countByStatus = { in: 0, out: 0 };
  for (const s of all) {
    if (matchesProvenance(s) && matchesStatus(s) && matchesSearch(s)) {
      countByFunction[s.functionCategory] += 1;
    }
    if (matchesFunction(s) && matchesStatus(s) && matchesSearch(s)) {
      countByProvenance[deriveProvenance(s.origin, s.source)] += 1;
    }
    if (matchesFunction(s) && matchesProvenance(s) && matchesSearch(s)) {
      countByStatus[deriveInLibrary(s.origin) ? 'in' : 'out'] += 1;
    }
  }

  const items = all.filter(
    (s) => matchesFunction(s) && matchesProvenance(s) && matchesStatus(s) && matchesSearch(s),
  );
  return { items, countByFunction, countByProvenance, countByStatus };
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  const obj = {} as Record<K, number>;
  for (const k of keys) obj[k] = 0;
  return obj;
}
