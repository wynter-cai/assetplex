/**
 * AI 分类内容 hash 缓存纯逻辑
 *
 * 以 SKILL.md 原文 sha256 为 key 持久化 AI 分类结果（Node 实现读写
 * ~/.assetplex/skill-ai-classifications.json，结构 Record<hash, entry>）。
 * 同内容跨技能复用同一条缓存；技能内容变更后 hash 不再匹配，缓存自然失效。
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 */

import { createHash } from 'node:crypto';
import { SKILL_FUNCTIONS, type SkillFunction } from './skills-inventory.js';

/** 单条 AI 分类缓存（对应一份 SKILL.md 内容） */
export interface AiClassifyCacheEntry {
  /** 9 职能闭集之一 */
  category: SkillFunction;
  /** 产出该结果的模型名（审计用） */
  model: string;
  /** 分类时间 ISO 字符串 */
  classifiedAt: string;
}

/** 缓存存储抽象（key = 内容 sha256 十六进制） */
export interface AiClassifyCacheStore {
  load(): Record<string, AiClassifyCacheEntry>;
  save(entries: Record<string, AiClassifyCacheEntry>): void;
}

/** 内容 sha256（十六进制），同内容必然同 hash */
export function hashSkillContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** 过滤非法条目（category 不在闭集 / 字段残缺），防御手改的脏 JSON */
export function sanitizeCacheEntries(
  raw: unknown,
): Record<string, AiClassifyCacheEntry> {
  const out: Record<string, AiClassifyCacheEntry> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.category === 'string' &&
      (SKILL_FUNCTIONS as string[]).includes(entry.category) &&
      typeof entry.model === 'string' &&
      entry.model !== '' &&
      typeof entry.classifiedAt === 'string' &&
      entry.classifiedAt !== ''
    ) {
      out[key] = {
        category: entry.category as SkillFunction,
        model: entry.model,
        classifiedAt: entry.classifiedAt,
      };
    }
  }
  return out;
}

/** 按 hash 读取缓存条目；未命中返回 null */
export function getCachedByHash(
  store: AiClassifyCacheStore,
  hash: string,
): AiClassifyCacheEntry | null {
  return sanitizeCacheEntries(store.load())[hash] ?? null;
}

/** 增量写入一条缓存（读取-合并-写回，不丢既有条目） */
export function saveCacheEntry(
  store: AiClassifyCacheStore,
  hash: string,
  entry: AiClassifyCacheEntry,
): void {
  const entries = sanitizeCacheEntries(store.load());
  entries[hash] = entry;
  store.save(entries);
}
