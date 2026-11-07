import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';

/** 窄屏断点（responsive Scenario 1/3，D3 四档断点表的 lg） */
const NARROW_QUERY = '(max-width: 1023px)';

function matchNarrow(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY).matches : false;
}

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState<boolean>(matchNarrow);

  // 跟随视口变化：变宽即收起抽屉，避免遮罩与焦点陷阱残留在桌面
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e: MediaQueryListEvent): void => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isNarrow && navOpen) setNavOpen(false);
  }, [isNarrow, navOpen]);

  /** 关闭抽屉并把焦点归还汉堡（keyboard Scenario 4） */
  const closeNav = (): void => {
    setNavOpen(false);
    if (isNarrow) burgerRef.current?.focus();
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background lg:flex-row">
      {/* skip-link：默认 sr-only 视觉隐藏（1px + 遮罩），Tab 聚焦时弹为视口内按钮（enhance-a11y-responsive D2，keyboard Scenario 1）。
          e2e 用它验尺寸不用 toBeVisible：Playwright 把 sr-only 的 1px 盒算 visible，与视觉隐藏不是一回事；
          jsdom 与部分场景下锚点跳转不移焦点，onClick 显式聚焦 main */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        跳到主内容
      </a>
      <MobileTopBar navOpen={navOpen} onOpen={() => setNavOpen(true)} buttonRef={burgerRef} />
      {navOpen && (
        <div
          data-testid="nav-scrim"
          aria-hidden="true"
          onClick={closeNav}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <Sidebar drawerOpen={navOpen} onClose={closeNav} />
      {/* 抽屉打开时锁滚动作用在 main（AppLayout 是 h-screen overflow-hidden，滚动容器是 main 而非 body） */}
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        aria-label="主内容"
        className={cn('min-w-0 flex-1', navOpen ? 'overflow-hidden' : 'overflow-y-auto')}
      >
        {/* 窄屏不再叠双层 padding：外层 p-4 已够，内容可用宽 ≥335px（responsive Scenario 1）；
            ≥sm 保持变更前的 24px 间距，1440 观感不回归（Scenario 4） */}
        <div className="mx-auto h-full w-full max-w-7xl p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
