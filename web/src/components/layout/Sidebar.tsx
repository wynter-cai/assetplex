import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Package,
  Plug,
  RefreshCw,
  Repeat,
  Settings,
  Boxes,
  ChevronDown,
  FolderGit2,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAssetCategories } from '@/lib/use-asset-categories';
import { APP_VERSION } from '@/lib/app-version';

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
  { to: '/projects', label: '项目', icon: FolderGit2 },
  { to: '/connections', label: '连接', icon: Plug },
  { to: '/discover', label: '技能发现', icon: Compass },
  { to: '/sync', label: '同步', icon: RefreshCw },
  { to: '/swap', label: '切换', icon: Repeat },
  { to: '/settings', label: '设置', icon: Settings },
];

export function Sidebar(): JSX.Element {
  // 资产库默认展开
  const [vaultExpanded, setVaultExpanded] = useState<boolean>(true);
  // 类别子项走「fallback + 接口覆盖」：后端声明源新增类别时侧栏自动跟随（spec asset-center-consistency S1，tasks I1）
  const { categories } = useAssetCategories();

  return (
    <aside
      aria-label="侧边栏"
      className="w-60 shrink-0 border-r bg-muted/40 h-screen sticky top-0 flex flex-col"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 h-16 border-b shrink-0">
        <Boxes className="h-6 w-6 text-primary" />
        <span className="font-semibold text-lg">AssetPlex</span>
      </div>

      {/* 主导航 */}
      <nav aria-label="主导航" className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;

          if (item.hasChildren) {
            // 折叠按钮与链接并列而非嵌套（enhance-a11y-responsive D5，keyboard Scenario 3/6）：
            // <button> 嵌在 <a> 内不合法，也破坏屏幕阅读器语义与 Tab 顺序
            return (
              <div key={item.to} className="space-y-1">
                <div className="grid grid-cols-[1fr_auto] items-center gap-1">
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors min-w-0',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => setVaultExpanded((v) => !v)}
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground"
                    aria-label={vaultExpanded ? '收起资产库' : '展开资产库'}
                    aria-expanded={vaultExpanded}
                    aria-controls="vault-category-nav"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        vaultExpanded ? '' : '-rotate-90',
                      )}
                    />
                  </button>
                </div>

                {vaultExpanded && (
                  <nav
                    id="vault-category-nav"
                    aria-label="资产类别"
                    className="ml-4 pl-3 border-l space-y-0.5"
                  >
                    {categories.map((cat) => {
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
                  </nav>
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

      {/* 底部版本 */}
      <div className="px-4 py-3 border-t text-xs text-muted-foreground shrink-0">
        AssetPlex v{APP_VERSION}
      </div>
    </aside>
  );
}
