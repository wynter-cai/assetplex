import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link, BrowserRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Vault from './Vault';
import { api } from '@/lib/api';
import { useToastStore } from '@/lib/toast-store';
import { makeAsset, makeCategoryDescriptor } from '@/lib/test-factories';
import type { Asset, SkillListResult } from '@/types/api';

/**
 * 资产库类别页页头（spec refactor-design-system page-headers）：
 * 实测背景是资产库各页无 H1，只能靠侧栏高亮判断位置——现在每个类别页必须有类别名 H1。
 */
beforeEach(() => {
  vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [], total: 0 });
  // 详情打开会拉正文；缺省给一份空正文，避免测试里打到真实网络
  vi.spyOn(api, 'getAsset').mockImplementation(async (id: string) => ({
    ...makeAsset({ id }),
    content: '',
  }));
});

/** 地址探针：断言深链写入/移除与类别切换后的地址形态 */
function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

interface RenderOptions {
  /** 附带一个切换类别的真实链接（走 react-router 导航，验证状态清理） */
  nav?: boolean;
}

function renderVault(path: string, options: RenderOptions = {}): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        {options.nav === true && <Link to="/vault/identity">切换到身份</Link>}
        <Routes>
          <Route path="/vault" element={<Vault />} />
          <Route path="/vault/:category" element={<Vault />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 用真实 BrowserRouter 渲染：验证地址改写走 replace，不往历史里塞条目 */
function renderVaultAt(path: string): ReturnType<typeof render> {
  window.history.replaceState({}, '', path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/vault" element={<Vault />} />
          <Route path="/vault/:category" element={<Vault />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('Vault 类别页标准页头', () => {
  it('规则类别页呈现 H1「规则」', () => {
    renderVault('/vault/rule');
    expect(screen.getByRole('heading', { level: 1, name: '规则' })).toBeInTheDocument();
  });

  it('身份类别页呈现 H1「身份」', () => {
    renderVault('/vault/identity');
    expect(screen.getByRole('heading', { level: 1, name: '身份' })).toBeInTheDocument();
  });

  it('MCP 类别页呈现 H1「MCP」', () => {
    renderVault('/vault/mcp');
    expect(screen.getByRole('heading', { level: 1, name: 'MCP' })).toBeInTheDocument();
  });

  it('全部资产页呈现 H1「全部资产」', () => {
    renderVault('/vault');
    expect(screen.getByRole('heading', { level: 1, name: '全部资产' })).toBeInTheDocument();
  });
});

describe('Vault 类别导航单轨与详情 overlay（spec refactor-design-system navigation-consolidation）', () => {
  const asset: Asset = {
    id: 'a1',
    name: '示例规则',
    category: 'rule',
    hubPath: 'hub/rule/a1',
    source: 'manual',
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    size: 100,
    distributions: [],
  };

  beforeEach(() => {
    // 两个资产：单资产会按 T4 自动展开详情，点击卡片就变成「收起」，测不到打开动作
    const sibling: Asset = { ...asset, id: 'a2', name: '示例规则二', hubPath: 'hub/rule/a2' };
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset, sibling], total: 2 });
    vi.spyOn(api, 'getAsset').mockResolvedValue({ ...asset, content: '# 示例' });
  });

  it('页内无重复类别栏（类别导航单轨，仅全局侧栏一处）', () => {
    renderVault('/vault/rule');
    expect(screen.queryByRole('button', { name: /全部资产/ })).not.toBeInTheDocument();
  });

  it('详情打开时列表保持渲染，详情面板具备窄屏 overlay 钩子（fixed + lg:static）', async () => {
    renderVault('/vault/rule');
    fireEvent.click(await screen.findByText('示例规则'));
    const overlay = await screen.findByTestId('detail-overlay');
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('lg:static');
    // 列表不被详情替换（关闭可返回列表状态）
    expect(screen.getAllByText('示例规则').length).toBeGreaterThan(0);
  });
});

describe('Vault 技能页容器高度（spec navigation-consolidation 长列表滚动中打开详情）', () => {
  const emptySkills: SkillListResult = {
    total: 0,
    items: [],
    countByFunction: {
      coding: 0, writing: 0, browser: 0, data: 0, devops: 0,
      'ai-integration': 0, design: 0, workflow: 0, other: 0,
    },
    countByProvenance: { self: 0, marketplace: 0, plugin: 0, builtin: 0 },
    countByStatus: { in: 0, out: 0 },
    countByScope: { asset: 0, environment: 0 },
  };

  it('外部类别页容器不自拉伸（self-start），否则右侧详情面板没有 sticky 可粘滞空间', async () => {
    vi.spyOn(api, 'listSkills').mockResolvedValue(emptySkills);
    renderVault('/vault/skill');
    await screen.findByRole('heading', { level: 1, name: '技能' });
    const host = screen.getByTestId('external-view-host');
    expect(host.className).toContain('self-start');
  });
});

/**
 * spec: asset-center-consistency Scenario 1（后端声明源是唯一真相）
 * 关联: fix-trust-and-consistency tasks I1
 */
describe('Vault 类别清单以接口为准（I1）', () => {
  it('接口下发的 label 覆盖 fallback 常量', async () => {
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      categories: [makeCategoryDescriptor({ code: 'rule', label: '约定', order: 30 })],
    });

    renderVault('/vault/rule');

    await screen.findByRole('heading', { level: 1, name: '约定' });
    expect(screen.queryByRole('heading', { level: 1, name: '规则' })).not.toBeInTheDocument();
  });

  it('接口标为 external 的类别走专用视图，不打 /api/assets', async () => {
    const listAssets = vi.spyOn(api, 'listAssets');
    vi.spyOn(api, 'getAssetCategories').mockResolvedValue({
      declaredAt: '2026-10-26T00:00:00.000Z',
      // 用 fallback 里没有的类别，确保初始渲染处于“等接口清单”状态
      categories: [makeCategoryDescriptor({ code: 'plugin', label: '插件', external: true, order: 70 })],
    });

    renderVault('/vault/plugin');

    await screen.findByTestId('external-view-host');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listAssets).not.toHaveBeenCalled();
  });

  it('接口失败时不无限等清单：未知类别照常加载', async () => {
    const listAssets = vi.spyOn(api, 'listAssets');
    vi.spyOn(api, 'getAssetCategories').mockRejectedValue(new Error('network down'));

    renderVault('/vault/unknown-code');

    await waitFor(() => expect(listAssets).toHaveBeenCalled());
  });
});

