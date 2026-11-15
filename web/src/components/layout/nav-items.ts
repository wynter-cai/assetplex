import {
  Home,
  Package,
  Plug,
  RefreshCw,
  Repeat,
  Settings,
  FolderGit2,
  Compass,
  Copy,
  History,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';

/** 导航组内的一个目标页 */
export interface NavSubItem {
  to: string;
  label: string;
  icon?: LucideIcon;
}

/** 组按钮徽标的数据来源（只表示「需要行动的数量」，不承载健康分等状态） */
export type NavBadgeSource = 'governance-pending';

/** 子项动态来源：资产类别清单由后端声明驱动，前端不写死类别 */
export type NavChildSource = 'asset-categories';

export interface NavGroup {
  id: string;
  /** 组主入口路径：参与命中判断，也是子项动态拼接的基址 */
  to: string;
  label: string;
  icon: LucideIcon;
  /** 固定子项；空数组 + 无 childSource = 单链接组，直接渲染为链接 */
  children: NavSubItem[];
  /** 动态子项来源，排在固定子项之前 */
  childSource?: NavChildSource;
  /** 子列表地标名称（屏幕阅读器可读） */
  sublistLabel?: string;
  /** 组按钮徽标来源；未声明则不显示徽标 */
  badge?: NavBadgeSource;
}

export type NavLinkItem = NavSubItem & { icon: LucideIcon };

/**
 * 五个导航组（refactor-home-action-panel navigation R1）
 *
 * 顺序即侧栏渲染顺序；「设置」不走分组，固定在最底部（BOTTOM_NAV）。
 * 组内 ≥2 个目标时渲染「组按钮 + 子项」，只有 1 个目标时渲染为直接链接。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    to: '/',
    label: '总览',
    icon: Home,
    children: [],
  },
  {
    id: 'vault',
    to: '/vault',
    label: '资产库',
    icon: Package,
    // 类别子项由接口清单动态生成，「发现外部技能」固定排在末尾
    childSource: 'asset-categories',
    children: [{ to: '/discover', label: '发现外部技能', icon: Compass }],
    sublistLabel: '资产类别',
  },
  {
    id: 'governance',
    to: '/governance',
    label: '治理',
    icon: ShieldCheck,
    children: [
      { to: '/governance', label: '体检与待办', icon: Stethoscope },
      { to: '/duplicates', label: '重复项', icon: Copy },
    ],
    sublistLabel: '治理子项',
    badge: 'governance-pending',
  },
  {
    id: 'connections',
    to: '/connections',
    label: '连接与同步',
    icon: Plug,
    children: [
      { to: '/connections', label: '工具连接', icon: Plug },
      { to: '/sync', label: '分发与漂移', icon: RefreshCw },
      { to: '/swap', label: '切换工具', icon: Repeat },
      { to: '/projects', label: '项目工作区', icon: FolderGit2 },
    ],
    sublistLabel: '连接与同步子项',
  },
  {
    id: 'activity',
    to: '/activities',
    label: '活动',
    icon: History,
    children: [],
  },
];

/** 底部固定入口：设置（与新手引导、版本号同区） */
export const SETTINGS_NAV: NavLinkItem = { to: '/settings', label: '设置', icon: Settings };

/** 单路径命中：`/` 只精确匹配，其余按路径段前缀匹配（`/vault` 命中 `/vault/rule`） */
export function isPathHit(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** 组命中：组入口或任一子项命中即算（`/discover`、`/duplicates` 都归各自组） */
export function isNavGroupHit(
  group: NavGroup,
  pathname: string,
  children: NavSubItem[] = group.children,
): boolean {
  return (
    isPathHit(group.to, pathname) || children.some((child) => isPathHit(child.to, pathname))
  );
}

/**
 * 窄屏顶部条摘要：返回当前所属组名（navigation Scenario 5.3）
 *
 * 命中组分不出时回退「设置」或「总览」，绝不显示空白。
 */
export function resolveNavSummary(pathname: string): string {
  const hit = NAV_GROUPS.find((group) => isNavGroupHit(group, pathname));
  if (hit !== undefined) return hit.label;
  if (isPathHit(SETTINGS_NAV.to, pathname)) return SETTINGS_NAV.label;
  return NAV_GROUPS[0].label;
}
