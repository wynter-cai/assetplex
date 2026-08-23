/**
 * 路径工具：处理 ~ 展开、跨平台路径
 */

import { homedir } from 'node:os';
import { resolve, normalize } from 'node:path';

/**
 * 展开 ~ 为 home 目录
 */
export function expandHome(filepath: string): string {
  if (!filepath) return filepath;
  if (filepath === '~') return homedir();
  if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
    return resolve(homedir(), filepath.slice(2));
  }
  if (filepath.startsWith('~')) {
    // ~username 形式（Windows 不支持，直接返回原值）
    return filepath;
  }
  return normalize(filepath);
}

/**
 * 获取 Hub 根目录（支持 ASSETPLEX_DIR 环境变量覆盖）
 */
export function getHubRoot(): string {
  const fromEnv = process.env.ASSETPLEX_DIR;
  if (fromEnv) return expandHome(fromEnv);
  return expandHome('~/.assetplex');
}

/**
 * 获取 Hub 内某文件的绝对路径
 */
export function hubPath(...segments: string[]): string {
  return resolve(getHubRoot(), ...segments);
}
