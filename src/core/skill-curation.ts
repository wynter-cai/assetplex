/**
 * 技能沉淀服务（纯逻辑）
 *
 * 把非保险箱技能复制进保险箱并记录来源（SKILL.md frontmatter source 字段）。
 * 沉淀 = 复制：源技能文件不动，工具里的原技能继续可用。
 *
 * spec: add-skill-curation / specs/skill-curation.spec.md
 */

import {
  listSkills,
  getSkillRawContent,
  parseFrontmatter,
  type SkillInfo,
} from './skills-inventory.js';
import { validateAssetName, buildAssetMarkdown, AssetWriteError } from './asset-name.js';
import type { SkillWriteDeps } from './skill-write.js';

export { AssetWriteError as SkillCurateError } from './asset-name.js';

/** 单条沉淀输入 */
export interface CurateSkillInput {
  /** 源技能 ID（盘点 id，即名称小写形式） */
  id: string;
  /** 目标名称（保险箱目录名），缺省沿用源技能名 */
  name?: string;
}

/** 批量沉淀单条失败明细 */
export interface CurateBatchFailure {
  id: string;
  /** 源技能名（便于用户识别） */
  name: string;
  /** 失败原因 */
  error: string;
}

/** 批量沉淀结果：部分成功语义，已成功不回滚 */
export interface CurateBatchResult {
  created: SkillInfo[];
  failed: CurateBatchFailure[];
}

/**
 * 沉淀单个技能到保险箱，返回创建后（含同名合并）的盘点条目。
 *
 * 冲突规则：
 * - 改名沉淀：目标名撞任何已有技能 → 400（与新建保险箱技能一致）
 * - 原名沉淀：保险箱已有同名（可能已沉淀过）→ 400
 *
 * @throws AssetWriteError 404 源不存在 / 400 源为 vault、同名冲突、名称非法
 */
export function curateVaultSkill(input: CurateSkillInput, deps: SkillWriteDeps): SkillInfo {
  const { fs, sources, store } = deps;
  const found = getSkillRawContent(input.id, { fs, sources, store });
  if (!found) {
    throw new AssetWriteError(`技能不存在：${input.id}`, 404);
  }
  const { skill, rawContent } = found;
  if (skill.origin === 'vault') {
    throw new AssetWriteError(`已是我的库技能，无需收藏：${skill.name}`, 400);
  }

  const targetName = validateAssetName(input.name ?? skill.name);
  const targetId = targetName.toLowerCase();
  assertNameAvailable(targetId, targetName, skill.id, { fs, sources, store });

  const { data, body } = parseFrontmatter(rawContent);
  const skillDir = `${sources.vaultSkillsDir}/${targetName}`;
  fs.ensureDir(skillDir);
  fs.writeFile(
    `${skillDir}/SKILL.md`,
    buildAssetMarkdown({
      name: targetName,
      description: data.description,
      content: body,
      source: `${skill.origin}:${skill.sourcePath}`,
    }),
  );

  const created = listSkills({ fs, sources, store }).items.find((s) => s.id === targetId);
  if (!created) {
    throw new Error(`技能收藏后未纳入盘点：${targetName}`);
  }
  return created;
}

/** 同名校验：改名撞任何已有技能；原名沉淀撞保险箱同名 */
function assertNameAvailable(
  targetId: string,
  targetName: string,
  sourceId: string,
  deps: SkillWriteDeps,
): void {
  const items = listSkills({ fs: deps.fs, sources: deps.sources, store: deps.store }).items;
  const existing = items.find((s) => s.id === targetId);
  if (!existing) return;

  if (targetId !== sourceId) {
    throw new AssetWriteError(
      `同名技能已存在：${existing.name}（来源：${existing.origin}），请改名`,
      400,
    );
  }
  if (existing.origin === 'vault') {
    throw new AssetWriteError(
      `我的库已存在同名技能：${targetName}（可能已收藏过），请改名`,
      400,
    );
  }
}

/**
 * 批量沉淀：逐条执行单条沉淀，部分成功不回滚。
 * id 去重；已是保险箱 / 不存在 / 同名冲突的计入 failed。
 *
 * @throws AssetWriteError 400 ids 为空或非法
 */
export function curateVaultSkills(input: { ids: string[] }, deps: SkillWriteDeps): CurateBatchResult {
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw new AssetWriteError('ids 不能为空', 400);
  }
  const ids = Array.from(
    new Set(input.ids.map((id) => id.trim().toLowerCase()).filter((id) => id !== '')),
  );
  if (ids.length === 0) {
    throw new AssetWriteError('ids 不能为空', 400);
  }

  const nameById = new Map(
    listSkills({ fs: deps.fs, sources: deps.sources, store: deps.store }).items.map((s) => [s.id, s.name]),
  );

  const created: SkillInfo[] = [];
  const failed: CurateBatchFailure[] = [];
  for (const id of ids) {
    try {
      created.push(curateVaultSkill({ id }, deps));
    } catch (err) {
      if (!(err instanceof AssetWriteError)) throw err;
      failed.push({ id, name: nameById.get(id) ?? id, error: err.message });
    }
  }
  return { created, failed };
}
