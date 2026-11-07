import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SyncEngine } from '../../../src/core/sync-engine.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubConfig } from '../../../src/core/config.js';
import type { ImportItem } from '../../../src/core/types.js';

/**
 * executeImport 二进制分支
 * spec: 设计文档/changes/refine-skill-cards-wizard/specs/import-wizard-noise.spec.md
 *       Requirement「导入执行不写乱码」
 */
describe('SyncEngine.executeImport 二进制条目', () => {
  let testDir: string;
  let originalAssetPlexDir: string | undefined;

  /** 合法的 1x1 PNG 字节，含 0x00 便于验证不被当作文本重编码 */
  const PNG_BYTES = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
  ]);

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-import-binary-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = testDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(testDir, { recursive: true, force: true });
  });

  function makeTestConfig(): HubConfig {
    return HubConfigSchema.parse({
      hub: { version: '1.0', default_sync_strategy: 'symlink' },
      tools: {},
    });
  }

  /** 工具侧源文件（技能目录里的图标），返回绝对路径 */
  function makeSourceIcon(bytes: Buffer = PNG_BYTES): string {
    const toolDir = join(testDir, 'tool-out', 'skills', 'demo');
    mkdirSync(toolDir, { recursive: true });
    const sourcePath = join(toolDir, '_icon.png');
    writeFileSync(sourcePath, bytes);
    return sourcePath;
  }

  function makeItem(
    sourcePath: string,
    strategy: ImportItem['strategy'],
    withFlag: boolean = true,
  ): ImportItem {
    return {
      tool: 'demo-tool',
      absolutePath: sourcePath,
      hubTargetPath: 'skills/demo/_icon.png',
      category: 'skill',
      conflict: strategy === undefined ? 'none' : 'differs',
      strategy,
      ...(withFlag ? { binary: true } : {}),
    };
  }

  it('库内无同名文件时按字节复制，状态 created', async () => {
    const sourcePath = makeSourceIcon();
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({ items: [makeItem(sourcePath, undefined)] });

    const target = join(testDir, 'skills', 'demo', '_icon.png');
    expect(result.items[0].status).toBe('created');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target).equals(PNG_BYTES)).toBe(true);
  });

  it('库内已有同名文件且策略为覆盖时按字节覆盖，状态 overwritten', async () => {
    const hubDir = join(testDir, 'skills', 'demo');
    mkdirSync(hubDir, { recursive: true });
    writeFileSync(join(hubDir, '_icon.png'), Buffer.from([0x00, 0x01, 0x02]));
    const sourcePath = makeSourceIcon();
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({ items: [makeItem(sourcePath, 'overwrite')] });

    expect(result.items[0].status).toBe('overwritten');
    expect(readFileSync(join(hubDir, '_icon.png')).equals(PNG_BYTES)).toBe(true);
  });

  it('二进制请求合并时跳过并说明原因，库内文件保持不变', async () => {
    const hubDir = join(testDir, 'skills', 'demo');
    mkdirSync(hubDir, { recursive: true });
    const existing = Buffer.from([0x00, 0x0a, 0x0b]);
    writeFileSync(join(hubDir, '_icon.png'), existing);
    const sourcePath = makeSourceIcon();
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({ items: [makeItem(sourcePath, 'merge')] });

    expect(result.items[0].status).toBe('skipped');
    expect(result.items[0].message).toContain('二进制文件无法合并');
    expect(readFileSync(join(hubDir, '_icon.png')).equals(existing)).toBe(true);
    expect(result.skipped).toBe(1);
  });

  it('旧客户端未带 binary 字段时，按源文件实际类型仍走字节写入（不写乱码）', async () => {
    const sourcePath = makeSourceIcon();
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({ items: [makeItem(sourcePath, undefined, false)] });

    const target = join(testDir, 'skills', 'demo', '_icon.png');
    expect(result.items[0].status).toBe('created');
    expect(readFileSync(target).equals(PNG_BYTES)).toBe(true);
  });

  it('文本条目行为不变：created 后内容与源文件一致', async () => {
    const toolDir = join(testDir, 'tool-out');
    mkdirSync(toolDir, { recursive: true });
    const sourcePath = join(toolDir, 'note.md');
    writeFileSync(sourcePath, '# 说明\n正文\n', 'utf-8');
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({
      items: [
        {
          tool: 'demo-tool',
          absolutePath: sourcePath,
          hubTargetPath: 'rules/note.md',
          category: 'rule',
          conflict: 'none',
        },
      ],
    });

    expect(result.items[0].status).toBe('created');
    expect(readFileSync(join(testDir, 'rules', 'note.md'), 'utf-8')).toBe('# 说明\n正文\n');
  });
});
