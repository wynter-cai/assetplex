/**
 * 规则标注集回归（add-diagnosis-rules T8）
 *
 * 锚定真实规则集：逐条用例跑静态检查，按规则统计 precision / recall 并断言阈值。
 * 规则集缺失或加载失败时直接失败（真命答案），不静默跳过。
 *
 * 运行：node scripts/diagnosis-eval.mjs
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRuleRegistryFromFile } from '../../../src/core/diagnosis-rules.js';
import { runStaticChecks } from '../../../src/core/diagnosis-static.js';
import type { DiagnosisRuleSet, RuleAssetCategory } from '../../../src/core/types.js';

const RULES_PATH = resolve('设计文档/changes/add-diagnosis-rules/diagnosis-rules.yaml');
const LABELS_PATH = resolve('tests/fixtures/diagnosis/labels.json');

interface LabelCase {
  id: string;
  kind: RuleAssetCategory;
  hubRelativePath: string;
  expectedRuleIds: string[];
  content: string;
}

interface Labels {
  version: string;
  cases: LabelCase[];
}

function loadLabels(): Labels {
  return JSON.parse(readFileSync(LABELS_PATH, 'utf-8')) as Labels;
}

function loadRules(): DiagnosisRuleSet {
  try {
    return loadRuleRegistryFromFile(RULES_PATH).ruleSet;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`规则集加载失败，标注回归无法给出真命答案：${message}`);
  }
}

interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

function add(counts: Counts, key: keyof Counts): void {
  counts[key] += 1;
}

const ZERO: Counts = { tp: 0, fp: 0, fn: 0 };

describe('诊断规则标注集回归（T8）', () => {
  const labels = loadLabels();
  const ruleSet = loadRules();

  it('标注集覆盖至少 5 条用例，且每条用例的规则编号都在规则集内', () => {
    const known = new Set(ruleSet.rules.map((rule) => rule.id));
    expect(labels.cases.length).toBeGreaterThanOrEqual(5);
    for (const item of labels.cases) {
      for (const ruleId of item.expectedRuleIds) {
        expect(known.has(ruleId), `${item.id} 标注了不存在的规则 ${ruleId}`).toBe(true);
      }
    }
  });

  it('逐规则 recall 与整体 precision 达标', () => {
    const perRule = new Map<string, Counts>();
    const overall: Counts = { ...ZERO };
    for (const item of labels.cases) {
      const expected = new Set(item.expectedRuleIds);
      const actual = new Set(
        runStaticChecks({ kind: item.kind, hubRelativePath: item.hubRelativePath, content: item.content }, ruleSet)
          .findings.map((finding) => finding.ruleId),
      );
      for (const ruleId of actual) {
        const counts = perRule.get(ruleId) ?? { ...ZERO };
        if (expected.has(ruleId)) {
          add(counts, 'tp');
          add(overall, 'tp');
        } else {
          add(counts, 'fp');
          add(overall, 'fp');
        }
        perRule.set(ruleId, counts);
      }
      for (const ruleId of expected) {
        if (actual.has(ruleId)) continue;
        const counts = perRule.get(ruleId) ?? { ...ZERO };
        add(counts, 'fn');
        add(overall, 'fn');
        perRule.set(ruleId, counts);
        // eslint-disable-next-line no-console
        console.log(`[diagnosis-eval] 漏报：${item.id} 缺 ${ruleId}`);
      }
    }

    for (const [ruleId, counts] of [...perRule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const recall = counts.tp + counts.fn === 0 ? 1 : counts.tp / (counts.tp + counts.fn);
      // eslint-disable-next-line no-console
      console.log(`[diagnosis-eval] ${ruleId}: tp=${counts.tp} fp=${counts.fp} fn=${counts.fn} recall=${recall.toFixed(2)}`);
    }
    const precision = overall.tp + overall.fp === 0 ? 1 : overall.tp / (overall.tp + overall.fp);
    const recall = overall.tp + overall.fn === 0 ? 1 : overall.tp / (overall.tp + overall.fn);
    // eslint-disable-next-line no-console
    console.log(`[diagnosis-eval] overall: precision=${precision.toFixed(2)} recall=${recall.toFixed(2)}`);

    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(precision).toBeGreaterThanOrEqual(0.8);
  });
});
