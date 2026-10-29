/**
 * 设置页版本号与枚举中文测试（fix-trust-and-consistency I6）
 *
 * spec: 断言界面版本 === package.json 版本；设置页无 hybrid / 工具 id 直出
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from './Settings';
import { api } from '@/lib/api';
import { APP_VERSION } from '@/lib/app-version';
import type { HubConfig } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    getHubConfig: vi.fn(),
    saveHubConfig: vi.fn(),
  },
}));

const CONFIG: HubConfig = {
  hub: {
    version: '1.0',
    defaultSyncStrategy: 'hybrid',
    backupDir: '~/.assetplex/.backups',
    autoWatch: false,
    backupKeepCount: 10,
  },
  identity: {
    profileAutoLearn: true,
    learnSources: ['trae-cn', 'claude-code'],
    learnIntervalHours: 24,
    learnMaxFacts: 100,
  },
  tools: {},
  marketplace: {
    enabled: true,
    cacheTtlHours: 24,
    sources: [],
    cacheDir: '~/.assetplex/cache',
  },
};

function renderPage(): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Settings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getHubConfig).mockResolvedValue(CONFIG);
});

describe('设置页版本号（I6）', () => {
  it('版本字段显示与 package.json 一致的 APP_VERSION，不取 API 的 config 值', async () => {
    renderPage();
    const versionField = await screen.findByLabelText('版本');
    expect(versionField).toHaveValue(APP_VERSION);
    // API 返回的是 "1.0"，界面不应显示它
    expect(versionField).not.toHaveValue('1.0');
  });
});

describe('设置页同步策略中文枚举（I6）', () => {
  it('默认同步策略显示中文「混合」而非内部值「hybrid」', async () => {
    renderPage();
    const select = await screen.findByLabelText('默认同步策略');
    expect(select).toHaveValue('hybrid');
    // 可见文本（selected option 的 text）是「混合」
    const selectedOption = (select as HTMLSelectElement).selectedOptions[0];
    expect(selectedOption?.textContent).toBe('混合');
  });

  it('页面全文不包含英文内部枚举词 hybrid/native-import/per-project', async () => {
    const { container } = renderPage();
    await screen.findByLabelText('默认同步策略');
    expect(container.textContent).not.toMatch(/\bhybrid\b/);
    expect(container.textContent).not.toMatch(/native-import/);
    expect(container.textContent).not.toMatch(/per-project/);
  });

  it('所有策略选项都是中文', async () => {
    renderPage();
    const select = await screen.findByLabelText('默认同步策略');
    const options = (select as HTMLSelectElement).options;
    const labels = Array.from(options).map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['原生导入', '符号链接', '复制', '混合', '按项目']),
    );
  });
});

describe('设置页学习来源中文化（K3 走查修复）', () => {
  it('默认值显示工具中文名，页面不直出 trae-cn 等内部标识', async () => {
    const { container } = renderPage();
    const input = await screen.findByLabelText('学习来源');
    expect(input).toHaveValue('TRAE 中国版、Claude Code');
    expect(container.textContent).not.toMatch(/trae-cn|claude-code/);
  });

  it('用户按中文名编辑后，保存时回写为工具 id', async () => {
    renderPage();
    const input = await screen.findByLabelText('学习来源');
    fireEvent.change(input, { target: { value: 'Claude Code、OpenAI Codex' } });
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }));
    await waitFor(() => expect(api.saveHubConfig).toHaveBeenCalled());
    const saved = vi.mocked(api.saveHubConfig).mock.calls[0][0];
    expect(saved.identity.learnSources).toEqual(['claude-code', 'codex']);
  });
});
