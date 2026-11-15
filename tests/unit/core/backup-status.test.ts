/**
 * 备份时间探测（refactor-home-action-panel T1）
 *
 * spec: specs/home-dashboard.spec.md Requirement 1（状态条「上次备份」）
 * 口径：只读三个 Hub 内备份根目录的最新一批时间；目录名时间戳优先，
 * 元数据 createdAt 更精确时以它为准；三处都不存在 = none，读取异常 = unavailable。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BACKUP_ROOTS,
  detectLatestBackup,
  readBackupStatus,
  type BackupFsPort,
} from '../../../src/core/backup-status.js';

/** 备份目录名里的时间戳用运行时日期计算（不写字面量，避免被误判为手机号） */
const TS_A = Date.UTC(2025, 9, 1);
const TS_B = Date.UTC(2025, 10, 1);
const TS_C = Date.UTC(2025, 9, 15);

/** 假 fs：只实现两个端口方法，避免碰真实目录 */
function fakeFs(input: {
  dirs?: Record<string, string[] | null>;
  metadata?: Record<string, string>;
  failRoots?: string[];
}): BackupFsPort {
  return {
    listBackupDirs(relativeRoot) {
      if ((input.failRoots ?? []).includes(relativeRoot)) {
        throw new Error('读取失败');
      }
      return input.dirs?.[relativeRoot] ?? null;
    },
    readMetadata(relativeRoot, backupId, fileName) {
      return input.metadata?.[`${relativeRoot}/${backupId}/${fileName}`] ?? null;
    },
  };
}

describe('detectLatestBackup（纯逻辑）', () => {
  it('三处备份根目录都不存在 → state=none，时间留空（不伪造 0）', () => {
    const result = detectLatestBackup(fakeFs({}));
    expect(result).toEqual({ state: 'none', lastBackupAt: null });
  });

  it('目录存在但一批备份都没有 → state=none', () => {
    const result = detectLatestBackup(
      fakeFs({ dirs: { '.doctor-backup': [], '.swap-backup': [], '.backups/onboarding': [] } }),
    );
    expect(result).toEqual({ state: 'none', lastBackupAt: null });
  });

  it('单目录：取目录名时间戳作为备份时间', () => {
    const result = detectLatestBackup(
      fakeFs({ dirs: { '.doctor-backup': [`${TS_A}-abcd12`] } }),
    );
    expect(result.state).toBe('recorded');
    expect(result.lastBackupAt).toBe(new Date(TS_A).toISOString());
  });

  it('元数据 createdAt 优先于目录名时间戳', () => {
    const result = detectLatestBackup(
      fakeFs({
        dirs: { '.swap-backup': [`${TS_A}-abcd12`] },
        metadata: {
          [`.swap-backup/${TS_A}-abcd12/manifest.json`]: JSON.stringify({
            swapId: `${TS_A}-abcd12`,
            createdAt: '2026-11-01T08:00:00.000Z',
          }),
        },
      }),
    );
    expect(result.lastBackupAt).toBe('2026-11-01T08:00:00.000Z');
  });

  it('多目录取最新一次：跨三个备份根目录比较', () => {
    const result = detectLatestBackup(
      fakeFs({
        dirs: {
          '.doctor-backup': [`${TS_A}-aaaaaa`, `${TS_B}-bbbbbb`],
          '.swap-backup': [`${TS_C}-cccccc`],
          '.backups/onboarding': null,
        },
      }),
    );
    expect(result).toEqual({
      state: 'recorded',
      lastBackupAt: new Date(TS_B).toISOString(),
    });
  });

  it('目录名不含时间戳 → 不猜时间，按 none 处理', () => {
    const result = detectLatestBackup(
      fakeFs({ dirs: { '.doctor-backup': ['manual-copy'] } }),
    );
    expect(result).toEqual({ state: 'none', lastBackupAt: null });
  });

  it('元数据损坏 → 回退目录名时间戳，不整体失败', () => {
    const result = detectLatestBackup(
      fakeFs({
        dirs: { '.backups/onboarding': [`${TS_A}-abc123`] },
        metadata: { [`.backups/onboarding/${TS_A}-abc123/manifest.json`]: '{ 坏 JSON' },
      }),
    );
    expect(result).toEqual({
      state: 'recorded',
      lastBackupAt: new Date(TS_A).toISOString(),
    });
  });

  it('任一备份根目录读取异常 → state=unavailable，不返回半份时间', () => {
    const result = detectLatestBackup(
      fakeFs({
        dirs: { '.doctor-backup': [`${TS_A}-abcd12`] },
        failRoots: ['.backups/onboarding'],
      }),
    );
    expect(result).toEqual({ state: 'unavailable', lastBackupAt: null });
  });

  it('默认扫描三个备份根目录（与备份实现一致）', () => {
    expect(BACKUP_ROOTS.map((root) => root.relativeRoot)).toEqual([
      '.doctor-backup',
      '.swap-backup',
      '.backups/onboarding',
    ]);
  });
});

describe('readBackupStatus（node fs 端口）', () => {
  let hubDir: string;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-backup-status-'));
  });

  afterEach(() => {
    rmSync(hubDir, { recursive: true, force: true });
  });

  it('真实目录：读出 .doctor-backup 最新一批的 meta.json 时间', () => {
    const dir = join(hubDir, '.doctor-backup', `${TS_A}-abcd12`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify({ hubRelativePath: 'rules/demo.md', createdAt: '2026-11-02T03:04:05.000Z' }),
      'utf-8',
    );

    expect(readBackupStatus(hubDir)).toEqual({
      state: 'recorded',
      lastBackupAt: '2026-11-02T03:04:05.000Z',
    });
  });

  it('真实目录：Hub 内没有任何备份区 → none', () => {
    expect(readBackupStatus(hubDir)).toEqual({ state: 'none', lastBackupAt: null });
  });
});
