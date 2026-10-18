/**
 * swap 单资产范围执行测试（add-asset-doctor F3）
 *
 * spec: fix-and-distribute.spec.md「分发」定义——医生复用 swap 通道而不自建；
 * SwapExecuteRequest.onlyHubRelativePaths 提供单资产粒度：命中的写入单元整单元执行
 * （技能目录含全部子文件），范围外单元完全不碰。回滚/备份语义与全量执行一致。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubItem, SyncStrategy, SyncTarget } from '../../../src/core/types.js';
import { SwapEngine } from '../../../src/core/swap.js';
import type { SwapCategory } from '../../../src/core/swap.js';

const FAKE_LAYOUT: Record<SwapCategory, { rel: string; target: string; strategy: SyncStrategy; isDir: boolean }> = {
  identity: { rel: 'identity/profile.md', target: 'IDENTITY.md', strategy: 'symlink', isDir: false },
  rule: { rel: 'rules', target: 'rules', strategy: 'symlink', isDir: true },
  skill: { rel: 'skills', target: 'skills', strategy: 'symlink', isDir: true },
  mcp: { rel: 'mcp/mcp.sources.json', target: '.mcp.json', strategy: 'copy', isDir: false },
  memory: { rel: 'memory', target: 'memory', strategy: 'symlink', isDir: true },
  agent: { rel: 'agents', target: 'agents', strategy: 'symlink', isDir: true },
};

class FakeToolAdapter extends BaseAdapter {
  readonly name = 'faketool';
  readonly displayName = 'Fake Tool';
  protected defaultConfigDir = '';
  protected signatureFiles = ['sig.txt'];
  protected supportedTargets: string[] = [];

  constructor(
    private readonly dir: string,
    private readonly categories: SwapCategory[],
  ) {
    super();
  }

  override getConfigDir(): string {
    return this.dir;
  }

  targets(): SyncTarget[] {
    return [];
  }

  override resolveHubItems(
    _hubConfig: HubConfig,
    hubRoot: string,
  ): Array<{ item: HubItem; target: SyncTarget }> {
    return this.categories.map((cat) => {
      const layout = FAKE_LAYOUT[cat];
      return {
        item: {
          type: cat,
          relativePath: layout.rel,
          absolutePath: resolve(hubRoot, layout.rel),
        } as HubItem,
        target: {
          tool: this.name,
          targetPath: resolve(this.dir, layout.target),
          strategy: layout.strategy,
          isDirectory: layout.isDir,
        } as SyncTarget,
      };
    });
  }
}

describe('swap 单资产范围执行（doctor F3）', () => {
  let hubDir: string;
  let toolDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-scope-hub-'));
    toolDir = mkdtempSync(join(tmpdir(), 'assetplex-scope-tool-'));
    writeFileSync(join(toolDir, 'sig.txt'), 'sig');
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(hubDir, { recursive: true, force: true });
    rmSync(toolDir, { recursive: true, force: true });
  });

  function writeHub(relPosix: string, content: string): void {
    const abs = join(hubDir, ...relPosix.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  function engineWith(categories: SwapCategory[]): SwapEngine {
    return new SwapEngine(HubConfigSchema.parse({}), [new FakeToolAdapter(toolDir, categories)]);
  }

  it('范围只含 identity：仅该资产写入，范围外类别目录零变化', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeHub('rules/global.md', '# Rule A');

    const engine = engineWith(['identity', 'rule']);
    const preview = await engine.preview('faketool');
    const result = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [],
      onlyHubRelativePaths: ['identity/profile.md'],
    });

    expect(result.items.map((i) => i.hubRelativePath)).toEqual(['identity/profile.md']);
    expect(result.counts.written).toBe(1);
    expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Hub Identity');
    expect(existsSync(resolve(toolDir, 'rules', 'global.md'))).toBe(false);
  });

  it('技能目录单元命中主文件 → 整单元（含子文件）随资产分发', async () => {
    writeHub('skills/demo/SKILL.md', '# demo skill');
    writeHub('skills/demo/assets/ref.md', '# ref');
    mkdirSync(join(toolDir, 'skills'), { recursive: true });

    const engine = engineWith(['skill']);
    const preview = await engine.preview('faketool');
    const result = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [],
      onlyHubRelativePaths: ['skills/demo/SKILL.md'],
    });

    expect(result.counts.written).toBe(2);
    expect(existsSync(resolve(toolDir, 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(existsSync(resolve(toolDir, 'skills', 'demo', 'assets', 'ref.md'))).toBe(true);
  });

  it('不传范围 = 既有全量行为不回退', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeHub('rules/global.md', '# Rule A');

    const engine = engineWith(['identity', 'rule']);
    const preview = await engine.preview('faketool');
    const result = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [],
    });

    expect(result.counts.written).toBe(2);
    expect(existsSync(resolve(toolDir, 'rules', 'global.md'))).toBe(true);
  });

  it('范围不命中任何单元：零写入零失败（等价空操作）', async () => {
    writeHub('rules/global.md', '# Rule A');

    const engine = engineWith(['rule']);
    const preview = await engine.preview('faketool');
    const result = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [],
      onlyHubRelativePaths: ['identity/ghost.md'],
    });

    expect(result.counts).toEqual({ written: 0, skipped: 0, failed: 0 });
    expect(result.success).toBe(true);
    expect(result.rollbackAvailable).toBe(false);
  });

  it('范围执行后回滚：本次新增项整体移除，备份语义不变', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeHub('rules/global.md', '# Rule A');

    const engine = engineWith(['identity', 'rule']);
    const preview = await engine.preview('faketool');
    const result = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [],
      onlyHubRelativePaths: ['identity/profile.md'],
    });
    const rollback = await engine.rollback(result.swapId);

    expect(rollback.success).toBe(true);
    expect(rollback.removed).toBe(1);
    expect(existsSync(resolve(toolDir, 'IDENTITY.md'))).toBe(false);
  });
});
