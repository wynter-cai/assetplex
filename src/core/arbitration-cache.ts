/**
 * 仲裁建议内容哈希缓存纯逻辑（add-llm-conflict-arbitration B5）
 *
 * 以 sha256(类别+左侧内容+右侧内容+准则集哈希+model) 为 key 持久化仲裁建议
 * （Node 实现读写 ~/.assetplex/arbitrations.json，结构 Record<key, entry>）。
 * 任一侧内容变、准则集增删改、换模型——key 即变，缓存自然失效，无需清理任务。
 *
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/conflict-arbitration.spec.md Scenario 7
 */

import { createHash } from 'node:crypto';
import { ARBITRATION_DECISIONS, type ArbitrationDecision } from './types.js';

/** 单条仲裁缓存（对应一次「左×右×准则集×模型」组合的建议） */
export interface ArbitrationCacheEntry {
  decision: ArbitrationDecision;
  rationale: string;
  /** 仅 decision=merge 时存在；其余决策携带视为脏数据 */
  mergedContent?: string;
  model: string;
  /** 实际进 prompt 的准则 slug */
  criteriaUsed: string[];
  /** 因预算舍去的准则条数 */
  criteriaSkipped: number;
  generatedAt: string;
}

/** 缓存存储抽象（key = 仲裁输入 sha256 十六进制） */
export interface ArbitrationCacheStore {
  load(): Record<string, ArbitrationCacheEntry>;
  save(entries: Record<string, ArbitrationCacheEntry>): void;
}

/** 仲裁缓存 key：五要素规范化拼接后 sha256（内容/准则/模型任一变即自然失效） */
export function computeArbitrationCacheKey(input: {
  category: string;
  left: string;
  right: string;
  criteriaHash: string;
  model: string;
}): string {
  const canonical = [input.category, input.left, input.right, input.criteriaHash, input.model].join(
    '\u0000',
  );
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** 过滤非法条目（decision 闭集外 / merge 缺草案 / 字段残缺），防御手改的脏 JSON */
export function sanitizeArbitrationEntries(
  raw: unknown,
): Record<string, ArbitrationCacheEntry> {
  const out: Record<string, ArbitrationCacheEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const e = value as Record<string, unknown>;
    if (
      typeof e.decision !== 'string' ||
      !(ARBITRATION_DECISIONS as readonly string[]).includes(e.decision) ||
      typeof e.rationale !== 'string' ||
      typeof e.model !== 'string' ||
      e.model === '' ||
      !isStringArray(e.criteriaUsed) ||
      typeof e.criteriaSkipped !== 'number' ||
      typeof e.generatedAt !== 'string' ||
      e.generatedAt === ''
    ) {
      continue;
    }
    const decision = e.decision as ArbitrationDecision;
    const merged = e.mergedContent;
    if (decision === 'merge') {
      if (typeof merged !== 'string' || merged.trim() === '') continue;
    } else if (merged !== undefined) {
      continue; // 非 merge 携带草案：脏数据
    }
    out[key] = {
      decision,
      rationale: e.rationale,
      ...(decision === 'merge' ? { mergedContent: merged } : {}),
      model: e.model,
      criteriaUsed: e.criteriaUsed,
      criteriaSkipped: e.criteriaSkipped,
      generatedAt: e.generatedAt,
    };
  }
  return out;
}

/** 按 key 读取缓存条目；未命中返回 null */
export function getArbitrationCached(
  store: ArbitrationCacheStore,
  key: string,
): ArbitrationCacheEntry | null {
  return sanitizeArbitrationEntries(store.load())[key] ?? null;
}

/** 增量写入一条缓存（读取-合并-写回，不丢既有条目） */
export function saveArbitrationEntry(
  store: ArbitrationCacheStore,
  key: string,
  entry: ArbitrationCacheEntry,
): void {
  const entries = sanitizeArbitrationEntries(store.load());
  entries[key] = entry;
  store.save(entries);
}
