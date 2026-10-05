/**
 * AgentFs 的 Node 文件系统实现
 *
 * 将智能体盘点所需的只读文件访问桥接到真实 node:fs。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { AgentFs } from '../../core/agent-inventory.js';

export const nodeAgentFs: AgentFs = {
  read(absolutePath: string): string | null {
    try {
      if (!existsSync(absolutePath)) return null;
      return readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  },

  listDir(absolutePath: string): string[] {
    try {
      if (!existsSync(absolutePath)) return [];
      return readdirSync(absolutePath).sort();
    } catch {
      return [];
    }
  },

  dirMtime(absolutePath: string): string | null {
    try {
      return statSync(absolutePath).mtime.toISOString();
    } catch {
      return null;
    }
  },
};
