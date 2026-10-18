/**
 * 应用修复编排测试（add-asset-doctor F3 core）
 *
 * spec: specs/fix-and-distribute.spec.md Scenario 2/3/4/5/6；proposal D2/D4（一次确认后
 * 依次执行：备份 → 写库 → 逐工具分发；分发失败不静默、逐工具如实回报）。
 * 全 DI：备份/写库/分发均为注入端口，core 不碰 fs（同诊断测试惯例）。
 */

import { describe, it, expect } from 'vitest';
import {
  applyAssetFix,
  undoApplyFix,
  ApplyAssetError,
  UndoBackupError,
  type DoctorApplyPorts,
  type DoctorDispatchItem,
} from '../../../src/core/doctor-apply.js';

interface Call {
  name: string;
  arg: string;
}

function ports(opts: {
  content?: string | null;
  defaultTargets?: string[];
  dispatchResults?: Record<string, DoctorDispatchItem | Error>;
} = {}) {
  const calls: Call[] = [];
  const p: DoctorApplyPorts = {
    read: (path) => {
      calls.push({ name: 'read', arg: path });
      return opts.content === undefined ? '旧内容\n' : opts.content;
    },
    backup: (path) => {
      calls.push({ name: 'backup', arg: path });
      return 'backup-1';
    },
    write: (path, content) => {
      calls.push({ name: 'write', arg: path });
      void content;
    },
    defaultTargets: async (path) => {
      calls.push({ name: 'defaultTargets', arg: path });
      return opts.defaultTargets ?? ['toolA', 'toolB'];
    },
    dispatchTool: async (tool, path) => {
      calls.push({ name: `dispatch:${tool}`, arg: path });
      const preset = opts.dispatchResults?.[tool];
      if (preset instanceof Error) throw preset;
      return preset ?? { tool, action: 'written', swapId: `swap-${tool}` };
    },
  };
  return { p, calls };
}

const input = (overrides: Partial<Parameters<typeof applyAssetFix>[0]> = {}) => ({
  kind: 'skill' as const,
  hubRelativePath: 'skills/demo-skill/SKILL.md',
  finalContent: '新内容\n',
  distribute: false,
  ...overrides,
});

describe('applyAssetFix', () => {
  it('只改库不分发（Scenario 6）：备份先于写库，dispatch 空数组', async () => {
    const { p, calls } = ports();
    const result = await applyAssetFix(input(), p);
    expect(calls.map((c) => c.name)).toEqual(['read', 'backup', 'write']);
    expect(result).toEqual({ saved: true, backupRef: 'backup-1', dispatch: [], rollbackAvailable: false });
  });

  it('资产读不到：throw 且零写库（写链路前置守卫）', async () => {
    const { p, calls } = ports({ content: null });
    await expect(applyAssetFix(input(), p)).rejects.toThrow(ApplyAssetError);
    expect(calls.map((c) => c.name)).toEqual(['read']);
  });

  it('分发逐工具聚合且顺序执行（Scenario 4）：显式 targets 时不再解析默认目标', async () => {
    const { p, calls } = ports();
    const result = await applyAssetFix(input({ distribute: true, targets: ['toolA', 'toolB'] }), p);
    expect(result.dispatch).toEqual([
      { tool: 'toolA', action: 'written', swapId: 'swap-toolA' },
      { tool: 'toolB', action: 'written', swapId: 'swap-toolB' },
    ]);
    expect(result.rollbackAvailable).toBe(true);
    expect(calls.some((c) => c.name === 'defaultTargets')).toBe(false);
    expect(calls.filter((c) => c.name.startsWith('dispatch:'))).toHaveLength(2);
  });

  it('缺省 targets：解析「已安装该资产的工具」', async () => {
    const { p, calls } = ports({ defaultTargets: ['toolC'] });
    const result = await applyAssetFix(input({ distribute: true }), p);
    expect(result.dispatch).toHaveLength(1);
    expect(result.dispatch[0].tool).toBe('toolC');
    expect(calls.some((c) => c.name === 'defaultTargets')).toBe(true);
  });

  it('某工具分发抛错不影响其他工具：失败项如实回报（Scenario 4/5）', async () => {
    const { p } = ports({
      dispatchResults: {
        toolA: { tool: 'toolA', action: 'written', swapId: 'swap-A' },
        toolB: new Error('目标工具目录已变化，请重新预览后再执行'),
      },
    });
    const result = await applyAssetFix(input({ distribute: true, targets: ['toolA', 'toolB'] }), p);
    expect(result.dispatch).toEqual([
      { tool: 'toolA', action: 'written', swapId: 'swap-A' },
      { tool: 'toolB', action: 'failed', reason: '目标工具目录已变化，请重新预览后再执行' },
    ]);
    // 库内本体不受分发失败影响（写库在分发前已完成且独立）
    expect(result.saved).toBe(true);
    expect(result.rollbackAvailable).toBe(true);
  });

  it('全部工具 skipped/failed：rollbackAvailable=false（无成功写入不可承诺回滚）', async () => {
    const { p } = ports({
      dispatchResults: {
        toolA: { tool: 'toolA', action: 'skipped', reason: '冲突未确认覆盖，保持原样' },
        toolB: new Error('未注册适配器: toolB'),
      },
    });
    const result = await applyAssetFix(input({ distribute: true, targets: ['toolA', 'toolB'] }), p);
    expect(result.rollbackAvailable).toBe(false);
    expect(result.dispatch[1].action).toBe('failed');
  });

  it('写库失败：错误上抛且不发任何分发（库未改成功不冒充分发）', async () => {
    const { p, calls } = ports();
    p.write = () => {
      throw new Error('磁盘写入失败');
    };
    await expect(applyAssetFix(input({ distribute: true, targets: ['toolA'] }), p)).rejects.toThrow('磁盘写入失败');
    expect(calls.some((c) => c.name.startsWith('dispatch:'))).toBe(false);
  });
});

describe('undoApplyFix', () => {
  it('按 backupRef 恢复旧版：读备份 → 写回原路径', async () => {
    const written: Array<{ path: string; content: string }> = [];
    const result = await undoApplyFix(
      'backup-1',
      {
        readBackup: (ref) => (ref === 'backup-1' ? { hubRelativePath: 'skills/demo-skill/SKILL.md', content: '旧内容\n' } : null),
        write: (path, content) => written.push({ path, content }),
      },
    );
    expect(result).toEqual({ restored: true, hubRelativePath: 'skills/demo-skill/SKILL.md' });
    expect(written).toEqual([{ path: 'skills/demo-skill/SKILL.md', content: '旧内容\n' }]);
  });

  it('备份不存在（被保留策略清理/ref 非法）：throw UndoBackupError，零写入', async () => {
    const written: string[] = [];
    await expect(
      undoApplyFix('gone', {
        readBackup: () => null,
        write: (path) => written.push(path),
      }),
    ).rejects.toThrow(UndoBackupError);
    expect(written).toHaveLength(0);
  });
});
