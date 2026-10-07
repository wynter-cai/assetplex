/**
 * 技能视图共享标签映射与排序（SkillsView / SkillDetail 共用）
 */

import type { SkillFunction, SkillFunctionSource, SkillProvenance, LibraryStatus } from '@/types/api';

export const FUNCTION_LABELS: Record<SkillFunction, string> = {
  coding: '编码开发',
  writing: '文档写作',
  browser: '浏览器自动化',
  data: '数据处理',
  devops: 'DevOps/部署',
  'ai-integration': 'AI 集成',
  design: '设计创意',
  workflow: '工作流自动化',
  other: '其他',
};

/** 纯出处四类（spec refactor-skill-origin-taxonomy：MECE，库状态不占分类轴） */
export const PROVENANCE_LABELS: Record<SkillProvenance, string> = {
  self: '自建',
  marketplace: '市场安装',
  plugin: '插件自带',
  builtin: '官方内置',
};

/** 库状态分段控件标签（与出处 chips 正交组合） */
export const LIBRARY_STATUS_LABELS: Record<LibraryStatus | 'all', string> = {
  all: '全部',
  in: '我的库',
  out: '未入库',
};

/** 分类来源标注（spec add-skill-ai-classification：手动 / AI / 关键词） */
export const FUNCTION_SOURCE_LABELS: Record<SkillFunctionSource, string> = {
  manual: '手动',
  ai: 'AI',
  keyword: '关键词',
};

export const FUNCTION_ORDER: SkillFunction[] = [
  'coding', 'writing', 'browser', 'data', 'devops', 'ai-integration', 'design', 'workflow', 'other',
];

export const PROVENANCE_ORDER: SkillProvenance[] = ['self', 'marketplace', 'plugin', 'builtin'];

/** 来源工具标注（spec fix-scan-count-gaps：官方内置徽章区分 TRAE / WorkBuddy 官方） */
export const TOOL_LABELS: Record<string, string> = {
  trae: 'TRAE',
  codebuddy: 'CodeBuddy',
  workbuddy: 'WorkBuddy',
  hub: '保险箱',
};

/**
 * 出处徽章文案：
 * - 项目技能优先显示工作区名（项目 · ××）
 * - 官方内置追加来源工具后缀（官方内置 · TRAE / WorkBuddy）
 * - 其余维持纯出处标签
 */
export function provenanceBadgeLabel(skill: {
  provenance: SkillProvenance;
  tool: string;
  workspaceName?: string;
}): string {
  if (skill.provenance === 'self' && skill.workspaceName) {
    return `项目 · ${skill.workspaceName}`;
  }
  if (skill.provenance === 'builtin') {
    return `${PROVENANCE_LABELS.builtin} · ${TOOL_LABELS[skill.tool] ?? skill.tool}`;
  }
  return PROVENANCE_LABELS[skill.provenance];
}

/**
 * 收藏溯源内部 origin → 纯出处映射（source frontmatter `${origin}:${path}` 格式不变，仅内部使用）；
 * personal/project/vault 无外部出处记 self，marketplace/plugin/builtin 保留原出处
 */
const CURATE_SOURCE_PROVENANCE: Record<string, SkillProvenance> = {
  personal: 'self',
  project: 'self',
  vault: 'self',
  marketplace: 'marketplace',
  plugin: 'plugin',
  builtin: 'builtin',
};

/** 解析收藏溯源标识（`${origin}:${path}`）并映射为纯出处供徽章显示；格式非法返回 null */
export function parseCurateSource(source: string): { provenance: SkillProvenance; path: string } | null {
  const idx = source.indexOf(':');
  if (idx <= 0) return null;
  const provenance = CURATE_SOURCE_PROVENANCE[source.slice(0, idx)];
  if (!provenance) return null;
  return { provenance, path: source.slice(idx + 1) };
}
