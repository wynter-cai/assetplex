/**
 * 引导路由测试（add-zero-config-onboarding T7）
 *
 * 只新增 3 端点：GET /api/onboarding/state、POST /start、POST /complete。
 * 全部依赖注入 + 临时 ASSETPLEX_DIR，不碰真实 ~/.assetplex。
 * spec: Requirement 1（state/start）、7（complete）、8（标记生效）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { createOnboardingRoutes, type OnboardingRouteDeps } from '../../../src/server/routes/onboarding.js';

let tempDir: string;
let envBackup: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-onb-route-'));
  envBackup = process.env.ASSETPLEX_DIR;
  process.env.ASSETPLEX_DIR = tempDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (envBackup === undefined) delete process.env.ASSETPLEX_DIR;
  else process.env.ASSETPLEX_DIR = envBackup;
});

function buildApp(deps: OnboardingRouteDeps = {}): Hono {
  const app = new Hono();
  app.route('/api/onboarding', createOnboardingRoutes(deps));
  return app;
}

const fakeTools = [
  { toolId: 'trae-cn', displayName: 'TRAE 中国版', installed: true, configDir: 'C:/fake/trae' },
  { toolId: 'qoder', displayName: 'Qoder', installed: false, configDir: 'C:/fake/qoder' },
];

describe('GET /state（spec 1.1/1.4/8.2）', () => {
  it('空 Hub：initialized=false、autoEnter=true、onboarded=false', async () => {
    const res = await buildApp({ detectTools: async () => fakeTools }).request('/api/onboarding/state');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { autoEnter: boolean; initialized: boolean; onboarded: boolean; assetCount: number; tools: unknown[] };
    expect(body.initialized).toBe(false);
    expect(body.onboarded).toBe(false);
    expect(body.autoEnter).toBe(true);
    expect(body.assetCount).toBe(0);
    expect(body.tools).toEqual(fakeTools);
    expect(body.tools).toHaveLength(2);
  });

  it('调用前后目录快照一致（只读，无副作用）', async () => {
    writeFileSync(join(tempDir, 'hub.toml'), 'x', 'utf-8');
    writeFileSync(join(tempDir, 'keep.md'), 'y', 'utf-8');
    const before = readdirSync(tempDir).sort();
    await buildApp({ assetCount: () => 2 }).request('/api/onboarding/state');
    const after = readdirSync(tempDir).sort();
    expect(after).toEqual(before);
  });

  it('有 hub.toml 且注入资产数 0 → autoEnter=true（Scenario 1.4）', async () => {
    writeFileSync(join(tempDir, 'hub.toml'), 'x', 'utf-8');
    const res = await buildApp({ assetCount: () => 0 }).request('/api/onboarding/state');
    const body = (await res.json()) as { autoEnter: boolean; initialized: boolean };
    expect(body.initialized).toBe(true);
    expect(body.autoEnter).toBe(true);
  });

  it('有 hub.toml 且资产数 3 → autoEnter=false（老用户，Scenario 8.2）', async () => {
    writeFileSync(join(tempDir, 'hub.toml'), 'x', 'utf-8');
    const res = await buildApp({ assetCount: () => 3 }).request('/api/onboarding/state');
    const body = (await res.json()) as { autoEnter: boolean };
    expect(body.autoEnter).toBe(false);
  });

  it('完成标记后 autoEnter=false 且 lastOutcome 可见（Scenario 8.1）', async () => {
    await buildApp().request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'completed', step: 'done' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await buildApp().request('/api/onboarding/state');
    const body = (await res.json()) as { autoEnter: boolean; onboarded: boolean; lastOutcome: { outcome: string } | null };
    expect(body.onboarded).toBe(true);
    expect(body.autoEnter).toBe(false);
    expect(body.lastOutcome?.outcome).toBe('completed');
  });
});

describe('POST /start（spec 4.1 幂等骨架）', () => {
  it('创建骨架并返回 created/skipped 与最新 state', async () => {
    const res = await buildApp().request('/api/onboarding/start', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: string[]; skipped: string[]; state: { autoEnter: boolean; initialized: boolean } };
    expect(body.created).toContain('hub.toml');
    // mcp.sources.json 不在骨架内（会计为资产破坏 autoEnter；spec 4.1 修订）
    expect(existsSync(join(tempDir, 'mcp', 'mcp.sources.json'))).toBe(false);
    // 骨架不写空模板
    expect(existsSync(join(tempDir, 'identity', 'profile.md'))).toBe(false);
    expect(body.state.initialized).toBe(true);
    // 骨架不产生可计资产 → 资产仍 0 → autoEnter 保持 true（CLI 首跑链路依赖）
    expect(body.state.autoEnter).toBe(true);
  });

  it('幂等：二次 start 全部 skipped，不覆盖用户改动', async () => {
    await buildApp().request('/api/onboarding/start', { method: 'POST' });
    writeFileSync(join(tempDir, 'README.md'), 'user-edited', 'utf-8');

    const res = await buildApp().request('/api/onboarding/start', { method: 'POST' });
    const body = (await res.json()) as { created: string[]; skipped: string[] };
    expect(body.created).toEqual([]);
    expect(body.skipped).toContain('README.md');
    expect(await (await buildApp().request('/api/onboarding/start', { method: 'POST' })).status).toBe(200);
  });
});

describe('POST /complete（spec 7.2/7.4，400 校验）', () => {
  it('completed 落盘，persisted=true', async () => {
    const res = await buildApp().request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'completed', step: 'done' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; persisted: boolean };
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(true);
    expect(existsSync(join(tempDir, 'onboarding.json'))).toBe(true);
  });

  it('skipped 同样落盘并记录步骤', async () => {
    const res = await buildApp().request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'skipped', step: 'doctor' }),
      headers: { 'content-type': 'application/json' },
    });
    const body = (await res.json()) as { state: { lastOutcome: { outcome: string; step: string } | null } };
    expect(body.state.lastOutcome).toEqual(
      expect.objectContaining({ outcome: 'skipped', step: 'doctor' }),
    );
  });

  it('非法 outcome/step 返回 400', async () => {
    const bad1 = await buildApp().request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'other', step: 'done' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(bad1.status).toBe(400);
    const bad2 = await buildApp().request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'completed', step: 'nope' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(bad2.status).toBe(400);
  });

  it('写入失败仍返回 200，persisted=false（不阻断跳转）', async () => {
    const filePath = join(tempDir, 'occupied');
    writeFileSync(filePath, 'x', 'utf-8');
    const res = await buildApp({ hubRoot: () => filePath }).request('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ outcome: 'completed', step: 'done' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; persisted: boolean };
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(false);
  });
});
