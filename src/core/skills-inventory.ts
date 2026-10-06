/**
 * 技能分类全貌盘点服务
 *
 * 跨全部来源发现 SKILL.md，按「职能」与「来源」两个维度归类，
 * 同名技能去重合并，支持用户手动覆盖职能分类（持久化到 Hub 元数据，
 * 不修改原始 SKILL.md）。
 *
 * 纯逻辑：文件系统访问通过注入的 SkillFs，覆盖存储通过 SkillOverrideStore。
 *
 * spec: specs/skills-taxonomy.spec.md
 */

// ============ 类型 ============

export type SkillFunction =
  | 'coding'
  | 'writing'
  | 'browser'
  | 'data'
  | 'devops'
  | 'ai-integration'
  | 'design'
  | 'workflow'
  | 'other';

export type SkillOrigin = 'builtin' | 'plugin' | 'personal' | 'marketplace' | 'vault';

/** 分类来源：手动覆盖 / AI 分类 / 关键词规则兜底 */
export type SkillFunctionSource = 'manual' | 'ai' | 'keyword';

export interface SkillInfo {
  /** 稳定 ID：技能名小写形式（跨重扫稳定，用作覆盖键） */
  id: string;
  name: string;
  description: string;
  functionCategory: SkillFunction;
  origin: SkillOrigin;
  /** 来源工具（trae / codebuddy） */
  tool: string;
  /** 主副本 SKILL.md 绝对路径 */
  sourcePath: string;
  version: string;
  /** 分类来源：手动覆盖 > AI 分类 > 关键词兜底 */
  functionSource: SkillFunctionSource;
  /** 沉淀来源（仅 vault 有值）：`${origin}:${sourcePath}`；自建/非 vault 为 undefined */
  source?: string;
  /** 其他副本 SKILL.md 绝对路径 */
  variants: string[];
}

/** 文件系统抽象（只读，与 AgentFs 结构兼容） */
export interface SkillFs {
  read(absolutePath: string): string | null;
  listDir(absolutePath: string): string[];
  dirMtime(absolutePath: string): string | null;
  /** 解析真实路径（符号链接归一化）；实现可省略，省略时不做符号链接去重 */
  realpath?(absolutePath: string): string;
}

/**
 * AI 缓存查询回调：入参为 SKILL.md 原文（hash 建立在原文上），
 * 命中返回 AI 分类，未命中返回 null（回退关键词）。
 * 由调用方组装（避免本模块依赖缓存实现），盘点过程无任何 LLM 调用。
 */
export type AiCacheLookup = (rawContent: string) => SkillFunction | null;

/** 手动覆盖存储抽象 */
export interface SkillOverrideStore {
  load(): Record<string, SkillFunction>;
  save(overrides: Record<string, SkillFunction>): void;
}

export interface SkillSources {
  /** ~/.trae-cn/skills（个人自建） */
  userSkillsDir: string;
  /** ~/.trae-cn/builtin（global + code/work/design persona 包） */
  builtinRoot: string;
  /** ~/.trae-cn/builtin_skills */
  builtinSkillsDir: string;
  /** ~/.trae-cn/plugins */
  pluginsRoot: string;
  /** ~/.codebuddy/skills-marketplace/skills */
  marketplaceSkillsDir: string;
  /** 保险箱技能根目录（Hub skills/<name>/SKILL.md） */
  vaultSkillsDir: string;
}

export interface ListSkillsParams {
  function?: SkillFunction;
  origin?: SkillOrigin;
  search?: string;
}

export interface ListSkillsResult {
  items: SkillInfo[];
  total: number;
  countByFunction: Record<SkillFunction, number>;
  countByOrigin: Record<SkillOrigin, number>;
}

/** 发现到的原始技能副本 */
interface RawSkill {
  name: string;
  description: string;
  version: string;
  sourcePath: string;
  origin: SkillOrigin;
  tool: string;
  /** frontmatter source（沉淀来源标识），非 vault 技能透传前会被过滤 */
  source?: string;
  /** SKILL.md 原文（含 frontmatter），AI 缓存 hash 的依据 */
  raw: string;
  /** frontmatter 之后的正文，用于兜底分类 */
  body: string;
}

