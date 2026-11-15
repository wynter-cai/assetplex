/**
 * 适配器类别支持矩阵回归测试（remove-tool-swap B21）
 *
 * spec: 原 enable-tool-hot-swap 的类别支持矩阵契约 —— 支持矩阵由 adapter.resolveHubItems
 * 返回的类型集合推导；工具目录不存在该概念时不得出现在映射中（以 support=false 诚实表达）。
 * 六类口径：identity/rule/skill/mcp/memory/agent（command 不属分发写入包）。
 */

import { describe, it, expect } from 'vitest';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubConfig } from '../../../src/core/config.js';
import type { AssetWriteCategory } from '../../../src/core/asset-write.js';
import { ASSET_WRITE_CATEGORIES } from '../../../src/core/asset-write.js';
import { WorkBuddyAdapter } from '../../../src/core/adapters/workbuddy.js';
import { TraeCnAdapter } from '../../../src/core/adapters/trae-cn.js';
import { ClaudeCodeAdapter } from '../../../src/core/adapters/claude-code.js';
import { CodexAdapter } from '../../../src/core/adapters/codex.js';
import { QoderAdapter } from '../../../src/core/adapters/qoder.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';

/** 解析适配器在六类口径下映射出的类别集合 */
function assetWriteCategoriesOf(adapter: ToolAdapter, config: HubConfig): Set<string> {
  const types = new Set(adapter.resolveHubItems(config, '/hub').map((r) => r.item.type as string));
  return new Set(ASSET_WRITE_CATEGORIES.filter((c: AssetWriteCategory) => types.has(c)));
}

const config = HubConfigSchema.parse({});

describe('切换六类支持矩阵(真实适配器回归防线)', () => {
  it('workbuddy: identity/memory/rule/skill/mcp 齐全，agent 不映射(experts 属运行时产物)', () => {
    const cats = assetWriteCategoriesOf(new WorkBuddyAdapter(), config);
    expect([...cats].sort()).toEqual(['identity', 'mcp', 'memory', 'rule', 'skill']);
  });

  it('trae-cn: identity/rule/skill/mcp；memory 目录由工具自有存储持有、agent 无概念，均不映射', () => {
    const cats = assetWriteCategoriesOf(new TraeCnAdapter(), config);
    expect([...cats].sort()).toEqual(['identity', 'mcp', 'rule', 'skill']);
  });

  it('claude-code: identity/rule/skill/mcp/agent；memory 无独立概念(CLAUDE.md 已承载)不映射', () => {
    const cats = assetWriteCategoriesOf(new ClaudeCodeAdapter(), config);
    expect([...cats].sort()).toEqual(['agent', 'identity', 'mcp', 'rule', 'skill']);
  });

  it('codex: identity/skill/mcp；rule 随 identity 聚合进 AGENTS.md，不单独映射', () => {
    const cats = assetWriteCategoriesOf(new CodexAdapter(), config);
    expect([...cats].sort()).toEqual(['identity', 'mcp', 'skill']);
  });

  it('qoder: 启用且有项目目标时映射 identity/rule/skill；memory/agent/mcp 无概念不映射', () => {
    const qoderConfig = HubConfigSchema.parse({
      tools: { qoder: { enabled: true, projectTargets: ['~/demo-project'] } },
    });
    const cats = assetWriteCategoriesOf(new QoderAdapter(), qoderConfig);
    expect([...cats].sort()).toEqual(['identity', 'rule', 'skill']);
  });

  it('qoder: 未启用/无项目目标时不映射任何类别', () => {
    const cats = assetWriteCategoriesOf(new QoderAdapter(), config);
    expect(cats.size).toBe(0);
  });
});
