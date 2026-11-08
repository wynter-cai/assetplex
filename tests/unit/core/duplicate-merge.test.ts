/**
 * 合并草案 / 归档式执行 / 还原测试（add-asset-governance K3/K4/K5）
 *
 * spec: specs/duplicate-governance.spec.md Scenario 3/4/5/7
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildMergeDraft,
  applyDuplicateMerge,
  undoDuplicateMerge,
  archivePathFor,
  DuplicateMergeError,
  type DuplicateMergePorts,
  type DuplicateMergeBatch,
  type UndoDuplicateMergePorts,
} from '../../../src/core/duplicate-merge.js';

const MEMBERS = [
  { hubRelativePath: 'skills/example-skill-a/SKILL.md', content: '# 技能\n\n步骤一\n步骤二\n' },
  { hubRelativePath: 'skills/example-skill-b/SKILL.md', content: '# 技能\n\n步骤一\n步骤二\n补充\n' },
];

function makePorts() {
  const files = new Map<string, string>(MEMBERS.map((m) => [m.hubRelativePath, m.content]));
  const batches = new Map<string, DuplicateMergeBatch>();
  const distribute = vi.fn(async () => [{ tool: 'trae-cn', action: 'written' as const }]);
  const ports: DuplicateMergePorts = {
    now: () => new Date('2026-11-08T00:00:00.000Z'),
    read: (p) => files.get(p) ?? null,
    backup: (p) => `backups/${p}-1`,
    write: (p, content) => {
      files.set(p, content);
    },
    archive: (original, archived) => {
      const content = files.get(original);
      if (content === undefined) throw new Error('文件不存在');
      files.delete(original);
      files.set(archived, content);
    },
    distribute,
    saveBatch: (batch) => {
      batches.set(batch.batchId, batch);
    },
  };
  return { ports, files, batches, distribute };
}

describe('合并草案（K3）', () => {
  it('产出保留项、待归档清单、合并正文与 diff，零写库', () => {
    const draft = buildMergeDraft({
      groupId: 'dup-near-1',
      groupKind: 'near',
      keepPath: 'skills/example-skill-b/SKILL.md',
      members: MEMBERS,
    });
    expect(draft.archivePaths).toEqual(['skills/example-skill-a/SKILL.md']);
    expect(draft.content).toContain('补充');
    expect(draft.unifiedDiff).toContain('--- a/skills/example-skill-b/SKILL.md');
    expect(draft.unifiedDiff).toContain('+补充');
  });

  it('保留项必须来自组内；灰区组必须显式 allowGray', () => {
    expect(() => buildMergeDraft({ groupId: 'g', groupKind: 'near', keepPath: 'skills/other.md', members: MEMBERS })).toThrow(DuplicateMergeError);
    expect(() => buildMergeDraft({ groupId: 'g', groupKind: 'gray', keepPath: MEMBERS[0].hubRelativePath, members: MEMBERS })).toThrow(DuplicateMergeError);
    const ok = buildMergeDraft({ groupId: 'g', groupKind: 'gray', keepPath: MEMBERS[0].hubRelativePath, members: MEMBERS, allowGray: true });
    expect(ok.archivePaths).toHaveLength(1);
  });
});

describe('归档式执行（K4）', () => {
  it('写保留项（备份）→ 归档其余成员 → 默认不分发；记录可撤销批次', async () => {
    const { ports, files, batches, distribute } = makePorts();
    const draft = buildMergeDraft({
      groupId: 'dup-1',
      groupKind: 'near',
      keepPath: 'skills/example-skill-b/SKILL.md',
      members: MEMBERS,
      mergedContent: '# 技能\n\n步骤一\n步骤二\n补充\n',
    });
    const result = await applyDuplicateMerge(
      { draft, batchId: 'batch-1', date: '2026-11-08' },
      ports,
    );

    expect(result.keep.written).toBe(true);
    expect(result.archived).toEqual([
      { path: 'skills/example-skill-a/SKILL.md', archivePath: '.archive/duplicates/2026-11-08/skills/example-skill-a/SKILL.md', ok: true },
    ]);
    expect(result.dispatch).toEqual([]);
    expect(distribute).not.toHaveBeenCalled();
    expect(files.has('skills/example-skill-a/SKILL.md')).toBe(false);
    expect(files.has('.archive/duplicates/2026-11-08/skills/example-skill-a/SKILL.md')).toBe(true);
    expect(batches.get('batch-1')?.keepContentBefore).toBe(MEMBERS[1].content);
  });

  it('单个归档失败不中断其余项，逐项回报原因', async () => {
    const { ports, batches } = makePorts();
    ports.archive = () => {
      throw new Error('目标已存在');
    };
    const draft = buildMergeDraft({
      groupId: 'dup-2',
      groupKind: 'exact',
      keepPath: 'skills/example-skill-a/SKILL.md',
      members: MEMBERS,
    });
    const result = await applyDuplicateMerge({ draft, batchId: 'batch-2', date: '2026-11-08' }, ports);
    expect(result.archived[0]?.ok).toBe(false);
    expect(result.archived[0]?.reason).toContain('目标已存在');
    expect(batches.get('batch-2')).toBeTruthy();
  });

  it('显式分发才调用分发通道，结果逐工具回报', async () => {
    const { ports, distribute } = makePorts();
    const draft = buildMergeDraft({
      groupId: 'dup-3',
      groupKind: 'near',
      keepPath: 'skills/example-skill-b/SKILL.md',
      members: MEMBERS,
    });
    const result = await applyDuplicateMerge({ draft, batchId: 'batch-3', date: '2026-11-08', distribute: true, targets: ['trae-cn'] }, ports);
    expect(distribute).toHaveBeenCalledTimes(1);
    expect(result.dispatch).toEqual([{ tool: 'trae-cn', action: 'written' }]);
  });

  it('归档路径固定到 .archive/duplicates/<日期>/<类别>/ 下', () => {
    expect(archivePathFor('skills/demo/SKILL.md', '2026-11-08')).toBe('.archive/duplicates/2026-11-08/skills/demo/SKILL.md');
    expect(archivePathFor('rules/a.md', '2026-11-08')).toBe('.archive/duplicates/2026-11-08/rules/a.md');
  });
});

describe('还原（K5）', () => {
  it('归档成员移回原路径、保留项恢复合并前内容，失败逐条列出', async () => {
    const { ports, files } = makePorts();
    const draft = buildMergeDraft({
      groupId: 'dup-5',
      groupKind: 'near',
      keepPath: 'skills/example-skill-b/SKILL.md',
      members: MEMBERS,
      mergedContent: '# 合并后\n',
    });
    const applied = await applyDuplicateMerge({ draft, batchId: 'batch-5', date: '2026-11-08' }, ports);
    expect(applied.batch).toBeTruthy();

    const undoPorts: UndoDuplicateMergePorts = {
      restoreArchived: (archived, original) => {
        const content = files.get(archived);
        if (content === undefined) throw new Error('归档缺失');
        files.set(original, content);
        files.delete(archived);
      },
      write: (path, content) => {
        files.set(path, content);
      },
    };
    const result = await undoDuplicateMerge(applied.batch, undoPorts);
    expect(result.keep.ok).toBe(true);
    expect(files.get('skills/example-skill-a/SKILL.md')).toBe(MEMBERS[0].content);
    expect(files.get('skills/example-skill-b/SKILL.md')).toBe(MEMBERS[1].content);
  });

  it('还原失败列出未还原路径与原因，其余项继续', async () => {
    const { ports, files } = makePorts();
    const draft = buildMergeDraft({
      groupId: 'dup-6',
      groupKind: 'near',
      keepPath: 'skills/example-skill-b/SKILL.md',
      members: MEMBERS,
    });
    const applied = await applyDuplicateMerge({ draft, batchId: 'batch-6', date: '2026-11-08' }, ports);
    const result = await undoDuplicateMerge(applied.batch, {
      restoreArchived: () => {
        throw new Error('磁盘只读');
      },
      write: (path, content) => {
        files.set(path, content);
      },
    });
    expect(result.archived[0]?.ok).toBe(false);
    expect(result.archived[0]?.reason).toContain('磁盘只读');
    expect(result.keep.ok).toBe(true);
  });
});
