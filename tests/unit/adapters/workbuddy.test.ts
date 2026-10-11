/**
 * WorkBuddy / CodeBuddy 适配器测试
 *
 * spec: enable-tool-hot-swap T2 —— identity/memory 纳入分发面
 * 说明:适配器 getConfigDir 硬编码 ~/.workbuddy|~/.codebuddy,测试通过替换实例方法定向到临时目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkBuddyAdapter } from '../../../src/core/adapters/workbuddy.js';
import { HubConfigSchema } from '../../../src/core/config.js';

describe('WorkBuddyAdapter - identity/memory 分发(T2)', () => {
  let testDir: string; // Hub 根(ASSETPLEX_DIR)
  let wbDir: string; // 模拟的 ~/.workbuddy
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-hub-'));
    wbDir = mkdtempSync(join(tmpdir(), 'assetplex-wb-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = testDir;
    // Hub 内准备 identity/profile.md 与 memory/ 源
    mkdirSync(join(testDir, 'identity'), { recursive: true });
    writeFileSync(join(testDir, 'identity/profile.md'), '# My Profile');
    mkdirSync(join(testDir, 'memory'), { recursive: true });
    writeFileSync(join(testDir, 'memory/preferences.md'), '# Prefs');
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(testDir, { recursive: true, force: true });
    rmSync(wbDir, { recursive: true, force: true });
  });

  /** 定向 getConfigDir 到临时 workbuddy 目录 */
  function adapterWithDir(): WorkBuddyAdapter {
    const adapter = new WorkBuddyAdapter();
    (adapter as unknown as { getConfigDir: () => string }).getConfigDir = () => wbDir;
    return adapter;
  }

  describe('resolveHubItems', () => {
    it('包含 identity 目标(IDENTITY.md)与 memory 目标(memory 目录)', () => {
      const adapter = adapterWithDir();
      const config = HubConfigSchema.parse({});
      const result = adapter.resolveHubItems(config, testDir);

      const idt = result.find((r) => r.item.type === 'identity');
      expect(idt).toBeDefined();
      expect(idt!.item.relativePath).toBe('identity/profile.md');
      expect(idt!.target.targetPath).toBe(resolve(wbDir, 'IDENTITY.md'));
      expect(idt!.target.strategy).toBe('symlink');
      expect(idt!.target.isDirectory).toBe(false);

      const mem = result.find((r) => r.item.type === 'memory');
      expect(mem).toBeDefined();
      expect(mem!.target.targetPath).toBe(resolve(wbDir, 'memory'));
      expect(mem!.target.isDirectory).toBe(true);
    });

    it('既有 rules/skills/mcp 三类映射保持不变', () => {
      const adapter = adapterWithDir();
      const config = HubConfigSchema.parse({});
      const result = adapter.resolveHubItems(config, testDir);
      const types = result.map((r) => r.item.type);
      expect(types).toContain('rule');
      expect(types).toContain('skill');
      expect(types).toContain('mcp');
    });
  });

  describe('scan', () => {
    it('发现 IDENTITY.md → identity/profile.md,memory/*.md → memory', async () => {
      writeFileSync(join(wbDir, 'IDENTITY.md'), '# WB Identity');
      mkdirSync(join(wbDir, 'memory'), { recursive: true });
      writeFileSync(join(wbDir, 'memory/prefs.md'), '# WB Prefs');

      const adapter = adapterWithDir();
      const items = await adapter.scan();

      const idt = items.find((i) => i.hubTargetPath === 'identity/profile.md');
      expect(idt).toBeDefined();
      expect(idt!.category).toBe('identity');

      const mem = items.find((i) => i.category === 'memory' && i.hubTargetPath.startsWith('memory/'));
      expect(mem).toBeDefined();
    });
  });

  describe('import', () => {
    it('import IDENTITY.md 返回 identity 类型', async () => {
      const p = join(wbDir, 'IDENTITY.md');
      writeFileSync(p, '# ID');
      const adapter = adapterWithDir();
      const item = await adapter.import(p);
      expect(item.type).toBe('identity');
    });

    it('import memory 文件返回 memory 类型', async () => {
      mkdirSync(join(wbDir, 'memory'), { recursive: true });
      const p = join(wbDir, 'memory/prefs.md');
      writeFileSync(p, '# Prefs');
      const adapter = adapterWithDir();
      const item = await adapter.import(p);
      expect(item.type).toBe('memory');
    });
  });
});
