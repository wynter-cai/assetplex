import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { ToolConfig } from '../../../src/core/adapters/types.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { SyncTarget, HubItem } from '../../../src/core/types.js';

/**
 * 用于测试的 TestAdapter：继承 BaseAdapter，实现 abstract 方法
 * 模拟 trae-cn 模式：signatureFiles = ['argv.json']
 */
class TestAdapter extends BaseAdapter {
  readonly name = 'test-tool';
  readonly displayName = 'Test Tool';
  readonly homepage = 'https://example.com/test-tool';

  protected defaultConfigDir = '~/.test-tool';
  protected signatureFiles = ['argv.json'];
  protected supportedTargets = ['config.json'];

  targets(config: ToolConfig): SyncTarget[] {
    const configDir = config.configDir || this.defaultConfigDir;
    const base = this.expandHome(configDir);
    return [
      {
        tool: this.name,
        targetPath: resolve(base, 'config.json'),
        strategy: 'symlink',
        isDirectory: false,
      },
    ];
  }
}

/**
 * 构造含 test-tool 配置的 HubConfig
 *
 * 注意：HubConfigSchema 会 strip 未声明的 tool key，
 * 所以这里先用 schema 解析得到默认结构，再用 cast 注入 test-tool
 */
function makeConfigWithTestTool(
  toolCfg: Record<string, unknown> = {
    enabled: true,
    configDir: '~/.test-tool',
    syncStrategy: 'symlink',
  },
): HubConfig {
  const base = HubConfigSchema.parse({});
  return {
    ...base,
    tools: {
      ...base.tools,
      'test-tool': toolCfg,
    },
  } as unknown as HubConfig;
}

