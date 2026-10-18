/**
 * 裁决准则路由测试（add-llm-conflict-arbitration A5）
 *
 * spec: specs/criteria-meta-asset.spec.md Scenario 1b/2/5；tasks A5（/api/files criteria 回路）
 * criteria 路由走 hub-files 真实 fs（ASSETPLEX_DIR 临时目录，先例同 hub-files.test）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdirSync, rmSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criteriaRoutes } from '../../../src/server/routes/criteria.js';
import { filesRoutes } from '../../../src/server/routes/files.js';
import { CRITERIA_PACK } from '../../../src/core/criteria-pack.js';

const app = new Hono();
app.route('/api/criteria', criteriaRoutes);
app.route('/api/files', filesRoutes);

describe('GET /api/criteria', () => {
  let hubRoot: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    hubRoot = mkdtempSync(join(tmpdir(), 'criteria-routes-test-'));
    originalEnv = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubRoot;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalEnv;
    rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('空库返回空数组', async () => {
    const res = await app.fetch(new Request('http://local/api/criteria'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ criteria: [] });
  });

  it('返回解析后的准则并按 priority→slug 排序', async () => {
    mkdirSync(join(hubRoot, 'criteria'), { recursive: true });
    writeFileSync(join(hubRoot, 'criteria', 'late.md'), '---\nname: 后者\npriority: 50\n---\nB');
    writeFileSync(join(hubRoot, 'criteria', 'first.md'), '---\nname: 先行\npriority: 5\nenabled: false\n---\nA');

    const body = (await (await app.fetch(new Request('http://local/api/criteria'))).json()) as {
      criteria: Array<{ slug: string; name: string; priority: number; enabled: boolean; body: string }>;
    };
    expect(body.criteria.map((c) => c.slug)).toEqual(['first', 'late']);
    expect(body.criteria[0]).toMatchObject({ name: '先行', priority: 5, enabled: false, body: 'A' });
  });

  it('POST /api/files 创建准则文件后可被 criteria 列表读回（零新写库通道验证）', async () => {
    const create = await app.fetch(
      new Request('http://local/api/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'criteria/demo.md', content: '---\nname: 演示\n---\n正文' }),
      }),
    );
    expect(create.status).toBe(200);

    const list = (await (await app.fetch(new Request('http://local/api/criteria'))).json()) as {
      criteria: Array<{ slug: string }>;
    };
    expect(list.criteria.map((c) => c.slug)).toEqual(['demo']);
  });

  it('/api/files?category=criteria 列表回路含 400 文案', async () => {
    const ok = await app.fetch(new Request('http://local/api/files?category=criteria'));
    expect(ok.status).toBe(200);

    const bad = await app.fetch(new Request('http://local/api/files?category=nope'));
    expect(bad.status).toBe(400);
    const text = JSON.stringify(await bad.json());
    expect(text).toContain('criteria'); // 文案随 HUB_CATEGORIES 自动涵盖
  });
});

describe('GET /api/criteria/pack 与 POST /api/criteria/import-pack', () => {
  let hubRoot: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    hubRoot = mkdtempSync(join(tmpdir(), 'criteria-pack-routes-test-'));
    originalEnv = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubRoot;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalEnv;
    rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('pack 列表返回模板元数据（不含正文，供 UI 勾选）', async () => {
    const res = await app.fetch(new Request('http://local/api/criteria/pack'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      templates: Array<{ slug: string; name: string; source: string; body?: string }>;
    };
    expect(body.templates.length).toBe(CRITERIA_PACK.length);
    expect(body.templates[0].slug).toBeTruthy();
    expect(body.templates[0].source).toBeTruthy();
    expect(body.templates[0].body).toBeUndefined();
  });

  it('按勾选导入；重复导入同名拒绝且内容零变化（Scenario 1b/3）', async () => {
    const slug = CRITERIA_PACK[0].slug;
    const first = (await (
      await app.fetch(
        new Request('http://local/api/criteria/import-pack', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slugs: [slug] }),
        }),
      )
    ).json()) as { inserted: string[]; rejected: string[] };
    expect(first).toEqual({ inserted: [slug], rejected: [] });
    expect(existsSync(join(hubRoot, 'criteria', `${slug}.md`))).toBe(true);

    const file = join(hubRoot, 'criteria', `${slug}.md`);
    const before = readFileSync(file, 'utf-8');
    const second = (await (
      await app.fetch(
        new Request('http://local/api/criteria/import-pack', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slugs: [slug, 'ghost'] }),
        }),
      )
    ).json()) as { inserted: string[]; rejected: string[] };
    expect(second.inserted).toEqual([]);
    expect(second.rejected).toEqual([slug, 'ghost']);
    expect(readFileSync(file, 'utf-8')).toBe(before);
  });

  it('非法请求体 400', async () => {
    const res = await app.fetch(
      new Request('http://local/api/criteria/import-pack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slugs: 'not-array' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