// ============ 常量（规则与代码分离） ============

export const SKILL_FUNCTIONS: SkillFunction[] = [
  'coding',
  'writing',
  'browser',
  'data',
  'devops',
  'ai-integration',
  'design',
  'workflow',
  'other',
];

export const SKILL_ORIGINS: SkillOrigin[] = ['builtin', 'plugin', 'personal', 'marketplace', 'vault'];

/**
 * 职能关键词规则表：按数组顺序匹配，首个命中的类别胜出。
 * coding 放在最后（兜底于 other 之前），避免其通用关键词抢占更具体类别。
 */
const FUNCTION_KEYWORDS: Array<{ category: Exclude<SkillFunction, 'other'>; keywords: string[] }> = [
  {
    category: 'writing',
    keywords: ['pdf', 'docx', 'pptx', 'word文档', 'document', '文档', '写作', '文章', '论文', '文案', '翻译', 'translation', 'ppt'],
  },
  {
    category: 'browser',
    keywords: ['browser', '浏览器', 'playwright', 'puppeteer', 'scrape', '网页', '爬虫'],
  },
  {
    category: 'data',
    keywords: ['xlsx', 'xls', 'csv', 'excel', 'spreadsheet', 'sheet', '表格', '数据', 'pandas', 'sql', 'dataset'],
  },
  {
    category: 'devops',
    keywords: ['docker', 'kubernetes', 'k8s', 'devops', '部署', '运维', 'terraform', 'ci/cd', '流水线', 'aws', 'cloud deploy'],
  },
  {
    category: 'ai-integration',
    keywords: ['openai', 'llm', 'gpt', '模型', 'embedding', 'rag', 'langchain', '向量', 'ai 集成', 'model integration'],
  },
  {
    category: 'design',
    keywords: ['figma', 'design', 'ui设计', '图标', 'logo', '海报', 'poster', '设计稿'],
  },
  {
    category: 'workflow',
    keywords: ['workflow', '工作流', '自动化编排', 'zapier', 'n8n', 'orchestrat', '定时任务'],
  },
  {
    category: 'coding',
    keywords: ['code', 'coding', '编程', '代码', '开发', 'debug', '重构', 'refactor', 'typescript', 'javascript', 'python', 'git', 'api', '程序员'],
  },
];

// ============ frontmatter ============

export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

/** 解析 Markdown 开头的扁平 YAML-ish frontmatter */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { data: {}, body: content };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: content.slice(match[0].length) };
}

// ============ 来源判定 ============

/**
 * 按绝对路径前缀判定来源类别。
 * personal / marketplace / plugin 优先于 builtin 判断，未匹配路径保守归为 builtin。
 */
export function classifyOrigin(absolutePath: string, sources: SkillSources): SkillOrigin {
  if (absolutePath.startsWith(sources.vaultSkillsDir)) return 'vault';
  if (absolutePath.startsWith(sources.userSkillsDir)) return 'personal';
  if (absolutePath.startsWith(sources.marketplaceSkillsDir)) return 'marketplace';
  if (absolutePath.startsWith(sources.pluginsRoot)) return 'plugin';
  return 'builtin';
}

// ============ 职能自动分类 ============

function hasNonAscii(text: string): boolean {
  return Array.from(text).some((ch) => ch.charCodeAt(0) > 127);
}

/** 关键词命中：纯 ASCII 用词边界（避免 api 误命中 rapid），含中文的用包含匹配 */
function keywordMatches(haystack: string, keyword: string): boolean {
  if (hasNonAscii(keyword)) {
    return haystack.includes(keyword.toLowerCase());
  }
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
}

/** 根据名称、描述与正文关键词自动归类职能；无匹配归入 other */
export function classifyFunction(input: { name: string; description: string; text?: string }): SkillFunction {
  const haystack = `${input.name} ${input.description} ${input.text ?? ''}`.toLowerCase();
  for (const rule of FUNCTION_KEYWORDS) {
    if (rule.keywords.some((kw) => keywordMatches(haystack, kw))) {
      return rule.category;
    }
  }
  return 'other';
}

// ============ 跨来源发现 ============

const PERSONA_TYPES = ['code', 'work', 'design'];

