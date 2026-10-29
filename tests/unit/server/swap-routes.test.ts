/**
 * 切换路由测试(enable-tool-hot-swap T7)
 *
 * spec: swap-bundle / swap-workflow / swap-verify-rollback
 * 验证 /api/swap/* 五端点:候选矩阵、预览、执行(含 staleness/未安装错误)、回滚、历史。
 * 通过 swapRoutesFactory 注入临时 Hub + FakeToolAdapter，不依赖真实工具目录。
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
import { SwapEngine } from '../../../src/core/swap.js';
import type { SwapCategory } from '../../../src/core/swap.js';
import { swapRoutesFactory } from '../../../src/server/routes/swap.js';

const ALL_CATEGORIES: SwapCategory[] = ['identity', 'rule', 'skill', 'mcp', 'memory', 'agent'];

const CATEGORY_HUB_FILE: Record<SwapCategory, string> = {
  identity: 'identity/profile.md',
  rule: 'rules/global.md',
  skill: 'skills/demo/SKILL.md',
  mcp: 'mcp/mcp.sources.json',
  memory: 'memory/notes.md',
  agent: 'agents/researcher.md',
};

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

describe('/api/swap 路由(enable-tool-hot-swap T7)', () => {
  let hubDir: string;
  let toolDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-swapapi-hub-'));
    toolDir = mkdtempSync(join(tmpdir(), 'assetplex-swapapi-tool-'));
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

  /** 构建被测 app:注入指定适配器集合的 SwapEngine(可传自定义 config) */
  function buildApp(adapters: ToolAdapter[], config: HubConfig = HubConfigSchema.parse({})): Hono {
    let engine: SwapEngine | null = null;
    const getEngine = (): SwapEngine => {
      if (!engine) engine = new SwapEngine(config, adapters);
      return engine;
    };
    const app = new Hono();
    app.route('/api/swap', swapRoutesFactory({ getEngine, listAdapters: () => adapters, getHubConfig: () => config }));
    return app;
  }

  function json(res: Response): Promise<Record<string, unknown>> {
    return res.json() as Promise<Record<string, unknown>>;
  }

  it('GET /tools 返回候选与六类支持矩阵(不支持类别带原因)', async () => {
    seedAllCategories();
    const app = buildApp([new FakeToolAdapter(toolDir, ['identity', 'rule', 'skill'])]);
    const res = await app.request('/api/swap/tools');
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

  it('POST /preview 返回六类分组;缺 tool 参数 400', async () => {
    seedAllCategories();
    const app = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);

    const res = await app.request('/api/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool' }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.tool).toBe('faketool');
    expect(body.toolInstalled).toBe(true);
    expect(body.groups).toHaveLength(6);

    const bad = await app.request('/api/swap/preview', { method: 'POST', body: JSON.stringify({}) });
    expect(bad.status).toBe(400);
  });

  it('POST /preview 未注册工具返回明确错误', async () => {
    const app = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);
    const res = await app.request('/api/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool: 'ghost' }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain('未注册');
  });

  it('预览→执行→历史 roundtrip:written 计数与落盘一致,历史含本次切换', async () => {
    seedAllCategories();
    const app = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);

    const previewRes = await app.request('/api/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool' }),
    });
    const preview = (await previewRes.json()) as { generatedAt: string };

    const execRes = await app.request('/api/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool', previewGeneratedAt: preview.generatedAt, overwriteDecisions: [] }),
    });
    expect(execRes.status).toBe(200);
    const result = (await execRes.json()) as {
      swapId: string;
      success: boolean;
      counts: { written: number };
    };
    expect(result.success).toBe(true);
    expect(result.counts.written).toBeGreaterThan(0);
    expect(existsSync(join(toolDir, 'IDENTITY.md'))).toBe(true);

    const histRes = await app.request('/api/swap/history');
    const histBody = (await histRes.json()) as {
      history: Array<{ swapId: string; tool: string; rolledBack: boolean }>;
    };
    expect(histBody.history[0].swapId).toBe(result.swapId);
    expect(histBody.history[0].tool).toBe('faketool');
    expect(histBody.history[0].rolledBack).toBe(false);
  });

  it('未预览直接执行 → 409 要求重新预览', async () => {
    seedAllCategories();
    const app = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);
    const res = await app.request('/api/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool', previewGeneratedAt: '2020-01-01T00:00:00.000Z', overwriteDecisions: [] }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toContain('重新预览');
  });

  it('未安装工具执行 → 409 明确错误', async () => {
    seedAllCategories();
    const emptyDir = mkdtempSync(join(tmpdir(), 'assetplex-swapapi-gone-'));
    rmSync(join(emptyDir, 'sig.txt'), { force: true });
    const app = buildApp([new FakeToolAdapter(emptyDir, ALL_CATEGORIES)]);

    const previewRes = await app.request('/api/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool' }),
    });
    const preview = (await previewRes.json()) as { toolInstalled: boolean; generatedAt: string };
    expect(preview.toolInstalled).toBe(false);

    const res = await app.request('/api/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool', previewGeneratedAt: preview.generatedAt, overwriteDecisions: [] }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toContain('未安装');
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('执行后回滚:恢复成功且幂等,历史标记 rolledBack', async () => {
    seedAllCategories();
    // 目标已有不同内容的 IDENTITY.md → differs → 覆盖并备份
    writeHub('identity/profile.md', '# hub identity\n');
    writeFileSync(join(toolDir, 'IDENTITY.md'), '# old identity\n', 'utf-8');
    const app = buildApp([new FakeToolAdapter(toolDir, ['identity'])]);

    const previewRes = await app.request('/api/swap/preview', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool' }),
    });
    const preview = (await previewRes.json()) as {
      generatedAt: string;
      groups: Array<{ items: Array<{ hubRelativePath: string; conflict: string }> }>;
    };
    const idItem = preview.groups[0].items[0];
    expect(idItem.conflict).toBe('differs');

    const execRes = await app.request('/api/swap/execute', {
      method: 'POST',
      body: JSON.stringify({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [{ hubRelativePath: idItem.hubRelativePath, overwrite: true }],
      }),
    });
    const result = (await execRes.json()) as { swapId: string; rollbackAvailable: boolean };
    expect(result.rollbackAvailable).toBe(true);
    expect(readFileSync(join(toolDir, 'IDENTITY.md'), 'utf-8')).toContain('hub identity');

    const rbRes = await app.request('/api/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: result.swapId }),
    });
    expect(rbRes.status).toBe(200);
    const rb = (await rbRes.json()) as { success: boolean; restored: number };
    expect(rb.success).toBe(true);
    expect(rb.restored).toBe(1);
    expect(readFileSync(join(toolDir, 'IDENTITY.md'), 'utf-8')).toContain('old identity');

    // 幂等:再次回滚仍成功(从备份再恢复一次同一内容)
    const rb2 = await app.request('/api/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: result.swapId }),
    });
    expect(((await rb2.json()) as { success: boolean }).success).toBe(true);

    const histBody = (await (await app.request('/api/swap/history')).json()) as {
      history: Array<{ swapId: string; rolledBack: boolean }>;
    };
    expect(histBody.history.find((h) => h.swapId === result.swapId)?.rolledBack).toBe(true);
  });

  it('GET /tools:项目级候选带 projectCount(未配置 0,配置 N 个为 N),非项目级不带该字段', async () => {
    seedAllCategories();
    // 项目级适配器(name 与配置里的 per-project 工具对齐)
    class ProjectLevelAdapter extends FakeToolAdapter {
      override readonly name = 'qoder';
      override readonly displayName = 'Qoder';
    }
    const emptyTargets = HubConfigSchema.parse({ tools: { qoder: { enabled: true } } });
    const twoTargets = HubConfigSchema.parse({
      tools: { qoder: { enabled: true, projectTargets: ['/demo/p1', '/demo/p2'] } },
    });

    const zero = await buildApp([new ProjectLevelAdapter(toolDir, ALL_CATEGORIES)], emptyTargets).request(
      '/api/swap/tools',
    );
    const zeroTools = (await json(zero)).tools as Array<Record<string, unknown>>;
    expect(zeroTools[0].projectLevel).toBe(true);
    expect(zeroTools[0].projectCount).toBe(0);

    const two = await buildApp([new ProjectLevelAdapter(toolDir, ALL_CATEGORIES)], twoTargets).request(
      '/api/swap/tools',
    );
    const twoTools = (await json(two)).tools as Array<Record<string, unknown>>;
    expect(twoTools[0].projectLevel).toBe(true);
    expect(twoTools[0].projectCount).toBe(2);

    // 非项目级工具不填 projectCount(避免界面误判)
    const plain = await buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]).request('/api/swap/tools');
    const plainTools = (await json(plain)).tools as Array<Record<string, unknown>>;
    expect(plainTools[0].projectLevel).toBe(false);
    expect('projectCount' in plainTools[0]).toBe(false);
  });

  it('回滚缺参 400;备份不存在返回 success:false 与明确原因', async () => {
    seedAllCategories();
    const app = buildApp([new FakeToolAdapter(toolDir, ALL_CATEGORIES)]);

    const bad = await app.request('/api/swap/rollback', { method: 'POST', body: JSON.stringify({}) });
    expect(bad.status).toBe(400);

    const res = await app.request('/api/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: 'no-such-swap' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain('不存在');
  });
});
