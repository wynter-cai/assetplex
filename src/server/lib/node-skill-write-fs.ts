/**
 * SkillWriteFs 的 Node 文件系统实现
 *
 * 在只读 nodeAgentFs 基础上增加保险箱技能写能力。
 * 删除必须经过 deleteHubDirectory 的守卫（仅允许 skills/<name> 一层）。
 */

import { existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { deleteHubDirectory } from '../../core/hub-files.js';
import { nodeAgentFs } from './node-agent-fs.js';
import type { SkillWriteFs } from '../../core/skill-write.js';

export const nodeSkillWriteFs: SkillWriteFs = {
  ...nodeAgentFs,

  realpath(absolutePath: string): string {
    try {
      return realpathSync(absolutePath);
    } catch {
      // 解析失败（路径不存在等）按原路径处理
      return absolutePath;
    }
  },

  exists(absolutePath: string): boolean {
    return existsSync(absolutePath);
  },

  ensureDir(absolutePath: string): void {
    mkdirSync(absolutePath, { recursive: true });
  },

  writeFile(absolutePath: string, content: string): void {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf-8');
  },

  removeDir(absolutePath: string): void {
    // 转为 Hub 相对路径，复用 deleteHubDirectory 的守卫与 Windows 兼容删除
    const rel = relative(getHubRoot(), absolutePath).replace(/\\/g, '/');
    deleteHubDirectory(rel);
  },
};
