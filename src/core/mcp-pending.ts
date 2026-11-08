/**
 * MCP 两段式写入的草稿缓存（add-asset-governance J3）
 *
 * propose 只产草稿（零写库），commit 凭 id 落盘；TTL 10 分钟。
 * 纯内存逻辑 + 可选 onChange 持久化回调；损坏条目一律丢弃（Scenario 10）。
 *
 * spec: specs/mcp-entry.spec.md Scenario 3/4/10
 */

import { randomUUID } from 'node:crypto';
import { DOCTOR_ASSET_KINDS, type DoctorAssetKind } from './types.js';
import { McpToolError } from './mcp-errors.js';

/** 草稿有效期（spec Scenario 4：超过 10 分钟拒绝并提示重新 propose） */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingChangeDraft {
  kind: DoctorAssetKind;
  mode: 'create' | 'update';
  hubRelativePath: string;
  content: string;
  rationale?: string;
}

export interface PendingChangeEntry extends PendingChangeDraft {
  pendingChangeId: string;
  createdAt: string;
  expiresAt: string;
}

export interface PendingChangeStore {
  propose(draft: PendingChangeDraft): PendingChangeEntry;
  get(pendingChangeId: string): PendingChangeEntry;
  drop(pendingChangeId: string): void;
  size(): number;
}

export interface PendingChangeStoreOptions {
  now?: () => number;
  ttlMs?: number;
  idFactory?: () => string;
  /** 容量上限，超出时淘汰最早过期条目（默认 100） */
  maxEntries?: number;
  /** 从磁盘恢复的原始条目；非法条目丢弃 */
  initial?: unknown;
  /** 条目变化回调（Node 层写盘用；核心不碰 fs） */
  onChange?: (entries: PendingChangeEntry[]) => void;
}

function isKind(value: unknown): value is DoctorAssetKind {
  return typeof value === 'string' && (DOCTOR_ASSET_KINDS as readonly string[]).includes(value);
}

function entryFrom(value: unknown): PendingChangeEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.pendingChangeId !== 'string' ||
    p.pendingChangeId === '' ||
    !isKind(p.kind) ||
    (p.mode !== 'create' && p.mode !== 'update') ||
    typeof p.hubRelativePath !== 'string' ||
    p.hubRelativePath === '' ||
    typeof p.content !== 'string'
  ) {
    return null;
  }
  // 时间戳容忍数字与 ISO 串（旧缓存/手改缓存不因此整条作废）
  const createdAt = toIso(p.createdAt);
  const expiresAt = toIso(p.expiresAt);
  if (createdAt === null || expiresAt === null) return null;
  return {
    pendingChangeId: p.pendingChangeId,
    kind: p.kind,
    mode: p.mode,
    hubRelativePath: p.hubRelativePath,
    content: p.content,
    ...(typeof p.rationale === 'string' ? { rationale: p.rationale } : {}),
    createdAt,
    expiresAt,
  };
}

function toIso(value: unknown): string | null {
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  return null;
}

/** 磁盘/缓存恢复入口：只保留结构完整的条目，防止坏数据被当作草稿执行 */
export function sanitizePendingEntries(raw: unknown): PendingChangeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(entryFrom).filter((entry): entry is PendingChangeEntry => entry !== null);
}

export function createPendingChangeStore(options: PendingChangeStoreOptions = {}): PendingChangeStore {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? PENDING_TTL_MS;
  const idFactory = options.idFactory ?? (() => randomUUID());
  const maxEntries = options.maxEntries ?? 100;
  const entries = new Map<string, PendingChangeEntry>();
  for (const entry of sanitizePendingEntries(options.initial)) {
    entries.set(entry.pendingChangeId, entry);
  }

  const emit = (): void => {
    options.onChange?.([...entries.values()]);
  };

  function prune(): void {
    const current = now();
    for (const [id, entry] of entries) {
      if (Date.parse(entry.expiresAt) <= current) entries.delete(id);
    }
    while (entries.size > maxEntries) {
      const oldest = [...entries.values()].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))[0];
      if (oldest === undefined) break;
      entries.delete(oldest.pendingChangeId);
    }
  }

  return {
    propose(draft: PendingChangeDraft): PendingChangeEntry {
      prune();
      const createdAt = now();
      const entry: PendingChangeEntry = {
        ...draft,
        pendingChangeId: idFactory(),
        createdAt: new Date(createdAt).toISOString(),
        expiresAt: new Date(createdAt + ttlMs).toISOString(),
      };
      entries.set(entry.pendingChangeId, entry);
      prune();
      emit();
      return entry;
    },

    get(pendingChangeId: string): PendingChangeEntry {
      const entry = entries.get(pendingChangeId);
      if (entry === undefined) {
        throw new McpToolError('NOT_FOUND', `草稿不存在或已被清理：${pendingChangeId}`, '请重新调用 assetplex_asset_propose 生成草稿');
      }
      if (Date.parse(entry.expiresAt) <= now()) {
        entries.delete(pendingChangeId);
        emit();
        throw new McpToolError('STALE_PENDING', `草稿已过期：${pendingChangeId}`, '请重新调用 assetplex_asset_propose 生成草稿后再 commit');
      }
      return entry;
    },

    drop(pendingChangeId: string): void {
      if (entries.delete(pendingChangeId)) emit();
    },

    size(): number {
      return entries.size;
    },
  };
}
