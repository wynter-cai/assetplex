/**
 * GitRunner 的 Node 实现：以子进程执行只读 git 命令。
 * 非 git 仓库或 git 不可用时返回 null。
 */

import { execFileSync } from 'node:child_process';
import type { GitRunner } from '../../core/projects.js';

export const nodeGitRunner: GitRunner = (cwd, args) => {
  try {
    return execFileSync('git', args, {
      cwd,
      timeout: 3000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};
