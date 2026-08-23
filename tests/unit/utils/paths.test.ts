import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { resolve, normalize } from 'node:path';
import { expandHome, getHubRoot, hubPath } from '../../../src/utils/paths.js';

describe('paths utils', () => {
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) {
      delete process.env.ASSETPLEX_DIR;
    } else {
      process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    }
  });

  describe('expandHome', () => {
    it('空字符串原样返回', () => {
      expect(expandHome('')).toBe('');
    });

    it('~ 返回 home 目录', () => {
      expect(expandHome('~')).toBe(homedir());
    });

    it('~/path 展开 ~ 为 home 目录', () => {
      const expanded = expandHome('~/documents/file.txt');
      expect(expanded).toBe(resolve(homedir(), 'documents/file.txt'));
    });

    it('~\\path (Windows 反斜杠) 展开 ~ 为 home 目录', () => {
      const expanded = expandHome('~\\documents\\file.txt');
      expect(expanded).toBe(resolve(homedir(), 'documents\\file.txt'));
    });

    it('~username 形式原样返回（Windows 不支持）', () => {
      expect(expandHome('~alice/documents')).toBe('~alice/documents');
    });

    it('普通路径调用 normalize', () => {
      expect(expandHome('/usr/local/bin')).toBe(normalize('/usr/local/bin'));
      expect(expandHome('./relative/path')).toBe(normalize('./relative/path'));
    });
  });

  describe('getHubRoot', () => {
    it('默认返回 ~/.assetplex', () => {
      delete process.env.ASSETPLEX_DIR;
      expect(getHubRoot()).toBe(resolve(homedir(), '.assetplex'));
    });

    it('ASSETPLEX_DIR 环境变量覆盖默认路径', () => {
      process.env.ASSETPLEX_DIR = '/custom/hub/path';
      // Windows 上 normalize 会把 / 转为 \
      const result = getHubRoot();
      expect(result.replace(/\\/g, '/')).toBe('/custom/hub/path');
    });

    it('ASSETPLEX_DIR 支持 ~/ 展开', () => {
      process.env.ASSETPLEX_DIR = '~/my-hub';
      expect(getHubRoot()).toBe(resolve(homedir(), 'my-hub'));
    });
  });

  describe('hubPath', () => {
    it('拼接 Hub 根目录与子路径', () => {
      delete process.env.ASSETPLEX_DIR;
      const result = hubPath('identity', 'profile.md');
      expect(result).toBe(resolve(homedir(), '.assetplex', 'identity', 'profile.md'));
    });

    it('无参数返回 Hub 根目录', () => {
      delete process.env.ASSETPLEX_DIR;
      expect(hubPath()).toBe(resolve(homedir(), '.assetplex'));
    });

    it('受 ASSETPLEX_DIR 影响', () => {
      process.env.ASSETPLEX_DIR = '/custom';
      const result = hubPath('file.txt');
      expect(result.replace(/\\/g, '/')).toBe(resolve('/custom', 'file.txt').replace(/\\/g, '/'));
    });
  });
});
