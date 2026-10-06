/**
 * 技能来源分类重构 API 契约（refactor-skill-origin-taxonomy）
 *
 * 语义变更：
 * - origin 六值（vault/personal/project/plugin/marketplace/builtin）→ provenance 四值纯出处 + inLibrary 布尔
 * - 筛选参数 origin → provenance；新增 status（库状态）参数
 * - 内部 vault 物理目录、source frontmatter、AI 分类缓存（内容 hash key）均不变
 */

/** 纯出处四类（MECE：按最初从哪来，互斥且穷尽） */
export type SkillProvenance = 'self' | 'marketplace' | 'plugin' | 'builtin';

/** 库状态（管理轴，独立于出处） */
export type LibraryStatus = 'in' | 'out';

/** 出处标签映射（前端 chips 用） */
export const PROVENANCE_LABELS: Record<SkillProvenance, string> = {
  self: '自建',
  marketplace: '市场安装',
  plugin: '插件自带',
  builtin: '官方内置',
};

/** 状态分段控件标签 */
export const LIBRARY_STATUS_LABELS: Record<LibraryStatus | 'all', string> = {
  all: '全部',
  in: '我的库',
  out: '未入库',
};

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  functionCategory: SkillFunction;
  /** 纯出处（替代旧 origin 六值对外语义） */
  provenance: SkillProvenance;
  /** 是否已入我的库（替代旧 origin=vault 的对外表达） */
  inLibrary: boolean;
  /** 项目技能时的工作区信息（徽章展示用，不占出处轴） */
  workspaceName?: string;
  workspacePath?: string;
  tool: string;
  /** 物理主文件路径 */
  path: string;
  /** 副本数 */
  variants: number;
  /** 沉淀溯源（库内技能才有；内部格式不变，前端经 PROVENANCE_LABELS 显示「来自 ××」） */
  source?: string;
  functionSource: 'manual' | 'ai' | 'keyword';
  version?: string;
}

/** GET /api/skills 查询参数 */
export interface ListSkillsQuery {
  /** 职能过滤（不变） */
  function?: SkillFunction;
  /** 出处过滤（四值，替代旧 origin） */
  provenance?: SkillProvenance;
  /** 库状态过滤（缺省=全部） */
  status?: LibraryStatus;
  search?: string;
}

/** 列表响应：计数随筛选联动（status/provenance/search 均作用于 countBy*） */
export interface SkillListResult {
  total: number;
  items: SkillInfo[];
  countByFunction: Record<SkillFunction, number>;
  /** 出处计数（随 status/search 过滤联动） */
  countByProvenance: Record<SkillProvenance, number>;
  /** 状态计数：我的库 / 未入库（随 provenance/search 联动） */
  countByStatus: { in: number; out: number };
}

// ─── 写管理契约等价迁移（行为不变，术语改写） ───────────────────────────

/**
 * 写接口（POST/PUT/DELETE /api/skills）作用域判定：
 * 原「仅 origin=vault 可写」→ 现「仅 inLibrary=true 可写」，错误体与状态码不变
 * （404 技能不存在 / 400 非库技能只读时 {error: '未入库技能只读，请先收藏到我的库'}）
 */

/** 沉淀接口（POST /api/skills/curate）行为不变：复制非库技能到库目录 + source 溯源 */
export interface CurateResult {
  skill: SkillInfo;
}

// ─── 内部约定（非 API 面） ──────────────────────────────────────────

/**
 * provenance 推导规则（inventory 时计算，纯函数）：
 * - origin=personal|project → self
 * - origin=vault：frontmatter source 以 `marketplace:` 开头 → marketplace；source 以 `plugin:` → plugin；无 source → self
 * - origin=plugin → plugin；origin=marketplace → marketplace；origin=builtin → builtin
 *
 * inLibrary = (origin === 'vault')
 *
 * 注意：vault 内沉淀自市场的技能出处记 marketplace（不占「自建」计数），
 * 因此「自建」= 个人自建 + 项目技能 + 库内无溯源自建；总数恒等于原六类合计。
 */
