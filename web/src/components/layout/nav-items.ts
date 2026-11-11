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
  type LucideIcon,
} from 'lucide-react';

export interface MainNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 是否包含子项（资产库） */
  hasChildren?: boolean;
}

/** 主导航项：侧栏与窄屏顶部条共用，保证「当前页摘要」与导航永不脱节 */
export const MAIN_NAV: MainNavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/activities', label: '活动', icon: History },
  { to: '/vault', label: '资产库', icon: Package, hasChildren: true },
  { to: '/duplicates', label: '重复治理', icon: Copy },
  { to: '/projects', label: '项目', icon: FolderGit2 },
  { to: '/connections', label: '连接', icon: Plug },
  { to: '/discover', label: '技能发现', icon: Compass },
  { to: '/sync', label: '同步', icon: RefreshCw },
  { to: '/swap', label: '切换', icon: Repeat },
  { to: '/settings', label: '设置', icon: Settings },
];
