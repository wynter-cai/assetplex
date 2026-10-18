/**
 * refactor-skill-asset-first-view API 契约增量
 *
 * 仅列本次变更涉及的部分；既有字段（SkillInfo/provenance/inLibrary 等）
 * 语义见 refactor-skill-origin-taxonomy/api-contract.ts，不动。
 */

/** 视图口径：资产 / 本机环境 / 全部（缺省，兼容旧调用） */
export type SkillViewScope = 'asset' | 'environment' | 'all';

/**
 * GET /api/skills 新增查询参数（其余既有参数不变）：
 * - scope=asset        → items 仅含 inLibrary===true 或 provenance==='self' 的技能
 * - scope=environment  → items 仅含其余（未入库且非自建）
 * - 缺省/all           → 不过滤（旧行为，零破坏）
 * - 非法值 → 400 {"error":"无效视图：xxx，支持：asset, environment, all"}
 * - scope 与 status/provenance/function/search 组合时，scope 先行，其余在其内二次过滤
 */
export interface ListSkillsQuery {
  scope?: SkillViewScope;
  function?: string;
  provenance?: string;
  status?: string;
  search?: string;
}

/** 分段计数：随 function/search 联动重算，不含 scope 自身维度 */
export interface SkillScopeCounts {
  asset: number;
  environment: number;
}

/** 响应新增 countByScope；items/countByProvenance/countByStatus 语义不变 */
export interface ListSkillsResultDelta {
  countByScope: SkillScopeCounts;
}

/**
 * total 语义修订（走查发现 UI 统计行缺口径，2026-10-18）：
 * - scope=asset/environment → total = 该视图口径集合数（不受 function/provenance/status/search 细分影响，沿「total 不随细分联动」惯例）
 * - 缺省/all              → 保持全量去重数（旧行为零破坏）
 */
