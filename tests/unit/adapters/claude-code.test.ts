/**
 * ClaudeCodeAdapter 扫描归类测试
 *
 * spec: add-memory-category / specs/memory-visible.spec.md
 * 关键断言：commands/ 不扫描（Claude 专属模板，非跨工具资产）；
 * agents/ 归智能体，不再伪装成 preference。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from '../../../src/core/adapters/claude-code.js';

describe('ClaudeCodeAdapter.scan 归类', () => {
  let testDir: string;
  let claudeDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-claude-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = testDir;

    claudeDir = join(testDir, 'claude');
    mkdirSync(join(claudeDir, 'commands'), { recursive: true });
    mkdirSync(join(claudeDir, 'agents'), { recursive: true });
    mkdirSync(join(claudeDir, 'rules'), { recursive: true });
    writeFileSync(join(claudeDir, 'commands/review-diff.md'), '# Review diff');
    writeFileSync(join(claudeDir, 'agents/code-reviewer.md'), '# Code reviewer');
    writeFileSync(join(claudeDir, 'rules/coding.md'), '# Coding rules');
    writeFileSync(join(claudeDir, 'CLAUDE.md'), '# My claude identity');
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) {
      delete process.env.ASSETPLEX_DIR;
    } else {
      process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  function makeAdapter(): ClaudeCodeAdapter {
    const adapter = new ClaudeCodeAdapter();
    (adapter as unknown as { defaultConfigDir: string }).defaultConfigDir = claudeDir;
    return adapter;
  }

  it('commands/ 下的文件不进入扫描结果（非跨工具资产）', async () => {
    const items = await makeAdapter().scan();
    // 目录存在、文件也在，但命令不是资产，不应被扫成任何类别
    expect(items.find((i) => i.absolutePath.endsWith('review-diff.md'))).toBeUndefined();
    expect(items.some((i) => i.hubTargetPath.startsWith('commands/'))).toBe(false);
  });

  it('agents/ 下的文件归智能体并落 agents/', async () => {
    const items = await makeAdapter().scan();
    const agent = items.find((i) => i.absolutePath.endsWith('code-reviewer.md'));
    expect(agent).toBeDefined();
    expect(agent?.category).toBe('agent');
    expect(agent?.hubTargetPath).toBe('agents/code-reviewer.md');
  });

  it('CLAUDE.md 仍归身份，rules/ 仍归规则', async () => {
    const items = await makeAdapter().scan();
    expect(items.find((i) => i.absolutePath.endsWith('CLAUDE.md'))?.category).toBe('identity');
    expect(items.find((i) => i.absolutePath.endsWith('coding.md'))?.category).toBe('rule');
  });

  it('扫描结果不再产出 preference 类别', async () => {
    const items = await makeAdapter().scan();
    expect(items.some((i) => i.category === 'preference')).toBe(false);
  });
});
