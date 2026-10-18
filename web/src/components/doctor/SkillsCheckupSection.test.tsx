/**
 * SkillsCheckupSection 技能页批量体检容器测试（add-asset-doctor F5）
 *
 * 容器职责：把「库内技能 × Hub 相对路径」组装成批量清单（环境条目/Hub 外路径不进批量——
 * 医生只服务资产侧），交给 BatchCheckup 做 estimate→并发诊断。组件内部行为在
 * BatchCheckup.test.tsx 覆盖，这里只断言清单口径与错误透出。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillsCheckupSection } from './SkillsCheckupSection';
import { api } from '@/lib/api';
import type { SkillInfo, SkillListResult } from '@/types/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    api: {
      ...actual.api,
      getHubHealth: vi.fn(),
      listSkills: vi.fn(),
      doctorEstimate: vi.fn(),
    },
  };
});

function skill(name: string, path: string, inLibrary: boolean): SkillInfo {
  return {
    id: name,
    name,
    description: '',
    functionCategory: 'other',
    provenance: 'self',
    inLibrary,
    tool: 'trae',
    path,
    version: '',
    functionSource: 'manual',
    variants: 0,
  };
}

function listResult(items: SkillInfo[]): SkillListResult {
  return {
    items,
    total: items.length,
    countByFunction: { other: items.length } as SkillListResult['countByFunction'],
    countByProvenance: { self: items.length } as SkillListResult['countByProvenance'],
    countByStatus: { in: items.length, out: 0 },
    countByScope: { asset: items.length, environment: 0 },
  };
}

function renderSection(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SkillsCheckupSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getHubHealth).mockReset();
  vi.mocked(api.listSkills).mockReset();
  vi.mocked(api.doctorEstimate).mockReset();
});

describe('SkillsCheckupSection', () => {
  it('点「全部体检」组装清单：仅库内技能、仅 Hub 内路径，estimate 随后发起', async () => {
    vi.mocked(api.getHubHealth).mockResolvedValue({
      hubRoot: 'C:/hub',
      hubExists: true,
      hubTomlExists: true,
      fileCountByCategory: {},
      totalFiles: 0,
    });
    vi.mocked(api.listSkills).mockResolvedValue(
      listResult([
        skill('demo-a', 'C:\\hub\\skills\\demo-a\\SKILL.md', true),
        skill('env-x', 'D:\\tools\\skills\\env-x\\SKILL.md', true),
        skill('out-y', 'C:\\hub\\skills\\out-y\\SKILL.md', false),
      ]),
    );
    vi.mocked(api.doctorEstimate).mockResolvedValue({ category: 'skill', total: 1, cacheHits: 0, willCall: 1 });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    expect(await screen.findByText(/将调用 1 次模型/)).toBeInTheDocument();
    expect(api.listSkills).toHaveBeenCalledWith(expect.objectContaining({ scope: 'asset' }));
    expect(api.doctorEstimate).toHaveBeenCalledWith('skill');
  });

  it('Hub 健康读取失败：错误文案透出且不发起 estimate', async () => {
    vi.mocked(api.getHubHealth).mockRejectedValue(new Error('Hub 不可用'));
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: '全部体检' }));
    expect(await screen.findByText(/Hub 不可用/)).toBeInTheDocument();
    expect(api.doctorEstimate).not.toHaveBeenCalled();
  });
});
