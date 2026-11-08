/**
 * sync 引导块集成测试（add-asset-governance J4）
 *
 * spec: specs/mcp-entry.spec.md Scenario 6
 * 夹具用中性示例名与临时目录，不读取真实 Hub。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SyncEngine } from '../../../src/core/sync-engine.js';
import { HubConfigSchema, type HubConfig } from '../../../src/core/config.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import { GUIDANCE_START, GUIDANCE_END, upsertGuidanceBlock } from '../../../src/core/guidance.js';

let root: string;
let hubRoot: string;
let toolDir: string;
let claudeMd: string;

function makeConfig(guidance: boolean, configDir: string): HubConfig {
  return HubConfigSchema.parse({
    hub: { guidance },
    tools: { 'claude-code': { enabled: true, configDir } },
  });
}

function makeAdapter(): ToolAdapter {
  return {
    name: 'claude-code',
    displayName: 'Claude Code',
    detect: async () => ({ installed: true, configDir: toolDir }),
    targets: () => [],
    resolveHubItems: (config: HubConfig, hub: string) => [
      {
        item: { type: 'preference', relativePath: 'identity/profile.md', absolutePath: join(hub, 'identity/profile.md') },
        target: { tool: 'claude-code', targetPath: claudeMd, strategy: 'native-import', isDirectory: false },
      },
    ],
    apply: async () => {
      // 模拟"已有聚合文件": 仅在不存在时生成，避免每次同步覆盖用户正文
      if (!existsSync(claudeMd)) writeFileSync(claudeMd, '# AGENTS.md\n\n用户自己的内容。\n', 'utf-8');
    },
    import: async () => ({ type: 'preference', relativePath: '', absolutePath: '' }),
    scan: async () => [],
    transform: (content: string) => content,
  } as unknown as ToolAdapter;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'assetplex-guidance-'));
  hubRoot = join(root, 'hub');
  toolDir = join(root, 'tool');
  claudeMd = join(toolDir, 'CLAUDE.md');
  mkdirSync(join(hubRoot, 'identity'), { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  writeFileSync(join(hubRoot, 'identity/profile.md'), '# Identity\n', 'utf-8');
  process.env.ASSETPLEX_DIR = hubRoot;
});

afterEach(() => {
  delete process.env.ASSETPLEX_DIR;
  rmSync(root, { recursive: true, force: true });
});

describe('sync 引导块', () => {
  it('开启时在已生成的 CLAUDE.md 中写入带起止标记的引导块', async () => {
    writeFileSync(claudeMd, '# AGENTS.md\n\n用户自己的内容。\n', 'utf-8');
    const engine = new SyncEngine(makeConfig(true, toolDir), [makeAdapter()]);
    await engine.run();

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).toContain(GUIDANCE_START);
    expect(content).toContain(GUIDANCE_END);
    expect(content).toContain('assetplex_identity_get');
    expect(content).toContain('用户自己的内容。');
  });

  it('重复同步只保留一个引导块', async () => {
    writeFileSync(claudeMd, '# AGENTS.md\n\n用户自己的内容。\n', 'utf-8');
    const engine = new SyncEngine(makeConfig(true, toolDir), [makeAdapter()]);
    await engine.run();
    await engine.run();

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content.match(new RegExp(GUIDANCE_START, 'g'))).toHaveLength(1);
    expect(content.match(new RegExp(GUIDANCE_END, 'g'))).toHaveLength(1);
  });

  it('关闭引导后同步移除块，且不改动其他内容', async () => {
    writeFileSync(claudeMd, upsertGuidanceBlock('# AGENTS.md\n\n用户自己的内容。\n', true), 'utf-8');
    const engine = new SyncEngine(makeConfig(false, toolDir), [makeAdapter()]);
    await engine.run();

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).not.toContain(GUIDANCE_START);
    expect(content).toContain('用户自己的内容。');
  });

  it('目标文件不存在时不凭空创建引导块以外的内容', async () => {
    const engine = new SyncEngine(makeConfig(true, toolDir), [makeAdapter()]);
    await engine.run();

    const content = readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('用户自己的内容。');
    expect(content).toContain(GUIDANCE_START);
  });
});
