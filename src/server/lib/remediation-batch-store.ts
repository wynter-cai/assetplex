/**
 * 一键整改批次记录（add-asset-governance I2/I3）
 *
 * 落盘位置：<Hub>/governance/remediation-batches/<batchId>.json
 * 用途：进程中断后可凭 batchId 查询与撤销已完成项（proposal 风险预留）。
 * batchId 只允许十六进制/短横线，杜绝路径穿越。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';

export interface RemediationBatchItemRecord {
  itemId: string;
  hubRelativePath: string;
  status: 'fixed' | 'failed' | 'skipped';
  backupRef?: string;
  reason?: string;
}

export interface RemediationBatchRecord {
  batchId: string;
  createdAt: string;
  items: RemediationBatchItemRecord[];
}

export interface RemediationBatchStore {
  save(record: RemediationBatchRecord): void;
  get(batchId: string): RemediationBatchRecord | null;
}

export const BATCH_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

function batchDir(): string {
  return join(getHubRoot(), 'governance', 'remediation-batches');
}

function batchPath(batchId: string): string {
  return join(batchDir(), `${batchId}.json`);
}

/** Node 实现：原子写（临时文件 + rename），读取宽容脏数据 */
export function createNodeRemediationBatchStore(): RemediationBatchStore {
  return {
    save(record) {
      if (!BATCH_ID_PATTERN.test(record.batchId)) {
        throw new Error('batchId 非法');
      }
      mkdirSync(batchDir(), { recursive: true });
      const target = batchPath(record.batchId);
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8');
      renameSync(tmp, target);
    },
    get(batchId) {
      if (!BATCH_ID_PATTERN.test(batchId)) return null;
      const path = batchPath(batchId);
      if (!existsSync(path)) return null;
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        if (typeof parsed !== 'object' || parsed === null) return null;
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.batchId !== 'string' || !Array.isArray(obj.items)) return null;
        return parsed as RemediationBatchRecord;
      } catch {
        return null;
      }
    },
  };
}

/** 测试用内存实现（中性数据，不落盘） */
export function createMemoryRemediationBatchStore(): RemediationBatchStore {
  const records = new Map<string, RemediationBatchRecord>();
  return {
    save(record) {
      records.set(record.batchId, record);
    },
    get(batchId) {
      return records.get(batchId) ?? null;
    },
  };
}