describe('BaseAdapter (via TestAdapter)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-base-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  describe('apply', () => {
    it('copy 策略：源文件存在时复制到目标路径', async () => {
      const srcPath = join(testDir, 'source.md');
      const destDir = join(testDir, 'dest');
      const destPath = join(destDir, 'copy.md');
      writeFileSync(srcPath, '# Hello\n');

      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: 'source.md',
        absolutePath: srcPath,
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: destPath,
        strategy: 'copy',
        isDirectory: false,
      };

      await adapter.apply(item, target);

      expect(existsSync(destPath)).toBe(true);
      expect(readFileSync(destPath, 'utf-8')).toBe('# Hello\n');
    });

    it('native-import 策略：默认实现抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: 'x.md',
        absolutePath: join(testDir, 'x.md'),
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'native-import',
        isDirectory: false,
      };

      await expect(adapter.apply(item, target)).rejects.toThrow(
        /不支持 native-import 策略/,
      );
    });

    it('per-project 策略：默认实现抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: 'x.md',
        absolutePath: join(testDir, 'x.md'),
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'per-project',
        isDirectory: false,
      };

      await expect(adapter.apply(item, target)).rejects.toThrow(
        /不支持 per-project 策略/,
      );
    });

    it('未知策略：抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: 'x.md',
        absolutePath: join(testDir, 'x.md'),
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'unknown-strategy' as SyncTarget['strategy'],
        isDirectory: false,
      };

      await expect(adapter.apply(item, target)).rejects.toThrow(
        /未知的同步策略/,
      );
    });

    it('absolutePath 为空：抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: '',
        absolutePath: '',
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'copy',
        isDirectory: false,
      };

      await expect(adapter.apply(item, target)).rejects.toThrow(
        /HubItem\.absolutePath 为空/,
      );
    });
  });

  describe('applyNativeImport / applyPerProject', () => {
    it('applyNativeImport() 默认抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: '',
        absolutePath: join(testDir, 'x.md'),
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'native-import',
        isDirectory: false,
      };

      await expect(
        (
          adapter as unknown as {
            applyNativeImport: (i: HubItem, t: SyncTarget) => Promise<void>;
          }
        ).applyNativeImport(item, target),
      ).rejects.toThrow(/不支持 native-import 策略/);
    });

    it('applyPerProject() 默认抛错', async () => {
      const adapter = new TestAdapter();
      const item: HubItem = {
        type: 'preference',
        relativePath: '',
        absolutePath: join(testDir, 'x.md'),
      };
      const target: SyncTarget = {
        tool: 'test-tool',
        targetPath: join(testDir, 'out.md'),
        strategy: 'per-project',
        isDirectory: false,
      };

      await expect(
        (
          adapter as unknown as {
            applyPerProject: (i: HubItem, t: SyncTarget) => Promise<void>;
          }
        ).applyPerProject(item, target),
      ).rejects.toThrow(/不支持 per-project 策略/);
    });
  });

  describe('import', () => {
    it('默认实现：读取文件内容返回 HubItem', async () => {
      const filePath = join(testDir, 'config.json');
      const raw = JSON.stringify({ hello: 'world' });
      writeFileSync(filePath, raw);

      const adapter = new TestAdapter();
      const item = await adapter.import(filePath);

      expect(item.type).toBe('preference');
      expect(item.relativePath).toBe('');
      expect(item.absolutePath).toBe(filePath);
      expect(item.content).toBeDefined();
      expect(item.content!.toString()).toBe(raw);
    });
  });

  describe('transform', () => {
    it('默认实现：返回原内容（同一引用）', () => {
      const adapter = new TestAdapter();
      const content = Buffer.from('hello world');
      const result = adapter.transform(content, 'md');
      expect(result).toBe(content);
    });

    it('json / toml / md 三种 format 均返回原内容', () => {
      const adapter = new TestAdapter();
      const content = Buffer.from('{"a":1}');
      for (const fmt of ['json', 'toml', 'md'] as const) {
        expect(adapter.transform(content, fmt)).toBe(content);
      }
    });
  });

  describe('detectVersion', () => {
    it('默认返回 undefined', async () => {
      const adapter = new TestAdapter();
      const version = await (
        adapter as unknown as {
          detectVersion: () => Promise<string | undefined>;
        }
      ).detectVersion();
      expect(version).toBeUndefined();
    });
  });

  describe('getToolConfig', () => {
    it('返回正确配置', () => {
      const config = makeConfigWithTestTool({
        enabled: true,
        configDir: '~/.test-tool',
        syncStrategy: 'symlink',
        mcpFormat: 'json',
      });
      const adapter = new TestAdapter();
      const toolConfig = (
        adapter as unknown as {
          getToolConfig: (c: HubConfig) => ToolConfig | null;
        }
      ).getToolConfig(config);

      expect(toolConfig).not.toBeNull();
      expect(toolConfig!.enabled).toBe(true);
      expect(toolConfig!.configDir).toBe('~/.test-tool');
      expect(toolConfig!.syncStrategy).toBe('symlink');
      expect(toolConfig!.mcpFormat).toBe('json');
    });

    it('工具不存在时返回 null', () => {
      // HubConfigSchema 默认不含 test-tool，会被 strip
      const config = HubConfigSchema.parse({});
      const adapter = new TestAdapter();
      const toolConfig = (
        adapter as unknown as {
          getToolConfig: (c: HubConfig) => ToolConfig | null;
        }
      ).getToolConfig(config);

      expect(toolConfig).toBeNull();
    });
  });

  describe('expandHome', () => {
    function callExpandHome(adapter: TestAdapter, p: string): string {
      return (
        adapter as unknown as { expandHome: (p: string) => string }
      ).expandHome(p);
    }

    it('空字符串返回空字符串', () => {
      const adapter = new TestAdapter();
      expect(callExpandHome(adapter, '')).toBe('');
    });

    it("'~' 返回 homedir", () => {
      const adapter = new TestAdapter();
      expect(callExpandHome(adapter, '~')).toBe(homedir());
    });

    it("'~/...' 展开 home 目录", () => {
      const adapter = new TestAdapter();
      const result = callExpandHome(adapter, '~/foo/bar');
      expect(result).toBe(normalize(resolve(homedir(), 'foo/bar')));
    });

    it("'~\\...' 展开 home 目录", () => {
      const adapter = new TestAdapter();
      const result = callExpandHome(adapter, '~\\foo\\bar');
      expect(result).toBe(normalize(resolve(homedir(), 'foo\\bar')));
    });

    it('普通路径返回规范化路径', () => {
      const adapter = new TestAdapter();
      const result = callExpandHome(adapter, '/usr/local/bin');
      expect(result).toBe(normalize('/usr/local/bin'));
    });
  });

  describe('resolveHubItems', () => {
    it('默认实现：基于 targets() 返回路径，HubItem.relativePath 为空', () => {
      const configDir = join(testDir, 'test-tool-home');
      mkdirSync(configDir, { recursive: true });

      const config = makeConfigWithTestTool({
        enabled: true,
        configDir,
        syncStrategy: 'symlink',
      });
      const adapter = new TestAdapter();
      const result = adapter.resolveHubItems(config, testDir);

      expect(result).toHaveLength(1);

      const { item, target } = result[0];
      // HubItem 默认字段
      expect(item.type).toBe('preference');
      expect(item.relativePath).toBe('');
      expect(item.absolutePath).toBe('');
      // target 来源于 targets()
      expect(target.tool).toBe('test-tool');
      expect(target.targetPath).toBe(resolve(configDir, 'config.json'));
      expect(target.strategy).toBe('symlink');
      expect(target.isDirectory).toBe(false);
    });

    it('工具未配置时返回空数组', () => {
      const config = HubConfigSchema.parse({});
      const adapter = new TestAdapter();
      const result = adapter.resolveHubItems(config, testDir);
      expect(result).toHaveLength(0);
    });
  });
});
