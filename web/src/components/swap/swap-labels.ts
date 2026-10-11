/**
 * 切换页文案（enable-tool-hot-swap T8/T9）
 *
 * 六类切换包口径与后端 SWAP_CATEGORIES 对齐；标签仅展示层使用。
 */

import type { SwapCategory, SwapConflictStatus } from '@/types/api';

/** 六类中文标签(顺序即预览分组顺序) */
export const SWAP_CATEGORY_LABELS: Record<SwapCategory, string> = {
  identity: '身份',
  rule: '规则',
  skill: '技能',
  mcp: 'MCP',
  memory: '记忆',
  agent: '智能体',
};

export const SWAP_CATEGORY_ORDER: SwapCategory[] = [
  'identity',
  'rule',
  'skill',
  'mcp',
  'memory',
  'agent',
];

/** 冲突状态的用户可读文案 */
export const CONFLICT_LABELS: Record<SwapConflictStatus, string> = {
  none: '新增',
  exists: '内容一致，跳过',
  differs: '目标已有不同内容',
};

/** 同步策略文案 */
export const STRATEGY_LABELS: Record<string, string> = {
  symlink: '链接',
  copy: '复制',
  'native-import': '聚合导入',
  'per-project': '按项目',
};
