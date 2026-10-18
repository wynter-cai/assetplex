/**
 * CriteriaView 裁决准则页测试（add-llm-conflict-arbitration A6）
 *
 * spec: specs/criteria-meta-asset.spec.md Scenario 1/2/4/1b UI 面
 * api 全 mock：准则列表/包/导入 + /files 写通道。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CriteriaView } from './CriteriaView';
import { api } from '@/lib/api';
import { getCategoryConfig } from '@/config/asset-categories';
import type { CriterionAsset, CriteriaPackTemplate } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    listCriteria: vi.fn(),
    listCriteriaPack: vi.fn(),
    importCriteriaPack: vi.fn(),
    createFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

function criterion(partial: Partial<CriterionAsset> & { slug: string; name: string }): CriterionAsset {
  return {
    relativePath: `criteria/${partial.slug}.md`,
    description: '',
    priority: 10,
    enabled: true,
    appliesTo: ['all'],
    body: '正文',
    ...partial,
  };
}

const twoCriteria = [
  // description 与准则包模板同值：同一准则导入后编辑的常见形态，开关序列化断言依赖此值
  criterion({ slug: 'token-economy', name: 'Token 效率', description: '只写模型不知道的', priority: 5, appliesTo: ['all'] }),
  criterion({ slug: 'rule-topic', name: '规则单主题', priority: 20, appliesTo: ['rule'], enabled: false, source: '社区规范' }),
];

const packTemplates: CriteriaPackTemplate[] = [
  { slug: 'skill-progressive-disclosure', name: '技能渐进披露', description: '正文精炼', priority: 5, appliesTo: ['skill'], source: 'Anthropic Agent Skills 设计指南' },
  { slug: 'token-economy', name: 'Token 效率', description: '只写模型不知道的', priority: 15, appliesTo: ['all'], source: '社区 token 优化实践' },
];

function renderView(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CriteriaView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listCriteria).mockResolvedValue({ criteria: twoCriteria });
  vi.mocked(api.listCriteriaPack).mockResolvedValue({ templates: packTemplates });
  vi.mocked(api.importCriteriaPack).mockResolvedValue({ inserted: ['skill-progressive-disclosure'], rejected: [] });
  vi.mocked(api.createFile).mockResolvedValue({ success: true });
  vi.mocked(api.writeFile).mockResolvedValue({ success: true });
  vi.mocked(api.deleteFile).mockResolvedValue({ success: true });
});

describe('列表与空态（Scenario 1）', () => {
  it('渲染准则卡：名称、优先级、来源与停用标记', async () => {
    renderView();
    expect(await screen.findByText('Token 效率')).toBeInTheDocument();
    expect(screen.getByText('规则单主题')).toBeInTheDocument();
    expect(screen.getByText('社区规范')).toBeInTheDocument();
    // 停用准则有明确的关闭态开关
    const switches = screen.getAllByRole('switch');
    expect(switches.some((s) => s.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('空库显示空态并给两个动作，不自动写任何文件', async () => {
    vi.mocked(api.listCriteria).mockResolvedValue({ criteria: [] });
    renderView();
    expect(await screen.findByText(/还没有准则/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建准则/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导入业内准则包/ })).toBeInTheDocument();
    expect(api.createFile).not.toHaveBeenCalled();
    expect(api.writeFile).not.toHaveBeenCalled();
  });
});

describe('启用开关与删除（Scenario 4）', () => {
  it('切换开关以重新序列化内容写回文件', async () => {
    renderView();
    const first = await screen.findByText('Token 效率');
    const card = first.closest('[data-testid^="criterion-card-"]');
    const toggle = card?.querySelector('[role="switch"]') as HTMLElement;
    fireEvent.click(toggle);
    await waitFor(() => expect(api.writeFile).toHaveBeenCalledTimes(1));
    const [path, content] = vi.mocked(api.writeFile).mock.calls[0];
    expect(path).toBe('criteria/token-economy.md');
    expect(content).toContain('enabled: false');
    expect(content).toContain('只写模型不知道的') // 序列化包含 description
  });

  it('删除有确认对话框并警示裁决质量影响', async () => {
    renderView();
    const del = await screen.findAllByRole('button', { name: /删除/ });
    fireEvent.click(del[0]);
    expect(await screen.findByText(/仲裁与诊断/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: /确认删除/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.deleteFile).toHaveBeenCalledTimes(1));
  });
});

describe('新建准则（Scenario 2）', () => {
  it('对话框保存走 createFile 生成 criteria/<slug>.md 带 frontmatter', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /新建准则/ }));
    const nameInput = await screen.findByLabelText(/名称/);
    fireEvent.change(nameInput, { target: { value: 'My Rule' } });
    const bodyInput = screen.getByLabelText(/正文/);
    fireEvent.change(bodyInput, { target: { value: '要做 X，不做 Y' } });
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(api.createFile).toHaveBeenCalledTimes(1));
    const [path, content] = vi.mocked(api.createFile).mock.calls[0];
    expect(path).toMatch(/^criteria\/my-rule(-[\w]+)?\.md$/);
    expect(content).toContain('name: My Rule');
    expect(content).toContain('要做 X，不做 Y');
  });
});

describe('业内准则包导入（Scenario 1b/3）', () => {
  it('勾选导入：调用 importCriteriaPack 并披露同名拒绝', async () => {
    vi.mocked(api.importCriteriaPack).mockResolvedValue({ inserted: ['skill-progressive-disclosure'], rejected: ['token-economy'] });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /导入业内准则包/ }));
    expect(await screen.findByText('技能渐进披露')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /技能渐进披露/ });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /导入选中/ }));
    await waitFor(() => expect(api.importCriteriaPack).toHaveBeenCalledWith(['skill-progressive-disclosure']));
    expect(await screen.findByText(/已存在，未覆盖/)).toBeInTheDocument();
  });
});

describe('导航配置驱动（A7）', () => {
  it('criteria 已入资产类别配置（Sidebar/Vault 由清单驱动渲染）', () => {
    const config = getCategoryConfig('criteria');
    expect(config).toBeDefined();
    expect(config?.external).toBe(true);
    expect(config?.label).toBe('裁决准则');
  });
});
