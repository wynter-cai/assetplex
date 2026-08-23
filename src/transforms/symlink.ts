/**
 * 跨平台符号链接创建器
 *
 * 优先级：symlink > junction (Windows) > copy
 *
 * Windows 普通用户无 mklink /D 权限（需开发者模式或管理员），
 * 但 mklink /J（junction）不需要权限且行为等价于目录 symlink。
 * Linux/macOS 用 fs.symlink 即可。
 */

import { symlink, existsSync, lstatSync, readlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { ensureDir, safeRemove, isSymlink, copyRecursive } from '../utils/fs.js';

/**
 * 判断路径是否是空目录（非 symlink）
 *
 * Windows 上若目标位置存在一个空的普通目录，会阻挡 symlink/junction 创建，
 * safeRemove 的 rmSync 偶尔因文件系统延迟返回成功但目录仍在，需要显式处理。
 */
function isEmptyDir(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) return false;
    if (isSymlink(path)) return false;
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

export type SymlinkMethod = 'symlink' | 'junction' | 'copy';

export interface SymlinkResult {
  /** 是否成功 */
  success: boolean;
  /** 实际使用的方法 */
  method: SymlinkMethod;
  /** 附加信息（如降级原因） */
  message?: string;
}

export interface CreateSymlinkOptions {
  /** 目标是目录还是文件（影响 Windows junction 判断） */
  isDirectory?: boolean;
  /** 若链接已存在或目标位置已有文件，是否强制覆盖 */
  force?: boolean;
}

/**
 * 创建跨平台符号链接（自动 fallback）
 *
 * @param target 源文件/目录绝对路径（Hub 内的）
 * @param linkPath 链接路径（工具目录内的）
 */
export async function createSymlink(
  target: string,
  linkPath: string,
  options: CreateSymlinkOptions = {},
): Promise<SymlinkResult> {
  const { isDirectory = false, force = false } = options;

  // 确保 target 存在
  if (!existsSync(target)) {
    return {
      success: false,
      method: 'symlink',
      message: `源路径不存在: ${target}`,
    };
  }

  // 确保 linkPath 的父目录存在
  ensureDir(dirname(linkPath));

  // 若链接已存在
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    if (!force) {
      // 检查是否已经指向正确目标
      const currentTarget = readLinkTargetSafe(linkPath);
      if (currentTarget && resolve(currentTarget) === resolve(target)) {
        return {
          success: true,
          method: 'symlink',
          message: '链接已存在且指向正确目标，跳过',
        };
      }
      return {
        success: false,
        method: 'symlink',
        message: `目标已存在: ${linkPath}（使用 force: true 覆盖）`,
      };
    }
    // force: 删除已有链接或文件
    safeRemove(linkPath);

    // Windows 兜底：safeRemove 后若空目录仍存在（文件系统延迟或 rmSync 静默失败），
    // 显式 rmdir 一次，避免后续 symlink/junction 因 EEXIST/ENOENT 失败。
    if (existsSync(linkPath) && isEmptyDir(linkPath)) {
      try {
        rmdirSync(linkPath);
      } catch {
        // 忽略，留给后续步骤报错
      }
    }
  }

  // 尝试方法 1: 原生 symlink（Linux/macOS 或 Windows 开发者模式）
  const symlinkType = isDirectory ? 'dir' : 'file';
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      symlink(target, linkPath, symlinkType, (err) => {
        if (err) rejectPromise(err);
        else resolvePromise();
      });
    });
    // Windows 上 symlink 可能"假成功"（回调无 err 但实际未创建）
    // 必须验证 linkPath 确实存在，否则继续 fallback
    if (existsSync(linkPath)) {
      return { success: true, method: 'symlink' };
    }
    // 假成功，继续 fallback（仅 Windows 会走到这里）
  } catch (err) {
    // Linux/macOS 上 symlink 失败是真实错误，不 fallback
    if (process.platform !== 'win32') {
      return {
        success: false,
        method: 'symlink',
        message: `symlink 创建失败: ${(err as Error).message}`,
      };
    }
    // Windows 继续 fallback
  }

  // 尝试方法 2: junction（仅 Windows 目录链接，无需权限）
  if (isDirectory && process.platform === 'win32') {
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        // Windows 上 type='junction' 创建目录 junction
        symlink(target, linkPath, 'junction', (err) => {
          if (err) rejectPromise(err);
          else resolvePromise();
        });
      });
      // junction 也可能假成功，验证存在性
      if (existsSync(linkPath)) {
        return {
          success: true,
          method: 'junction',
          message: '使用 junction（建议开启 Windows 开发者模式以获得原生 symlink）',
        };
      }
    } catch {
      // 继续降级到 copy
    }
  }

  // 终极 fallback: copy（保证功能可用，但失去实时性）
  try {
    copyRecursive(target, linkPath);
    return {
      success: true,
      method: 'copy',
      message: '降级为 copy（建议开启 Windows 开发者模式以获得原生 symlink）',
    };
  } catch (err) {
    return {
      success: false,
      method: 'copy',
      message: `copy fallback 失败: ${(err as Error).message}`,
    };
  }
}

/**
 * 删除符号链接（不删源）
 */
export async function removeSymlink(linkPath: string): Promise<void> {
  if (isSymlink(linkPath)) {
    safeRemove(linkPath);
  }
}

/**
 * 安全读取链接目标（兼容 symlink 和 junction）
 */
function readLinkTargetSafe(linkPath: string): string | null {
  try {
    if (!existsSync(linkPath) && !isSymlink(linkPath)) return null;
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return null;
    const target = readlinkSync(linkPath);
    if (isAbsolute(target)) return target;
    return resolve(dirname(linkPath), target);
  } catch {
    return null;
  }
}
