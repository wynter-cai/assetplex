/**
 * 裁决准则前端模型（add-llm-conflict-arbitration A6）
 *
 * serializeCriterion 与后端 core/criteria.ts serializeCriterionFile 同构：
 * 前端写回的文件必须能被后端宽容解析往返。web 包不能 import core，故本地复制。
 */

import type { CriterionAppliesTo, CriterionAsset } from '@/types/api';

/** 准则 frontmatter 序列化（后端解析契约：key: value 行，enabled 仅显式 false 才关） */
export function serializeCriterion(asset: CriterionAsset): string {
  const lines = [
    '---',
    `name: ${asset.name}`,
    `description: ${asset.description}`,
    `priority: ${asset.priority}`,
    `enabled: ${asset.enabled}`,
    `appliesTo: [${asset.appliesTo.join(', ')}]`,
  ];
  if (asset.source) lines.push(`source: ${asset.source}`);
  lines.push('---', asset.body);
  return lines.join('\n');
}

/** 名称 → slug：ASCII 化后取 [a-z0-9-]，非 ASCII（如纯中文）回退时间戳占位 */
export function slugifyCriterionName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `criterion-${Date.now().toString(36)}`;
}

/** slug 去重：冲突时追加 -2、-3…（与 CriteriaView 测试的路径后缀正则对应） */
export function uniqueCriterionSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** appliesTo 闭集选项与中文标签（顺序即 UI 展示顺序） */
export const CRITERION_CATEGORY_OPTIONS: Array<{ code: CriterionAppliesTo; label: string }> = [
  { code: 'all', label: '通用' },
  { code: 'identity', label: '身份' },
  { code: 'skill', label: '技能' },
  { code: 'rule', label: '规则' },
  { code: 'mcp', label: 'MCP' },
  { code: 'command', label: '命令' },
  { code: 'agent', label: '智能体' },
  { code: 'memory', label: '记忆' },
];

export function criterionAppliesToLabel(appliesTo: CriterionAppliesTo[]): string {
  if (appliesTo.includes('all')) return '通用';
  const labels = CRITERION_CATEGORY_OPTIONS
    .filter((o) => appliesTo.includes(o.code))
    .map((o) => o.label);
  return labels.join(' / ') || '通用';
}
