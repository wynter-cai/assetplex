import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAssetCategories } from '@/lib/use-asset-categories';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { HOME_DASHBOARD_QUERY_KEY } from '@/lib/use-home-dashboard';
import { APP_VERSION } from '@/lib/app-version';
import type { AssetCategoryConfig } from '@/config/asset-categories';
import {
  NAV_GROUPS,
  SETTINGS_NAV,
  isNavGroupHit,
  type NavGroup,
  type NavSubItem,
} from './nav-items';

interface SidebarProps {
  /** 窄屏抽屉是否打开（≥lg 恒为 false，侧栏常驻） */
  drawerOpen?: boolean;
  /** 请求关闭抽屉（Esc / 遮罩 / 点选导航项），由调用方负责焦点归还 */
  onClose?: () => void;
}

const ROW_BASE = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors';
const ROW_IDLE = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';
const ROW_ACTIVE = 'bg-primary text-primary-foreground';

/** 组按钮状态 */
const GROUP_BASE = 'flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors';
const GROUP_HIT = 'font-medium text-foreground';

/**
 * 治理徽标：只读首页聚合缓存（['home-dashboard']），不自己发请求、不轮询。
 * 未加载 / 读取失败 / 为 0 时返回 null（navigation Scenario 3.2/3.3）。
 */
function useGovernancePending(): number | null {
  const { data } = useQuery({
    queryKey: HOME_DASHBOARD_QUERY_KEY,
    queryFn: () => api.getHomeDashboard(),
    enabled: false,
    staleTime: Infinity,
  });
  const total = data?.issues.total;
  return typeof total === 'number' && total > 0 ? total : null;
}

/** 组的子项：动态类别（后端声明驱动）在前，固定子项在后 */
function resolveChildren(group: NavGroup, categories: AssetCategoryConfig[]): NavSubItem[] {
  if (group.childSource !== 'asset-categories') return group.children;
  return [
    ...categories.map((category) => ({
      to: `${group.to}/${category.code}`,
      label: category.label,
      icon: category.icon,
    })),
    ...group.children,
  ];
}

interface GroupSectionProps {
  group: NavGroup;
  children: NavSubItem[];
  hit: boolean;
  expanded: boolean;
  badge: number | null;
  onToggle: () => void;
  onNavigate?: () => void;
}

/** 多链接组：组按钮与子项链接并列，不含 `<a><button>` 嵌套（Scenario 6.1） */
function GroupSection({
  group,
  children,
  hit,
  expanded,
  badge,
  onToggle,
  onNavigate,
}: GroupSectionProps): JSX.Element {
  const listId = `nav-group-${group.id}-list`;
  const Icon = group.icon;
  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-current={hit ? 'true' : undefined}
          data-active={hit ? 'true' : 'false'}
          className={cn(
            GROUP_BASE,
            hit ? GROUP_HIT : ROW_IDLE,
            hit && !expanded ? 'bg-accent/60' : '',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{group.label}</span>
          {badge !== null && (
            <span
              aria-label={`${badge} 项待治理`}
              className="rounded-full bg-primary px-1.5 py-0.5 text-11 leading-none text-primary-foreground"
            >
              {badge}
            </span>
          )}
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', expanded ? '' : '-rotate-90')}
          />
        </button>
      </div>

      {/* 列表始终挂载（aria-controls 必须指向真实节点），用 hidden 控制可见性 */}
      <nav
        id={listId}
        hidden={!expanded}
        aria-label={group.sublistLabel ?? `${group.label}子项`}
        className="ml-4 pl-3 border-l space-y-0.5"
      >
        {children.map((child) => {
          const ChildIcon = child.icon;
          return (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                )
              }
            >
              {ChildIcon !== undefined && <ChildIcon className="h-3.5 w-3.5" />}
              {child.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar({ drawerOpen = false, onClose }: SidebarProps = {}): JSX.Element {
  const { pathname } = useLocation();
  // 类别子项走「fallback + 接口覆盖」：后端声明源新增类别时侧栏自动跟随（tasks I1）
  const { categories } = useAssetCategories();
  const pending = useGovernancePending();
  const asideRef = useRef<HTMLElement>(null);
  // 抽屉打开时才锁焦点（enhance-a11y-responsive T9/T10）：桌面无汉堡，drawerOpen 恒 false
  useFocusTrap(asideRef, drawerOpen, onClose);

  // 手动展开/收起：任何路径变化都清空 —— 命中组重新自动展开（Scenario 2.4），
  // 未命中组保持收起（Scenario 2.3 的「不丢位置」仅指不跳转、不卸载）
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setManualExpanded({});
  }, [pathname]);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => {
        const children = resolveChildren(group, categories);
        return { group, children, hit: isNavGroupHit(group, pathname, children) };
      }),
    [categories, pathname],
  );

  const toggleGroup = (id: string, current: boolean): void => {
    setManualExpanded((prev) => ({ ...prev, [id]: !current }));
  };

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      aria-label="侧边栏"
      className={cn(
        'w-60 shrink-0 border-r bg-muted/40 h-screen flex flex-col',
        // <lg：抽屉（滑入覆盖内容）；≥lg：常驻文档流
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 h-16 border-b shrink-0">
        <Boxes className="h-6 w-6 text-primary" />
        <span className="font-semibold text-lg">AssetPlex</span>
      </div>

      {/* 五个导航组 */}
      <nav aria-label="主导航" className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
        {groups.map(({ group, children, hit }) => {
          const Icon = group.icon;
          if (children.length === 0) {
            return (
              <NavLink
                key={group.id}
                to={group.to}
                end={group.to === '/'}
                onClick={onClose}
                className={({ isActive }) => cn(ROW_BASE, isActive ? ROW_ACTIVE : ROW_IDLE)}
              >
                <Icon className="h-4 w-4" />
                {group.label}
              </NavLink>
            );
          }
          const expanded = manualExpanded[group.id] ?? hit;
          return (
            <GroupSection
              key={group.id}
              group={group}
              children={children}
              hit={hit}
              expanded={expanded}
              badge={group.badge === 'governance-pending' ? pending : null}
              onToggle={() => toggleGroup(group.id, expanded)}
              onNavigate={onClose}
            />
          );
        })}
      </nav>

      {/* 底部固定区：新手引导 / 设置 / 版本号 */}
      <div className="px-3 py-3 border-t space-y-1 shrink-0">
        <NavLink
          to="/onboarding"
          onClick={onClose}
          data-testid="nav-onboarding"
          className={({ isActive }) => cn(ROW_BASE, isActive ? ROW_ACTIVE : ROW_IDLE)}
        >
          <Sparkles className="h-4 w-4" />
          新手引导
        </NavLink>
        <NavLink
          to={SETTINGS_NAV.to}
          onClick={onClose}
          className={({ isActive }) => cn(ROW_BASE, isActive ? ROW_ACTIVE : ROW_IDLE)}
        >
          <SETTINGS_NAV.icon className="h-4 w-4" />
          {SETTINGS_NAV.label}
        </NavLink>
        <div className="px-3 pt-1 text-xs text-muted-foreground">AssetPlex v{APP_VERSION}</div>
      </div>
    </aside>
  );
}
