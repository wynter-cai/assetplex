/**
 * 资产类别配置
 *
 * 这里定义所有资产类别的元信息（图标、显示名、code）。
 * 前端导航、后端类型、扫描器都应从配置读取，而不是写死。
 *
 * 参考: 设计文档/assetplex-asset-taxonomy.md
 */

import { User, Sparkles, BookOpen, Server, Bot, type LucideIcon } from 'lucide-react';

export interface AssetCategoryConfig {
  /** 类别代码，用于 URL 和后端通信 */
  code: string;
  /** 中文显示名 */
  label: string;
  /** 图标组件 */
  icon: LucideIcon;
  /** 在资产库列表中的排序权重，数字越小越靠前 */
  order: number;
  /**
   * 是否为外部数据类别。
   * true 表示数据不走 /api/assets，而由专用接口提供（如智能体走 /api/agents）。
   */
  external?: boolean;
}

/**
 * 当前支持的资产类别。
 *
 * 新增类别只需在此数组追加，Sidebar 与 Vault 左侧导航自动生效。
 * 外部数据类别设置 external: true，由 Vault 渲染专用视图。
 */
export const ASSET_CATEGORIES: AssetCategoryConfig[] = [
  { code: 'identity', label: '身份', icon: User, order: 10 },
  { code: 'skill', label: '技能', icon: Sparkles, order: 20, external: true },
  { code: 'rule', label: '规则', icon: BookOpen, order: 30 },
  { code: 'mcp', label: 'MCP', icon: Server, order: 40 },
  { code: 'agent', label: '智能体', icon: Bot, order: 50, external: true },
];

/** 根据 code 获取类别配置 */
export function getCategoryConfig(code: string): AssetCategoryConfig | undefined {
  return ASSET_CATEGORIES.find((c) => c.code === code);
}

/** 获取所有类别的 code 列表 */
export function getCategoryCodes(): string[] {
  return ASSET_CATEGORIES.map((c) => c.code);
}
