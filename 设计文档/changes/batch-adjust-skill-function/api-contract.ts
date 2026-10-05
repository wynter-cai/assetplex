/**
 * 技能职能批量调整 API 契约
 * change: batch-adjust-skill-function
 */

import type { SkillFunction, SkillInfo } from '../../../src/core/skills-inventory.js';

/** POST /api/skills/function-batch 请求体 */
export interface BatchSetSkillFunctionRequest {
  /** 要调整的技能 id 列表（技能名小写） */
  ids: string[];
  /** 目标职能分类 */
  functionCategory: SkillFunction;
}

/** POST /api/skills/function-batch 响应体 */
export interface BatchSetSkillFunctionResponse {
  /** 成功更新后的技能条目 */
  updated: SkillInfo[];
  /** 请求了但磁盘上已不存在的 id */
  missing: string[];
}

/** 400 错误响应（ids 非数组/为空 或 functionCategory 非法） */
export interface BatchSetSkillFunctionError {
  error: string;
}
