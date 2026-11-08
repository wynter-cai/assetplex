/**
 * MCP 两段式写入的草稿缓存测试（add-asset-governance J3）
 *
 * spec: specs/mcp-entry.spec.md Scenario 4（过期 id 拒绝）/ Scenario 10（缓存损坏不崩）
 */

import { describe, it, expect } from 'vitest';
import {
  createPendingChangeStore,
  sanitizePendingEntries,
  PENDING_TTL_MS,
} from '../../../src/core/mcp-pending.js';
import { McpToolError } from '../../../src/core/mcp-errors.js';

function draft(path = 'rules/demo-rule.md') {
  return {
    kind: 'rule' as const,
    mode: 'update' as const,
    hubRelativePath: path,
    content: '# demo\n',
  };
}

describe('mcp-pending 草稿缓存', () => {
  it('propose 后返回可凭 id 取回的完整草稿（零写库由调用方保证）', () => {
    let clock = 1000;
    const store = createPendingChangeStore({ now: () => clock, idFactory: () => 'p-1' });
    const entry = store.propose(draft());

    expect(entry.pendingChangeId).toBe('p-1');
    expect(entry.expiresAt).toBe(new Date(1000 + PENDING_TTL_MS).toISOString());
    expect(store.get('p-1')).toEqual(entry);
  });

  it('TTL 默认 10 分钟：过期后取用抛 STALE_PENDING', () => {
    let clock = 1000;
    const store = createPendingChangeStore({ now: () => clock, idFactory: () => 'p-1' });
    store.propose(draft());

    clock += PENDING_TTL_MS + 1;
    try {
      store.get('p-1');
      expect.fail('应当抛出 STALE_PENDING');
    } catch (err) {
      expect(err).toBeInstanceOf(McpToolError);
      expect((err as McpToolError).code).toBe('STALE_PENDING');
      expect((err as McpToolError).hint).toContain('重新');
    }
  });

  it('未知 id 抛 NOT_FOUND，不返回半成品', () => {
    const store = createPendingChangeStore({ now: () => 1, idFactory: () => 'p-1' });
    try {
      store.get('missing');
      expect.fail('应当抛出');
    } catch (err) {
      expect((err as McpToolError).code).toBe('NOT_FOUND');
    }
  });

  it('drop 后不可再取用', () => {
    const store = createPendingChangeStore({ now: () => 1, idFactory: () => 'p-1' });
    store.propose(draft());
    store.drop('p-1');
    expect(() => store.get('p-1')).toThrow(McpToolError);
  });

  it('缓存损坏：非法条目一律丢弃，不崩、不把坏数据当草稿', () => {
    const entries = sanitizePendingEntries([
      null,
      { pendingChangeId: 'ok', kind: 'rule', mode: 'update', hubRelativePath: 'rules/a.md', content: '# a', createdAt: 1, expiresAt: 9999999999999 },
      { pendingChangeId: 'bad-kind', kind: 'unknown', mode: 'create', hubRelativePath: 'rules/b.md', content: 'x', createdAt: 1, expiresAt: 9 },
      { pendingChangeId: 'no-content', kind: 'rule', mode: 'update', hubRelativePath: 'rules/c.md', createdAt: 1, expiresAt: 9 },
      'garbage',
    ]);

    expect(entries.map((e) => e.pendingChangeId)).toEqual(['ok']);
  });

  it('容量上限：超出时淘汰最早过期的条目，不无限增长', () => {
    let clock = 1000;
    let seq = 0;
    const store = createPendingChangeStore({
      now: () => clock,
      idFactory: () => `p-${++seq}`,
      maxEntries: 2,
    });
    store.propose(draft('rules/a.md'));
    clock += 10;
    store.propose(draft('rules/b.md'));
    clock += 10;
    store.propose(draft('rules/c.md'));

    expect(store.size()).toBe(2);
    expect(() => store.get('p-1')).toThrow(McpToolError);
  });
});