/** 扫描某 skills 根目录下的直接技能子目录（每个含 SKILL.md） */
function scanSkillDir(
  fs: SkillFs,
  skillsDir: string,
  origin: SkillOrigin,
  tool: string,
): RawSkill[] {
  const result: RawSkill[] = [];
  for (const entry of fs.listDir(skillsDir)) {
    const skillMd = `${skillsDir}/${entry}/SKILL.md`;
    const raw = fs.read(skillMd);
    if (raw === null) continue;
    const { data, body } = parseFrontmatter(raw);
    result.push({
      name: data.name || entry,
      description: data.description ?? '',
      version: data.version ?? '',
      sourcePath: skillMd,
      origin,
      tool,
      source: data.source,
      raw,
      body,
    });
  }
  return result;
}

/** 跨全部来源发现技能副本；缺失目录贡献零条目不报错 */
export function discoverSkillFiles(fs: SkillFs, sources: SkillSources): RawSkill[] {
  const out: RawSkill[] = [];

  // 保险箱（Hub skills/<name>/SKILL.md）
  out.push(...scanSkillDir(fs, sources.vaultSkillsDir, 'vault', 'hub'));

  // 个人自建（~/.trae-cn/skills）
  out.push(...scanSkillDir(fs, sources.userSkillsDir, 'personal', 'trae'));

  // 官方内置：全局技能
  out.push(...scanSkillDir(fs, `${sources.builtinRoot}/global/skills`, 'builtin', 'trae'));

  // 官方内置：builtin_skills
  out.push(...scanSkillDir(fs, sources.builtinSkillsDir, 'builtin', 'trae'));

  // 官方内置：persona 捆绑技能（builtin/code|work|design/<persona>/skills）
  for (const type of PERSONA_TYPES) {
    const typeDir = `${sources.builtinRoot}/${type}`;
    for (const persona of fs.listDir(typeDir)) {
      out.push(...scanSkillDir(fs, `${typeDir}/${persona}/skills`, 'builtin', 'trae'));
    }
  }

  // 插件自带（plugins/<org>/<plugin>/<version>/skills）
  for (const org of fs.listDir(sources.pluginsRoot)) {
    const orgDir = `${sources.pluginsRoot}/${org}`;
    for (const plugin of fs.listDir(orgDir)) {
      const pluginDir = `${orgDir}/${plugin}`;
      for (const version of fs.listDir(pluginDir)) {
        out.push(...scanSkillDir(fs, `${pluginDir}/${version}/skills`, 'plugin', 'trae'));
      }
    }
  }

  // 市场安装（CodeBuddy skills-marketplace/skills）
  out.push(...scanSkillDir(fs, sources.marketplaceSkillsDir, 'marketplace', 'codebuddy'));

  // 符号链接场景：同一物理文件只保留一条（优先保留 vault/保险箱来源）
  const deduped = dedupeByRealPath(out, fs);

  // 依据真实路径再校验一次来源（防御性，保持与路径一致）
  for (const skill of deduped) {
    skill.origin = classifyOrigin(skill.sourcePath, sources);
  }
  return deduped;
}

/**
 * 按真实路径去重（符号链接场景：hub/skills 与 ~/.trae-cn/skills 互为链接时，
 * 同一 SKILL.md 会被扫描两次）。同真实路径只保留一条，vault 来源优先。
 * fs 未实现 realpath 时原样返回。
 */
function dedupeByRealPath(raws: RawSkill[], fs: SkillFs): RawSkill[] {
  if (typeof fs.realpath !== 'function') return raws;

  const byRealPath = new Map<string, RawSkill>();
  const keyOf = new Map<RawSkill, string>();
  for (const raw of raws) {
    let key = raw.sourcePath;
    try {
      key = fs.realpath(raw.sourcePath);
    } catch {
      // 解析失败按原路径处理
    }
    keyOf.set(raw, key);
    const current = byRealPath.get(key);
    if (!current || ORIGIN_PRIORITY[raw.origin] < ORIGIN_PRIORITY[current.origin]) {
      byRealPath.set(key, raw);
    }
  }
  return raws.filter((raw) => byRealPath.get(keyOf.get(raw) ?? '') === raw);
}

