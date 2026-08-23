import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { TraeCnAdapter } from '../../../src/core/adapters/trae-cn.js';
import { HubConfigSchema } from '../../../src/core/config.js';

describe('TraeCnAdapter', () => {
  let testDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-trae-'));
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
   * 构造一个已安装 TRAE CN 的场景：testDir/trae-cn/argv.json 存在
   */
  function makeTraeCnInstalled(): string {
    const traeCnDir = join(testDir, 'trae-cn');
    mkdirSync(traeCnDir, { recursive: true });
    mkdirSync(join(traeCnDir, 'memory'), { recursive: true });
    writeFileSync(join(traeCnDir, 'argv.json'), JSON.stringify({ version: '1.0.28' }));
    return traeCnDir;
  }

  /**
   * 构造 Hub 内容（在 testDir 下）
   */
  function makeHubContent(): void {
    mkdirSync(join(testDir, 'identity'), { recursive: true });
    writeFileSync(join(testDir, 'identity/profile.md'), '# My Profile\ntest user');

    mkdirSync(join(testDir, 'skills'), { recursive: true });
    mkdirSync(join(testDir, 'rules', 'always'), { recursive: true });
    writeFileSync(join(testDir, 'rules/always/global.md'), '# Global Rules');

    mkdirSync(join(testDir, 'mcp'), { recursive: true });
    writeFileSync(
      join(testDir, 'mcp/mcp.sources.json'),
      JSON.stringify({ mcpServers: { test: { command: 'echo' } } }),
    );
  }

  describe('detect', () => {
    it('正确识别已安装的 TRAE CN', async () => {
      const traeCnDir = makeTraeCnInstalled();
      const adapter = new TraeCnAdapter();
      // 重写 defaultConfigDir 指向 testDir
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;

      const status = await adapter.detect();

      expect(status.installed).toBe(true);
      expect(status.configDirExists).toBe(true);
      expect(status.configDir).toBe(traeCnDir);
    });

    it('缺少标志性文件时返回未安装', async () => {
      const traeCnDir = join(testDir, 'empty-trae-cn');
      mkdirSync(traeCnDir, { recursive: true });  // 不创建 argv.json

      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;

      const status = await adapter.detect();

      expect(status.installed).toBe(false);
      expect(status.configDirExists).toBe(true);
      expect(status.error).toContain('标志性文件');
    });

    it('目录不存在时返回未安装', async () => {
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = join(testDir, 'nonexistent');

      const status = await adapter.detect();

      expect(status.installed).toBe(false);
      expect(status.configDirExists).toBe(false);
    });
  });

  describe('resolveHubItems', () => {
    it('返回 4 个 (item, target) 关联', () => {
      const traeCnDir = join(testDir, 'trae-cn');
      const config = HubConfigSchema.parse({});
      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;

      const result = adapter.resolveHubItems(config, testDir);

      expect(result).toHaveLength(4);

      // 检查每个 target 的路径
      const targetPaths = result.map((r) => r.target.targetPath);
      expect(targetPaths).toContain(resolve(traeCnDir, 'memory/user_profile.md'));
      expect(targetPaths).toContain(resolve(traeCnDir, 'skills'));
      expect(targetPaths).toContain(resolve(traeCnDir, 'rules'));
      expect(targetPaths).toContain(resolve(traeCnDir, 'mcp.json'));
    });

    it('profile.md 关联到 identity/profile.md', () => {
      const adapter = new TraeCnAdapter();
      const config = HubConfigSchema.parse({});
      const result = adapter.resolveHubItems(config, testDir);

      const profileItem = result.find((r) =>
        r.target.targetPath.includes('user_profile.md'),
      );
      expect(profileItem).toBeDefined();
      expect(profileItem?.item.type).toBe('identity');
      expect(profileItem?.item.relativePath).toBe('identity/profile.md');
      expect(profileItem?.target.strategy).toBe('symlink');
    });

    it('mcp.json 是 copy 策略', () => {
      const adapter = new TraeCnAdapter();
      const config = HubConfigSchema.parse({});
      const result = adapter.resolveHubItems(config, testDir);

      const mcpItem = result.find((r) => r.target.targetPath.endsWith('mcp.json'));
      expect(mcpItem).toBeDefined();
      expect(mcpItem?.target.strategy).toBe('copy');
      expect(mcpItem?.item.type).toBe('mcp');
    });
  });

  describe('apply / import', () => {
    it('apply 后 mcp.json 是普通文件（copy 策略）', async () => {
      const traeCnDir = makeTraeCnInstalled();
      makeHubContent();

      const adapter = new TraeCnAdapter();
      (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = traeCnDir;
      const config = HubConfigSchema.parse({});
      const items = adapter.resolveHubItems(config, testDir);

      // 找到 mcp.json 的 item
      const mcpItem = items.find((i) => i.target.targetPath.endsWith('mcp.json'));
      expect(mcpItem).toBeDefined();

      await adapter.apply(mcpItem!.item, mcpItem!.target);

      // mcp.json 应该是普通文件（不是符号链接）
      const mcpPath = join(traeCnDir, 'mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
      const content = readFileSync(mcpPath, 'utf-8');
      expect(content).toContain('mcpServers');
      expect(content).toContain('test');
    });

    it('import 返回正确类型的 HubItem', async () => {
      const traeCnDir = makeTraeCnInstalled();
      // 写一个测试 mcp.json
      writeFileSync(
        join(traeCnDir, 'mcp.json'),
        JSON.stringify({ mcpServers: {} }),
      );

      const adapter = new TraeCnAdapter();
      const item = await adapter.import(join(traeCnDir, 'mcp.json'));

      expect(item.type).toBe('mcp');
      expect(item.absolutePath).toContain('mcp.json');
      expect(item.content).toBeDefined();
    });

    it('import user_profile.md 返回 identity 类型', async () => {
      const traeCnDir = makeTraeCnInstalled();
      writeFileSync(
        join(traeCnDir, 'memory/user_profile.md'),
        '# Test Profile',
      );

      const adapter = new TraeCnAdapter();
      const item = await adapter.import(join(traeCnDir, 'memory/user_profile.md'));

      expect(item.type).toBe('identity');
    });
  });
});
