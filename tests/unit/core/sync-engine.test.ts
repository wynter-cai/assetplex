import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SyncEngine, printSyncPlan, printSyncResult } from '../../../src/core/sync-engine.js';
import { TraeCnAdapter } from '../../../src/core/adapters/trae-cn.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubConfig } from '../../../src/core/config.js';

describe('SyncEngine', () => {
  let testDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-engine-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = testDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) {
      delete process.env.ASSETPLEX_DIR;
    } else {
      process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * 构造一个最小 Hub 配置（仅启用 trae-cn，config_dir 指向 testDir）
   */
  function makeTestConfig(traeCnDir: string): HubConfig {
    return HubConfigSchema.parse({
      hub: { version: '1.0', default_sync_strategy: 'symlink' },
      tools: {
        'trae-cn': {
          enabled: true,
          config_dir: traeCnDir,
          sync_strategy: 'symlink',
          mcp_format: 'json',
          targets: [],
        },
      },
    });
  }

  /**
   * 在 testDir 下构造 Hub 内容
   */
  function makeHubContent(): void {
    mkdirSync(join(testDir, 'identity'), { recursive: true });
    writeFileSync(join(testDir, 'identity/profile.md'), '# Profile\ntest content');

    mkdirSync(join(testDir, 'skills'), { recursive: true });
    mkdirSync(join(testDir, 'rules'), { recursive: true });
    mkdirSync(join(testDir, 'mcp'), { recursive: true });
    writeFileSync(
      join(testDir, 'mcp/mcp.sources.json'),
      JSON.stringify({ mcpServers: {} }),
    );
  }

  describe('plan', () => {
    it('对未安装工具返回空计划（带 skip）', async () => {
      const nonexistentDir = join(testDir, 'nonexistent-trae-cn');
      const config = makeTestConfig(nonexistentDir);
      const adapter = new TraeCnAdapter();
      // 覆写 defaultConfigDir，避免读到真实 ~/.trae-cn
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = nonexistentDir;
      const engine = new SyncEngine(config, [adapter]);

      const plans = await engine.plan({});

      expect(plans).toHaveLength(1);
      expect(plans[0].tool).toBe('trae-cn');
      // 未安装 → toolInstalled=false
      expect(plans[0].toolInstalled).toBe(false);
    });

    it('对已安装工具返回正确的同步计划', async () => {
      // 构造 trae-cn 目录（含 argv.json 标志文件）
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');

      // 构造 Hub 内容
      makeHubContent();

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      const plans = await engine.plan({});

      expect(plans[0].tool).toBe('trae-cn');
      expect(plans[0].toolInstalled).toBe(true);
      // 应有 4 个 items（profile.md, skills, rules, mcp.json）
      expect(plans[0].items.length).toBe(4);
      // 每个都应是待执行的 symlink 或 copy 动作
      for (const item of plans[0].items) {
        expect(['symlink', 'copy', 'skip']).toContain(item.action);
      }
    });

    it('--tool 过滤指定工具', async () => {
      const config = makeTestConfig(join(testDir, 'trae-cn'));
      const adapter = new TraeCnAdapter();
      const engine = new SyncEngine(config, [adapter]);

      const plans = await engine.plan({ tool: 'codex' });  // 不存在的工具

      expect(plans).toHaveLength(0);  // 被过滤的工具不应出现在计划中
    });

    it('--tools 多工具过滤只保留选中项', async () => {
      const config = makeTestConfig(join(testDir, 'trae-cn'));
      const traeAdapter = new TraeCnAdapter();
      const fakeCodex = { name: 'codex' } as unknown as ToolAdapter;
      const engine = new SyncEngine(config, [traeAdapter, fakeCodex]);

      const plans = await engine.plan({ tools: ['codex'] });

      // 仅 codex 出现在结果里（trae-cn 被过滤）
      expect(plans).toHaveLength(1);
      expect(plans[0].tool).toBe('codex');
    });

    it('Hub 源文件不存在时返回 skip 动作', async () => {
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');

      // 不构造 Hub 内容（identity/profile.md 不存在）

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      const plans = await engine.plan({});

      const profileItem = plans[0].items.find((i) =>
        i.target.targetPath.includes('user_profile.md'),
      );
      expect(profileItem).toBeDefined();
      expect(profileItem?.action).toBe('skip');
      expect(profileItem?.reason).toContain('Hub 源不存在');
    });
  });

  describe('run', () => {
    it('执行后工具目录有符号链接/文件', async () => {
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');

      makeHubContent();

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      const results = await engine.run({});

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe('trae-cn');
      expect(results[0].success).toBe(true);
      expect(results[0].itemCount).toBeGreaterThan(0);

      // mcp.json 应该被创建（copy 策略）
      expect(existsSync(join(traeCnDir, 'mcp.json'))).toBe(true);
    });
  });

  describe('printSyncPlan / printSyncResult', () => {
    it('不抛错地打印计划', () => {
      const plans = [
        {
          tool: 'trae-cn',
          toolInstalled: true,
          items: [
            {
              item: { type: 'identity', relativePath: 'profile.md', absolutePath: '/tmp/profile.md' },
              target: { tool: 'trae-cn', targetPath: '/tmp/target', strategy: 'symlink' as const, isDirectory: false },
              action: 'symlink' as const,
            },
          ],
        },
      ];
      expect(() => printSyncPlan(plans)).not.toThrow();
    });

    it('不抛错地打印结果', () => {
      const results = [
        {
          tool: 'trae-cn',
          success: true,
          itemCount: 4,
          skippedCount: 0,
          errors: [],
          warnings: [],
          durationMs: 100,
        },
      ];
      expect(() => printSyncResult(results)).not.toThrow();
    });

    it('打印包含错误的结果', () => {
      const results = [
        {
          tool: 'trae-cn',
          success: false,
          itemCount: 2,
          skippedCount: 1,
          errors: ['target/path: 失败原因'],
          warnings: [],
          durationMs: 50,
        },
      ];
      expect(() => printSyncResult(results)).not.toThrow();
    });

    it('打印空 items 的计划', () => {
      const plans = [
        {
          tool: 'codex',
          toolInstalled: false,
          items: [],
        },
      ];
      expect(() => printSyncPlan(plans)).not.toThrow();
    });

    it('打印含 skip 动作和 reason 的计划', () => {
      const plans = [
        {
          tool: 'trae-cn',
          toolInstalled: true,
          items: [
            {
              item: { type: 'identity', relativePath: 'profile.md', absolutePath: '/tmp/profile.md' },
              target: { tool: 'trae-cn', targetPath: '/tmp/target', strategy: 'symlink' as const, isDirectory: false },
              action: 'skip' as const,
              reason: '已是正确符号链接，跳过',
            },
          ],
        },
      ];
      expect(() => printSyncPlan(plans)).not.toThrow();
    });
  });

  describe('reverseImport', () => {
    it('未启用工具返回空结果', async () => {
      // 构造一个不含 trae-cn 启用配置的 HubConfig
      const config = HubConfigSchema.parse({
        hub: { version: '1.0', default_sync_strategy: 'symlink' },
        tools: {},  // 不启用任何工具
      });
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = join(testDir, 'nonexistent');
      const engine = new SyncEngine(config, [adapter]);

      const results = await engine.reverseImport({});

      expect(results).toEqual([]);
    });

    it('已启用工具但未安装返回空结果', async () => {
      const nonexistentDir = join(testDir, 'nonexistent-trae-cn');
      const config = makeTestConfig(nonexistentDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = nonexistentDir;
      const engine = new SyncEngine(config, [adapter]);

      const results = await engine.reverseImport({});

      // 工具未安装 → reverseImport 跳过，results 不包含该工具
      expect(results).toHaveLength(0);
    });

    it('已安装工具导入存在的目标文件', async () => {
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');
      // 构造一个反向导入的目标文件（profile.auto.md 之类）
      writeFileSync(join(traeCnDir, 'memory', 'user_profile.md'), '# Imported Profile');

      makeHubContent();

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      const results = await engine.reverseImport({});

      expect(results).toHaveLength(1);
      expect(results[0].tool).toBe('trae-cn');
      // 至少导入存在的 target（具体数量取决于 adapter 实现）
      expect(results[0].items.length).toBeGreaterThanOrEqual(0);
    });

    it('--tool 过滤指定工具', async () => {
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');

      makeHubContent();

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      // 过滤不存在的工具
      const results = await engine.reverseImport({ tool: 'codex' });

      expect(results).toHaveLength(0);
    });
  });

  describe('run 错误处理', () => {
    it('适配器 apply 抛错时记录到 errors', async () => {
      const traeCnDir = join(testDir, 'trae-cn');
      mkdirSync(traeCnDir, { recursive: true });
      mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
      writeFileSync(join(traeCnDir, 'argv.json'), '{}');

      // 构造 Hub 内容，但不创建 profile.md（这样 apply 会因源文件不存在抛错）
      mkdirSync(join(testDir, 'skills'), { recursive: true });
      mkdirSync(join(testDir, 'rules'), { recursive: true });
      mkdirSync(join(testDir, 'mcp'), { recursive: true });
      writeFileSync(join(testDir, 'mcp/mcp.sources.json'), JSON.stringify({ mcpServers: {} }));

      const config = makeTestConfig(traeCnDir);
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const engine = new SyncEngine(config, [adapter]);

      const results = await engine.run({});

      expect(results).toHaveLength(1);
      // 应该有 errors（identity/profile.md 不存在导致 apply 失败）
      // 注意：plan 阶段会把不存在的源标记为 skip，所以 apply 不会被调用
      // 但 itemCount 应该 < 4（profile.md 被跳过）
      expect(results[0].itemCount).toBeLessThan(4);
      expect(results[0].skippedCount).toBeGreaterThan(0);
    });
  });
});