/**
 * spec: asset-distribution-truth Scenario 8（判定失败必须诚实降级）
 * 关联: fix-trust-and-consistency tasks I2
 */
describe('Vault 分发索引降级提示（I2）', () => {
  const asset: Asset = {
    id: 'rules/safety.md',
    name: '示例规则',
    category: 'rule',
    hubPath: 'rules/safety.md',
    source: 'manual',
    lastModifiedAt: '2026-10-01T00:00:00.000Z',
    size: 100,
    distributions: [],
  };

  it('索引 partial 时页面出现一行「部分工具状态暂不可用」', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset], total: 1 });
    vi.spyOn(api, 'getDistributions').mockResolvedValue({
      generatedAt: '2026-10-26T00:00:00.000Z',
      cached: false,
      partial: true,
      failedTools: ['claude'],
      index: { 'rules/safety.md': [{ toolId: 'trae-cn', toolName: 'TRAE 中国版', status: 'synced' }] },
      projectTools: [],
    });

    renderVault('/vault/rule');

    await screen.findByText('部分工具状态暂不可用');
    // 失败工具不伪装成任何圆点，已有真值的工具照常渲染
    expect(screen.queryByTestId('distribution-dot-claude')).not.toBeInTheDocument();
    expect(screen.getByTestId('distribution-dot-trae-cn')).toBeInTheDocument();
  });

  it('索引完整时不出现降级提示', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [asset], total: 1 });
    vi.spyOn(api, 'getDistributions').mockResolvedValue({
      generatedAt: '2026-10-26T00:00:00.000Z',
      cached: false,
      partial: false,
      failedTools: [],
      index: {},
      projectTools: [],
    });

    renderVault('/vault/rule');

    await screen.findByText('示例规则');
    expect(screen.queryByText('部分工具状态暂不可用')).not.toBeInTheDocument();
  });
});

