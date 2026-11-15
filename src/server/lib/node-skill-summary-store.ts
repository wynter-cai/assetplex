/**
 * 技能诊断摘要的 Node JSON 文件实现
 *
 * skill-diagnosis-summaries.json（key = Hub 内相对路径），落在 Hub 元数据目录
 * （默认 ~/.assetplex/），与 skill-ai-classifications.json 同风格：
 * 文件缺失/损坏按空表处理，脏条目逐条过滤。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  sanitizeDiagnosisSummaries,
  type SkillDiagnosisSummary,
  type SkillDiagnosisSummaryStore,
} from '../../core/skill-diagnosis-summary.js';
import { expandHome } from '../../utils/paths.js';

/** 解析 Hub 元数据目录下的文件路径：$ASSETPLEX_DIR/<name> */
function resolveAssetplexFile(name: string): string {
  const hubRoot = process.env.ASSETPLEX_DIR ?? '~/.assetplex';
  return resolve(expandHome(hubRoot), name);
}

/** 读 JSON 文件为 unknown，缺失/损坏返回 null */
function readJson(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** 写 JSON 文件（自动建目录） */
function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

/** 技能诊断摘要存储（skill-diagnosis-summaries.json） */
export function createNodeSkillSummaryStore(
  filePath: string = resolveAssetplexFile('skill-diagnosis-summaries.json'),
): SkillDiagnosisSummaryStore {
  return {
    load(): Record<string, SkillDiagnosisSummary> {
      return sanitizeDiagnosisSummaries(readJson(filePath));
    },
    save(records: Record<string, SkillDiagnosisSummary>): void {
      writeJson(filePath, records);
    },
  };
}

/** 默认单例（真实路径） */
export const nodeSkillSummaryStore = createNodeSkillSummaryStore();
