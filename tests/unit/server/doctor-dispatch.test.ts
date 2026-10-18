/**
 * 医生分发端口 Node 实现测试（add-asset-doctor F3）
 *
 * spec: fix-and-distribute.spec.md「分发」定义 + Scenario 4/5/6：不自建通道，
 * 复用 swap 单资产预览-执行（onlyHubRelativePaths）；differs 项视为 apply 一屏确认的显式覆盖。
 * 用临时 Hub + FakeToolAdapter 驱动真实 SwapEngine（同 swap 测试惯例）。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubItem, SyncTarget } from '../../../src/core/types.js';
import { SwapEngine } from '../../../src/core/swap.js';
import type { SwapCategory } from '../../../src/core/swap.js';
import { dispatchToolViaSwap, resolveDefaultTargets, type DispatchDeps } from '../../../src/server/lib/doctor-dispatch.js';

const LAYOUT: Record<'identity' | 'rule', { rel: string; target: string; isDir: boolean }> = {
  identity: { rel: 'identity/profile.md', target: 'IDENTITY.md', isDir: false },
  rule: { rel: 'rules/global.md', target: 'rules/global.md', isDir: false },
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
      const layout = LAYOUT[cat as 'identity' | 'rule'];
      return {
        item: { type: cat, relativePath: layout.rel, absolutePath: resolve(hubRoot, layout.rel) } as HubItem,
        target: {
          tool: this.name,
          targetPath: resolve(this.dir, layout.target),
          strategy: 'copy',
          isDirectory: layout.isDir,
        } as SyncTarget,
      };
    });
  }
}

describe('doctor dispatch via swap（F3 分发端口）', () => {
  let hubDir: string;
  let toolDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-disp-hub-'));
    toolDir = mkdtempSync(join(tmpdir(), 'assetplex-disp-tool-'));
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

  function deps(categories: SwapCategory[]): DispatchDeps {
    const adapter = new FakeToolAdapter(toolDir, categories);
    const engine = new SwapEngine(HubConfigSchema.parse({}), [adapter]);
    return {
      getSwapEngine: () => engine,
      listInstalledTools: async () => [adapter.name],
    };
  }

  it('新增投放：目标无此资产 → written 且回传 swapId（供分发回滚）', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    const item = await dispatchToolViaSwap(deps(['identity']), 'faketool', 'identity/profile.md');
    expect(item).toEqual({ tool: 'faketool', action: 'written', swapId: expect.any(String) });
    expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Hub Identity');
  });

  it('differs 视为一屏确认的显式覆盖：备份后写入新版（Scenario 2/5 不静默）', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own', 'utf-8');
    const item = await dispatchToolViaSwap(deps(['identity']), 'faketool', 'identity/profile.md');
    expect(item.action).toBe('written');
    expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Hub Identity');
    // 覆盖前旧版入了 swap 备份区（回滚依据）
    expect(existsSync(join(hubDir, '.swap-backup'))).toBe(true);
  });

  it('范围只到本资产：同工具其他类别零变化（Scenario 6 的反向保证）', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeHub('rules/global.md', '# Rule A');
    await dispatchToolViaSwap(deps(['identity', 'rule']), 'faketool', 'identity/profile.md');
    expect(existsSync(resolve(toolDir, 'rules', 'global.md'))).toBe(false);
  });

  it('不支持该资产的类别：preview 无此路径 → skipped 且有原因', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    const item = await dispatchToolViaSwap(deps(['rule']), 'faketool', 'identity/profile.md');
    expect(item.action).toBe('skipped');
    expect(item.reason).toContain('不支持');
  });

  it('工具未安装：skipped 不发执行', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    rmSync(join(toolDir, 'sig.txt'));
    const item = await dispatchToolViaSwap(deps(['identity']), 'faketool', 'identity/profile.md');
    expect(item.action).toBe('skipped');
    expect(item.reason).toContain('未安装');
  });

  it('默认目标：只含「库内容已存在于工具」的安装工具；新投放路径不计入', async () => {
    writeHub('identity/profile.md', '# Hub Identity');
    writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Hub Identity', 'utf-8');
    const tools = await resolveDefaultTargets(deps(['identity', 'rule']), 'identity/profile.md');
    expect(tools).toEqual(['faketool']);
    const ghost = await resolveDefaultTargets(deps(['identity', 'rule']), 'identity/other.md');
    expect(ghost).toEqual([]);
  });
});
