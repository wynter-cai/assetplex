import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../../../src/core/adapters/claude-code.js';
import { CodexAdapter } from '../../../src/core/adapters/codex.js';
import { QoderAdapter } from '../../../src/core/adapters/qoder.js';

describe('适配器动态扫描 rules/（回归测试）', () => {
  const testDir = mkdtempSync(join(tmpdir(), 'assetplex-rules-scan-'));
  const originalAssetPlexDir = process.env.ASSETPLEX_DIR;

  beforeAll(() => {
    // 构造 Hub 规则 fixture，避免依赖真实 ~/.assetplex 目录
    const rulesDir = join(testDir, 'rules', 'always');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(join(rulesDir, 'global.md'), '# Global Rules\n\nalways 生效的通用规则。\n');
    writeFileSync(
      join(testDir, 'rules', 'windows-coding-pitfalls.md'),
      '# Windows 编码陷阱\n\nWindows 专属注意事项。\n',
    );
    writeFileSync(
      join(testDir, 'rules', 'e2e-testing-playbook.md'),
      '# E2E 测试手册\n\n端到端测试流程。\n',
    );
    process.env.ASSETPLEX_DIR = testDir;
  });

  afterAll(() => {
    if (originalAssetPlexDir === undefined) {
      delete process.env.ASSETPLEX_DIR;
    } else {
      process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Claude Code CLAUDE.md 包含 rules/ 下所有 .md 文件', async () => {
    const base = join(testDir, '.claude');
    mkdirSync(base, { recursive: true });
    const adapter = new ClaudeCodeAdapter();
    vi.spyOn(adapter, 'getConfigDir').mockReturnValue(base);
    const items = adapter.resolveHubItems({} as any, '');
    const target = items.find((i) => i.target.targetPath.endsWith('CLAUDE.md'))!;
    await adapter.apply(target.item, target.target);
    const content = readFileSync(target.target.targetPath, 'utf-8');
    expect(content).toContain('rules/always/global.md');
    expect(content).toContain('rules/windows-coding-pitfalls.md');
    expect(content).toContain('rules/e2e-testing-playbook.md');
  });

  it('Codex AGENTS.md Rules 分区包含 rules/ 下所有 .md', async () => {
    const base = join(testDir, '.codex');
    mkdirSync(base, { recursive: true });
    const adapter = new CodexAdapter();
    vi.spyOn(adapter, 'getConfigDir').mockReturnValue(base);
    const items = adapter.resolveHubItems({} as any, '');
    const target = items.find((i) => i.target.targetPath.endsWith('AGENTS.md'))!;
    await adapter.apply(target.item, target.target);
    const content = readFileSync(target.target.targetPath, 'utf-8');
    expect(content).toContain('windows-coding-pitfalls');
    expect(content).toContain('e2e-testing-playbook');
    expect(content).toContain('always/global');
  });

  it('Qoder 项目级 AGENTS.md 包含 rules/ 下所有 .md', async () => {
    const projectBase = join(testDir, 'project');
    mkdirSync(projectBase, { recursive: true });
    const adapter = new QoderAdapter();
    const hubConfig = {
      tools: {
        qoder: { enabled: true, projectTargets: [projectBase] },
      },
    } as any;
    const items = adapter.resolveHubItems(hubConfig, '');
    const target = items.find((i) => i.target.targetPath.endsWith('AGENTS.md'))!;
    await adapter.apply(target.item, target.target);
    const content = readFileSync(target.target.targetPath, 'utf-8');
    expect(content).toContain('windows-coding-pitfalls');
    expect(content).toContain('e2e-testing-playbook');
    expect(content).toContain('always/global');
  });
});
