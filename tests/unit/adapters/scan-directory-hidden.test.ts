import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { ToolConfig } from '../../../src/core/adapters/types.js';
import type { DiscoveredCategory, DiscoveredItem, SyncTarget } from '../../../src/core/types.js';

/**
 * scanDirectory 隐藏条目过滤 + 二进制标记
 * spec: 设计文档/changes/refine-skill-cards-wizard/specs/import-wizard-noise.spec.md
 *       Requirement「隐藏条目不出现在盘点里」
 */

/** 只为暴露 protected scanDirectory 的最小适配器 */
class ProbeAdapter extends BaseAdapter {
  readonly name = 'probe';
  readonly displayName = 'Probe';
  protected readonly defaultConfigDir = '';
  protected readonly signatureFiles: string[] = [];
  protected readonly supportedTargets: string[] = [];

  targets(_config: ToolConfig): SyncTarget[] {
    return [];
  }

  scanDir(dirPath: string, baseDir: string, hubPrefix: string, category: DiscoveredCategory): DiscoveredItem[] {
    return this.scanDirectory(dirPath, baseDir, hubPrefix, category);
  }
}

describe('scanDirectory 隐藏条目过滤', () => {
  let testDir: string;
  let base: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-scan-hidden-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = join(testDir, 'hub');
    base = join(testDir, 'tool');
    mkdirSync(base, { recursive: true });
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('点文件与点目录被跳过，正常文件照常返回', () => {
    const rulesDir = join(base, 'rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, 'rules.md'), '# Rules\n');
    writeFileSync(join(rulesDir, '.arkcli-managed-skills.json'), '{}');
    writeFileSync(join(rulesDir, '.DS_Store'), 'x');
    mkdirSync(join(rulesDir, '.git'), { recursive: true });
    writeFileSync(join(rulesDir, '.git', 'HEAD'), 'ref: main\n');

    const items = new ProbeAdapter().scanDir(rulesDir, base, 'rules', 'rule');

    expect(items.map((i) => i.hubTargetPath)).toEqual(['rules/rules.md']);
  });

  it('嵌套隐藏目录整棵跳过', () => {
    const skillsDir = join(base, 'skills');
    mkdirSync(join(skillsDir, 'demo', '.cache'), { recursive: true });
    writeFileSync(join(skillsDir, 'demo', 'SKILL.md'), '# Demo\n');
    writeFileSync(join(skillsDir, 'demo', '.cache', 'blob.json'), '{}');

    const items = new ProbeAdapter().scanDir(skillsDir, base, 'skills', 'skill');

    expect(items.map((i) => i.hubTargetPath)).toEqual(['skills/demo/SKILL.md']);
  });

  it('起点本身是点目录时，内部正常文件照常被发现（Qoder .qoder/skills）', () => {
    const qoderSkills = join(base, '.qoder', 'skills');
    mkdirSync(qoderSkills, { recursive: true });
    writeFileSync(join(qoderSkills, 'mycode.md'), '# MyCode\n');

    const items = new ProbeAdapter().scanDir(qoderSkills, base, 'skills', 'skill');

    expect(items.map((i) => i.hubTargetPath)).toEqual(['skills/mycode.md']);
  });

  it('扫描结果带 binary 静态字段：图标为二进制，markdown 为文本', () => {
    const skillsDir = join(base, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'SKILL.md'), '# Demo\n');
    writeFileSync(join(skillsDir, '_icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));

    const items = new ProbeAdapter().scanDir(skillsDir, base, 'skills', 'skill');
    const byPath = new Map(items.map((i) => [i.hubTargetPath, i]));

    expect(byPath.get('skills/SKILL.md')?.binary).toBe(false);
    expect(byPath.get('skills/_icon.png')?.binary).toBe(true);
  });
});
