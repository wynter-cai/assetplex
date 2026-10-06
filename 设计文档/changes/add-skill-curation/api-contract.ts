/**
 * API 契约：技能沉淀工作流（add-skill-curation）
 *
 * 前后端共用类型。沉淀 = 复制非保险箱技能到保险箱并记录来源。
 */

import type { SkillInfo } from '../../web/src/types/api.js';

/** SkillInfo 扩展：来源标识（本变更新增，可选字段向后兼容） */
export interface SkillInfoWithSource extends SkillInfo {
  /** 沉淀来源：自建技能为空；沉淀技能格式 `${origin}:${sourcePath}` */
  source?: string;
}

/** POST /api/skills/curate 请求体：沉淀单个技能到保险箱 */
export interface CurateSkillRequest {
  /** 源技能 ID（盘点 id，即名称小写形式） */
  id: string;
  /** 目标名称（目录名），缺省沿用源技能名 */
  name?: string;
}

/** POST /api/skills/curate 响应（201）：创建后的保险箱技能（含 source） */
export interface CurateSkillResponse {
  skill: SkillInfoWithSource;
}

/** 批量沉淀中单条失败明细 */
export interface CurateBatchFailure {
  id: string;
  /** 源技能名（便于用户识别） */
  name: string;
  /** 失败原因（同名冲突 / 名称非法等） */
  error: string;
}

/** POST /api/skills/curate-batch 请求体：批量沉淀 */
export interface CurateBatchRequest {
  /** 源技能 ID 列表 */
  ids: string[];
}

/** POST /api/skills/curate-batch 响应（200）：部分成功语义，已成功不回滚 */
export interface CurateBatchResponse {
  /** 创建成功的保险箱技能（含 source） */
  created: SkillInfoWithSource[];
  /** 失败明细：已是保险箱技能 / 同名冲突 / 名称非法 */
  failed: CurateBatchFailure[];
}

/** 错误响应格式（与既有写接口一致）：{ error: string }，status 400/404/500 */

/**
 * 路由一览
 * - POST /api/skills/curate       单条沉淀（400 同名冲突/名称非法/源为 vault；404 源不存在）
 * - POST /api/skills/curate-batch 批量沉淀（200 部分成功；400 ids 为空或非法）
 */
