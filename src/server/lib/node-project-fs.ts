/**
 * ProjectFs 的 Node 文件系统实现
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { ProjectFs } from '../../core/projects.js';

export const nodeProjectFs: ProjectFs = {
  read(absolutePath: string): string | null {
    try {
      if (!existsSync(absolutePath)) return null;
      return readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  },
  exists(absolutePath: string): boolean {
    try {
      return existsSync(absolutePath);
    } catch {
      return false;
    }
  },
  isDirectory(absolutePath: string): boolean {
    try {
      return statSync(absolutePath).isDirectory();
    } catch {
      return false;
    }
  },
  listDir(absolutePath: string): string[] {
    try {
      return readdirSync(absolutePath);
    } catch {
      return [];
    }
  },
  mtime(absolutePath: string): string | null {
    try {
      return statSync(absolutePath).mtime.toISOString();
    } catch {
      return null;
    }
  },
};
