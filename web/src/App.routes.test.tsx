/**
 * 旧 URL 重定向测试（refactor-home-action-panel T13）
 *
 * spec: specs/navigation.spec.md Requirement 4 Scenario 4.2 / 4.3
 * 断言：六条旧地址逐条映射到新地址；跳转为替换式（不新增历史记录）；未知路径行为不变（落 `/`）。
 * 页面与布局全部打桩，只验证路由映射本身。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import App from './App';

vi.mock('./components/layout/AppLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { AppLayout: (): JSX.Element => <Outlet /> };
});

vi.mock('./components/onboarding/FirstRunGate', () => ({
  FirstRunGate: ({ children }: { children: JSX.Element }): JSX.Element => <>{children}</>,
}));

vi.mock('./components/ui/toast', () => ({ Toaster: (): null => null }));

vi.mock('./pages/Home', () => ({ default: (): JSX.Element => <div>page-home</div> }));
vi.mock('./pages/Vault', () => ({ default: (): JSX.Element => <div>page-vault</div> }));
vi.mock('./pages/Connections', () => ({ default: (): JSX.Element => <div>page-connections</div> }));
vi.mock('./pages/Sync', () => ({ default: (): JSX.Element => <div>page-sync</div> }));
vi.mock('./pages/Swap', () => ({ default: (): JSX.Element => <div>page-swap</div> }));
vi.mock('./pages/Import', () => ({ default: (): JSX.Element => <div>page-import</div> }));
vi.mock('./pages/Discover', () => ({ default: (): JSX.Element => <div>page-discover</div> }));
vi.mock('./pages/Settings', () => ({ default: (): JSX.Element => <div>page-settings</div> }));
vi.mock('./pages/Projects', () => ({ default: (): JSX.Element => <div>page-projects</div> }));
vi.mock('./pages/Duplicates', () => ({ default: (): JSX.Element => <div>page-duplicates</div> }));
vi.mock('./pages/Governance', () => ({ default: (): JSX.Element => <div>page-governance</div> }));
vi.mock('./pages/Activities', () => ({ default: (): JSX.Element => <div>page-activities</div> }));
vi.mock('./pages/Onboarding', () => ({ default: (): JSX.Element => <div>page-onboarding</div> }));
// T13 之后这些旧页面不再挂路由，桩仍保留以明确「不再直接渲染」
vi.mock('./pages/Tools', () => ({ default: (): JSX.Element => <div>page-tools</div> }));
vi.mock('./pages/Dashboard', () => ({ default: (): JSX.Element => <div>page-dashboard</div> }));
vi.mock('./pages/Identity', () => ({ default: (): JSX.Element => <div>page-identity</div> }));
vi.mock('./pages/Skills', () => ({ default: (): JSX.Element => <div>page-skills</div> }));
vi.mock('./pages/Rules', () => ({ default: (): JSX.Element => <div>page-rules</div> }));
vi.mock('./pages/Mcp', () => ({ default: (): JSX.Element => <div>page-mcp</div> }));

function LocationProbe(): JSX.Element {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div data-testid="location" data-nav-type={navigationType}>
      {location.pathname}
    </div>
  );
}

function renderAt(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ['/identity', '/vault/identity'],
  ['/rules', '/vault/rule'],
  ['/skills', '/vault/skill'],
  ['/mcp', '/vault/mcp'],
  ['/tools', '/connections'],
  ['/legacy/dashboard', '/'],
];

describe('App 旧 URL 重定向', () => {
  it.each(REDIRECTS)('%s 替换式跳转到 %s', async (from, to) => {
    renderAt(from);
    const probe = await screen.findByTestId('location');
    await waitFor(() => expect(probe.textContent).toBe(to));
    // 替换式：导航类型为 REPLACE，用户按返回不会被弹回旧地址
    expect(probe.dataset.navType).toBe('REPLACE');
  });

  it('未知路径仍落到首页，且为替换式', async () => {
    renderAt('/no-such-page');
    const probe = await screen.findByTestId('location');
    await waitFor(() => expect(probe.textContent).toBe('/'));
    expect(probe.dataset.navType).toBe('REPLACE');
    expect(await screen.findByText('page-home')).toBeInTheDocument();
  });

  it('保留路径行为不变（不触发跳转）', async () => {
    renderAt('/vault/skill');
    const probe = await screen.findByTestId('location');
    expect(probe.textContent).toBe('/vault/skill');
    expect(probe.dataset.navType).toBe('POP');
    expect(await screen.findByText('page-vault')).toBeInTheDocument();
  });
});
