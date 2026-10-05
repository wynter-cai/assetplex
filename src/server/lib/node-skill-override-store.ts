/**
 * SkillOverrideStore 的 Node 实现
 *
 * 将「技能职能分类」的手动覆盖持久化到 Hub 元数据目录下的
 * skill-overrides.json（默认 ~/.assetplex/skill-overrides.json）。
 * 绝不写入原始 SKILL.md。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SKILL_FUNCTIONS, type SkillFunction, type SkillOverrideStore } from '../../core/skills-inventory.js';
import { expandHome } from '../../utils/paths.js';

/** 解析覆盖文件路径：$ASSETPLEX_DIR/skill-overrides.json */
export function resolveSkillOverridesPath(): string {
  const hubRoot = process.env.ASSETPLEX_DIR ?? '~/.assetplex';
  return resolve(expandHome(hubRoot), 'skill-overrides.json');
}

/** 过滤掉不属于合法职能枚举的条目，防御脏数据 */
function sanitize(raw: unknown): Record<string, SkillFunction> {
  const out: Record<string, SkillFunction> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && (SKILL_FUNCTIONS as string[]).includes(value)) {
      out[key] = value as SkillFunction;
    }
  }
  return out;
}

export function createNodeSkillOverrideStore(filePath: string = resolveSkillOverridesPath()): SkillOverrideStore {
  return {
    load(): Record<string, SkillFunction> {
      try {
        if (!existsSync(filePath)) return {};
        return sanitize(JSON.parse(readFileSync(filePath, 'utf-8')));
      } catch {
        return {};
      }
    },
    save(overrides: Record<string, SkillFunction>): void {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(overrides, null, 2)}\n`, 'utf-8');
    },
  };
}

/** 默认单例（真实路径） */
export const nodeSkillOverrideStore = createNodeSkillOverrideStore();
