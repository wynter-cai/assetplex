/**
 * 重复合并批次记录（add-asset-governance K4/K5）
 *
 * 落盘位置：<Hub>/governance/duplicate-merges/<groupId>.json
 * 每个重复组只保留最近一次合并记录，供 /duplicates/undo 按 groupId 还原。
 * groupId 由成员路径哈希生成（dup-<kind>-<hash>），额外做字符白名单防路径穿越。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import type { DuplicateMergeBatch } from '../../core/duplicate-merge.js';

export interface DuplicateMergeBatchStore {
  save(batch: DuplicateMergeBatch): void;
  getByGroup(groupId: string): DuplicateMergeBatch | null;
}

export const GROUP_ID_PATTERN = /^[A-Za-z0-9._-]{4,80}$/;

function batchDir(): string {
  return join(getHubRoot(), 'governance', 'duplicate-merges');
}

function batchPath(groupId: string): string {
  return join(batchDir(), `${groupId}.json`);
}

export function isSafeGroupId(groupId: string): boolean {
  return GROUP_ID_PATTERN.test(groupId) && groupId !== '.' && groupId !== '..';
}

export function createNodeDuplicateBatchStore(): DuplicateMergeBatchStore {
  return {
    save(batch) {
      if (!isSafeGroupId(batch.groupId)) throw new Error('groupId 非法');
      mkdirSync(batchDir(), { recursive: true });
      const target = batchPath(batch.groupId);
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, JSON.stringify(batch, null, 2), 'utf-8');
      renameSync(tmp, target);
    },
    getByGroup(groupId) {
      if (!isSafeGroupId(groupId)) return null;
      const path = batchPath(groupId);
      if (!existsSync(path)) return null;
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        if (typeof parsed !== 'object' || parsed === null) return null;
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.groupId !== 'string' || !Array.isArray(obj.archived)) return null;
        return parsed as DuplicateMergeBatch;
      } catch {
        return null;
      }
    },
  };
}

export function createMemoryDuplicateBatchStore(): DuplicateMergeBatchStore {
  const records = new Map<string, DuplicateMergeBatch>();
  return {
    save(batch) {
      records.set(batch.groupId, batch);
    },
    getByGroup(groupId) {
      return records.get(groupId) ?? null;
    },
  };
}
