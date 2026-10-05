/**
 * AgentWriteFs 的 Node 文件系统实现
 *
 * 在只读 nodeAgentFs 基础上增加保险箱智能体写能力（agents/<name>.md 文件级操作）。
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { nodeAgentFs } from './node-agent-fs.js';
import type { AgentWriteFs } from '../../core/agent-write.js';

export const nodeAgentWriteFs: AgentWriteFs = {
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

  removeFile(absolutePath: string): void {
    try {
      unlinkSync(absolutePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // 不存在时静默（幂等）
    }
  },
};
