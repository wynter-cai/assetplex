/**
 * Hub 骨架初始化测试（add-zero-config-onboarding T3）
 *
 * spec 4.1：骨架只含目录 + hub.toml + mcp.sources.json + README，
 * 绝不写身份/规则空模板；幂等；已存在文件不覆盖。
 * 另含 assetplex init 回归：默认 init 行为必须保持不变（仍写完整模板）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureHubSkeleton, HUB_DIRECTORIES } from '../../../src/core/hub-skeleton.js';
import { loadHubConfig } from '../../../src/core/config.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-skeleton-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('ensureHubSkeleton（spec 4.1 修订）', () => {
  it('空目录：创建全部目录与骨架文件（不含 mcp.sources.json）', () => {
    const result = ensureHubSkeleton(tempDir);

    expect(existsSync(join(tempDir, 'hub.toml'))).toBe(true);
    expect(existsSync(join(tempDir, 'README.md'))).toBe(true);
    // mcp/mcp.sources.json 会被计为资产、破坏首跑 autoEnter，骨架不写（由 init/用户添加 MCP 创建）
    expect(existsSync(join(tempDir, 'mcp', 'mcp.sources.json'))).toBe(false);
    for (const dir of HUB_DIRECTORIES) {
      expect(existsSync(join(tempDir, ...dir.split('/')))).toBe(true);
    }
    expect(result.created).toContain('hub.toml');
    expect(result.created).not.toContain('mcp/mcp.sources.json');
    expect(result.skipped).toEqual([]);
  });

  it('不写身份/规则/偏好空模板（避免与真实资产冲突）', () => {
    ensureHubSkeleton(tempDir);
    const forbidden = [
      join('identity', 'profile.md'),
      join('identity', 'profile.auto.md'),
      join('identity', 'communication-style.md'),
      join('identity', 'tech-stack.md'),
      join('identity', 'env.md'),
      join('preferences', 'coding-style.md'),
      join('preferences', 'git-workflow.md'),
      join('rules', 'always', 'global.md'),
    ];
    for (const rel of forbidden) {
      expect(existsSync(join(tempDir, rel))).toBe(false);
    }
  });

  it('已存在文件不覆盖，计入 skipped', () => {
    writeFileSync(join(tempDir, 'hub.toml'), 'custom-content', 'utf-8');
    const result = ensureHubSkeleton(tempDir);
    expect(readFileSync(join(tempDir, 'hub.toml'), 'utf-8')).toBe('custom-content');
    expect(result.skipped).toContain('hub.toml');
    expect(result.created).not.toContain('hub.toml');
    expect(result.created).toContain('README.md');
  });

  it('幂等：二次调用无新建', () => {
    ensureHubSkeleton(tempDir);
    const second = ensureHubSkeleton(tempDir);
    expect(second.created).toEqual([]);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it('hub.toml 是可解析的默认配置（含全部工具键）', () => {
    ensureHubSkeleton(tempDir);
    const config = loadHubConfig(join(tempDir, 'hub.toml'));
    expect(config.tools).toHaveProperty('trae-cn');
    expect(config.tools).toHaveProperty('claude-code');
    expect(config.tools).toHaveProperty('codex');
    expect(config.tools).toHaveProperty('workbuddy');
    expect(config.tools).toHaveProperty('qoder');
  });
});

describe('assetplex init 回归（默认行为不变）', () => {
  let initEnvBackup: string | undefined;

  beforeEach(() => {
    initEnvBackup = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = mkdtempSync(join(tmpdir(), 'assetplex-init-reg-'));
  });

  afterEach(() => {
    rmSync(process.env.ASSETPLEX_DIR ?? '', { recursive: true, force: true });
    if (initEnvBackup === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = initEnvBackup;
  });

  it('默认 init 仍写完整模板（身份/规则/偏好/mcp.sources.json），与骨架不同', async () => {
    const { initCommand } = await import('../../../src/cli/commands/init.js');
    await initCommand({});

    const root = process.env.ASSETPLEX_DIR ?? '';
    expect(existsSync(join(root, 'hub.toml'))).toBe(true);
    expect(existsSync(join(root, 'identity', 'profile.md'))).toBe(true);
    expect(existsSync(join(root, 'rules', 'always', 'global.md'))).toBe(true);
    expect(existsSync(join(root, 'preferences', 'git-workflow.md'))).toBe(true);
    expect(existsSync(join(root, 'mcp', 'mcp.sources.json'))).toBe(true);
  });

  it('init 重复执行不覆盖已存在的模板文件', async () => {
    const { initCommand } = await import('../../../src/cli/commands/init.js');
    await initCommand({});
    const profilePath = join(process.env.ASSETPLEX_DIR ?? '', 'identity', 'profile.md');
    writeFileSync(profilePath, 'user-edited', 'utf-8');

    await initCommand({});
    expect(readFileSync(profilePath, 'utf-8')).toBe('user-edited');
  });
});
