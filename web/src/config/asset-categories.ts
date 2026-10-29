/**
 * 资产类别配置（fallback 清单 + 图标映射）
 *
 * 唯一声明源在后端 `src/core/asset-categories.ts`，经 `GET /api/asset-categories` 下发；
 * 本文件只保留**同名字段的 fallback**，用于首屏渲染与接口不可用时兜底。
 *
 * ⚠️ 新增类别请改后端声明源，不要在这里加——那正是「六份清单互不一致」的起点
 * （spec asset-center-consistency Scenario 1；后端 tests/unit/core/asset-categories.test.ts
 * 会逐字段比对两边的 label / description / order / external）。
 */

import {
  User,
  Sparkles,
  BookOpen,
  Server,
  Bot,
  Brain,
  Scale,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { AssetCategoryDescriptor } from '@/types/api';

/** 前端消费形态 = 声明源字段 + 图标（图标属于表现层，不进声明源） */
export type AssetCategoryConfig = AssetCategoryDescriptor & { icon: LucideIcon };

/** 已知类别的图标映射 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  identity: User,
  skill: Sparkles,
  rule: BookOpen,
  mcp: Server,
  agent: Bot,
  memory: Brain,
  criteria: Scale,
};

/** 接口新增了未知类别时的默认图标——保证导航项不会渲染成空白 */
export const DEFAULT_CATEGORY_ICON: LucideIcon = Package;

/**
 * fallback 清单（字段与后端声明源同名同值）
 *
 * external 供数类别走专用接口，不经 /api/assets；
 * 准则只作仲裁与诊断依据，不参与分发。
 */
export const FALLBACK_ASSET_CATEGORIES: AssetCategoryConfig[] = [
  { code: 'identity', label: '身份', description: '你的人设、背景与身份资料', hubDir: 'identity', syncable: true, doctorSupported: true, order: 10, external: false, icon: User },
  { code: 'skill', label: '技能', description: '盘点各工具安装的技能，收藏到我的库后统一同步到各工具', hubDir: 'skills', syncable: true, doctorSupported: true, order: 20, external: true, icon: Sparkles },
  { code: 'rule', label: '规则', description: '约束 AI 行为的规则与约定', hubDir: 'rules', syncable: true, doctorSupported: true, order: 30, external: false, icon: BookOpen },
  { code: 'mcp', label: 'MCP', description: 'MCP 服务器配置资产', hubDir: 'mcp', syncable: true, doctorSupported: false, order: 40, external: false, icon: Server },
  { code: 'agent', label: '智能体', description: '盘点各工具中的子智能体配置', hubDir: 'agents', syncable: true, doctorSupported: true, order: 50, external: true, icon: Bot },
  { code: 'memory', label: '记忆', description: '跨会话保留的事实、决定与偏好', hubDir: 'memory', syncable: true, doctorSupported: true, order: 55, external: false, icon: Brain, legacyHubDirs: ['preferences'] },
  { code: 'criteria', label: '裁决准则', description: '冲突仲裁与资产诊断依据的最佳实践准则——准则本身也是资产', hubDir: 'criteria', syncable: false, doctorSupported: false, order: 60, external: true, icon: Scale },
];

/**
 * 旧引用名：等同 fallback 清单
 *
 * @deprecated 组件请改用 `useAssetCategories()`，否则接口下发的新类别不会出现在界面上。
 *   保留此别名只为骨架屏与静态兜底文案等非渲染场景可复用同一份常量。
 */
export const ASSET_CATEGORIES: AssetCategoryConfig[] = FALLBACK_ASSET_CATEGORIES;

/** 根据 code 获取类别配置（查的是 fallback 清单；接口数据请用 useAssetCategories） */
export function getCategoryConfig(code: string): AssetCategoryConfig | undefined {
  return FALLBACK_ASSET_CATEGORIES.find((category) => category.code === code);
}

/** 获取所有类别的 code 列表（fallback 口径） */
export function getCategoryCodes(): string[] {
  return FALLBACK_ASSET_CATEGORIES.map((category) => category.code);
}
