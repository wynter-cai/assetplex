/**
 * POST /api/sync/run?backup=1 接线测试（add-zero-config-onboarding T6）
 *
 * - 不带 backup：响应与旧行为一致（只有 results），不创建备份目录，plan 不被调用
 * - backup=1：先 plan → 备份已存在目标 → run；响应带 backupRef
 * - 无覆盖目标：backupRef=null 且不建目录
 * - dryRun 与 backup 同给：以 dryRun 为准，不备份
 * hubContext 用 vi.mock 替换，不触真实引擎。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import type { SyncPlan, SyncResult } from '../../../src/core/types.js';

const { fakeEngine } = vi.hoisted(() => ({
  fakeEngine: {
    plan: vi.fn(async () => [] as SyncPlan[]),
    run: vi.fn(async () => [] as SyncResult[]),
  },
}));

vi.mock('../../../src/server/lib/hub-context.js', () => ({
  hubContext: { getEngine: () => fakeEngine },
}));

import { syncRoutes } from '../../../src/server/routes/sync.js';

let tempDir: string;
let envBackup: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-runbackup-'));
  envBackup = process.env.ASSETPLEX_DIR;
  process.env.ASSETPLEX_DIR = tempDir;
  fakeEngine.plan.mockReset();
  fakeEngine.run.mockReset();
  fakeEngine.plan.mockImplementation(async () => []);
  fakeEngine.run.mockImplementation(async () => []);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (envBackup === undefined) delete process.env.ASSETPLEX_DIR;
  else process.env.ASSETPLEX_DIR = envBackup;
});

function buildApp(): Hono {
  const app = new Hono();
  app.route('/api/sync', syncRoutes);
  return app;
}

function planWithExistingTarget(): SyncPlan[] {
  const targetPath = join(tempDir, 'tool', 'keep.md');
  mkdirSync(join(targetPath, '..'), { recursive: true });
  writeFileSync(targetPath, 'precious', 'utf-8');
  return [
    {
      tool: 'trae-cn',
      toolInstalled: true,
      items: [
        {
          item: { type: 'rule', relativePath: 'rules/keep.md', absolutePath: join(tempDir, 'src.md') },
          target: { tool: 'trae-cn', targetPath, strategy: 'copy', isDirectory: false },
          action: 'copy',
          targetExists: true,
        },
        {
          item: { type: 'rule', relativePath: 'rules/new.md', absolutePath: join(tempDir, 'src.md') },
          target: { tool: 'trae-cn', targetPath: join(tempDir, 'tool', 'new.md'), strategy: 'copy', isDirectory: false },
          action: 'copy',
          targetExists: false,
        },
      ],
    },
  ];
}

describe('POST /api/sync/run backup 扩展（T6）', () => {
  it('不带 backup：行为不变，无 backupRef，plan 不被调用，不建备份目录', async () => {
    fakeEngine.plan.mockImplementation(async () => planWithExistingTarget());
    const res = await buildApp().request('/api/sync/run', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.results).toBeDefined();
    expect(body.backupRef).toBeUndefined();
    expect(fakeEngine.plan).not.toHaveBeenCalled();
    expect(existsSync(join(tempDir, '.backups', 'onboarding'))).toBe(false);
  });

  it('backup=1：先备份已存在目标再执行，响应带 backupRef', async () => {
    fakeEngine.plan.mockImplementation(async () => planWithExistingTarget());
    const res = await buildApp().request('/api/sync/run?backup=1&tools=trae-cn', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { backupRef?: string | null };
    expect(fakeEngine.plan).toHaveBeenCalled();
    expect(fakeEngine.run).toHaveBeenCalled();
    expect(body.backupRef).toMatch(/^\.backups\/onboarding\/.+$/);

    const backupDir = join(tempDir, body.backupRef ?? '');
    expect(readFileSync(join(backupDir, 'files', '0'), 'utf-8')).toBe('precious');
    expect(existsSync(join(backupDir, 'manifest.json'))).toBe(true);
    // 新建目标不备份：files 下只有一个条目
    const files = readdirSync(join(backupDir, 'files'));
    expect(files).toHaveLength(1);
  });

  it('backup=1 但无已存在目标：backupRef=null，不建目录', async () => {
    fakeEngine.plan.mockImplementation(async () => [
      {
        tool: 'trae-cn',
        toolInstalled: true,
        items: [
          {
            item: { type: 'rule', relativePath: 'rules/new.md', absolutePath: join(tempDir, 'src.md') },
            target: { tool: 'trae-cn', targetPath: join(tempDir, 'tool', 'new.md'), strategy: 'copy', isDirectory: false },
            action: 'copy',
            targetExists: false,
          },
        ],
      },
    ]);
    const res = await buildApp().request('/api/sync/run?backup=1', { method: 'POST' });
    const body = (await res.json()) as { backupRef?: string | null };
    expect(body.backupRef).toBeNull();
    expect(existsSync(join(tempDir, '.backups', 'onboarding'))).toBe(false);
    expect(fakeEngine.run).toHaveBeenCalled();
  });

  it('backup=1 + dryRun=true：以 dryRun 为准，不备份', async () => {
    fakeEngine.plan.mockImplementation(async () => planWithExistingTarget());
    const res = await buildApp().request('/api/sync/run?backup=1&dryRun=true', { method: 'POST' });
    const body = (await res.json()) as { backupRef?: string | null };
    expect(body.backupRef).toBeNull();
    expect(existsSync(join(tempDir, '.backups', 'onboarding'))).toBe(false);
    expect(fakeEngine.run).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
  });
});
