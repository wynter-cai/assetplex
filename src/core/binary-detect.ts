/**
 * 二进制文件判定（纯函数，无状态）
 *
 * spec: 设计文档/changes/refine-skill-cards-wizard/specs/import-wizard-noise.spec.md
 *
 * 两道判定：
 * 1. 扩展名白名单——技能目录里的图标/压缩包/字体一眼认出，不读内容；
 * 2. NUL 嗅探兜底——扩展名未知（如 `asset.bin`、无扩展名）时读前 8KB，
 *    出现 0x00 即判二进制，避免漏判后被当文本重编码写出乱码。
 */

import { closeSync, openSync, readSync } from 'node:fs';
import { extname } from 'node:path';

/** 嗅探窗口：二进制文件的魔数都在开头，8KB 足够 */
export const SNIFF_BYTES = 8 * 1024;

/**
 * 已知二进制扩展名（小写，含点）。
 * 注意：`.bin` 故意不在此列，交给 NUL 嗅探兜底判定。
 */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // 图片
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.svg',
  // 压缩包
  '.zip', '.gz', '.tgz', '.tar', '.7z', '.rar',
  // 文档
  '.pdf', '.psd', '.sketch', '.fig',
  // 字体
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // 音视频
  '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.avi',
  // 可执行与字节码
  '.exe', '.dll', '.so', '.dylib', '.wasm', '.class', '.jar',
]);

/** 扩展名是否命中二进制白名单（大小写不敏感） */
export function isBinaryPath(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/** 前 8KB 是否含 NUL 字节（空缓冲区判文本） */
export function looksBinary(data: Buffer): boolean {
  return data.subarray(0, SNIFF_BYTES).includes(0);
}

/**
 * 组合判定：扩展名优先，未命中则嗅探文件头。
 * 文件读不了（不存在/无权限）时只信扩展名，不抛错。
 */
export function isBinaryFile(filePath: string): boolean {
  if (isBinaryPath(filePath)) return true;

  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const read = readSync(fd, buffer, 0, SNIFF_BYTES, 0);
    return looksBinary(buffer.subarray(0, read));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // 关闭失败不影响判定结果
      }
    }
  }
}
