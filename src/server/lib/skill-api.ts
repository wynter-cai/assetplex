/**
 * 技能 API 对外投影
 *
 * spec: 设计文档/changes/refactor-skill-origin-taxonomy/api-contract.ts
 *
 * 内部 SkillInfo 的 origin 六值不对外暴露；映射为 provenance 四值 + inLibrary 布尔。
 * path=主副本物理路径、variants=副本数（内部分别为 sourcePath 与 variants: string[]）。
 */

import type {
  SkillFunction,
  SkillFunctionSource,
  SkillInfo,
  SkillSources,
} from '../../core/skills-inventory.js';
import {
  deriveInLibrary,
  deriveProvenance,
  type SkillProvenance,
} from '../../core/skill-provenance.js';
import { catalogFieldsOf } from '../../core/skill-catalog.js';
import type { SkillCatalogEntryFields } from '../../core/skill-catalog-types.js';
import type { SkillDiagnosisSummaryView } from '../../core/skill-diagnosis-summary.js';

/** 技能条目 API 对外语义（api-contract.ts 的 SkillInfo） */
export interface SkillApiInfo {
  id: string;
  name: string;
  description: string;
  functionCategory: SkillFunction;
  /** 纯出处（替代旧 origin 六值对外语义） */
  provenance: SkillProvenance;
  /** 是否已入我的库（替代旧 origin=vault 的对外表达） */
  inLibrary: boolean;
  /** 项目技能时的工作区信息（徽章展示用，不占出处轴） */
  workspaceName?: string;
  workspacePath?: string;
  /** 来源工具（trae / codebuddy / hub） */
  tool: string;
  /** 物理主文件路径 */
  path: string;
  /** 副本数 */
  variants: number;
  /** 沉淀溯源（库内技能才有；内部格式不变，前端经 PROVENANCE_LABELS 显示「来自 ××」） */
  source?: string;
  functionSource: SkillFunctionSource;
  version?: string;
  /** 主副本最后修改时间（ISO）；读不到为 null */
  lastModifiedAt: string | null;
}

/** 看板条目 = 既有条目光段 + 分类增量字段 + 上次体检摘要投影 */
export interface SkillApiCatalogInfo extends SkillApiInfo, SkillCatalogEntryFields {
  diagnosis?: SkillDiagnosisSummaryView;
}

/** 内部盘点条目 → API 对外条目（不透传 origin/sourcePath/variants 数组） */
export function toApiSkill(skill: SkillInfo): SkillApiInfo {
  const api: SkillApiInfo = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    functionCategory: skill.functionCategory,
    provenance: deriveProvenance(skill.origin, skill.source),
    inLibrary: deriveInLibrary(skill.origin),
    tool: skill.tool,
    path: skill.sourcePath,
    variants: skill.variants.length,
    functionSource: skill.functionSource,
    version: skill.version,
    lastModifiedAt: skill.lastModifiedAt,
  };
  if (skill.workspaceName !== undefined) api.workspaceName = skill.workspaceName;
  if (skill.workspacePath !== undefined) api.workspacePath = skill.workspacePath;
  if (skill.source !== undefined) api.source = skill.source;
  return api;
}

/** 内部盘点条目 → 看板条目（分类依据 + 三分组 + 上次体检摘要投影） */
export function toApiCatalogSkill(
  skill: SkillInfo,
  sources: SkillSources,
  diagnosis?: SkillDiagnosisSummaryView,
): SkillApiCatalogInfo {
  const api: SkillApiCatalogInfo = { ...toApiSkill(skill), ...catalogFieldsOf(skill, sources) };
  if (diagnosis !== undefined) api.diagnosis = diagnosis;
  return api;
}
