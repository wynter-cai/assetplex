/**
 * 技能视图共享标签映射与排序（SkillsView / SkillDetail 共用）
 */

import type { SkillFunction, SkillOrigin } from '@/types/api';

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
  marketplace: '市场安装',
};

export const FUNCTION_ORDER: SkillFunction[] = [
  'coding', 'writing', 'browser', 'data', 'devops', 'ai-integration', 'design', 'workflow', 'other',
];

/** vault（保险箱）为主本，排序最前 */
export const ORIGIN_ORDER: SkillOrigin[] = ['vault', 'personal', 'plugin', 'marketplace', 'builtin'];
