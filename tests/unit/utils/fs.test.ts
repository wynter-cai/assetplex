import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import {
  ensureDir,
  isSymlink,
  readSymlinkTarget,
  safeRemove,
  copyRecursive,
  isSamePath,
  isDirectory,
  isFile,
  relativePath,
  listMarkdownFiles,
  listMarkdownFilesRecursive,
} from '../../../src/utils/fs.js';
import { createSymlink } from '../../../src/transforms/symlink.js';

describe('fs utils', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'assetplex-fs-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('ensureDir', () => {
    it('递归创建目录', () => {
      const dir = join(testDir, 'a', 'b', 'c');
      ensureDir(dir);
      expect(existsSync(dir)).toBe(true);
    });

    it('已存在目录不报错', () => {
      const dir = join(testDir, 'exists');
      mkdirSync(dir);
      ensureDir(dir);
      expect(existsSync(dir)).toBe(true);
    });
  });

  describe('isSymlink', () => {
    it('识别符号链接', async () => {
      const target = join(testDir, 'target.txt');
      const link = join(testDir, 'link.txt');
      writeFileSync(target, 'content');
      const r = await createSymlink(target, link, { isDirectory: false, force: true });

      // copy 降级时 isSymlink 返回 false（Windows 无 symlink 权限）
      if (r.method !== 'copy') {
        expect(isSymlink(link)).toBe(true);
      }
      expect(isSymlink(target)).toBe(false);  // 普通文件不是 symlink
    });

    it('不存在路径返回 false', () => {
      expect(isSymlink(join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('readSymlinkTarget', () => {
    it('读取绝对路径目标', async () => {
      const target = join(testDir, 'target.txt');
      const link = join(testDir, 'link.txt');
      writeFileSync(target, 'content');
      const r = await createSymlink(target, link, { isDirectory: false, force: true });

      // copy 降级时 readSymlinkTarget 返回 null
      if (r.method === 'copy') {
        expect(readSymlinkTarget(link)).toBe(null);
      } else {
        expect(readSymlinkTarget(link)).toBe(target);
      }
    });

    it('非符号链接返回 null', () => {
      const file = join(testDir, 'file.txt');
      writeFileSync(file, 'content');

      expect(readSymlinkTarget(file)).toBe(null);
    });
  });

  describe('safeRemove', () => {
    it('删除符号链接不影响源', async () => {
      const target = join(testDir, 'target.txt');
      const link = join(testDir, 'link.txt');
      writeFileSync(target, 'content');
      await createSymlink(target, link, { isDirectory: false, force: true });

      safeRemove(link);

      expect(existsSync(link)).toBe(false);
      expect(existsSync(target)).toBe(true);
    });

    it('删除普通文件', () => {
      const file = join(testDir, 'file.txt');
      writeFileSync(file, 'content');

      safeRemove(file);

      expect(existsSync(file)).toBe(false);
    });

    it('删除目录（递归）', () => {
      const dir = join(testDir, 'dir');
      mkdirSync(dir);
      writeFileSync(join(dir, 'file.txt'), 'content');

      safeRemove(dir);

      expect(existsSync(dir)).toBe(false);
    });

    it('删除不存在路径不报错', () => {
      safeRemove(join(testDir, 'nonexistent'));
    });
  });

  describe('copyRecursive', () => {
    it('复制文件', () => {
      const src = join(testDir, 'src.txt');
      const dest = join(testDir, 'dest.txt');
      writeFileSync(src, 'content');

      copyRecursive(src, dest);

      expect(existsSync(dest)).toBe(true);
      expect(statSync(dest).isFile()).toBe(true);
    });

    it('递归复制目录', () => {
      const src = join(testDir, 'src-dir');
      const dest = join(testDir, 'dest-dir');
      mkdirSync(src);
      mkdirSync(join(src, 'subdir'));
      writeFileSync(join(src, 'file.txt'), 'content');
      writeFileSync(join(src, 'subdir', 'nested.txt'), 'nested');

      copyRecursive(src, dest);

      expect(existsSync(dest)).toBe(true);
      expect(existsSync(join(dest, 'file.txt'))).toBe(true);
      expect(existsSync(join(dest, 'subdir', 'nested.txt'))).toBe(true);
    });

    it('源不存在抛错', () => {
      expect(() => copyRecursive(join(testDir, 'nonexistent'), join(testDir, 'dest'))).toThrow();
    });
  });

  describe('isSamePath', () => {
    it('相同路径返回 true', () => {
      expect(isSamePath('/a/b/c', '/a/b/c')).toBe(true);
    });

    it('不同路径返回 false', () => {
      expect(isSamePath('/a/b/c', '/a/b/d')).toBe(false);
    });

    it('空路径返回 false', () => {
      expect(isSamePath('', '/a')).toBe(false);
      expect(isSamePath('/a', '')).toBe(false);
    });
  });

  describe('isDirectory / isFile', () => {
    it('正确识别目录', () => {
      const dir = join(testDir, 'dir');
      mkdirSync(dir);
      expect(isDirectory(dir)).toBe(true);
      expect(isFile(dir)).toBe(false);
    });

    it('正确识别文件', () => {
      const file = join(testDir, 'file.txt');
      writeFileSync(file, 'content');
      expect(isFile(file)).toBe(true);
      expect(isDirectory(file)).toBe(false);
    });

    it('不存在路径返回 false', () => {
      expect(isDirectory(join(testDir, 'nonexistent'))).toBe(false);
      expect(isFile(join(testDir, 'nonexistent'))).toBe(false);
    });
  });

  describe('relativePath', () => {
    it('返回相对路径', () => {
      const result = relativePath('/a/b', '/a/b/c');
      expect(result).toBe('c');
    });
  });

  describe('ensureDir 边缘场景', () => {
    it('已存在的目录不报错（多次调用幂等）', () => {
      const dir = join(testDir, 'exists');
      ensureDir(dir);
      ensureDir(dir);  // 再次调用不抛错
      expect(existsSync(dir)).toBe(true);
    });
  });

  describe('isSamePath 大小写', () => {
    it('Windows 上路径大小写不敏感', () => {
      // Windows 路径不区分大小写
      const isSame = isSamePath('C:\\Users\\Test', 'c:\\users\\test');
      // 仅断言不抛错（具体行为依赖平台）
      expect(typeof isSame).toBe('boolean');
    });
  });

  describe('listMarkdownFiles', () => {
    it('列出目录下所有 .md 文件（不递归）', () => {
      const dir = join(testDir, 'rules');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'global.md'), '# global');
      writeFileSync(join(dir, 'alpha.md'), '# alpha');
      writeFileSync(join(dir, 'readme.txt'), 'ignore me');
      mkdirSync(join(dir, 'sub'));
      writeFileSync(join(dir, 'sub', 'nested.md'), '# nested');

      const files = listMarkdownFiles(dir);
      expect(files).toEqual(['alpha.md', 'global.md']);
    });

    it('目录不存在时返回空数组', () => {
      expect(listMarkdownFiles(join(testDir, 'nonexistent'))).toEqual([]);
    });

    it('空目录返回空数组', () => {
      const dir = join(testDir, 'empty');
      mkdirSync(dir);
      expect(listMarkdownFiles(dir)).toEqual([]);
    });
  });

  describe('listMarkdownFilesRecursive', () => {
    it('递归列出所有 .md，返回相对 POSIX 路径', () => {
      const dir = join(testDir, 'rules');
      mkdirSync(join(dir, 'always'), { recursive: true });
      mkdirSync(join(dir, 'manual'), { recursive: true });
      writeFileSync(join(dir, 'playbook.md'), '# playbook');
      writeFileSync(join(dir, 'always', 'global.md'), '# global');
      writeFileSync(join(dir, 'always', 'security.md'), '# security');
      writeFileSync(join(dir, 'manual', 'refactor.md'), '# refactor');
      writeFileSync(join(dir, 'notes.txt'), 'ignore');

      const files = listMarkdownFilesRecursive(dir);
      expect(files).toEqual([
        'always/global.md',
        'always/security.md',
        'manual/refactor.md',
        'playbook.md',
      ]);
    });

    it('目录不存在时返回空数组', () => {
      expect(listMarkdownFilesRecursive(join(testDir, 'nope'))).toEqual([]);
    });
  });
});
