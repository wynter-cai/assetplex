/**
 * DiagnosisPanel 组件测试（add-asset-doctor E6）
 *
 * spec: specs/asset-diagnosis.spec.md Scenario 1/2/4/5(披露)/7/8 的 UI 面。
 * mock api.doctorDiagnose / api.getHubHealth；按钮触发、报告渲染、降级与失败隔离展示。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiagnosisPanel } from './DiagnosisPanel';
import { toHubRelative } from '@/lib/hub-path';
import { api } from '@/lib/api';
import type { DiagnosisReport } from '@/types/api';

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

function baseReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
  return {
    kind: 'skill',
    hubRelativePath: 'skills/demo-skill/SKILL.md',
    overall: 'needs-attention',
    issues: [
      {
        severity: 'high',
        criterion: 'mechanical:description-empty',
        finding: 'description 为空',
        suggestion: '补一句触发描述',
        fixable: true,
      },
      {
        severity: 'medium',
        criterion: 'token-economy',
        finding: '正文重复通用知识',
        suggestion: '删除基础概念段',
        fixable: true,
      },
    ],
    criteriaUsed: ['token-economy'],
    criteriaSkipped: 0,
    cached: false,
    mechanicalOnly: false,
    model: 'demo-model',
    generatedAt: '2026-10-18T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(hubRelativePath = 'skills/demo-skill/SKILL.md'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DiagnosisPanel kind="skill" hubRelativePath={hubRelativePath} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getHubHealth).mockResolvedValue({
    hubRoot: 'C:/hub',
    hubExists: true,
    hubTomlExists: true,
    fileCountByCategory: {},
    totalFiles: 0,
  });
  vi.mocked(api.doctorDiagnose).mockReset();
});

describe('toHubRelative', () => {
  it('Hub 内绝对路径 → 正斜杠相对路径；Hub 外 → null', () => {
    expect(toHubRelative('C:/hub', 'C:\\hub\\skills\\demo\\SKILL.md')).toBe('skills/demo/SKILL.md');
    expect(toHubRelative('C:/hub', 'D:\\elsewhere\\SKILL.md')).toBeNull();
    expect(toHubRelative('C:/hub', 'C:\\hub')).toBeNull();
  });
});

describe('DiagnosisPanel', () => {
  it('初始只显示「资产医生」按钮，点击才发起诊断', async () => {
    vi.mocked(api.doctorDiagnose).mockResolvedValue(baseReport());
    renderPanel();
    expect(api.doctorDiagnose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));
    await waitFor(() => expect(api.doctorDiagnose).toHaveBeenCalledTimes(1));
    expect(api.doctorDiagnose).toHaveBeenCalledWith({ kind: 'skill', hubRelativePath: 'skills/demo-skill/SKILL.md' });
  });

  it('报告渲染：结论徽标 + 逐条问题（严重度/机械检查标注/准则链接/建议）', async () => {
    vi.mocked(api.doctorDiagnose).mockResolvedValue(baseReport());
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));

    expect(await screen.findByText('需关注')).toBeInTheDocument();
    expect(screen.getByText('高')).toBeInTheDocument();
    expect(screen.getByText('中')).toBeInTheDocument();
    expect(screen.getByText('description 为空')).toBeInTheDocument();
    expect(screen.getByText('删除基础概念段')).toBeInTheDocument();
    // 机械项标注「机械检查」不是链接；自定义准则是回准则页的链接
    expect(screen.getByText('机械检查')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'token-economy' });
    expect(link).toHaveAttribute('href', '/criteria?slug=token-economy');
  });

  it('健康资产正反馈：空 issues 显示「未发现违反已启用准则的问题」不凑数（Scenario 2）', async () => {
    vi.mocked(api.doctorDiagnose).mockResolvedValue(
      baseReport({ overall: 'healthy', issues: [] }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));
    expect(await screen.findByText('健康')).toBeInTheDocument();
    expect(screen.getByText('未发现违反已启用准则的问题')).toBeInTheDocument();
  });

  it('cached 与预算截断披露同仲裁机制（Scenario 4/5）', async () => {
    vi.mocked(api.doctorDiagnose).mockResolvedValue(baseReport({ cached: true, criteriaSkipped: 2 }));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));
    expect(await screen.findByText('来自缓存')).toBeInTheDocument();
    expect(screen.getByText(/2 条准则未参与本次诊断/)).toBeInTheDocument();
  });

  it('AI 未配置机械降级：展示配置引导与入口（Scenario 7）', async () => {
    vi.mocked(api.doctorDiagnose).mockResolvedValue(
      baseReport({ overall: 'at-risk', mechanicalOnly: true, issues: [baseReport().issues[0]], criteriaUsed: [], model: '' }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));
    expect(await screen.findByText(/配置 AI 端点后可诊断语义质量问题/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去配置 AI 服务' })).toHaveAttribute('href', '/skills');
    expect(screen.getByText('有风险')).toBeInTheDocument();
  });

  it('诊断失败如实展示后端文案，不产生半成品报告（Scenario 8）', async () => {
    vi.mocked(api.doctorDiagnose).mockRejectedValue(new Error('诊断失败：输出无法解析为 JSON'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '资产医生' }));
    expect(await screen.findByText('诊断失败：输出无法解析为 JSON')).toBeInTheDocument();
  });
});
