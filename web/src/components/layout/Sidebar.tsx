import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Boxes, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAssetCategories } from '@/lib/use-asset-categories';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { APP_VERSION } from '@/lib/app-version';
import { MAIN_NAV } from './nav-items';

interface SidebarProps {
  /** 窄屏抽屉是否打开（≥lg 恒为 false，侧栏常驻） */
  drawerOpen?: boolean;
  /** 请求关闭抽屉（Esc / 遮罩 / 点选导航项），由调用方负责焦点归还 */
  onClose?: () => void;
}

export function Sidebar({ drawerOpen = false, onClose }: SidebarProps = {}): JSX.Element {
  // 资产库默认展开
  const [vaultExpanded, setVaultExpanded] = useState<boolean>(true);
  // 类别子项走「fallback + 接口覆盖」：后端声明源新增类别时侧栏自动跟随（spec asset-center-consistency S1，tasks I1）
  const { categories } = useAssetCategories();
  const asideRef = useRef<HTMLElement>(null);
  // 抽屉打开时才锁焦点（enhance-a11y-responsive T9/T10）：桌面无汉堡，drawerOpen 恒 false
  useFocusTrap(asideRef, drawerOpen, onClose);

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
                    onClick={onClose}
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
                          onClick={onClose}
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
              onClick={onClose}
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
