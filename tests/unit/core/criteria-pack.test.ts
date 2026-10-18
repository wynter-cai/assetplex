/**
 * 业内准则包单元测试（add-llm-conflict-arbitration A4）
 *
 * spec: specs/criteria-meta-asset.spec.md Scenario 1b/3
 * 准则模板为 core 常量；insertCriteriaPack 走 hub-files 真实 fs（ASSETPLEX_DIR 临时目录）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CRITERIA_PACK, insertCriteriaPack } from '../../../src/core/criteria-pack.js';
import { listCriteria, parseCriterionFile } from '../../../src/core/criteria.js';

describe('CRITERIA_PACK 模板完整性', () => {
  it('至少 6 条业内最佳实践准则', () => {
    expect(CRITERIA_PACK.length).toBeGreaterThanOrEqual(6);
  });

  it('slug 全库唯一、字段齐备、正文非空且带来源', () => {
    const slugs = CRITERIA_PACK.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of CRITERIA_PACK) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(20);
      expect(t.source.length).toBeGreaterThan(0);
      expect(t.appliesTo.length).toBeGreaterThan(0);
    }
  });

  it('模板文本可被准则解析器直接消化（往返无损）', () => {
    for (const t of CRITERIA_PACK) {
      const asset = parseCriterionFile(`criteria/${t.slug}.md`, t.toFileContent());
      expect(asset.slug).toBe(t.slug);
      expect(asset.name).toBe(t.name);
      expect(asset.appliesTo).toEqual(t.appliesTo);
      expect(asset.source).toBe(t.source);
      expect(asset.enabled).toBe(true);
    }
  });
});

describe('insertCriteriaPack：按勾选导入（Scenario 1b/3）', () => {
  let hubRoot: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    hubRoot = mkdtempSync(join(tmpdir(), 'criteria-pack-test-'));
    originalEnv = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubRoot;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalEnv;
    rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('仅勾选的准则生成到 Hub/criteria/，未勾选不生成', () => {
    const first = CRITERIA_PACK[0].slug;
    const result = insertCriteriaPack([first]);

    expect(result.inserted).toEqual([first]);
    expect(result.rejected).toEqual([]);
    expect(existsSync(join(hubRoot, 'criteria', `${first}.md`))).toBe(true);
    expect(listCriteria().map((c) => c.slug)).toEqual([first]);
    for (const t of CRITERIA_PACK.slice(1)) {
      expect(existsSync(join(hubRoot, 'criteria', `${t.slug}.md`))).toBe(false);
    }
  });

  it('同名拒绝且不改动已有文件（含用户编辑过的内容）', () => {
    const slug = CRITERIA_PACK[0].slug;
    insertCriteriaPack([slug]);

    const file = join(hubRoot, 'criteria', `${slug}.md`);
    const edited = '【用户改过】\n';
    writeFileSync(file, edited, 'utf-8');

    const result = insertCriteriaPack([slug]);
    expect(result.inserted).toEqual([]);
    expect(result.rejected).toEqual([slug]);
    expect(readFileSync(file, 'utf-8')).toBe(edited);
  });

  it('未知 slug 进 rejected；空勾选是 no-op', () => {
    expect(insertCriteriaPack(['no-such-slug']).rejected).toEqual(['no-such-slug']);
    const empty = insertCriteriaPack([]);
    expect(empty.inserted).toEqual([]);
    expect(empty.rejected).toEqual([]);
  });
});
