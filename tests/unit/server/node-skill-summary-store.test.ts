/**
 * 技能诊断摘要 Node 存储（refactor-skill-catalog T4）
 *
 * 落 ~/.assetplex/skill-diagnosis-summaries.json（测试用临时目录注入）。
 * 容错风格与 node-ai-classify-store 一致：文件缺失/损坏按空表处理，脏条目逐条过滤。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createNodeSkillSummaryStore,
} from '../../../src/server/lib/node-skill-summary-store.js';
import {
  mergeDiagnosisSummary,
  type SkillDiagnosisSummary,
} from '../../../src/core/skill-diagnosis-summary.js';

function record(overrides: Partial<SkillDiagnosisSummary> = {}): SkillDiagnosisSummary {
  return {
    hubRelativePath: 'skills/demo-a/SKILL.md',
    contentHash: 'hash-1',
    overall: 'healthy',
    issueCounts: { high: 0, medium: 0, low: 0 },
    mechanicalOnly: true,
    rulesVersion: 'demo-rules-1',
    model: 'demo-model',
    checkedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

let testDir = '';

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'assetplex-skill-summary-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('createNodeSkillSummaryStore', () => {
  const fileOf = (): string => join(testDir, 'skill-diagnosis-summaries.json');

  it('文件缺失时返回空表', () => {
    const store = createNodeSkillSummaryStore(fileOf());
    expect(store.load()).toEqual({});
  });

  it('保存后可原样读回（自动建目录）', () => {
    const filePath = join(testDir, 'nested', 'skill-diagnosis-summaries.json');
    const store = createNodeSkillSummaryStore(filePath);
    store.save({ 'skills/demo-a/SKILL.md': record() });

    expect(store.load()).toEqual({ 'skills/demo-a/SKILL.md': record() });
    expect(existsSync(filePath)).toBe(true);
  });

  it('损坏 JSON 按空表处理；脏条目逐条过滤', () => {
    const broken = createNodeSkillSummaryStore(fileOf());
    writeFileSync(fileOf(), '{ not json', 'utf-8');
    expect(broken.load()).toEqual({});

    const store = createNodeSkillSummaryStore(fileOf());
    writeFileSync(
      fileOf(),
      JSON.stringify({
        'skills/demo-a/SKILL.md': record(),
        'skills/demo-b/SKILL.md': { ...record(), overall: 'nope' },
      }),
      'utf-8',
    );
    expect(Object.keys(store.load())).toEqual(['skills/demo-a/SKILL.md']);
  });

  it('部分写入：合并后两条都在，其他键不受影响', () => {
    const store = createNodeSkillSummaryStore(fileOf());
    store.save({ 'skills/demo-a/SKILL.md': record() });

    const withB = mergeDiagnosisSummary(
      store.load(),
      record({ hubRelativePath: 'skills/demo-b/SKILL.md', overall: 'at-risk' }),
    );
    store.save(withB);

    const loaded = store.load();
    expect(Object.keys(loaded).sort()).toEqual(['skills/demo-a/SKILL.md', 'skills/demo-b/SKILL.md']);
    expect(loaded['skills/demo-b/SKILL.md'].overall).toBe('at-risk');
  });

  it('清空摘要不影响其他存储文件', () => {
    const summaries = createNodeSkillSummaryStore(fileOf());
    const otherPath = join(testDir, 'other-store.json');
    const other = createNodeSkillSummaryStore(otherPath);

    summaries.save({ 'skills/demo-a/SKILL.md': record() });
    other.save({ 'skills/demo-b/SKILL.md': record({ hubRelativePath: 'skills/demo-b/SKILL.md' }) });

    summaries.save({});

    expect(summaries.load()).toEqual({});
    expect(other.load()).toEqual({
      'skills/demo-b/SKILL.md': record({ hubRelativePath: 'skills/demo-b/SKILL.md' }),
    });
    expect(JSON.parse(readFileSync(otherPath, 'utf-8'))).toHaveProperty('skills/demo-b/SKILL.md');
  });
});
