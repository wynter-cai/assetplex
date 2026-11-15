/**
 * 旧 URL 重定向测试（refactor-home-action-panel T13）
 *
 * spec: specs/navigation.spec.md Requirement 4 Scenario 4.2 / 4.3
 * spec: refactor-governance-center/specs/governance-center.spec.md Scenario 1.2 / 6.2
 * 断言：旧地址逐条映射到新地址；跳转为替换式（不新增历史记录）；未知路径行为不变（落 `/`）。
 * 页面与布局全部打桩，只验证路由映射本身。
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
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
vi.mock('./pages/Import', () => ({ default: (): JSX.Element => <div>page-import</div> }));
vi.mock('./pages/Discover', () => ({ default: (): JSX.Element => <div>page-discover</div> }));
vi.mock('./pages/Settings', () => ({ default: (): JSX.Element => <div>page-settings</div> }));
vi.mock('./pages/Projects', () => ({ default: (): JSX.Element => <div>page-projects</div> }));
vi.mock('./pages/Duplicates', () => ({ default: (): JSX.Element => <div>page-duplicates</div> }));
vi.mock('./pages/QualityCenter', () => ({
  default: (): JSX.Element => <div>page-quality-center</div>,
}));
vi.mock('./pages/QualityRules', () => ({
  default: (): JSX.Element => <div>page-quality-rules</div>,
}));
vi.mock('./pages/QualityBatch', () => ({
  default: (): JSX.Element => <div>page-quality-batch</div>,
}));
vi.mock('./components/criteria/CriteriaView', () => ({
  CriteriaView: (): JSX.Element => <div>page-quality-criteria</div>,
}));
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

/** 历史探针：模拟「点旧地址链接 → 浏览器后退」的完整路径 */
function HistoryProbe(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div>
      <div data-testid="probe-location">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/governance')}>
        去旧治理地址
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        后退
      </button>
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
  ['/swap', '/sync'],
  ['/legacy/dashboard', '/'],
  ['/governance', '/quality'],
  ['/governance/batch', '/quality/batch'],
  ['/vault/criteria', '/quality/criteria'],
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

describe('App 质量中心路由（governance-center Scenario 1.2 / 1.4 / 6.1）', () => {
  it.each([
    ['/quality', 'page-quality-center'],
    ['/quality/batch', 'page-quality-batch'],
    ['/quality/rules', 'page-quality-rules'],
    ['/quality/criteria', 'page-quality-criteria'],
  ])('%s 渲染质量中心对应页面', async (path, text) => {
    renderAt(path);
    const probe = await screen.findByTestId('location');
    expect(probe.textContent).toBe(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('从 /quality 后退不会弹回 /governance（旧地址已被替换出历史）', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
        <HistoryProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '去旧治理地址' }));
    await waitFor(() => expect(screen.getByTestId('probe-location').textContent).toBe('/quality'));
    expect(await screen.findByText('page-quality-center')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '后退' }));
    await waitFor(() => expect(screen.getByTestId('probe-location').textContent).toBe('/'));
    expect(await screen.findByText('page-home')).toBeInTheDocument();
  });
});
