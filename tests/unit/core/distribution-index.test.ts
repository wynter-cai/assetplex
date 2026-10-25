/**
 * 分发状态索引测试
 *
 * spec: asset-distribution-truth（状态判定规则 1-8 + Scenario 1/4/6）
 * 关联: fix-trust-and-consistency proposal D1 / D2 / D3
 *
 * 夹具一律用平台无关的中性示例名（demo-*），不出现真实用户名与目录名。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { HubItem, SyncTarget } from '../../../src/core/types.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import {
  buildDistributionIndex,
  type DistributionIndexPayload,
} from '../../../src/core/distribution-index.js';
import { nodeFsProbe, type FsProbe } from '../../../src/core/distribution-status.js';

const hubConfig = HubConfigSchema.parse({});

interface FakeAdapterOptions {
  name: string;
  installed: boolean;
  pairs: Array<{ item: HubItem; target: SyncTarget }>;
  /** 模拟 detect 抛错（单工具失败隔离） */
  broken?: boolean;
}

function makeAdapter(options: FakeAdapterOptions): ToolAdapter {
  return {
    name: options.name,
    displayName: options.name.toUpperCase(),
    async detect() {
      if (options.broken) throw new Error('detect exploded');
      return {
        name: options.name,
        installed: options.installed,
        configDirExists: options.installed,
        configDir: '',
      };
    },
    targets(): SyncTarget[] {
      return options.pairs.map((p) => p.target);
    },
    resolveHubItems() {
      return options.pairs;
    },
    async apply() {
      /* 只读索引不写盘 */
    },
    async import() {
      return { type: 'identity', relativePath: '', absolutePath: '' };
    },
    async scan() {
      return [];
    },
    transform(content: Buffer) {
      return content;
    },
  };
}

function dirPair(hubDir: string, hubAbs: string, targetPath: string, tool: string): { item: HubItem; target: SyncTarget } {
  return {
    item: { type: 'skill', relativePath: hubDir, absolutePath: hubAbs },
    target: { tool, targetPath, strategy: 'symlink', isDirectory: true },
  };
}

function filePair(
  hubRel: string,
  hubAbs: string,
  targetPath: string,
  tool: string,
): { item: HubItem; target: SyncTarget } {
  return {
    item: { type: 'identity', relativePath: hubRel, absolutePath: hubAbs },
    target: { tool, targetPath, strategy: 'symlink', isDirectory: false },
  };
}

function aggregatePair(targetPath: string, tool: string): { item: HubItem; target: SyncTarget } {
  return {
    item: { type: 'identity', relativePath: 'AGENTS.md', absolutePath: '' },
    target: { tool, targetPath, strategy: 'copy', isDirectory: false },
  };
}

/** 建 symlink；Windows 无权限时返回 false，让对应用例跳过 */
function trySymlink(source: string, target: string, isDir: boolean): boolean {
  try {
    symlinkSync(source, target, isDir ? 'junction' : 'file');
    return true;
  } catch {
    return false;
  }
}

let root = '';
let hubRoot = '';
let toolRoot = '';

const ASSETS = [
  { id: 'identity/profile.md', hubPath: 'identity/profile.md', category: 'identity' },
  { id: 'rules/demo-rule.md', hubPath: 'rules/demo-rule.md', category: 'rule' },
  { id: 'skills/demo-skill/SKILL.md', hubPath: 'skills/demo-skill/SKILL.md', category: 'skill' },
];

/** 探针：把指定路径伪装成指向 Hub 的链接，不依赖 Windows symlink 权限 */
function probeWithLinks(links: Record<string, string>): FsProbe {
  return {
    ...nodeFsProbe,
    isSymlink: (path) => path in links,
    linksTo: (linkPath, expected) => links[linkPath] === expected,
  };
}

function build(
  tools: ToolAdapter[],
  enabled: boolean[] = [],
  probe?: FsProbe,
): Promise<DistributionIndexPayload> {
  return buildDistributionIndex({
    tools: tools.map((adapter, index) => ({ adapter, enabled: enabled[index] ?? true })),
    hubConfig,
    hubRoot,
    assets: ASSETS,
    probe,
  });
}

