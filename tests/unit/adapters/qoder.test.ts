import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QoderAdapter } from '../../../src/core/adapters/qoder.js';

/**
 * Qoder detect 检测逻辑（spec: fix-scan-count-gaps/scan-sources.spec.md）
 *
 * 检测候选 ~/.qoder-cn（国行）→ ~/.qoder（国际版），
 * 标志文件 argv.json / mcp.json / settings.json。
 */
describe('QoderAdapter.detect', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) rmSync(testDir, { recursive: true, force: true });
  });

  /** 将候选目录列表指向测试临时目录 */
  function makeAdapter(candidates: string[]): QoderAdapter {
    const adapter = new QoderAdapter();
    (adapter as unknown as { configDirCandidates: string[] }).configDirCandidates = candidates;
    return adapter;
  }

  it('识别 Qoder CN：~/.qoder-cn 含 argv.json', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-qoder-'));
    const cnDir = join(testDir, '.qoder-cn');
    mkdirSync(cnDir, { recursive: true });
    writeFileSync(join(cnDir, 'argv.json'), JSON.stringify({}));

    const status = await makeAdapter([cnDir, join(testDir, '.qoder')]).detect();

    expect(status.name).toBe('qoder');
    expect(status.installed).toBe(true);
    expect(status.configDirExists).toBe(true);
    expect(status.configDir).toBe(cnDir);
  });

  it('回退国际版：cn 缺失时用 ~/.qoder', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-qoder-'));
    const intlDir = join(testDir, '.qoder');
    mkdirSync(intlDir, { recursive: true });
    writeFileSync(join(intlDir, 'mcp.json'), '{}');

    const status = await makeAdapter([join(testDir, '.qoder-cn'), intlDir]).detect();

    expect(status.installed).toBe(true);
    expect(status.configDir).toBe(intlDir);
  });

  it('目录存在但无标志性文件 → 未安装并说明原因', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-qoder-'));
    const cnDir = join(testDir, '.qoder-cn');
    mkdirSync(cnDir, { recursive: true });

    const status = await makeAdapter([cnDir]).detect();

    expect(status.installed).toBe(false);
    expect(status.configDirExists).toBe(true);
    expect(status.error).toContain('标志性文件');
  });

  it('候选目录均不存在 → 未安装且 configDir 为空', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-qoder-'));

    const status = await makeAdapter([join(testDir, '.qoder-cn'), join(testDir, '.qoder')]).detect();

    expect(status.installed).toBe(false);
    expect(status.configDirExists).toBe(false);
    expect(status.configDir).toBe('');
  });

  it('getConfigDir 返回首个存在的候选目录', () => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-qoder-'));
    const cnDir = join(testDir, '.qoder-cn');
    const intlDir = join(testDir, '.qoder');
    mkdirSync(intlDir, { recursive: true });

    const adapter = makeAdapter([cnDir, intlDir]);

    expect(adapter.getConfigDir()).toBe(intlDir);
  });
});
