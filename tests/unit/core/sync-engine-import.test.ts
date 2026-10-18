import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SyncEngine } from '../../../src/core/sync-engine.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubConfig } from '../../../src/core/config.js';
import type { ImportItem } from '../../../src/core/types.js';

/**
 * executeImport 的仲裁草案（mergeDraft）透传落盘测试
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/conflict-arbitration.spec.md（C4）
 */
describe('SyncEngine.executeImport mergeDraft', () => {
  let testDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-import-'));
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

  function makeTestConfig(): HubConfig {
    return HubConfigSchema.parse({
      hub: { version: '1.0', default_sync_strategy: 'symlink' },
      tools: {},
    });
  }

  /** 准备 Hub 现有文件与工具侧源文件，返回源文件绝对路径 */
  function makeFiles(existingContent: string, sourceContent: string): string {
    mkdirSync(join(testDir, 'rules'), { recursive: true });
    writeFileSync(join(testDir, 'rules', 'demo-rule.md'), existingContent, 'utf-8');
    const toolDir = join(testDir, 'tool-out');
    mkdirSync(toolDir, { recursive: true });
    const sourcePath = join(toolDir, 'demo-rule.md');
    writeFileSync(sourcePath, sourceContent, 'utf-8');
    return sourcePath;
  }

  function makeItem(sourcePath: string, strategy: ImportItem['strategy'], mergeDraft?: string): ImportItem {
    return {
      tool: 'demo-tool',
      absolutePath: sourcePath,
      hubTargetPath: 'rules/demo-rule.md',
      category: 'rule',
      conflict: 'differs',
      strategy,
      ...(mergeDraft === undefined ? {} : { mergeDraft }),
    };
  }

  it('strategy=merge 且携带非空 mergeDraft 时，落盘内容等于仲裁草案', async () => {
    const sourcePath = makeFiles('# Hub 现有\n旧内容\n', '# 工具侧\n新内容\n');
    const draft = '# 仲裁合并草案\n草案正文\n';
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({
      items: [makeItem(sourcePath, 'merge', draft)],
    });

    expect(result.items[0].status).toBe('merged');
    expect(result.merged).toBe(1);
    expect(readFileSync(join(testDir, 'rules', 'demo-rule.md'), 'utf-8')).toBe(draft);
  });

  it('strategy=merge 无 mergeDraft 时维持机械合并（回归）', async () => {
    const sourcePath = makeFiles('HUB-MARKER 旧内容\n', 'SOURCE-MARKER 新内容\n');
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({
      items: [makeItem(sourcePath, 'merge')],
    });

    expect(result.items[0].status).toBe('merged');
    const written = readFileSync(join(testDir, 'rules', 'demo-rule.md'), 'utf-8');
    expect(written).toContain('HUB-MARKER');
    expect(written).toContain('SOURCE-MARKER');
  });

  it('mergeDraft 为空白串时视同缺省，走机械合并', async () => {
    const sourcePath = makeFiles('HUB-MARKER 旧内容\n', 'SOURCE-MARKER 新内容\n');
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({
      items: [makeItem(sourcePath, 'merge', '   \n  ')],
    });

    expect(result.items[0].status).toBe('merged');
    const written = readFileSync(join(testDir, 'rules', 'demo-rule.md'), 'utf-8');
    expect(written).toContain('HUB-MARKER');
    expect(written).toContain('SOURCE-MARKER');
  });

  it('strategy=overwrite 时忽略 mergeDraft，落盘源文件内容', async () => {
    const sourcePath = makeFiles('# Hub 现有\n旧内容\n', '# 工具侧\n新内容\n');
    const engine = new SyncEngine(makeTestConfig(), []);

    const result = await engine.executeImport({
      items: [makeItem(sourcePath, 'overwrite', '不该被使用的草案')],
    });

    expect(result.items[0].status).toBe('overwritten');
    const written = readFileSync(join(testDir, 'rules', 'demo-rule.md'), 'utf-8');
    expect(written).toBe('# 工具侧\n新内容\n');
    expect(written).not.toContain('不该被使用的草案');
  });
});
