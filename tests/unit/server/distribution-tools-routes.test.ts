/**
 * 分发工具矩阵与回滚路由测试（remove-tool-swap B21）
 *
 * GET  /api/distributions/tools   —— 候选工具 + 六类支持矩阵
 * POST /api/remediations/rollback —— 回滚一次分发（覆盖项恢复 + 新增项移除）
 *
 * 原切换工具矩阵与回滚端点已归位，旧路径不再挂载（断言 404）。
 * 通过工厂注入临时 Hub + FakeToolAdapter，不依赖真实工具目录。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubItem, SyncStrategy, SyncTarget } from '../../../src/core/types.js';
import { AssetWriteEngine } from '../../../src/core/asset-write.js';
import type { AssetWriteCategory } from '../../../src/core/asset-write.js';
import { distributionToolsRoutesFactory } from '../../../src/server/routes/distribution-tools.js';
import { remediationRollbackRoutesFactory } from '../../../src/server/routes/remediation-rollback.js';

const ALL_CATEGORIES: AssetWriteCategory[] = ['identity', 'rule', 'skill', 'mcp', 'memory', 'agent'];

const CATEGORY_HUB_FILE: Record<AssetWriteCategory, string> = {
  identity: 'identity/profile.md',
  rule: 'rules/global.md',
  skill: 'skills/demo/SKILL.md',
  mcp: 'mcp/mcp.sources.json',
  memory: 'memory/notes.md',
  agent: 'agents/researcher.md',
};

const FAKE_LAYOUT: Record<AssetWriteCategory, { rel: string; target: string; strategy: SyncStrategy; isDir: boolean }> = {
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
    private readonly categories: AssetWriteCategory[],
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

describe('分发工具矩阵与回滚路由（remove-tool-swap B21）', () => {
  let hubDir: string;
  let toolDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-distapi-hub-'));
    toolDir = mkdtempSync(join(tmpdir(), 'assetplex-distapi-tool-'));
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

  function seedAllCategories(): void {
    for (const [cat, rel] of Object.entries(CATEGORY_HUB_FILE)) {
      // mcp 目标为 .json，回读验证会校验语法，种子需是合法 JSON
      writeHub(rel, cat === 'mcp' ? '{"mcpServers":{}}' : `# ${rel}\ncontent`);
    }
  }

  /** 构建被测 app：注入适配器集合与真实引擎（可传自定义 config） */
  function buildApp(
    adapters: ToolAdapter[],
    config: HubConfig = HubConfigSchema.parse({}),
  ): { app: Hono; engine: AssetWriteEngine } {
    const engine = new AssetWriteEngine(config, adapters);
    const app = new Hono();
    app.route(
      '/api/distributions',
      distributionToolsRoutesFactory({ listAdapters: () => adapters, getHubConfig: () => config }),
    );
    app.route('/api/remediations', remediationRollbackRoutesFactory({ getEngine: () => engine }));
    return { app, engine };
  }

  function json(res: Response): Promise<Record<string, unknown>> {
    return res.json() as Promise<Record<string, unknown>>;
  }

  it('GET /api/distributions/tools 返回候选与六类支持矩阵(不支持类别带原因)', async () => {
    seedAllCategories();
    const { app } = buildApp([new FakeToolAdapter(toolDir, ['identity', 'rule', 'skill'])]);
    const res = await app.request('/api/distributions/tools');
    expect(res.status).toBe(200);
    const body = await json(res);
    const tools = body.tools as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('faketool');
    expect(tools[0].displayName).toBe('Fake Tool');
    expect(tools[0].installed).toBe(true);
    const matrix = tools[0].supportMatrix as Record<string, { supported: boolean; reason?: string }>;
    expect(matrix.identity.supported).toBe(true);
    expect(matrix.agent.supported).toBe(false);
    expect(matrix.agent.reason).toContain('agent');
  });

  it('GET /api/distributions/tools:项目级候选带 projectCount,非项目级不带该字段', async () => {
    seedAllCategories();
    class ProjectLevelAdapter extends FakeToolAdapter {
      override readonly name = 'qoder';
      override readonly displayName = 'Qoder';
    }
    const emptyTargets = HubConfigSchema.parse({ tools: { qoder: { enabled: true } } });
    const twoTargets = HubConfigSchema.parse({
      tools: { qoder: { enabled: true, projectTargets: ['/demo/p1', '/demo/p2'] } },
    });

    const zero = await buildApp([new ProjectLevelAdapter(toolDir, ALL_CATEGORIES)], emptyTargets).app.request(
      '/api/distributions/tools',
    );
    const zeroTools = (await json(zero)).tools as Array<Record<string, unknown>>;
    expect(zeroTools[0].projectLevel).toBe(true);
    expect(zeroTools[0].projectCount).toBe(0);

    const two = await buildApp([new ProjectLevelAdapter(toolDir, ALL_CATEGORIES)], twoTargets).app.request(
      '/api/distributions/tools',
    );
    const twoTools = (await json(two)).tools as Array<Record<string, unknown>>;
    expect(twoTools[0].projectLevel).toBe(true);
    expect(twoTools[0].projectCount).toBe(2);

    // 非项目级工具不填 projectCount(避免界面误判)
    const plain = await buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]).app.request(
      '/api/distributions/tools',
    );
    const plainTools = (await json(plain)).tools as Array<Record<string, unknown>>;
    expect(plainTools[0].projectLevel).toBe(false);
    expect('projectCount' in plainTools[0]).toBe(false);
  });

  it('旧 /api/swap 端点不再挂载（404）', async () => {
    const { app } = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);
    const tools = await app.request('/api/swap/tools');
    expect(tools.status).toBe(404);
    const rollback = await app.request('/api/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: 'x' }),
    });
    expect(rollback.status).toBe(404);
  });

  it('POST /api/remediations/rollback 缺参 400;备份不存在 success:false 与明确原因', async () => {
    seedAllCategories();
    const { app } = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);

    const bad = await app.request('/api/remediations/rollback', { method: 'POST', body: JSON.stringify({}) });
    expect(bad.status).toBe(400);

    const res = await app.request('/api/remediations/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: 'no-such-write' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('不存在');
  });

  it('回滚真实分发:恢复覆盖项且幂等', async () => {
    seedAllCategories();
    // 目标已有不同内容的 IDENTITY.md → differs → 覆盖并备份
    writeHub('identity/profile.md', '# hub identity\n');
    writeFileSync(join(toolDir, 'IDENTITY.md'), '# old identity\n', 'utf-8');
    const { app, engine } = buildApp([new FakeToolAdapter(toolDir, ['identity'])]);

    const preview = await engine.preview('faketool');
    const executed = await engine.execute({
      tool: 'faketool',
      previewGeneratedAt: preview.generatedAt,
      overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
    });
    expect(executed.rollbackAvailable).toBe(true);
    expect(readFileSync(join(toolDir, 'IDENTITY.md'), 'utf-8')).toContain('hub identity');

    const rbRes = await app.request('/api/remediations/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: executed.swapId }),
    });
    expect(rbRes.status).toBe(200);
    const rb = (await rbRes.json()) as { success: boolean; restored: number };
    expect(rb.success).toBe(true);
    expect(rb.restored).toBe(1);
    expect(readFileSync(join(toolDir, 'IDENTITY.md'), 'utf-8')).toContain('old identity');

    // 幂等:再次回滚仍成功(从备份再恢复一次同一内容)
    const rb2 = await app.request('/api/remediations/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: executed.swapId }),
    });
    expect(((await rb2.json()) as { success: boolean }).success).toBe(true);

    const entry = engine.history().find((h) => h.swapId === executed.swapId);
    expect(entry?.rolledBack).toBe(true);
    // 备份目录仍按原数据格式落在 .swap-backup/（B21 不改数据文件）
    expect(existsSync(join(hubDir, '.swap-backup', executed.swapId, 'manifest.json'))).toBe(true);
  });
});
