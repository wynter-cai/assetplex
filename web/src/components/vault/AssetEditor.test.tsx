/**
 * AssetEditor 资产医生入口测试（add-asset-doctor G3 走查缺口回灌）
 *
 * 浏览器走查发现 /vault/rule 主视图详情无体检入口（医生只接了旧 /rules 页）。
 * 口径：view 模式下 rule/identity/memory 类别提供「资产医生」；mcp/skill 类别不提供
 * （mcp 一期不做诊断；skill 走技能页专属视图）。
 * 关联：add-memory-category T12 走查前的补齐（memory-visible Scenario 7）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetEditor } from './AssetEditor';
import { api } from '@/lib/api';
import type { Asset } from '@/types/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    api: {
      ...actual.api,
      getHubHealth: vi.fn(),
      doctorDiagnose: vi.fn(),
    },
  };
});

function asset(category: string, hubPath: string): Asset & { content?: string } {
  return {
    id: hubPath,
    name: 'demo-asset',
    category: category as Asset['category'],
    hubPath,
    source: 'manual',
    lastModifiedAt: '2026-10-18T00:00:00.000Z',
    size: 10,
    distributions: [],
    content: '正文',
  };
}

function renderEditor(a: Asset & { content?: string }, mode: 'view' | 'edit'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AssetEditor asset={a} mode={mode} onClose={() => undefined} onSave={async () => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getHubHealth).mockReset();
  vi.mocked(api.doctorDiagnose).mockReset();
});

describe('AssetEditor 医生入口', () => {
  it('view 模式 rule 类别：渲染「资产医生」按钮', () => {
    renderEditor(asset('rule', 'rules/demo-rule.md'), 'view');
    expect(screen.getByRole('button', { name: '资产医生' })).toBeInTheDocument();
  });

  it('view 模式 identity 类别：同样提供入口', () => {
    renderEditor(asset('identity', 'identity/profile.md'), 'view');
    expect(screen.getByRole('button', { name: '资产医生' })).toBeInTheDocument();
  });

  it('view 模式 memory 类别：提供入口（记忆也要能体检，Scenario 7）', () => {
    renderEditor(asset('memory', 'memory/demo-session.md'), 'view');
    expect(screen.getByRole('button', { name: '资产医生' })).toBeInTheDocument();
  });

  it('mcp 类别与 edit 模式均不提供医生入口（一期口径+只读红线）', () => {
    renderEditor(asset('mcp', 'mcp/mcp.sources.json'), 'view');
    expect(screen.queryByRole('button', { name: '资产医生' })).not.toBeInTheDocument();
    renderEditor(asset('rule', 'rules/demo-rule.md'), 'edit');
    expect(screen.queryByRole('button', { name: '资产医生' })).not.toBeInTheDocument();
  });
});
