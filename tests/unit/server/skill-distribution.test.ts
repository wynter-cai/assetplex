/**
 * 技能批量分发预览测试（refactor-skill-catalog T13）
 *
 * spec: skill-catalog.spec.md R6.1 / R6.2 / R6.5 / R7.6
 * 断言：按所选技能主文件过滤、四态统计、defaultSelected 保守勾选、
 * statusUnknown 独立标记、sampleTargets 只给工具内相对路径、token 10 分钟、预览零写入。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SkillFs } from '../../../src/core/skills-inventory.js';
import { nodeAgentFs } from '../../../src/server/lib/node-agent-fs.js';
import {
  SKILL_MD,
  FakeSkillAdapter,
  buildHarness,
  hashOf,
  postJson,
  preview,
  seedEnvSkill,
  seedHub,
  toolDir,
} from './skill-distribution-fixtures.js';

describe('POST /api/skills/distribution/preview（T13）', () => {
  let root: string;
  let hubDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'assetplex-skilldist-'));
    hubDir = seedHub(root);
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(root, { recursive: true, force: true });
  });

  it('按所选技能过滤、统计四态、保守默认勾选、状态未知独立标记且零写入（R6.1/R6.2/R6.5/R7.6）', async () => {
    const dirA = toolDir(root, 'tool-a');
    mkdirSync(join(dirA, 'skills', 'demo-a'), { recursive: true });
    writeFileSync(join(dirA, 'skills', 'demo-a', 'SKILL.md'), '旧版内容', 'utf-8');
    const dirB = toolDir(root, 'tool-b');
    const dirC = toolDir(root, 'tool-c', false);
    const dirD = toolDir(root, 'tool-d');
    seedEnvSkill(root, 'demo-env');
    const brokenDir = join(hubDir, 'skills', 'demo-broken');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(join(brokenDir, 'SKILL.md'), SKILL_MD('demo-broken', '坏文件'), 'utf-8');

    const adapters = [
      new FakeSkillAdapter(dirA, ['demo-a', 'demo-b']),
      new FakeSkillAdapter(dirB, ['demo-a', 'demo-b']),
      new FakeSkillAdapter(dirC, ['demo-a']),
      new FakeSkillAdapter(dirD, ['demo-a'], { detectThrows: true }),
      new FakeSkillAdapter(toolDir(root, 'tool-e'), [], { identityOnly: true }),
    ];

    // 盘点时能读到（故仍在列表中），复核正文时读不到 → missing-file
    const brokenPath = join(brokenDir, 'SKILL.md').replace(/\\/g, '/');
    const brokenContent = SKILL_MD('demo-broken', '坏文件');
    let brokenReads = 0;
    const fs: SkillFs = {
      read: (p) => {
        if (p.replace(/\\/g, '/') !== brokenPath) return nodeAgentFs.read(p);
        brokenReads += 1;
        return brokenReads === 1 ? brokenContent : null;
      },
      listDir: nodeAgentFs.listDir,
      dirMtime: nodeAgentFs.dirMtime,
    };

    const before = {
      hubA: hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md')),
      toolA: hashOf(join(dirA, 'skills', 'demo-a', 'SKILL.md')),
    };
    const { app } = buildHarness(root, hubDir, adapters, { fs });
    const body = await preview(app, ['demo-a', 'demo-b', 'demo-env', 'demo-broken', 'ghost']);

    expect(body.skills.map((s) => s.id)).toEqual(['demo-a', 'demo-b']);
    expect(body.skills.map((s) => s.hubRelativePath)).toEqual(['skills/demo-a/SKILL.md', 'skills/demo-b/SKILL.md']);
    expect(body.ineligible).toEqual([
      { id: 'demo-env', name: 'demo-env', reason: 'not-in-library' },
      { id: 'demo-broken', name: 'demo-broken', reason: 'missing-file' },
      { id: 'ghost', name: 'ghost', reason: 'not-found' },
    ]);

    const byTool = new Map(body.tools.map((t) => [t.tool, t]));
    const suffix = (dir: string): string => `tool-${dir.split(/[\\/]/).pop() ?? ''}`;

    const a = byTool.get(suffix(dirA));
    expect(a?.installed).toBe(true);
    expect(a?.supported).toBe(true);
    expect(a?.defaultSelected).toBe(true);
    expect(a?.files).toEqual({ total: 2, created: 1, overwritten: 0, unchanged: 0, conflicts: 1 });
    expect(a?.sampleTargets).toEqual(['skills/demo-a/SKILL.md', 'skills/demo-b/SKILL.md']);

    const b = byTool.get(suffix(dirB));
    expect(b?.defaultSelected).toBe(false);
    expect(b?.files.created).toBe(2);

    const c = byTool.get(suffix(dirC));
    expect(c?.installed).toBe(false);
    expect(c?.defaultSelected).toBe(false);
    expect(c?.skipReason).toContain('未安装');

    const d = byTool.get(suffix(dirD));
    expect(d?.statusUnknown).toBe(true);
    expect(d?.installed).toBe(false);
    expect(d?.defaultSelected).toBe(false);
    expect(d?.skipReason).toContain('状态');

    const e = byTool.get('identitytool');
    expect(e?.supported).toBe(false);
    expect(e?.skipReason).toContain('不支持');

    expect(body.totals).toEqual({ tools: 5, files: 4, created: 3, overwritten: 0, unchanged: 0, conflicts: 1 });
    expect(body.backup.policy).toBe('swap');

    // token 快照：10 分钟有效期
    expect(new Date(body.expiresAt).getTime() - new Date(body.generatedAt).getTime()).toBe(10 * 60 * 1000);

    // 零写入 + 不回传本机绝对路径
    expect(hashOf(join(hubDir, 'skills', 'demo-a', 'SKILL.md'))).toBe(before.hubA);
    expect(hashOf(join(dirA, 'skills', 'demo-a', 'SKILL.md'))).toBe(before.toolA);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(hubDir);
    expect(raw).not.toContain(dirA);
  });

  it('ids 缺失、空数组或非字符串 → 400（R6.5）', async () => {
    const { app } = buildHarness(root, hubDir, [new FakeSkillAdapter(toolDir(root, 'tool-a'), ['demo-a'])]);
    expect((await postJson(app, '/api/skills/distribution/preview', {})).status).toBe(400);
    expect((await postJson(app, '/api/skills/distribution/preview', { ids: [] })).status).toBe(400);
    expect((await postJson(app, '/api/skills/distribution/preview', { ids: [1] })).status).toBe(400);
  });
});