/**
 * spec: asset-center-consistency Scenario 6/8（全部资产可筛选可分页；空态与失败态不说假话）
 * 关联: fix-trust-and-consistency tasks I3
 */
describe('Vault 筛选、分页与空态/失败态（I3）', () => {
  it('全部资产页提供类别筛选与同步状态筛选，数量实时可见', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({
      items: [
        makeAsset({ id: 'rules/a.md', name: '规则A', category: 'rule' }),
        makeAsset({ id: 'identity/me.md', name: '身份', category: 'identity' }),
      ],
      total: 2,
    });

    renderVault('/vault');

    await screen.findByLabelText('按类别筛选');
    expect(screen.getByLabelText('按同步状态筛选')).toBeInTheDocument();
    expect(screen.getByText('共 2 项资产')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('按类别筛选'), { target: { value: 'identity' } });
    expect(screen.getByText('共 1 项资产')).toBeInTheDocument();
  });

  it('URL 已锁定类别时不给类别筛选，避免与侧栏双轨', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({
      items: [
        makeAsset({ id: 'rules/a.md', name: '规则A', category: 'rule' }),
        makeAsset({ id: 'rules/b.md', name: '规则B', category: 'rule' }),
      ],
      total: 2,
    });

    renderVault('/vault/rule');

    await screen.findByLabelText('按同步状态筛选');
    expect(screen.queryByLabelText('按类别筛选')).not.toBeInTheDocument();
  });

  it('请求失败时给错误与重试，不显示「共 0 项」', async () => {
    vi.spyOn(api, 'listAssets').mockRejectedValue(new Error('boom'));

    renderVault('/vault/rule');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText(/共 \d+ 项资产/)).not.toBeInTheDocument();
  });

  it('类别下拉只列列表里真正出现的类别（技能虽走专用视图，但已在全部资产里就要能筛）', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({
      items: [
        makeAsset({ id: 'skills/demo/SKILL.md', name: '示例技能', category: 'skill' }),
        makeAsset({ id: 'rules/a.md', name: '规则A', category: 'rule' }),
      ],
      total: 2,
    });

    renderVault('/vault');

    const select = await screen.findByLabelText('按类别筛选');
    expect(within(select).getByRole('option', { name: '技能' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '规则' })).toBeInTheDocument();
    // 列表里没有的类别（裁决准则只走专用接口）不进选项
    expect(within(select).queryByRole('option', { name: '裁决准则' })).not.toBeInTheDocument();
  });

  it('库为空时说明「还没有资产」并给出主动作「从工具收藏到我的库」', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [], total: 0 });

    renderVault('/vault');

    expect(await screen.findByText('还没有资产')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从工具收藏到我的库' })).toBeInTheDocument();
  });
});

/**
 * memory-visible Scenario 4：重名（大小写不敏感）拒绝保存并提示，磁盘不留半成品
 *
 * 后端 createHubFile 抛「文件已存在」，但之前前端 onError 缺位：
 * 保存失败时面板静默停住、用户看不到任何提示（T15 走查回灌）。
 */
describe('Vault 新建/保存失败提示（memory-visible Scenario 4）', () => {
  it('重名时弹出错误提示，且新建面板不静默关闭', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({
      items: [makeAsset({ id: 'memory/team-decisions.md', name: 'team-decisions', category: 'memory' })],
      total: 1,
    });
    vi.spyOn(api, 'createAsset').mockRejectedValue(
      new Error('文件已存在：memory/team-decisions.md（与 team-decisions.md 重名）'),
    );
    useToastStore.getState().reset();

    renderVault('/vault/memory');

    fireEvent.click(await screen.findByRole('button', { name: '新建' }));
    fireEvent.change(screen.getByPlaceholderText('资产名称（如 react-expert）'), {
      target: { value: 'Team-Decisions' },
    });
    fireEvent.change(screen.getByPlaceholderText('在此输入 Markdown 内容...'), {
      target: { value: '# 正文' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(
        toasts.some((t) => t.variant === 'error' && (t.description ?? '').includes('文件已存在')),
      ).toBe(true);
    });
    // 失败不关面板：用户能改名重试，不会误以为已保存
    expect(screen.getByText('新建资产')).toBeInTheDocument();
  });
});

