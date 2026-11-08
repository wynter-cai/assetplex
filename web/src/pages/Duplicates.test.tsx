/**
 * 重复治理页组件测试（add-asset-governance K6）
 *
 * 覆盖：空态、建议保留项、改选保留项、灰区显式勾选、归档式执行与还原。
 * 断言重点（对应 spec Scenario 6/7）：无重复不打扰、灰区不自动执行、归档只移动不删除。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Duplicates from './Duplicates';
import { api } from '@/lib/api';
import type { DuplicateGroupView, DuplicateScanResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  api: {
    scanDuplicates: vi.fn(),
    getDuplicateMergeDraft: vi.fn(),
    applyDuplicateMerge: vi.fn(),
    undoDuplicateMerge: vi.fn(),
  },
}));

const mocked = vi.mocked(api, true);

function makeGroup(kind: DuplicateGroupView['kind']): DuplicateGroupView {
  return {
    id: `dup-${kind}-example`,
    kind,
    category: 'skill',
    similarity: 0.92,
    suggestedKeep: 'skills/example-skill-b/SKILL.md',
    reason: '正文最完整',
    members: [
      {
        hubRelativePath: 'skills/example-skill-a/SKILL.md',
        name: 'example-skill-a',
        toolSources: [],
        bodyLength: 120,
        modifiedAt: '2026-11-07T00:00:00.000Z',
        contentHash: 'aaa',
      },
      {
        hubRelativePath: 'skills/example-skill-b/SKILL.md',
        name: 'example-skill-b',
        toolSources: ['trae-cn'],
        bodyLength: 140,
        modifiedAt: '2026-11-08T00:00:00.000Z',
        contentHash: 'bbb',
      },
    ],
  };
}

function scanResult(groups: DuplicateGroupView[]): DuplicateScanResponse {
  return {
    groups,
    scannedAssets: 2,
    grayCount: groups.filter((group) => group.kind === 'gray').length,
    aiUsed: false,
    estimatedAiCalls: 0,
    generatedAt: '2026-11-08T00:00:00.000Z',
  };
}

async function scanWith(groups: DuplicateGroupView[]): Promise<void> {
  mocked.scanDuplicates.mockResolvedValue(scanResult(groups));
  fireEvent.click(screen.getByTestId('duplicates-scan'));
  await waitFor(() => expect(screen.queryByText('扫描中…')).toBeNull());
}

describe('Duplicates page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无重复时显示空态且不渲染组卡片（Scenario 6）', async () => {
    render(<Duplicates />);
    await scanWith([]);
    expect(screen.getByTestId('duplicates-empty')).toHaveTextContent('没有发现重复条目');
    expect(screen.queryAllByTestId(/duplicate-group-/)).toHaveLength(0);
  });

  it('默认勾选建议保留项，并允许改选', async () => {
    render(<Duplicates />);
    await scanWith([makeGroup('near')]);
    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[1]?.checked).toBe(true);

    fireEvent.click(radios[0] as HTMLInputElement);
    expect(radios[0]?.checked).toBe(true);

    mocked.getDuplicateMergeDraft.mockResolvedValue({
      groupId: 'dup-near-example',
      keepPath: 'skills/example-skill-a/SKILL.md',
      draftContent: '# 合并后正文\n',
      unifiedDiff: '',
      archivePaths: ['skills/example-skill-b/SKILL.md'],
      cached: false,
      model: '',
    });
    fireEvent.click(screen.getByText('生成合并草案'));
    await waitFor(() =>
      expect(mocked.getDuplicateMergeDraft).toHaveBeenCalledWith({
        groupId: 'dup-near-example',
        keepPath: 'skills/example-skill-a/SKILL.md',
      }),
    );
    expect(await screen.findByTestId('duplicate-draft')).toBeInTheDocument();
  });

  it('灰区组必须显式勾选才可生成草案（Scenario 7）', async () => {
    render(<Duplicates />);
    await scanWith([makeGroup('gray')]);
    const draftButton = screen.getByText('生成合并草案');
    expect(draftButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/我已人工确认这组可以合并/));
    expect(draftButton).not.toBeDisabled();
  });

  it('执行合并默认不分发，语义为归档不删除，并可还原本组（Scenario 4/5）', async () => {
    render(<Duplicates />);
    await scanWith([makeGroup('near')]);

    mocked.getDuplicateMergeDraft.mockResolvedValue({
      groupId: 'dup-near-example',
      keepPath: 'skills/example-skill-b/SKILL.md',
      draftContent: '# 合并后正文\n',
      unifiedDiff: '',
      archivePaths: ['skills/example-skill-a/SKILL.md'],
      cached: false,
      model: '',
    });
    fireEvent.click(screen.getByText('生成合并草案'));
    await screen.findByTestId('duplicate-draft');
    expect(screen.getByText(/→ skills\/example-skill-a\/SKILL.md/)).toBeInTheDocument();

    mocked.applyDuplicateMerge.mockResolvedValue({
      groupId: 'dup-near-example',
      keepPath: 'skills/example-skill-b/SKILL.md',
      backupRef: '.backups/example-1',
      archived: [
        {
          from: 'skills/example-skill-a/SKILL.md',
          to: '.archive/duplicates/2026-11-08/skills/example-skill-a/SKILL.md',
          status: 'archived',
        },
      ],
      dispatch: [],
      rollbackAvailable: true,
    });

    fireEvent.click(screen.getByText('确认执行（只归档，不删除）'));
    await waitFor(() =>
      expect(mocked.applyDuplicateMerge).toHaveBeenCalledWith({
        groupId: 'dup-near-example',
        keepPath: 'skills/example-skill-b/SKILL.md',
        finalContent: '# 合并后正文\n',
        archiveMembers: ['skills/example-skill-a/SKILL.md'],
        distribute: false,
      }),
    );
    expect(await screen.findByTestId('duplicate-applied')).toHaveTextContent('已归档');

    mocked.undoDuplicateMerge.mockResolvedValue({
      restored: ['skills/example-skill-a/SKILL.md'],
      keepRestored: true,
      failures: [],
    });
    fireEvent.click(screen.getByText('还原本组'));
    await waitFor(() => expect(mocked.undoDuplicateMerge).toHaveBeenCalledWith('dup-near-example'));
    expect(await screen.findByTestId('duplicate-undone')).toHaveTextContent('保留项已恢复：是');
  });
});