function statusOf(payload: DistributionIndexPayload, assetId: string, toolId: string): string | undefined {
  return payload.index[assetId]?.find((entry) => entry.toolId === toolId)?.status;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assetplex-dist-'));
  hubRoot = join(root, 'hub');
  toolRoot = join(root, 'tool');
  mkdirSync(join(hubRoot, 'identity'), { recursive: true });
  mkdirSync(join(hubRoot, 'rules'), { recursive: true });
  mkdirSync(join(hubRoot, 'skills/demo-skill'), { recursive: true });
  mkdirSync(toolRoot, { recursive: true });
  writeFileSync(join(hubRoot, 'identity/profile.md'), '# 身份\n示例内容\n');
  writeFileSync(join(hubRoot, 'rules/demo-rule.md'), '# 规则\n示例内容\n');
  writeFileSync(join(hubRoot, 'skills/demo-skill/SKILL.md'), '# 技能\n示例内容\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('分发状态索引', () => {
  it('规则 1：未安装的工具一律 not_installed', async () => {
    const adapter = makeAdapter({
      name: 'tool-offline',
      installed: false,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), join(toolRoot, 'skills'), 'tool-offline')],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-offline')).toBe('not_installed');
  });

  it('规则 2：已安装但未启用 → not_enabled', async () => {
    const adapter = makeAdapter({
      name: 'tool-disabled',
      installed: true,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), join(toolRoot, 'skills'), 'tool-disabled')],
    });
    const payload = await build([adapter], [false]);
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-disabled')).toBe('not_enabled');
  });

  it('规则 3：项目级工具不产生任何条目，只上报接入项目数', async () => {
    const projectA = join(root, 'project-a');
    const projectB = join(root, 'project-b');
    const adapter = makeAdapter({
      name: 'tool-per-project',
      installed: true,
      pairs: [
        {
          item: { type: 'skill', relativePath: 'skills', absolutePath: join(hubRoot, 'skills') },
          target: { tool: 'tool-per-project', targetPath: join(projectA, '.demo/skills'), strategy: 'per-project', isDirectory: true },
        },
        {
          item: { type: 'identity', relativePath: 'AGENTS.md', absolutePath: '' },
          target: { tool: 'tool-per-project', targetPath: join(projectA, 'AGENTS.md'), strategy: 'per-project', isDirectory: false },
        },
        {
          item: { type: 'identity', relativePath: 'AGENTS.md', absolutePath: '' },
          target: { tool: 'tool-per-project', targetPath: join(projectB, 'AGENTS.md'), strategy: 'per-project', isDirectory: false },
        },
      ],
    });
    const payload = await build([adapter]);
    for (const asset of ASSETS) {
      expect(statusOf(payload, asset.id, 'tool-per-project')).toBeUndefined();
    }
    expect(payload.projectTools).toEqual([
      { toolId: 'tool-per-project', toolName: 'TOOL-PER-PROJECT', projectCount: 2 },
    ]);
  });

  it('规则 4：目录 symlink 指向 Hub 目录 → 全目录 synced', async () => {
    const linked = trySymlink(join(hubRoot, 'skills'), join(toolRoot, 'skills'), true);
    if (!linked) return; // 无 symlink 权限（Windows 未开开发者模式）时跳过
    const adapter = makeAdapter({
      name: 'tool-link',
      installed: true,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), join(toolRoot, 'skills'), 'tool-link')],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-link')).toBe('synced');
  });

  it('规则 4（探针）：目录链接指向别处 → conflict，不冒充已同步', async () => {
    mkdirSync(join(toolRoot, 'skills'), { recursive: true });
    const targetDir = join(toolRoot, 'skills');
    const adapter = makeAdapter({
      name: 'tool-link-elsewhere',
      installed: true,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), targetDir, 'tool-link-elsewhere')],
    });
    const payload = await build(
      [adapter],
      [],
      probeWithLinks({ [targetDir]: join(root, 'other-place') }),
    );
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-link-elsewhere')).toBe('conflict');
  });

  it('规则 5：文件 symlink 指向 Hub 文件 → synced（探针，不依赖 OS 权限）', async () => {
    const target = join(toolRoot, 'user_profile.md');
    writeFileSync(target, '# 旧副本\n');
    const hubFile = join(hubRoot, 'identity/profile.md');
    const adapter = makeAdapter({
      name: 'tool-file-link',
      installed: true,
      pairs: [filePair('identity/profile.md', hubFile, target, 'tool-file-link')],
    });
    const payload = await build([adapter], [], probeWithLinks({ [target]: hubFile }));
    expect(statusOf(payload, 'identity/profile.md', 'tool-file-link')).toBe('synced');
  });

  it('规则 5：目录内单文件链接指向别处 → conflict', async () => {
    const targetDir = join(toolRoot, 'rules');
    mkdirSync(targetDir, { recursive: true });
    const linkedFile = join(targetDir, 'demo-rule.md');
    writeFileSync(linkedFile, '# 别处的内容\n');
    const adapter = makeAdapter({
      name: 'tool-inner-link',
      installed: true,
      pairs: [dirPair('rules', join(hubRoot, 'rules'), targetDir, 'tool-inner-link')],
    });
    const payload = await build(
      [adapter],
      [],
      probeWithLinks({ [linkedFile]: join(root, 'stray/demo-rule.md') }),
    );
    expect(statusOf(payload, 'rules/demo-rule.md', 'tool-inner-link')).toBe('conflict');
  });

  it('规则 6：聚合文件命中 Hub 相对路径 → synced，未命中 → pending', async () => {
    writeFileSync(join(toolRoot, 'AGENTS.md'), '# AGENTS\n\n### rules/demo-rule.md\n\n内容\n');
    const adapter = makeAdapter({
      name: 'tool-aggregate',
      installed: true,
      pairs: [aggregatePair(join(toolRoot, 'AGENTS.md'), 'tool-aggregate')],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'rules/demo-rule.md', 'tool-aggregate')).toBe('synced');
    expect(statusOf(payload, 'identity/profile.md', 'tool-aggregate')).toBe('pending');
  });

  it('规则 7：非 symlink 副本内容一致 → synced，不一致 → conflict', async () => {
    mkdirSync(join(toolRoot, 'rules'), { recursive: true });
    writeFileSync(join(toolRoot, 'rules/demo-rule.md'), '# 规则\n示例内容\n');
    writeFileSync(join(toolRoot, 'stale.md'), '# 身份\n被改坏的内容\n');
    const adapter = makeAdapter({
      name: 'tool-copy',
      installed: true,
      pairs: [
        dirPair('rules', join(hubRoot, 'rules'), join(toolRoot, 'rules'), 'tool-copy'),
        filePair('identity/profile.md', join(hubRoot, 'identity/profile.md'), join(toolRoot, 'stale.md'), 'tool-copy'),
      ],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'rules/demo-rule.md', 'tool-copy')).toBe('synced');
    expect(statusOf(payload, 'identity/profile.md', 'tool-copy')).toBe('conflict');
  });

  it('规则 8：目标不存在 → pending（目录与文件两种形态）', async () => {
    const adapter = makeAdapter({
      name: 'tool-empty',
      installed: true,
      pairs: [
        dirPair('rules', join(hubRoot, 'rules'), join(toolRoot, 'rules'), 'tool-empty'),
        filePair('identity/profile.md', join(hubRoot, 'identity/profile.md'), join(toolRoot, 'absent.md'), 'tool-empty'),
      ],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'rules/demo-rule.md', 'tool-empty')).toBe('pending');
    expect(statusOf(payload, 'identity/profile.md', 'tool-empty')).toBe('pending');
  });

  it('单工具失败隔离：failedTools + partial，其他工具结果不受影响', async () => {
    const broken = makeAdapter({ name: 'tool-broken', installed: true, pairs: [], broken: true });
    const healthy = makeAdapter({
      name: 'tool-healthy',
      installed: false,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), join(toolRoot, 'skills'), 'tool-healthy')],
    });
    const payload = await build([broken, healthy]);
    expect(payload.partial).toBe(true);
    expect(payload.failedTools).toEqual(['tool-broken']);
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-healthy')).toBe('not_installed');
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-broken')).toBeUndefined();
  });

  it('工具不接收该类别时不产生条目（不得伪造成未分发）', async () => {
    const adapter = makeAdapter({
      name: 'tool-partial',
      installed: true,
      pairs: [
        filePair('identity/profile.md', join(hubRoot, 'identity/profile.md'), join(toolRoot, 'profile.md'), 'tool-partial'),
      ],
    });
    const payload = await build([adapter]);
    expect(statusOf(payload, 'identity/profile.md', 'tool-partial')).toBe('pending');
    expect(statusOf(payload, 'skills/demo-skill/SKILL.md', 'tool-partial')).toBeUndefined();
  });

  it('每个条目都带工具显示名，索引可被前端直接渲染', async () => {
    const adapter = makeAdapter({
      name: 'tool-label',
      installed: false,
      pairs: [dirPair('skills', join(hubRoot, 'skills'), join(toolRoot, 'skills'), 'tool-label')],
    });
    const payload = await build([adapter]);
    const entry = payload.index['skills/demo-skill/SKILL.md']?.[0];
    expect(entry?.toolName).toBe('TOOL-LABEL');
    expect(entry?.toolId).toBe('tool-label');
    expect(payload.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