/**
 * spec: refactor-asset-pipeline T4（资产库三套布局）
 *
 * 0 个资产只留居中空态与唯一出口；1 个资产自动展开一次详情且列表收窄；
 * ≥2 个维持自适应网格 + 详情栏。单资产不再摆搜索与同步状态筛选。
 */
describe('Vault 三套布局（T4）', () => {
  const safety = makeAsset({ id: 'rules/safety.md', name: '安全规则', category: 'rule' });
  const style = makeAsset({ id: 'rules/style.md', name: '风格规则', category: 'rule' });

  it('0 个资产：居中空态 + 单一主操作，不渲染搜索/筛选/分页/详情栏', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [], total: 0 });

    renderVault('/vault/rule');

    const title = await screen.findByText('我的库里还没有规则');
    const emptyBlock = title.parentElement as HTMLElement;
    // 居中空态：文案区块水平居中，且只有一个出口
    expect(emptyBlock.className).toContain('text-center');
    expect(within(emptyBlock).getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '从已安装的工具收藏规则' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('搜索资产...')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('按类别筛选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('按同步状态筛选')).not.toBeInTheDocument();
    expect(screen.queryByTestId('asset-pagination')).not.toBeInTheDocument();
    expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument();
  });

  it('单资产自动展开一次详情，列表收窄且保留单卡选中态', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety], total: 1 });

    renderVault('/vault/rule');

    expect(await screen.findByTestId('detail-overlay')).toBeInTheDocument();
    // 自动展开不是用户选择，不写地址
    expect(screen.getByTestId('location').textContent).not.toContain('asset=');
    // 列表列不能拉伸到整宽，否则单卡占满内容区、下方留大片空白
    expect(screen.getByTestId('asset-list-column').className).toContain('lg:w-[340px]');
    expect(screen.getByRole('button', { name: '收起 安全规则 详情' })).toBeInTheDocument();
  });

  it('关闭后本次停留不再自动展开，并给出「展开详情」入口', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety], total: 1 });

    renderVault('/vault/rule');
    await screen.findByTestId('detail-overlay');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '展开详情' })).toBeInTheDocument();
    // 列表重渲染也不得再次抢开
    await waitFor(() => expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument());
    expect(screen.getByTestId('location').textContent).not.toContain('asset=');
  });

  it('点「展开详情」可再次打开，并写入 asset 参数', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety], total: 1 });

    renderVault('/vault/rule');
    await screen.findByTestId('detail-overlay');
    fireEvent.keyDown(window, { key: 'Escape' });
    await screen.findByRole('button', { name: '展开详情' });

    fireEvent.click(screen.getByRole('button', { name: '展开详情' }));

    expect(await screen.findByTestId('detail-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toContain('asset=rules%2Fsafety.md');
  });

  it('≥2 个资产：不自动展开，列表用自适应网格，点卡片才打开详情', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety, style], total: 2 });

    renderVault('/vault/rule');

    expect(await screen.findByText('安全规则')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('asset-list-column').className).toContain('flex-1');

    fireEvent.click(screen.getByText('安全规则'));

    expect(await screen.findByTestId('detail-overlay')).toBeInTheDocument();
  });

  it('单资产不渲染搜索框与同步状态筛选，保留「共 N 项」计数', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety], total: 1 });

    renderVault('/vault/rule');

    await screen.findByText('安全规则');
    expect(screen.queryByPlaceholderText('搜索资产...')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('按类别筛选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('按同步状态筛选')).not.toBeInTheDocument();
    expect(screen.getByText('共 1 项资产')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-pagination')).not.toBeInTheDocument();
  });

  it('切换类别时重置详情、搜索与筛选', async () => {
    vi.spyOn(api, 'listAssets').mockImplementation(async (params) => {
      const items =
        params?.category === 'identity'
          ? [
              makeAsset({ id: 'identity/a.md', name: '人设A', category: 'identity' }),
              makeAsset({ id: 'identity/b.md', name: '人设B', category: 'identity' }),
            ]
          : [safety, style];
      return { items, total: items.length };
    });

    renderVault('/vault/rule', { nav: true });

    fireEvent.change(await screen.findByPlaceholderText('搜索资产...'), {
      target: { value: '安全' },
    });
    // 搜索词进 queryKey，新结果落地前是骨架屏
    fireEvent.click(await screen.findByText('安全规则'));
    await screen.findByTestId('detail-overlay');
    fireEvent.change(screen.getByLabelText('按同步状态筛选'), { target: { value: 'synced' } });

    fireEvent.click(screen.getByRole('link', { name: '切换到身份' }));

    await screen.findByText('人设A');
    expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument();
    // 搜索词与筛选随类别归零（新类别 URL 无 q，筛选面板随之重挂）
    expect(screen.getByPlaceholderText('搜索资产...')).toHaveValue('');
    expect(screen.getByLabelText('按同步状态筛选')).toHaveValue('all');
    expect(screen.getByTestId('location').textContent).toBe('/vault/identity');
  });
});

