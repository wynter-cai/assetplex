/**
 * 分发索引缓存失效测试
 *
 * spec: asset-distribution-truth（Scenario 7 写入后状态即时刷新）
 * 关联: fix-trust-and-consistency tasks H5
 *
 * 重点：写通道（swap 执行/回滚）必须让 30 秒缓存失效，
 * 否则用户切完工具仍看到「未分发」，等于又一次撒谎。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  getDistributionIndex,
  invalidateDistributionIndex,
  resetDistributionIndexCache,
  type DistributionIndexDeps,
} from '../../../src/core/distribution-index.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { SwapEngine } from '../../../src/core/swap.js';
import { swapRoutesFactory } from '../../../src/server/routes/swap.js';

/** 未安装适配器：索引可算且不触达文件系统 */
function makeOfflineAdapter(): ToolAdapter {
  const name = 'tool-offline';
  return {
    name,
    displayName: 'TOOL-OFFLINE',
    async detect() {
      return { name, installed: false, configDirExists: false, configDir: '' };
    },
    targets() {
      return [];
    },
    resolveHubItems() {
      return [];
    },
    async apply() {},
    async import() {
      return { type: 'identity', relativePath: '', absolutePath: '' };
    },
    async scan() {
      return [];
    },
    transform(content: Buffer) {
      return content;
    },
  };
}

const deps: DistributionIndexDeps = {
  tools: [{ adapter: makeOfflineAdapter(), enabled: true }],
  hubConfig: HubConfigSchema.parse({}),
  hubRoot: '/hub',
  assets: [{ id: 'rules/demo-rule.md', hubPath: 'rules/demo-rule.md', category: 'rule' }],
};

/** 计数加载器：断言是否真的重算，而不是命中缓存 */
function countingLoader(): { load: () => Promise<DistributionIndexDeps>; count: () => number } {
  let count = 0;
  return {
    load: async () => {
      count += 1;
      return deps;
    },
    count: () => count,
  };
}

/** 最小假引擎：只实现路由会调用的三个方法 */
function fakeEngine(): SwapEngine {
  const engine = {
    async execute() {
      return { swapId: 'swap-demo', tool: 'faketool', success: true, counts: { written: 1 } };
    },
    async rollback() {
      return { success: true, restored: 1 };
    },
    history() {
      return [];
    },
  };
  return engine as unknown as SwapEngine;
}

function buildSwapApp(): Hono {
  const app = new Hono();
  app.route(
    '/api/swap',
    swapRoutesFactory({ getEngine: fakeEngine, listAdapters: () => [], getHubConfig: () => deps.hubConfig }),
  );
  return app;
}

describe('分发索引缓存失效（H5）', () => {
  beforeEach(() => {
    resetDistributionIndexCache();
  });

  it('30 秒内重复读取命中缓存，不重复计算', async () => {
    const loader = countingLoader();
    const first = await getDistributionIndex({}, loader.load);
    const second = await getDistributionIndex({}, loader.load);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(loader.count()).toBe(1);
  });

  it('invalidateDistributionIndex 后下次读取必须重算', async () => {
    const loader = countingLoader();
    await getDistributionIndex({}, loader.load);
    invalidateDistributionIndex();
    const fresh = await getDistributionIndex({}, loader.load);
    expect(fresh.cached).toBe(false);
    expect(loader.count()).toBe(2);
  });

  it('swap 执行成功后缓存失效（切完工具立刻能看到新状态）', async () => {
    const loader = countingLoader();
    await getDistributionIndex({}, loader.load);
    const app = buildSwapApp();
    const res = await app.request('/api/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'faketool', previewGeneratedAt: '2026-10-25T00:00:00.000Z' }),
    });
    expect(res.status).toBe(200);
    const after = await getDistributionIndex({}, loader.load);
    expect(after.cached).toBe(false);
    expect(loader.count()).toBe(2);
  });

  it('swap 回滚成功后缓存失效', async () => {
    const loader = countingLoader();
    await getDistributionIndex({}, loader.load);
    const app = buildSwapApp();
    const res = await app.request('/api/swap/rollback', {
      method: 'POST',
      body: JSON.stringify({ swapId: 'swap-demo' }),
    });
    expect(res.status).toBe(200);
    const after = await getDistributionIndex({}, loader.load);
    expect(after.cached).toBe(false);
    expect(loader.count()).toBe(2);
  });
});
