/**
 * 同步策略中文映射（设置页 Select 选项标签唯一来源）
 *
 * spec fix-trust-and-consistency I6：设置页无 hybrid / 内部 id 直出
 */

export const SYNC_STRATEGY_LABELS: Record<string, string> = {
  'native-import': '原生导入',
  symlink: '符号链接',
  copy: '复制',
  hybrid: '混合',
  'per-project': '按项目',
};

/** 未知策略回退原始值（不显示空白，方便排查新增枚举未同步的情况） */
export function strategyLabel(value: string): string {
  return SYNC_STRATEGY_LABELS[value] ?? value;
}

/** 下拉选项列表（按固定顺序） */
export const STRATEGY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  SYNC_STRATEGY_LABELS,
).map(([value, label]) => ({ value, label }));
