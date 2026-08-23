/**
 * 文件系统跨平台工具集
 *
 * 统一封装 Node.js fs API，处理 Windows 上 junction/symlink 行为差异。
 */

import {
  existsSync,
  mkdirSync,
  readlinkSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, isAbsolute, relative, join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 确保目录存在（递归创建）
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * 判断路径是否为符号链接（Windows junction 也算）
 *
 * 注意：Node.js 的 lstatSync().isSymbolicLink() 在 Windows 上对 junction（目录连接）
 * 返回 false，但 junction 在功能上等价于 symlink。这里用 readlinkSync 尝试读取，
 * 不抛错即认为是 symlink/junction。
 */
export function isSymlink(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    readlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取符号链接目标路径（junction 和 symlink 都能读）
 *
 * @returns 目标绝对路径；若不是链接或读取失败返回 null
 */
export function readSymlinkTarget(path: string): string | null {
  try {
    const target = readlinkSync(path);
    // readlink 返回的是相对路径或绝对路径，统一转为绝对路径
    if (isAbsolute(target)) return target;
    return resolve(dirname(path), target);
  } catch {
    return null;
  }
}

/**
 * 安全删除：如果是符号链接只删链接不删源；如果是普通文件/目录直接删
 */
export function safeRemove(path: string): void {
  if (!existsSync(path) && !isSymlink(path)) return;

  if (isSymlink(path)) {
    // 符号链接：用 unlink 删除链接本身（不影响源）
    try {
      unlinkSync(path);
      return;
    } catch {
      // Windows 上目录链接可能需要 rmdir
      try {
        rmdirSync(path);
        return;
      } catch {
        // 继续尝试 rmSync
      }
    }
  }

  // 普通文件或目录：递归删除
  // Windows 上 rmSync 存在已知 bug：对包含文件的目录返回成功但未实际删除
  // 优先尝试 rmSync（带 maxRetries 内建重试），失败则用 Windows 原生 rmdir 命令
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // 忽略错误，下面兜底处理
  }

  // 验证是否真的删除了
  if (!existsSync(path)) return;

  // Windows 上 rmSync 可能假成功，使用原生命令 rmdir /S /Q 兜底
  if (process.platform === 'win32') {
    try {
      // 路径可能含空格，需用双引号包裹
      execSync(`rmdir /S /Q "${path}"`, { stdio: 'ignore' });
    } catch {
      // 忽略错误
    }
  }

  // 最终轮询验证（Windows 文件系统可能有延迟）
  for (let i = 0; i < 5; i++) {
    if (!existsSync(path)) return;
    const start = Date.now();
    while (Date.now() - start < 100) {
      // busy wait 100ms 让文件系统同步
    }
  }
}

/**
 * 复制文件或目录（递归）
 */
export function copyRecursive(src: string, dest: string): void {
  if (!existsSync(src)) {
    throw new Error(`源路径不存在: ${src}`);
  }

  const stat = statSync(src);

  if (stat.isFile()) {
    ensureDir(dirname(dest));
    copyFileSync(src, dest);
    return;
  }

  if (stat.isDirectory()) {
    // 如果目标已存在且是符号链接，先删除
    if (isSymlink(dest)) {
      safeRemove(dest);
    }
    ensureDir(dest);

    for (const entry of readdirSync(src)) {
      const srcPath = resolve(src, entry);
      const destPath = resolve(dest, entry);
      copyRecursive(srcPath, destPath);
    }
    return;
  }

  throw new Error(`不支持的文件类型: ${src}`);
}

/**
 * 判断两个路径是否指向同一文件（规范化后比较）
 *
 * 用于检测已有符号链接是否指向正确目标
 */
export function isSamePath(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = resolve(a).toLowerCase();
  const nb = resolve(b).toLowerCase();
  return na === nb;
}

/**
 * 判断路径是否为目录
 */
export function isDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 判断路径是否为普通文件
 */
export function isFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * 返回相对路径（用于日志输出更友好）
 */
export function relativePath(from: string, to: string): string {
  return relative(from, to);
}

/**
 * 列出目录下所有 .md 文件（仅顶层，不递归），按文件名排序。
 * 目录不存在时返回空数组，不抛异常。
 *
 * 用于适配器在生成聚合文件（CLAUDE.md / AGENTS.md）时动态发现
 * rules/always/ 等目录下的规则文件，避免硬编码列表导致新增规则不生效。
 */
export function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * 列出目录下所有 .md 文件，返回相对于该目录的 POSIX 风格相对路径
 * （例如 "always/global.md"）。不递归子目录的子目录以外层级，
 * 这里只做一层子目录 + 顶层文件的扫描，足够 rules/ 使用。
 */
export function listMarkdownFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const walk = (current: string, prefix: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(current, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, `${prefix}${name}/`);
      } else if (name.toLowerCase().endsWith('.md')) {
        result.push(`${prefix}${name}`);
      }
    }
  };
  walk(dir, '');
  return result.sort((a, b) => a.localeCompare(b));
}
