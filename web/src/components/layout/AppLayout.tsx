import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* skip-link：默认 sr-only 视觉隐藏（1px + clip），Tab 聚焦时弹为视口内按钮（enhance-a11y-responsive D2，keyboard Scenario 1）。
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
      <Sidebar />
      <main ref={mainRef} id="main-content" tabIndex={-1} aria-label="主内容" className="flex-1 min-w-0 overflow-y-auto">
        <div className="container mx-auto h-full max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
