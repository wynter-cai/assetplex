import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Package,
  Plug,
  RefreshCw,
  Activity as ActivityIcon,
  Settings,
  Boxes,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSET_CATEGORIES } from '@/config/asset-categories';

interface MainNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 是否包含子项（资产库） */
  hasChildren?: boolean;
}

const MAIN_NAV: MainNavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/vault', label: '资产库', icon: Package, hasChildren: true },
  { to: '/connections', label: '连接', icon: Plug },
  { to: '/sync', label: '同步', icon: RefreshCw },
  { to: '/activities', label: '活动', icon: ActivityIcon },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar(): JSX.Element {
  // 资产库默认展开
  const [vaultExpanded, setVaultExpanded] = useState<boolean>(true);

  return (
    <aside className="w-60 shrink-0 border-r bg-muted/40 h-screen sticky top-0 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 h-16 border-b shrink-0">
        <Boxes className="h-6 w-6 text-primary" />
        <span className="font-semibold text-lg">AssetPlex</span>
      </div>

      {/* 主导航 */}
      <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;

          if (item.hasChildren) {
            return (
              <div key={item.to} className="space-y-1">
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setVaultExpanded((v) => !v);
                    }}
                    className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
                    aria-label={vaultExpanded ? '收起资产库' : '展开资产库'}
                    aria-expanded={vaultExpanded}
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        vaultExpanded ? '' : '-rotate-90',
                      )}
                    />
                  </button>
                </NavLink>

                {vaultExpanded && (
                  <div className="ml-4 pl-3 border-l space-y-0.5">
                    {ASSET_CATEGORIES.map((cat) => {
                      const CatIcon = cat.icon;
                      const childTo = `${item.to}/${cat.code}`;
                      return (
                        <NavLink
                          key={cat.code}
                          to={childTo}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
                              isActive
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                            )
                          }
                        >
                          <CatIcon className="h-3.5 w-3.5" />
                          {cat.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* 底部状态条（可选，后续放版本号等） */}
      <div className="px-4 py-3 border-t text-xs text-muted-foreground shrink-0">
        AssetPlex v2.0
      </div>
    </aside>
  );
}
