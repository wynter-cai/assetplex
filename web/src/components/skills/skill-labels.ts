/**
 * 技能视图共享标签映射与排序（SkillsView / SkillDetail 共用）
 */

import type { SkillFunction, SkillFunctionSource, SkillOrigin } from '@/types/api';

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

export const ORIGIN_LABELS: Record<SkillOrigin, string> = {
  vault: '保险箱',
  builtin: '官方内置',
  plugin: '插件自带',
  personal: '个人自建',
  project: '项目技能',
  marketplace: '市场安装',
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

/** vault（保险箱）为主本，排序最前；项目技能紧随个人自建 */
export const ORIGIN_ORDER: SkillOrigin[] = ['vault', 'personal', 'project', 'plugin', 'marketplace', 'builtin'];

/** 解析沉淀来源标识（`${origin}:${sourcePath}`）；格式非法返回 null */
export function parseCurateSource(source: string): { origin: SkillOrigin; path: string } | null {
  const idx = source.indexOf(':');
  if (idx <= 0) return null;
  const origin = source.slice(0, idx);
  if (!(ORIGIN_ORDER as string[]).includes(origin)) return null;
  return { origin: origin as SkillOrigin, path: source.slice(idx + 1) };
}
