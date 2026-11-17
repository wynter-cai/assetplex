/**
 * 技能批量分发执行测试（refactor-skill-catalog T14）
 *
 * spec: skill-catalog.spec.md R6.2 / R6.3 / R6.4
 * 断言：冲突默认跳过、显式覆盖才写入、逐「技能 × 工具」结果、单工具失败隔离、
 * swapId 可回滚、token 过期/重复执行 409、未知 token 404、库内正文零变化。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FakeSkillAdapter,
  buildHarness,
  hashOf,
  postJson,
  preview,
  seedHub,
  toolDir,
} from './skill-distribution-fixtures.js';

describe('POST /api/skills/distribution/execute（T14）', () => {
  let root: string;
  let hubDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'assetplex-skilldist-exec-'));
    hubDir = seedHub(root);
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(root, { recursive: true, force: true });
  });

  /** 目标工具里已有不同内容的 demo-a（differs → 冲突） */
  function toolWithConflict(name: string): { dir: string; adapter: FakeSkillAdapter } {
    const dir = toolDir(root, name);
    mkdirSync(join(dir, 'skills', 'demo-a'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'demo-a', 'SKILL.md'), '旧版内容', 'utf-8');
    return { dir, adapter: new FakeSkillAdapter(dir, ['demo-a', 'demo-b']) };
  }

  it('冲突默认跳过，目标与库内正文均不变（R6.2）', async () => {
    const { dir, adapter } = toolWithConflict('tool-a');
    const { app } = buildHarness(root, hubDir, [adapter]);

    const hubHash = hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md'));
    const targetHash = hashOf(join(dir, 'skills', 'demo-a', 'SKILL.md'));
    const snapshot = await preview(app, ['demo-a']);
    const { status, body } = await postJson(app, '/api/skills/distribution/execute', {
      token: snapshot.token,
      targets: [{ tool: adapter.name, overwriteConflicts: false }],
    });

    expect(status).toBe(200);
    const results = body.results as Array<{ skillId: string; action: string; reason?: string }>;
    expect(results).toHaveLength(1);
    expect(results[0].skillId).toBe('demo-a');
    expect(results[0].action).toBe('skipped');
    expect(results[0].reason).toContain('冲突');
    expect(body.counts).toEqual({ written: 0, skipped: 1, failed: 0 });
    expect(body.rollback).toEqual([]);
    expect(body.distributionIndexRefreshed).toBe(true);
    expect(hashOf(join(dir, 'skills', 'demo-a', 'SKILL.md'))).toBe(targetHash);
    expect(hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md'))).toBe(hubHash);
  });

  it('overwriteConflicts=true 才写入并回传 swapId；库内正文零变化（R6.3/R6.4）', async () => {
    const { dir, adapter } = toolWithConflict('tool-a');
    const { app } = buildHarness(root, hubDir, [adapter]);

    const hubHash = hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md'));
    const snapshot = await preview(app, ['demo-a']);
    const { status, body } = await postJson(app, '/api/skills/distribution/execute', {
      token: snapshot.token,
      targets: [{ tool: adapter.name, overwriteConflicts: true }],
    });

    expect(status).toBe(200);
    const results = body.results as Array<{ skillId: string; skillName: string; tool: string; action: string; swapId?: string }>;
    expect(results).toEqual([
      { skillId: 'demo-a', skillName: 'demo-a', tool: adapter.name, action: 'written', swapId: expect.any(String) },
    ]);
    expect(body.counts).toEqual({ written: 1, skipped: 0, failed: 0 });
    expect(body.rollback).toEqual([{ tool: adapter.name, swapId: results[0].swapId }]);
    expect(readFileSync(join(dir, 'skills', 'demo-a', 'SKILL.md'), 'utf-8')).toBe(
      readFileSync(join(hubDir, 'skills', 'demo-a', 'SKILL.md'), 'utf-8'),
    );
    expect(hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md'))).toBe(hubHash);
  });

  it('单工具失败不中断其他工具，逐「技能 × 工具」如实报告（R6.3）', async () => {
    const { dir: dirA, adapter: adapterA } = toolWithConflict('tool-a');
    const dirBad = toolDir(root, 'tool-bad');
    const adapterBad = new FakeSkillAdapter(dirBad, ['demo-a'], { failApply: true });
    const { app } = buildHarness(root, hubDir, [adapterA, adapterBad]);

    const snapshot = await preview(app, ['demo-a']);
    const { status, body } = await postJson(app, '/api/skills/distribution/execute', {
      token: snapshot.token,
      targets: [
        { tool: adapterA.name, overwriteConflicts: true },
        { tool: adapterBad.name, overwriteConflicts: true },
      ],
    });

    expect(status).toBe(200);
    const results = body.results as Array<{ tool: string; action: string; reason?: string }>;
    expect(results.map((r) => [r.tool, r.action])).toEqual([
      [adapterA.name, 'written'],
      [adapterBad.name, 'failed'],
    ]);
    expect(results[1].reason).toContain('模拟写入失败');
    expect(body.counts).toEqual({ written: 1, skipped: 0, failed: 1 });
    expect(readFileSync(join(dirA, 'skills', 'demo-a', 'SKILL.md'), 'utf-8')).toContain('demo-a');
    expect(existsSync(join(dirBad, 'skills', 'demo-a', 'SKILL.md'))).toBe(false);
  });

  it('token 过期 → 409', async () => {
    const { adapter } = toolWithConflict('tool-a');
    let now = Date.parse('2026-11-18T00:00:00.000Z');
    const { app } = buildHarness(root, hubDir, [adapter], { now: () => now });
    const snapshot = await preview(app, ['demo-a']);
    now += 10 * 60 * 1000 + 1;

    const { status, body } = await postJson(app, '/api/skills/distribution/execute', {
      token: snapshot.token,
      targets: [{ tool: adapter.name, overwriteConflicts: false }],
    });
    expect(status).toBe(409);
    expect(String(body.error)).toContain('过期');
  });

  it('同一 token 重复执行 → 409；未知 token → 404', async () => {
    const { adapter } = toolWithConflict('tool-a');
    const { app } = buildHarness(root, hubDir, [adapter]);
    const snapshot = await preview(app, ['demo-a']);
    const payload = {
      token: snapshot.token,
      targets: [{ tool: adapter.name, overwriteConflicts: false }],
    };
    expect((await postJson(app, '/api/skills/distribution/execute', payload)).status).toBe(200);
    const again = await postJson(app, '/api/skills/distribution/execute', payload);
    expect(again.status).toBe(409);
    expect(String(again.body.error)).toContain('已执行');

    const ghost = await postJson(app, '/api/skills/distribution/execute', { ...payload, token: 'ghost' });
    expect(ghost.status).toBe(404);
  });
});
