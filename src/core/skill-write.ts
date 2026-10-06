/**
 * 保险箱技能写服务（纯逻辑）
 *
 * 创建/更新/删除 Hub 中的技能目录 skills/<name>/SKILL.md。
 * 文件系统通过注入的 SkillWriteFs 提供，便于测试且不直接依赖 fs。
 *
 * spec: add-skill-agent-write-management / specs/skill-write.spec.md
 */

import {
  listSkills,
  type SkillFs,
  type SkillInfo,
  type SkillSources,
  type SkillOverrideStore,
} from './skills-inventory.js';
import { validateAssetName, buildAssetMarkdown, AssetWriteError } from './asset-name.js';

export { AssetWriteError as SkillWriteError } from './asset-name.js';

/** 技能写管理所需文件系统（在只读 SkillFs 基础上增加写能力） */
export interface SkillWriteFs extends SkillFs {
  /** 路径是否存在（文件或目录） */
  exists(path: string): boolean;
  /** 递归创建目录 */
  ensureDir(path: string): void;
  /** 写入文本文件（覆盖） */
  writeFile(path: string, content: string): void;
  /** 递归删除目录（不存在时静默） */
  removeDir(path: string): void;
}

/** 新建技能输入 */
export interface VaultSkillInput {
  /** 技能名，同时用作目录名；大小写不敏感唯一 */
  name: string;
  /** 描述，写入 frontmatter description；可空 */
  description?: string;
  /** SKILL.md 正文（frontmatter 之后的内容） */
  content: string;
}

/** 技能写服务依赖 */
export interface SkillWriteDeps {
  fs: SkillWriteFs;
  sources: SkillSources;
  store: SkillOverrideStore;
}

/** 创建保险箱技能，返回创建后的盘点条目 */
export function createVaultSkill(input: VaultSkillInput, deps: SkillWriteDeps): SkillInfo {
  const name = validateAssetName(input.name);
  const { fs, sources, store } = deps;

  // 同名拒绝：跨全部来源，大小写不敏感（盘点 id 即名称小写形式）
  const conflict = listSkills({ fs, sources, store }).items.find((s) => s.id === name.toLowerCase());
  if (conflict) {
    throw new AssetWriteError(`同名技能已存在：${conflict.name}（来源：${conflict.origin}）`, 400);
  }

  const skillDir = `${sources.vaultSkillsDir}/${name}`;
  fs.ensureDir(skillDir);
  fs.writeFile(
    `${skillDir}/SKILL.md`,
    buildAssetMarkdown({
      name,
      description: input.description ?? '',
      content: input.content ?? '',
    }),
  );

  const created = listSkills({ fs, sources, store }).items.find((s) => s.id === name.toLowerCase());
  if (!created) {
    throw new Error(`技能创建后未纳入盘点：${name}`);
  }
  return created;
}

/** 更新保险箱技能（整文件替换），返回刷新后的盘点条目 */
export function updateVaultSkill(id: string, content: string, deps: SkillWriteDeps): SkillInfo {
  const { fs, sources, store } = deps;
  const target = listSkills({ fs, sources, store }).items.find((s) => s.id === id.toLowerCase());
  if (!target) {
    throw new AssetWriteError(`技能不存在：${id}`, 404);
  }
  assertVaultSkill(target);

  fs.writeFile(target.sourcePath, content);

  const refreshed = listSkills({ fs, sources, store }).items.find((s) => s.id === target.id);
  if (!refreshed) {
    throw new Error(`技能更新后未纳入盘点：${target.name}`);
  }
  return refreshed;
}

/** 删除保险箱技能（整个技能目录），成功无返回值 */
export function deleteVaultSkill(id: string, deps: SkillWriteDeps): void {
  const { fs, sources, store } = deps;
  const target = listSkills({ fs, sources, store }).items.find((s) => s.id === id.toLowerCase());
  if (!target) {
    throw new AssetWriteError(`技能不存在：${id}`, 404);
  }
  assertVaultSkill(target);

  // 防御：仅允许删除 vault 技能根下的一层技能目录
  const dir = target.sourcePath.slice(0, target.sourcePath.lastIndexOf('/'));
  const base = `${sources.vaultSkillsDir}/`;
  const rel = dir.startsWith(base) ? dir.slice(base.length) : '';
  if (rel === '' || rel.includes('/') || rel.includes('\\')) {
    throw new AssetWriteError(`非法技能目录：${dir}`, 400);
  }

  fs.removeDir(dir);
}

function assertVaultSkill(skill: SkillInfo): void {
  // 内部判定保持 origin==='vault'（与 inLibrary=true 天然等价，契约行为零迁移）
  if (skill.origin !== 'vault') {
    throw new AssetWriteError('未入库技能只读，请先收藏到我的库', 400);
  }
}
