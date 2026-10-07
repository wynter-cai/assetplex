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
  /** 一句话描述（类别页页头副标题，spec refactor-design-system page-headers） */
  description: string;
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
  { code: 'identity', label: '身份', description: '你的人设、背景与身份资料', icon: User, order: 10 },
  { code: 'skill', label: '技能', description: '盘点各工具安装的技能，收藏到我的库后统一同步分发', icon: Sparkles, order: 20, external: true },
  { code: 'rule', label: '规则', description: '约束 AI 行为的规则与约定', icon: BookOpen, order: 30 },
  { code: 'mcp', label: 'MCP', description: 'MCP 服务器配置资产', icon: Server, order: 40 },
  { code: 'agent', label: '智能体', description: '盘点各工具中的子智能体配置', icon: Bot, order: 50, external: true },
];

/** 根据 code 获取类别配置 */
export function getCategoryConfig(code: string): AssetCategoryConfig | undefined {
  return ASSET_CATEGORIES.find((c) => c.code === code);
}

/** 获取所有类别的 code 列表 */
export function getCategoryCodes(): string[] {
  return ASSET_CATEGORIES.map((c) => c.code);
}
