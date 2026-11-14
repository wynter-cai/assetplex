/**
 * 分发前备份测试（add-zero-config-onboarding T6）
 *
 * spec 6.4：存在覆盖/冲突时，先把原文件复制到
 * <Hub>/.backups/onboarding/<批次>/ 并留 manifest；保留最近 3 批；
 * 无覆盖时 backupRef=null 且不建目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupSyncTargets } from '../../../src/core/sync-backup.js';
import type { SyncPlan } from '../../../src/core/types.js';

let tempDir: string;
let backupRoot: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-backup-'));
  backupRoot = join(tempDir, '.backups', 'onboarding');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function planWith(targets: Array<{ path: string; exists: boolean; action?: string; content?: string }>): SyncPlan[] {
  const hubDir = join(tempDir, 'hub-src');
  mkdirSync(hubDir, { recursive: true });
  writeFileSync(join(hubDir, 'src.md'), 'hub-content', 'utf-8');

  return [
    {
      tool: 'trae-cn',
      toolInstalled: true,
      items: targets.map((t, i) => {
        if (t.exists) {
          mkdirSync(join(t.path, '..'), { recursive: true });
          writeFileSync(t.path, t.content ?? 'old-content', 'utf-8');
        }
        return {
          item: { type: 'rule', relativePath: `rules/${i}.md`, absolutePath: join(hubDir, 'src.md') },
          target: { tool: 'trae-cn', targetPath: t.path, strategy: 'copy', isDirectory: false },
          action: (t.action ?? 'copy') as 'copy' | 'skip',
          targetExists: t.exists,
        };
      }),
    },
  ];
}

describe('backupSyncTargets（spec 6.4）', () => {
  it('无可备份目标 → 返回 null 且不创建任何目录', () => {
    const plans = planWith([
      { path: join(tempDir, 't', 'a.md'), exists: false },
      { path: join(tempDir, 't', 'b.md'), exists: false, action: 'skip' },
    ]);
    expect(backupSyncTargets(plans, backupRoot)).toBeNull();
    expect(existsSync(backupRoot)).toBe(false);
  });

  it('已存在目标写入前备份，manifest 可追溯，skip/新建不备份', () => {
    const existing = join(tempDir, 't', 'keep.md');
    const plans = planWith([
      { path: existing, exists: true, content: 'precious' },
      { path: join(tempDir, 't', 'new.md'), exists: false },
      { path: join(tempDir, 't', 's.md'), exists: true, action: 'skip' },
    ]);

    const result = backupSyncTargets(plans, backupRoot);
    expect(result).not.toBeNull();
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0].targetPath).toBe(existing);
    expect(result?.entries[0].backupKey).toBe('0');

    const backupDir = join(backupRoot, result?.swapId ?? '');
    expect(readFileSync(join(backupDir, 'files', '0'), 'utf-8')).toBe('precious');
    const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf-8')) as {
      swapId: string;
      entries: Array<{ targetPath: string; backupKey: string }>;
    };
    expect(manifest.swapId).toBe(result?.swapId);
    expect(manifest.entries[0].backupKey).toBe('0');
  });

  it('保留最近 3 批：超出后最旧批次被清理', () => {
    // 预置 3 个更早的批次目录（名称按时间排序在新增之前）
    for (const id of ['1000-aaa', '2000-bbb', '3000-ccc']) {
      mkdirSync(join(backupRoot, id), { recursive: true });
    }
    const existing = join(tempDir, 't', 'keep.md');
    const plans = planWith([{ path: existing, exists: true }]);

    const result = backupSyncTargets(plans, backupRoot);
    expect(result).not.toBeNull();

    const dirs = readdirSync(backupRoot).sort();
    expect(dirs).toHaveLength(3);
    expect(dirs).not.toContain('1000-aaa');
    expect(dirs).toContain(result?.swapId ?? '');
  });

  it('多目标依次编号 files/0、files/1', () => {
    const plans = planWith([
      { path: join(tempDir, 't', 'a.md'), exists: true, content: 'A' },
      { path: join(tempDir, 't', 'b.md'), exists: true, content: 'B' },
    ]);
    const result = backupSyncTargets(plans, backupRoot);
    expect(result?.entries.map((e) => e.backupKey)).toEqual(['0', '1']);
    const dir = join(backupRoot, result?.swapId ?? '');
    expect(readFileSync(join(dir, 'files', '0'), 'utf-8')).toBe('A');
    expect(readFileSync(join(dir, 'files', '1'), 'utf-8')).toBe('B');
  });
});
