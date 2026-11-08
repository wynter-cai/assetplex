/**
 * 同步引导块测试（add-asset-governance J4）
 *
 * spec: specs/mcp-entry.spec.md Scenario 6（起止标记 / 原地更新 / 关闭即移除且不动其他内容）
 */

import { describe, it, expect } from 'vitest';
import {
  GUIDANCE_START,
  GUIDANCE_END,
  upsertGuidanceBlock,
} from '../../../src/core/guidance.js';

const OTHER = '# AGENTS.md\n\n用户自己的内容。\n';

describe('guidance 引导块', () => {
  it('开启时追加带起止标记的引导块，保留原有内容', () => {
    const out = upsertGuidanceBlock(OTHER, true);
    expect(out.startsWith(OTHER.replace(/\n$/, ''))).toBe(true);
    expect(out).toContain(GUIDANCE_START);
    expect(out).toContain(GUIDANCE_END);
    expect(out).toContain('assetplex_identity_get');
  });

  it('重复开启只原地更新，不重复追加', () => {
    const once = upsertGuidanceBlock(OTHER, true);
    const twice = upsertGuidanceBlock(once, true);
    expect(twice.match(new RegExp(GUIDANCE_START, 'g'))).toHaveLength(1);
    expect(twice.match(new RegExp(GUIDANCE_END, 'g'))).toHaveLength(1);
  });

  it('关闭时移除块且不改动文件其他内容', () => {
    const enabled = upsertGuidanceBlock(OTHER, true);
    const disabled = upsertGuidanceBlock(enabled, false);
    expect(disabled).not.toContain(GUIDANCE_START);
    expect(disabled).toContain('用户自己的内容。');
  });

  it('没有块时关闭是幂等的，正文原样返回', () => {
    expect(upsertGuidanceBlock(OTHER, false)).toBe(OTHER);
  });
});
