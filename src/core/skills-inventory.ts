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

export type SkillOrigin = 'builtin' | 'plugin' | 'personal' | 'marketplace';

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
  functionOverridden: boolean;
  /** 其他副本 SKILL.md 绝对路径 */
  variants: string[];
}

/** 文件系统抽象（只读，与 AgentFs 结构兼容） */
export interface SkillFs {
  read(absolutePath: string): string | null;
  listDir(absolutePath: string): string[];
  dirMtime(absolutePath: string): string | null;
}

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

export const SKILL_ORIGINS: SkillOrigin[] = ['builtin', 'plugin', 'personal', 'marketplace'];

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

interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

/** 解析 Markdown 开头的扁平 YAML-ish frontmatter */
function parseFrontmatter(content: string): ParsedFrontmatter {
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
      body,
    });
  }
  return result;
}

/** 跨全部来源发现技能副本；缺失目录贡献零条目不报错 */
export function discoverSkillFiles(fs: SkillFs, sources: SkillSources): RawSkill[] {
  const out: RawSkill[] = [];

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

  // 依据真实路径再校验一次来源（防御性，保持与路径一致）
  for (const skill of out) {
    skill.origin = classifyOrigin(skill.sourcePath, sources);
  }
  return out;
}

// ============ 同名去重 ============

const ORIGIN_PRIORITY: Record<SkillOrigin, number> = {
  personal: 0,
  plugin: 1,
  marketplace: 2,
  builtin: 3,
};

/** 正文兜底分类时只取开头部分，降低长文档里偶然提及关键词的噪声 */
const BODY_FALLBACK_LIMIT = 400;

/**
 * 同名技能（小写比较）合并为一个主条目。
 * 主副本来源按 personal > plugin > marketplace > builtin 选取，同优先级取路径靠前。
 * 其余副本绝对路径计入 variants。
 */
export function dedupeSkills(raws: RawSkill[], overrides: Record<string, SkillFunction>): SkillInfo[] {
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

    // 有描述时以名称+描述分类；描述缺失时才取正文开头兜底
    const bodyFallback = primary.description ? '' : primary.body.slice(0, BODY_FALLBACK_LIMIT);

    skills.push({
      id: key,
      name: primary.name,
      description: primary.description,
      functionCategory:
        overridden ??
        classifyFunction({ name: primary.name, description: primary.description, text: bodyFallback }),
      origin: primary.origin,
      tool: primary.tool,
      sourcePath: primary.sourcePath,
      version: primary.version,
      functionOverridden: overridden !== undefined,
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

function buildAll(fs: SkillFs, sources: SkillSources, store: SkillOverrideStore): SkillInfo[] {
  const raws = discoverSkillFiles(fs, sources);
  return dedupeSkills(raws, store.load());
}

export function listSkills(input: {
  fs: SkillFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  params?: ListSkillsParams;
}): ListSkillsResult {
  const { fs, sources, store, params = {} } = input;

  if (params.function && !SKILL_FUNCTIONS.includes(params.function)) {
    throw new Error(`无效职能：${params.function}，支持：${SKILL_FUNCTIONS.join(', ')}`);
  }
  if (params.origin && !SKILL_ORIGINS.includes(params.origin)) {
    throw new Error(`无效来源：${params.origin}，支持：${SKILL_ORIGINS.join(', ')}`);
  }

  const all = buildAll(fs, sources, store);

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
  input: { fs: SkillFs; sources: SkillSources; store: SkillOverrideStore },
): SkillInfo | null {
  if (!SKILL_FUNCTIONS.includes(functionCategory)) {
    throw new Error(`无效职能：${functionCategory}，支持：${SKILL_FUNCTIONS.join(', ')}`);
  }
  const key = id.toLowerCase();
  const { fs, sources, store } = input;
  const all = buildAll(fs, sources, store);
  const target = all.find((s) => s.id === key);
  if (!target) return null;

  const overrides = store.load();
  overrides[key] = functionCategory;
  store.save(overrides);

  return { ...target, functionCategory, functionOverridden: true };
}

// ============ 单个技能原文 ============

/**
 * 按 id 读取单个技能的元信息与主副本 SKILL.md 原文。
 * 路径来自扫描结果而非请求参数，避免路径穿越。
 * @returns 不存在时返回 null
 */
export function getSkillRawContent(
  id: string,
  input: { fs: SkillFs; sources: SkillSources; store: SkillOverrideStore },
): { skill: SkillInfo; rawContent: string } | null {
  const { fs, sources, store } = input;
  const all = buildAll(fs, sources, store);
  const skill = all.find((s) => s.id === id.toLowerCase());
  if (!skill) return null;
  return { skill, rawContent: fs.read(skill.sourcePath) ?? '' };
}
