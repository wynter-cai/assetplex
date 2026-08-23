import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSymlink, removeSymlink } from '../../../src/transforms/symlink.js';
import { isSymlink } from '../../../src/utils/fs.js';

describe('symlink', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-symlink-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('createSymlink 文件链接', () => {
    it('成功创建文件符号链接', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(targetFile, 'hello world');

      const result = await createSymlink(targetFile, linkPath, { isDirectory: false });

      expect(result.success).toBe(true);
      expect(['symlink', 'junction', 'copy']).toContain(result.method);
      // copy 降级时 isSymlink 为 false 是正常的（Windows 无 symlink 权限）
      if (result.method !== 'copy') {
        expect(isSymlink(linkPath)).toBe(true);
      } else {
        expect(existsSync(linkPath)).toBe(true);
      }
    });

    it('force=true 覆盖已有链接', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(targetFile, 'new content');
      // 先创建一个旧的链接
      const oldTarget = join(testDir, 'old.txt');
      writeFileSync(oldTarget, 'old content');
      await createSymlink(oldTarget, linkPath, { isDirectory: false, force: true });

      // 用 force 覆盖
      const result = await createSymlink(targetFile, linkPath, { isDirectory: false, force: true });

      expect(result.success).toBe(true);
      if (result.method !== 'copy') {
        expect(isSymlink(linkPath)).toBe(true);
      }
    });

    it('force=false 已有链接且指向错误目标时返回失败', async () => {
      const target1 = join(testDir, 'target1.txt');
      const target2 = join(testDir, 'target2.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(target1, 'content1');
      writeFileSync(target2, 'content2');
      await createSymlink(target1, linkPath, { isDirectory: false, force: true });

      const result = await createSymlink(target2, linkPath, { isDirectory: false, force: false });

      expect(result.success).toBe(false);
      expect(result.message).toContain('目标已存在');
    });

    it('链接已指向正确目标时幂等返回成功', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(targetFile, 'content');
      const first = await createSymlink(targetFile, linkPath, { isDirectory: false, force: true });

      // copy 降级时不支持幂等性测试（普通文件无法判断指向）
      if (first.method === 'copy') return;

      const result = await createSymlink(targetFile, linkPath, { isDirectory: false, force: false });

      expect(result.success).toBe(true);
      expect(result.message).toContain('已存在且指向正确目标');
    });

    it('源路径不存在时返回失败', async () => {
      const result = await createSymlink(
        join(testDir, 'nonexistent'),
        join(testDir, 'link'),
        { isDirectory: false },
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('源路径不存在');
    });
  });

  describe('createSymlink 目录链接', () => {
    it('成功创建目录符号链接', async () => {
      const targetDir = join(testDir, 'target-dir');
      const linkPath = join(testDir, 'link-dir');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'file.txt'), 'content');

      const result = await createSymlink(targetDir, linkPath, { isDirectory: true });

      expect(result.success).toBe(true);
      expect(['symlink', 'junction', 'copy']).toContain(result.method);
    });

    it('自动创建父目录', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'subdir', 'nested', 'link.txt');
      writeFileSync(targetFile, 'content');

      const result = await createSymlink(targetFile, linkPath, { isDirectory: false });

      expect(result.success).toBe(true);
      expect(existsSync(linkPath)).toBe(true);
    });

    it('force=true 覆盖挡路的空普通目录（Windows 回归）', async () => {
      // 复现 Windows 上目标位置存在一个空普通目录、导致 symlink 失败的问题
      const targetDir = join(testDir, 'target-dir');
      const linkPath = join(testDir, 'link-dir');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'file.txt'), 'content');
      mkdirSync(linkPath, { recursive: true }); // 空目录挡路

      const result = await createSymlink(targetDir, linkPath, {
        isDirectory: true,
        force: true,
      });

      expect(result.success).toBe(true);
      // 链接应可访问到目标里的文件
      expect(existsSync(join(linkPath, 'file.txt'))).toBe(true);
    });
  });

  describe('removeSymlink', () => {
    it('删除符号链接（不删源）', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(targetFile, 'content');
      const r = await createSymlink(targetFile, linkPath, { isDirectory: false, force: true });

      await removeSymlink(linkPath);

      // copy 降级时 removeSymlink 不会删除普通文件（只删 symlink）
      if (r.method !== 'copy') {
        expect(existsSync(linkPath)).toBe(false);
      }
      expect(existsSync(targetFile)).toBe(true);  // 源不受影响
    });

    it('删除不存在的链接不报错', async () => {
      await removeSymlink(join(testDir, 'nonexistent'));
      // 不抛错即通过
    });
  });

  describe('跨平台行为', () => {
    it('返回的 method 字段是有效枚举值', async () => {
      const targetFile = join(testDir, 'target.txt');
      const linkPath = join(testDir, 'link.txt');
      writeFileSync(targetFile, 'content');

      const result = await createSymlink(targetFile, linkPath, { isDirectory: false });

      expect(['symlink', 'junction', 'copy']).toContain(result.method);
    });

    it('Windows 上无权限时 fallback 到 copy（自动验证）', async () => {
      if (process.platform !== 'win32') return;  // 仅 Windows 测试
      const targetDir = join(testDir, 'target-dir');
      const linkPath = join(testDir, 'link-dir');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'file.txt'), 'content');

      const result = await createSymlink(targetDir, linkPath, { isDirectory: true });

      expect(result.success).toBe(true);
      // Windows 上可能是 symlink/junction/copy 任一种
      expect(['symlink', 'junction', 'copy']).toContain(result.method);
    });
  });
});
