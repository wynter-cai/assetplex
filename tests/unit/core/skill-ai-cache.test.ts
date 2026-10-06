/**
 * AI 分类内容 hash 缓存纯逻辑测试
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 * - 缓存 key = SKILL.md 原文 sha256；同内容跨技能复用；内容变更旧条目自然失效
 */

import { describe, expect, it } from 'vitest';
import {
  getCachedByHash,
  hashSkillContent,
  saveCacheEntry,
  sanitizeCacheEntries,
  type AiClassifyCacheEntry,
  type AiClassifyCacheStore,
} from '../../../src/core/skill-ai-cache.js';

class MemoryCacheStore implements AiClassifyCacheStore {
  data: Record<string, AiClassifyCacheEntry> = {};
  saves = 0;

  load(): Record<string, AiClassifyCacheEntry> {
    return this.data;
  }

  save(entries: Record<string, AiClassifyCacheEntry>): void {
    this.data = entries;
    this.saves += 1;
  }
}

const ENTRY: AiClassifyCacheEntry = { category: 'workflow', model: 'lite', classifiedAt: '2026-10-06T00:00:00.000Z' };

describe('hashSkillContent', () => {
  it('同内容 hash 相同（同内容跨技能复用的前提）', () => {
    expect(hashSkillContent('---\nname: a\n---\nbody')).toBe(hashSkillContent('---\nname: a\n---\nbody'));
  });

  it('不同内容 hash 不同（内容变更后缓存失效的前提）', () => {
    expect(hashSkillContent('内容A')).not.toBe(hashSkillContent('内容B'));
  });

  it('输出为 64 位十六进制（sha256）', () => {
    expect(hashSkillContent('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getCachedByHash / saveCacheEntry', () => {
  it('保存后按 hash 读取命中', () => {
    const store = new MemoryCacheStore();
    const hash = hashSkillContent('内容A');
    saveCacheEntry(store, hash, ENTRY);
    expect(getCachedByHash(store, hash)).toEqual(ENTRY);
  });

  it('同 hash 重复保存覆盖同一条目，不新增（同内容技能复用一条缓存）', () => {
    const store = new MemoryCacheStore();
    const hash = hashSkillContent('内容A');
    saveCacheEntry(store, hash, ENTRY);
    saveCacheEntry(store, hash, { ...ENTRY, category: 'design' });
    expect(Object.keys(store.load())).toHaveLength(1);
    expect(getCachedByHash(store, hash)?.category).toBe('design');
  });

  it('不同 hash 互相隔离，且既有条目不被增量保存丢失', () => {
    const store = new MemoryCacheStore();
    const hashA = hashSkillContent('内容A');
    const hashB = hashSkillContent('内容B');
    saveCacheEntry(store, hashA, ENTRY);
    saveCacheEntry(store, hashB, { ...ENTRY, category: 'coding' });
    expect(Object.keys(store.load())).toHaveLength(2);
    expect(getCachedByHash(store, hashA)?.category).toBe('workflow');
    expect(getCachedByHash(store, hashB)?.category).toBe('coding');
  });

  it('未保存的 hash 返回 null（缓存未命中）', () => {
    expect(getCachedByHash(new MemoryCacheStore(), hashSkillContent('x'))).toBeNull();
  });
});

describe('sanitizeCacheEntries', () => {
  it('丢弃 category 非法或字段残缺的条目（防御手改的脏 JSON）', () => {
    const entries = sanitizeCacheEntries({
      ok: ENTRY,
      badCategory: { category: 'travel', model: 'm', classifiedAt: 't' },
      noModel: { category: 'coding', model: '', classifiedAt: 't' },
      notObject: 'junk',
    });
    expect(Object.keys(entries)).toEqual(['ok']);
  });

  it('空输入返回空记录', () => {
    expect(sanitizeCacheEntries({})).toEqual({});
  });
});
