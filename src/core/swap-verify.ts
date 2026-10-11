/**
 * swap 回读验证
 *
 * 诚实边界:仅断言"已写入并校验"——目标存在 + 按其类型可解析 + 与源一致，
 * 不代表工具已加载生效。md/纯文本直读；json/toml 复用既有 transforms 校验语法。
 */

import { existsSync, readFileSync } from 'node:fs';
import type { SwapVerifyResult } from './swap-types.js';
import { expectedBuffer } from './swap-plan.js';
import { isValidJson, isValidToml } from '../transforms/json-toml.js';

/** 按扩展名校验目标内容可否解析 */
export function checkParseable(targetPath: string, content: string): boolean {
  if (targetPath.endsWith('.json')) return isValidJson(content);
  if (targetPath.endsWith('.toml')) return isValidToml(content);
  return true;
}

/** 回读单个目标并与源比对，得出三维验证结论 */
export function verifyTarget(
  sourcePath: string,
  targetPath: string,
  hubRelativePath: string,
): SwapVerifyResult {
  const base = { hubRelativePath, targetPath };
  if (!existsSync(targetPath)) {
    return { ...base, exists: false, parseable: false, matchesSource: false, passed: false, failure: `目标文件不存在: ${targetPath}` };
  }
  let content: string;
  try {
    content = readFileSync(targetPath, 'utf-8');
  } catch (err) {
    return {
      ...base,
      exists: true,
      parseable: false,
      matchesSource: false,
      passed: false,
      failure: `目标文件无法读取: ${targetPath} (${(err as Error).message})`,
    };
  }
  const parseable = checkParseable(targetPath, content);
  const sourceExists = existsSync(sourcePath);
  const matchesSource = sourceExists && readFileSync(targetPath).equals(expectedBuffer(sourcePath));

  let failure: string | undefined;
  if (!parseable) {
    failure = `目标文件解析失败: ${targetPath}`;
  } else if (!matchesSource) {
    failure = sourceExists ? `目标内容与源不一致: ${targetPath}` : `Hub 源不存在: ${hubRelativePath}`;
  }
  return {
    ...base,
    exists: true,
    parseable,
    matchesSource,
    passed: parseable && matchesSource,
    failure,
  };
}
