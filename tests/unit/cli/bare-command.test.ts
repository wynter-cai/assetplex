/**
 * 无子命令 `assetplex` 首跑决策测试（add-zero-config-onboarding T9）
 *
 * 首次环境（autoEnter=true）→ 'wizard'：建骨架 + 启动 UI；
 * 非首次 → 'help'：不产生任何副作用。
 * 决策与副作用分离，测试不真起服务。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveBareInvocation,
  handleBareInvocation,
} from '../../../src/cli/commands/bare.js';

let tempDir: string;
let envBackup: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-bare-'));
  envBackup = process.env.ASSETPLEX_DIR;
  process.env.ASSETPLEX_DIR = tempDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (envBackup === undefined) delete process.env.ASSETPLEX_DIR;
  else process.env.ASSETPLEX_DIR = envBackup;
});

describe('resolveBareInvocation（纯函数）', () => {
  it('首次环境（autoEnter=true）→ wizard', () => {
    expect(resolveBareInvocation({ autoEnter: true })).toBe('wizard');
  });

  it('非首次（autoEnter=false）→ help', () => {
    expect(resolveBareInvocation({ autoEnter: false })).toBe('help');
  });
});

describe('handleBareInvocation（副作用注入）', () => {
  it('wizard：建骨架并启动 UI，返回 wizard', async () => {
    let skeleton = false;
    let uiStarted = false;
    const invocation = await handleBareInvocation({
      state: { autoEnter: true },
      ensureSkeleton: () => {
        skeleton = true;
      },
      startUi: async () => {
        uiStarted = true;
      },
    });
    expect(invocation).toBe('wizard');
    expect(skeleton).toBe(true);
    expect(uiStarted).toBe(true);
  });

  it('help：零副作用（不建骨架、不启动 UI）', async () => {
    let skeleton = false;
    let uiStarted = false;
    const invocation = await handleBareInvocation({
      state: { autoEnter: false },
      ensureSkeleton: () => {
        skeleton = true;
      },
      startUi: async () => {
        uiStarted = true;
      },
    });
    expect(invocation).toBe('help');
    expect(skeleton).toBe(false);
    expect(uiStarted).toBe(false);
    expect(existsSync(tempDir)).toBe(true);
  });
});
