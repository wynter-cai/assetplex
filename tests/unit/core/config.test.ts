/**
 * Hub 配置加载/保存测试
 *
 * fix-ui-trust-gaps T3 回归锁：hub.toml 缺失时（实测环境即此状态），
 * loadHubConfig 返回含全部工具键的默认配置，saveHubConfig 能自建目录与文件，
 * 这是连接页启停开关（POST /tools/:name/toggle）在无 toml 环境可用的前提。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHubConfig, saveHubConfig } from '../../../src/core/config.js';

let tempDir: string;
let configPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-config-'));
  configPath = join(tempDir, 'hub.toml');
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('hub.toml 缺失场景（fix-ui-trust-gaps T3）', () => {
  it('文件不存在时加载默认配置，且包含全部工具键', () => {
    expect(existsSync(configPath)).toBe(false);
    const config = loadHubConfig(configPath);

    expect(config.tools).toHaveProperty('trae-cn');
    expect(config.tools).toHaveProperty('claude-code');
    expect(config.tools).toHaveProperty('codex');
    expect(config.tools).toHaveProperty('workbuddy');
    expect(config.tools).toHaveProperty('qoder');
  });

  it('默认配置保存时自建目录与文件（不依赖预先存在的 hub.toml）', () => {
    const config = loadHubConfig(configPath);
    expect(existsSync(configPath)).toBe(false);

    config.tools.qoder.enabled = true;
    expect(() => saveHubConfig(config, configPath)).not.toThrow();
    expect(existsSync(configPath)).toBe(true);
  });

  it('保存后重新加载，工具启停状态持久化', () => {
    const config = loadHubConfig(configPath);
    config.tools.qoder.enabled = true;
    saveHubConfig(config, configPath);

    const reloaded = loadHubConfig(configPath);
    expect(reloaded.tools.qoder.enabled).toBe(true);

    reloaded.tools['trae-cn'].enabled = false;
    saveHubConfig(reloaded, configPath);
    expect(loadHubConfig(configPath).tools['trae-cn'].enabled).toBe(false);
  });

  it('目标目录多级不存在时保存仍成功（mkdir recursive）', () => {
    const deepPath = join(tempDir, 'nested', 'deeper', 'hub.toml');
    const config = loadHubConfig(deepPath);
    saveHubConfig(config, deepPath);
    expect(existsSync(deepPath)).toBe(true);
  });
});
