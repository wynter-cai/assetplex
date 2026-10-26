/**
 * 同步页的共用显示数据（工具显示名 + 动作徽章）
 *
 * 左栏卡片、右栏详情、结果卡都从这里取，避免同一个动作在三处叫三个名字。
 */

import { Copy, Link2, SkipForward, Layers, type LucideIcon } from 'lucide-react';
import type { SyncPlan } from '@/types/api';

export const TOOL_DISPLAY_NAME: Record<string, string> = {
  'trae-cn': 'TRAE 中国版',
  trae: 'TRAE',
  workbuddy: 'WorkBuddy',
  'claude-code': 'Claude Code',
  codex: 'OpenAI Codex',
  qoder: 'Qoder',
};

/** 工具 id → 显示名（未收录的直出 id，不静默变成空白） */
export function toolDisplayName(name: string): string {
  return TOOL_DISPLAY_NAME[name] ?? name;
}

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive' | 'success';

/** 计划动作 → 徽章文案与图标 */
export const ACTION_META: Record<string, { label: string; variant: BadgeVariant; icon: LucideIcon }> = {
  symlink: { label: '链接', variant: 'default', icon: Link2 },
  copy: { label: '复制', variant: 'secondary', icon: Copy },
  skip: { label: '跳过', variant: 'outline', icon: SkipForward },
};

/** 未知动作的兜底徽章（新增动作时界面不会漏画） */
export const FALLBACK_ACTION_META: { label: string; variant: BadgeVariant; icon: LucideIcon } = {
  label: '变更',
  variant: 'outline',
  icon: Layers,
};

/** 某个工具计划里需要写入的条目数与冲突数（唯一口径来自 summarizeImpact） */
export function actionableCount(plan: SyncPlan): number {
  return plan.items.filter((entry) => entry.action !== 'skip').length;
}