/**
 * spec: refactor-asset-pipeline T5（单资产深链与来源回退）
 *
 * `?asset=<库内相对路径>` 是详情是否打开的唯一真源：直接打开按路径定位；
 * 未命中落类别列表并提示；开关详情都 replace，不新增历史。
 */
describe('Vault 单资产深链（T5）', () => {
  const safety = makeAsset({ id: 'rules/safety.md', name: '安全规则', category: 'rule' });
  const style = makeAsset({ id: 'rules/style.md', name: '风格规则', category: 'rule' });

  beforeEach(() => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety, style], total: 2 });
    vi.spyOn(api, 'getAsset').mockResolvedValue({ ...safety, content: '# 安全' });
    useToastStore.getState().reset();
  });

  it('直接打开带 asset 参数的地址：列表落地后定位并打开详情', async () => {
    renderVault('/vault/rule?asset=rules%2Fsafety.md');

    expect(await screen.findByTestId('detail-overlay')).toBeInTheDocument();
    expect(await screen.findByText('查看资产')).toBeInTheDocument();
    expect(screen.getByText('路径：rules/safety.md')).toBeInTheDocument();
  });

  it('关闭详情移除 asset 参数，且打开/关闭都走 replace 不新增历史', async () => {
    renderVaultAt('/vault/rule');
    const historyLengthBeforeNavigation = window.history.length;

    fireEvent.click(await screen.findByText('安全规则'));

    await waitFor(() =>
      expect(window.location.search).toBe('?asset=rules%2Fsafety.md'),
    );
    expect(window.history.length).toBe(historyLengthBeforeNavigation);

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(window.history.length).toBe(historyLengthBeforeNavigation);
  });

  it('资产不存在时落类别列表并提示，且不发起诊断请求', async () => {
    const getAsset = vi.spyOn(api, 'getAsset');
    const diagnose = vi.spyOn(api, 'doctorDiagnose');

    renderVault('/vault/rule?asset=rules%2Fgone.md');

    expect(await screen.findByText('安全规则')).toBeInTheDocument();
    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some((t) => t.title === '资产不存在或已被移动')).toBe(true);
    });
    expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument();
    expect(getAsset).not.toHaveBeenCalled();
    expect(diagnose).not.toHaveBeenCalled();
    // 未命中后落回类别列表，地址里不留 asset
    expect(screen.getByTestId('location').textContent).toBe('/vault/rule');
  });

  it('单资产自动展开不写地址，用户主动点卡片才写', async () => {
    vi.spyOn(api, 'listAssets').mockResolvedValue({ items: [safety], total: 1 });

    renderVault('/vault/rule');
    await screen.findByTestId('detail-overlay');
    expect(screen.getByTestId('location').textContent).not.toContain('asset=');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('detail-overlay')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('安全规则'));

    await screen.findByTestId('detail-overlay');
    expect(screen.getByTestId('location').textContent).toContain('asset=rules%2Fsafety.md');
    // 自动展开与主动打开不叠加成两个详情
    expect(screen.getAllByTestId('detail-overlay')).toHaveLength(1);
  });
});
