/**
 * 技能发现页流程测试（add-github-skill-source L2/L3/L4 组件测试）
 *
 * 断言用户可见行为：发现→候选清单；预览只读且未点确认零入库请求；同名默认跳过；
 * 未配置 AI 时打标置灰；确认后落结果屏。api.github 全 mock，不碰网络。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Discover from './Discover';
import { api } from '@/lib/api';
import type { GithubDiscoverResult, GithubCurateResult } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    listSkills: vi.fn(),
    getAiClassifyConfig: vi.fn(),
    github: {
      discover: vi.fn(),
      preview: vi.fn(),
      curate: vi.fn(),
      classifyEstimate: vi.fn(),
      classify: vi.fn(),
    },
  },
}));

const github = api.github as unknown as Record<string, ReturnType<typeof vi.fn>>;

const DISCOVER: GithubDiscoverResult = {
  repo: 'acme/skills',
  sha: 'deadbeefcafe',
  shortSha: 'deadbe',
  candidates: [
    { name: 'foo', description: 'Foo 技能', skillPath: 'skills/foo/SKILL.md', dirPath: 'skills/foo', sizeBytes: 120, supportingFileCount: 1 },
  ],
  notes: [],
  cached: false,
};

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Discover />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function toCandidateStep(): Promise<void> {
  fireEvent.change(screen.getByLabelText('GitHub 源'), { target: { value: 'acme/skills' } });
  fireEvent.click(screen.getByRole('button', { name: '发现技能' }));
  await screen.findByText('foo');
}

beforeEach(() => {
  vi.clearAllMocks();
  github.discover.mockResolvedValue(DISCOVER);
  github.preview.mockResolvedValue({ skillPath: 'skills/foo/SKILL.md', name: 'foo', description: 'Foo 技能', content: '正文', contentTruncated: false, supportingFiles: [] });
  github.curate.mockResolvedValue({ created: [{ id: 'foo', name: 'foo' }], skipped: [], failed: [], backupRefs: [], suggestDoctor: true } as unknown as GithubCurateResult);
  (api.listSkills as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
  (api.getAiClassifyConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ baseUrl: 'https://llm.test/v1', model: 'm', hasApiKey: true });
});

describe('Discover 页', () => {
  it('发现 → 候选清单，展示候选名与锁定 SHA', async () => {
    renderPage();
    await toCandidateStep();
    expect(github.discover).toHaveBeenCalledWith('acme/skills', false);
    expect(screen.getByText('Foo 技能')).toBeInTheDocument();
    expect(screen.getByText(/deadbe/)).toBeInTheDocument();
  });

  it('预览只读：打开预览发 preview 请求，未点确认零 curate 请求', async () => {
    renderPage();
    await toCandidateStep();
    fireEvent.click(screen.getByRole('button', { name: /预览/ }));
    await waitFor(() => expect(github.preview).toHaveBeenCalledWith({ repo: 'acme/skills', sha: 'deadbeefcafe', skillPath: 'skills/foo/SKILL.md' }));
    expect(github.curate).not.toHaveBeenCalled();
  });

  it('同名已存在缺省跳过：确认后 curate item.action=skip，落结果屏', async () => {
    (api.listSkills as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ id: 'foo', name: 'foo', inLibrary: true }], total: 1 });
    renderPage();
    await toCandidateStep();
    fireEvent.click(screen.getByRole('button', { name: /下一步：确认收藏/ }));
    await screen.findByText('同名已存在');
    fireEvent.click(screen.getByRole('button', { name: '确认收藏' }));
    await waitFor(() => expect(github.curate).toHaveBeenCalledTimes(1));
    const arg = github.curate.mock.calls[0][0] as { items: { skillPath: string; name: string; action?: string }[] };
    expect(arg.items[0]).toEqual({ skillPath: 'skills/foo/SKILL.md', name: 'foo', action: 'skip' });
    await screen.findByText('收藏结果');
    expect(screen.getByText('立即体检')).toBeInTheDocument();
  });

  it('未配置 AI：智能打标按钮置灰', async () => {
    (api.getAiClassifyConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ baseUrl: '', model: '', hasApiKey: false });
    renderPage();
    await toCandidateStep();
    expect(screen.getByRole('button', { name: /智能打标/ })).toBeDisabled();
  });

  it('非法源串：本地拦截，不发 discover 请求', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('GitHub 源'), { target: { value: 'oops' } });
    fireEvent.click(screen.getByRole('button', { name: '发现技能' }));
    await waitFor(() => expect(github.discover).not.toHaveBeenCalled());
    expect(screen.queryByText('Foo 技能')).not.toBeInTheDocument();
  });
});
