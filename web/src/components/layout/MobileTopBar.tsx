import type { RefObject } from 'react';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { resolveNavSummary } from './nav-items';

interface MobileTopBarProps {
  /** 抽屉是否打开（驱动 aria-expanded） */
  navOpen: boolean;
  onOpen: () => void;
  /** 汉堡按钮引用：抽屉关闭后焦点归还给它 */
  buttonRef: RefObject<HTMLButtonElement>;
}

/**
 * 窄屏顶部工具条（enhance-a11y-responsive T10/D4，responsive Scenario 1）：
 * <lg 显示汉堡 + 当前页摘要；≥lg 完全隐藏，侧栏改为常驻。
 *
 * 摘要按导航组映射（refactor-home-action-panel navigation Scenario 5.3）：
 * `/sync` 显示「连接与同步」而非某个子项或「总览」。
 */
export function MobileTopBar({ navOpen, onOpen, buttonRef }: MobileTopBarProps): JSX.Element {
  const { pathname } = useLocation();
  const summary = resolveNavSummary(pathname);

  return (
    <header className="lg:hidden flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        className="-ml-2 rounded-md p-2 hover:bg-accent"
        aria-label="打开导航菜单"
        aria-expanded={navOpen}
        aria-controls="app-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="truncate text-sm font-medium">{summary}</span>
    </header>
  );
}