// ============ 同名去重 ============

const ORIGIN_PRIORITY: Record<SkillOrigin, number> = {
  vault: 0,
  personal: 1,
  plugin: 2,
  marketplace: 3,
  builtin: 4,
};

/** 正文兜底分类时只取开头部分，降低长文档里偶然提及关键词的噪声 */
const BODY_FALLBACK_LIMIT = 400;

/**
 * 同名技能（小写比较）合并为一个主条目。
 * 主副本来源按 vault > personal > plugin > marketplace > builtin 选取，同优先级取路径靠前。
 * 其余副本绝对路径计入 variants。
 * 分类优先级：手动覆盖 > AI 缓存（aiLookup 命中）> 关键词规则。
 */
export function dedupeSkills(
  raws: RawSkill[],
  overrides: Record<string, SkillFunction>,
  aiLookup?: AiCacheLookup,
): SkillInfo[] {
  const groups = new Map<string, RawSkill[]>();
  for (const raw of raws) {
    const key = raw.name.toLowerCase();
    const bucket = groups.get(key);
    if (bucket) bucket.push(raw);
    else groups.set(key, [raw]);
  }

  const skills: SkillInfo[] = [];
  for (const [key, copies] of groups) {
    const sorted = [...copies].sort((a, b) => {
      const rank = ORIGIN_PRIORITY[a.origin] - ORIGIN_PRIORITY[b.origin];
      if (rank !== 0) return rank;
      return a.sourcePath.localeCompare(b.sourcePath);
    });
    const primary = sorted[0];
    const variants = sorted.slice(1).map((c) => c.sourcePath);
    const overridden = Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : undefined;

    // 分类优先级：手动覆盖 > AI 缓存命中 > 关键词规则（描述缺失才取正文兜底）
    const aiCategory = overridden === undefined && aiLookup ? aiLookup(primary.raw) : undefined;
    const hasAi = aiCategory !== undefined && aiCategory !== null;
    const bodyFallback = !hasAi && !primary.description
      ? primary.body.slice(0, BODY_FALLBACK_LIMIT)
      : '';

    let functionCategory: SkillFunction;
    let functionSource: SkillFunctionSource;
    if (overridden !== undefined) {
      functionCategory = overridden;
      functionSource = 'manual';
    } else if (hasAi) {
      functionCategory = aiCategory as SkillFunction;
      functionSource = 'ai';
    } else {
      functionCategory = classifyFunction({ name: primary.name, description: primary.description, text: bodyFallback });
      functionSource = 'keyword';
    }

    skills.push({
      id: key,
      name: primary.name,
      description: primary.description,
      functionCategory,
      origin: primary.origin,
      tool: primary.tool,
      sourcePath: primary.sourcePath,
      version: primary.version,
      functionSource,
      source: primary.origin === 'vault' ? primary.source : undefined,
      variants,
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

// ============ 聚合 ============

function emptyFunctionCounts(): Record<SkillFunction, number> {
  const obj = {} as Record<SkillFunction, number>;
  for (const f of SKILL_FUNCTIONS) obj[f] = 0;
  return obj;
}

function emptyOriginCounts(): Record<SkillOrigin, number> {
  const obj = {} as Record<SkillOrigin, number>;
  for (const o of SKILL_ORIGINS) obj[o] = 0;
  return obj;
}

function buildAll(fs: SkillFs, sources: SkillSources, store: SkillOverrideStore, aiLookup?: AiCacheLookup): SkillInfo[] {
  const raws = discoverSkillFiles(fs, sources);
  return dedupeSkills(raws, store.load(), aiLookup);
}

export function listSkills(input: {
  fs: SkillFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  /** AI 缓存查询（可选）：命中则分类来源为 ai，缺省时全部走关键词兜底 */
  aiLookup?: AiCacheLookup;
  params?: ListSkillsParams;
}): ListSkillsResult {
  const { fs, sources, store, aiLookup, params = {} } = input;

  if (params.function && !SKILL_FUNCTIONS.includes(params.function)) {
    throw new Error(`无效职能：${params.function}，支持：${SKILL_FUNCTIONS.join(', ')}`);
  }
  if (params.origin && !SKILL_ORIGINS.includes(params.origin)) {
    throw new Error(`无效来源：${params.origin}，支持：${SKILL_ORIGINS.join(', ')}`);
  }

  const all = buildAll(fs, sources, store, aiLookup);

  // 计数始终反映全貌（不受筛选影响）
  const countByFunction = emptyFunctionCounts();
  const countByOrigin = emptyOriginCounts();
  for (const s of all) {
    countByFunction[s.functionCategory] += 1;
    countByOrigin[s.origin] += 1;
  }

  let items = all;
  if (params.function) items = items.filter((s) => s.functionCategory === params.function);
  if (params.origin) items = items.filter((s) => s.origin === params.origin);
  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    items = items.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }

  return { items, total: all.length, countByFunction, countByOrigin };
}

// ============ 手动覆盖 ============

/**
 * 覆盖某技能的职能分类并持久化。
 * @returns 更新后的主条目；技能不存在返回 null；function 非法抛错
 */
export function overrideSkillFunction(
  id: string,
  functionCategory: SkillFunction,
  input: { fs: SkillFs; sources: SkillSources; store: SkillOverrideStore; aiLookup?: AiCacheLookup },
): SkillInfo | null {
  if (!SKILL_FUNCTIONS.includes(functionCategory)) {
    throw new Error(`无效职能：${functionCategory}，支持：${SKILL_FUNCTIONS.join(', ')}`);
  }
  const key = id.toLowerCase();
  const { fs, sources, store, aiLookup } = input;
  const all = buildAll(fs, sources, store, aiLookup);
  const target = all.find((s) => s.id === key);
  if (!target) return null;

  const overrides = store.load();
  overrides[key] = functionCategory;
  store.save(overrides);

  return { ...target, functionCategory, functionSource: 'manual' };
}

/** 批量覆盖结果：updated 为更新后的条目，missing 为磁盘上已不存在的 id（原样返回） */
export interface BatchOverrideResult {
  updated: SkillInfo[];
  missing: string[];
}

/**
 * 批量覆盖多个技能的职能分类并一次性持久化。
 * id 大小写不敏感；已不存在的 id 计入 missing，不影响其余；
 * 全部 missing（或空列表）时不写存储。
 * @throws functionCategory 非法时抛错（不写存储）
 */
export function overrideSkillFunctionsBatch(
  ids: string[],
  functionCategory: SkillFunction,
  input: { fs: SkillFs; sources: SkillSources; store: SkillOverrideStore; aiLookup?: AiCacheLookup },
): BatchOverrideResult {
  if (!SKILL_FUNCTIONS.includes(functionCategory)) {
    throw new Error(`无效职能：${functionCategory}，支持：${SKILL_FUNCTIONS.join(', ')}`);
  }
  const { fs, sources, store, aiLookup } = input;
  const all = buildAll(fs, sources, store, aiLookup);
  const byId = new Map(all.map((s) => [s.id, s]));

  const targets: SkillInfo[] = [];
  const missing: string[] = [];
  for (const rawId of ids) {
    const skill = byId.get(rawId.toLowerCase());
    if (skill) targets.push(skill);
    else missing.push(rawId);
  }

  if (targets.length > 0) {
    const overrides = store.load();
    for (const t of targets) overrides[t.id] = functionCategory;
    store.save(overrides);
  }

  return {
    updated: targets.map((t) => ({ ...t, functionCategory, functionSource: 'manual' })),
    missing,
  };
}

// ============ 单个技能原文 ============

/**
 * 按 id 读取单个技能的元信息与主副本 SKILL.md 原文。
 * 路径来自扫描结果而非请求参数，避免路径穿越。
 * @returns 不存在时返回 null
 */
export function getSkillRawContent(
  id: string,
  input: { fs: SkillFs; sources: SkillSources; store: SkillOverrideStore; aiLookup?: AiCacheLookup },
): { skill: SkillInfo; rawContent: string } | null {
  const { fs, sources, store, aiLookup } = input;
  const all = buildAll(fs, sources, store, aiLookup);
  const skill = all.find((s) => s.id === id.toLowerCase());
  if (!skill) return null;
  return { skill, rawContent: fs.read(skill.sourcePath) ?? '' };
}
