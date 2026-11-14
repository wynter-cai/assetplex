/**
 * AiConfigDialog 预设测试（add-zero-config-onboarding T11）
 *
 * - 不传 presets：行为与原来完全一致（无预设按钮）
 * - 传 presets：渲染预设按钮，点击只填充地址与模型名，绝不预置 Key
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiConfigDialog, type AiConfigPreset } from './AiConfigDialog';
import { api } from '@/lib/api';

const configView = { baseUrl: '', model: '', hasApiKey: false };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getAiClassifyConfig').mockResolvedValue(configView);
  vi.spyOn(api, 'saveAiClassifyConfig').mockResolvedValue(configView);
});

const presets: AiConfigPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'doubao', label: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6' },
];

async function open(): Promise<void> {
  render(<AiConfigDialog open onOpenChange={() => undefined} onSaved={() => undefined} />);
  // 字段在配置加载完成后才渲染
  await screen.findByLabelText('AI 分类 Base URL');
}

describe('AiConfigDialog（T11）', () => {
  it('不传 presets：不渲染预设按钮（向后兼容）', async () => {
    await open();
    expect(screen.queryByText('DeepSeek')).toBeNull();
    expect(screen.getByLabelText('AI 分类 Base URL')).toBeInTheDocument();
  });

  it('传 presets：渲染预设，点击只填地址与模型，Key 留空', async () => {
    render(
      <AiConfigDialog
        open
        onOpenChange={() => undefined}
        onSaved={() => undefined}
        presets={presets}
      />,
    );
    await screen.findByLabelText('AI 分类 Base URL');

    fireEvent.click(screen.getByRole('button', { name: 'DeepSeek' }));
    expect(screen.getByLabelText('AI 分类 Base URL')).toHaveValue('https://api.deepseek.com/v1');
    expect(screen.getByLabelText('AI 分类模型')).toHaveValue('deepseek-chat');
    expect(screen.getByLabelText('AI 分类 API Key')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '豆包' }));
    expect(screen.getByLabelText('AI 分类 Base URL')).toHaveValue('https://ark.cn-beijing.volces.com/api/v3');
    expect(screen.getByLabelText('AI 分类 API Key')).toHaveValue('');
  });
});
