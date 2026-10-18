/**
 * 技能出处（provenance）与库状态（inLibrary）推导
 *
 * spec: 设计文档/changes/refactor-skill-origin-taxonomy/specs/skill-origin-taxonomy.spec.md
 *
 * 内部 SkillOrigin 六值枚举与 vault 物理目录、source frontmatter 格式全部不变；
 * 本模块只做对外语义投影：
 * - provenance：四值纯出处（self / marketplace / plugin / builtin，MECE）
 * - inLibrary：是否已入我的库（等价于内部 origin=vault）
 */

/** 纯出处四类（MECE：按最初从哪来，互斥且穷尽） */
export type SkillProvenance = 'self' | 'marketplace' | 'plugin' | 'builtin';

/** 库状态（管理轴，独立于出处） */
export type LibraryStatus = 'in' | 'out';

/** 出处四类全集（参数校验与计数初始化用） */
export const SKILL_PROVENANCES: SkillProvenance[] = ['self', 'marketplace', 'plugin', 'builtin'];

/** 库状态两值全集 */
export const LIBRARY_STATUSES: LibraryStatus[] = ['in', 'out'];

/**
 * 视图口径（资产/环境）：资产优先视图的集合定义。
 * spec: 设计文档/changes/refactor-skill-asset-first-view/specs/asset-first-view.spec.md（定义节）
 */
export type SkillAssetScope = 'asset' | 'environment';

/** 视图口径两值全集 */
export const SKILL_ASSET_SCOPES: SkillAssetScope[] = ['asset', 'environment'];

/**
 * 推导纯出处（内部 origin 六值 → 对外四值）：
 * - personal|project → self
 * - vault：source 以 `marketplace:` 开头 → marketplace；以 `plugin:` 开头 → plugin；其余/无 → self
 * - plugin → plugin；marketplace → marketplace；builtin → builtin
 * - 未知 origin → builtin 兜底并 console.warn（防御脏数据）
 */
export function deriveProvenance(origin: string, curateSource?: string): SkillProvenance {
  if (origin === 'personal' || origin === 'project') return 'self';
  if (origin === 'vault') {
    if (typeof curateSource === 'string' && curateSource.startsWith('marketplace:')) {
      return 'marketplace';
    }
    if (typeof curateSource === 'string' && curateSource.startsWith('plugin:')) {
      return 'plugin';
    }
    return 'self';
  }
  if (origin === 'plugin') return 'plugin';
  if (origin === 'marketplace') return 'marketplace';
  if (origin === 'builtin') return 'builtin';
  console.warn(`[skill-provenance] 未知技能来源：${origin}，按官方内置兜底`);
  return 'builtin';
}

/** 是否已入我的库（等价于内部 origin=vault 判定，契约行为零迁移） */
export function deriveInLibrary(origin: string): boolean {
  return origin === 'vault';
}

/**
 * 推导视图口径：资产 ⇔ 已入库 ∪ 出处为自建（未入库的个人/项目技能也是资产）；
 * 反面即环境（未入库的市场/插件/内置，不公示，仅折叠入口主动调取）。
 * 两集合互斥，并集为全量盘点。
 */
export function deriveScope(provenance: SkillProvenance, inLibrary: boolean): SkillAssetScope {
  return inLibrary || provenance === 'self' ? 'asset' : 'environment';
}
