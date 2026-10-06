/**
 * AI 智能分类核心纯逻辑
 *
 * 显式触发：对目标技能（单条/批量/缺省全部非手动覆盖）调用 LLM，
 * 按 9 职能闭集归类。结果按 SKILL.md 原文 sha256 写入内容缓存：
 * 命中缓存的技能不再调 LLM，同内容跨技能复用，内容变更后自然失效。
 *
 * 失败隔离：单条失败（网络/解析/闭集外输出）只进 failed 明细，
 * 不写缓存、不中断批量。手动覆盖的技能永不参与 AI 分类。
 *
 * 纯逻辑：文件系统（SkillFs）、覆盖存储（SkillOverrideStore）、
 * 缓存（AiClassifyCacheStore）、LLM（LlmClient）全部注入。
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 */

import {
  SKILL_FUNCTIONS,
  listSkills,
  type SkillFs,
  type SkillFunction,
  type SkillInfo,
  type SkillOverrideStore,
  type SkillSources,
} from './skills-inventory.js';
import { isAiConfigComplete, type AiClassifyConfig } from './ai-config.js';
import {
  getCachedByHash,
  hashSkillContent,
  saveCacheEntry,
  type AiClassifyCacheStore,
} from './skill-ai-cache.js';

// ============ 依赖抽象 ============

/** LLM 客户端抽象（Node 实现走 OpenAI 兼容 /chat/completions） */
export interface LlmClient {
  chat(input: { system: string; user: string }): Promise<string>;
}

/** AI 配置不完整专用错误（路由层映射为 400 提示先完成配置） */
export class AiConfigIncompleteError extends Error {
  constructor() {
    super('AI 配置不完整，请先在设置中配置 baseUrl、apiKey 与 model');
    this.name = 'AiConfigIncompleteError';
  }
}

// ============ prompt ============

/** 分类闭集定义（进 system 提示词，约束小模型输出） */
const CATEGORY_DEFINITIONS: Array<{ category: SkillFunction; hint: string }> = [
  { category: 'coding', hint: '编程开发：写代码、调试、重构、代码审查' },
  { category: 'writing', hint: '文档写作：文档、文章、翻译、PPT/Word/PDF 处理' },
  { category: 'browser', hint: '浏览器自动化：网页操作、爬取、端到端测试' },
  { category: 'data', hint: '数据处理：表格、SQL、数据清洗与分析' },
  { category: 'devops', hint: '部署运维：CI/CD、容器、云资源、监控' },
  { category: 'ai-integration', hint: 'AI/LLM 集成：调用模型、RAG、Agent 编排接入' },
  { category: 'design', hint: '设计：UI 设计稿、图标、海报、视觉素材' },
  { category: 'workflow', hint: '工作流自动化：任务编排、定时任务、跨应用流程' },
  { category: 'other', hint: '其他：不属于以上任何类别' },
];

/** 正文进 prompt 的截断上限（控制 token，长文档关键词噪声也低） */
const BODY_PROMPT_LIMIT = 2000;

/** 构造分类 prompt（导出便于测试约束内容） */
export function buildClassifyPrompt(input: {
  name: string;
  description: string;
  rawContent: string;
}): { system: string; user: string } {
  const system = [
    '你是技能分类器。把给定的技能归入以下九个分类之一：',
    ...CATEGORY_DEFINITIONS.map((d) => `- ${d.category}：${d.hint}`),
    '只输出 JSON：{"category":"<分类>"}，不要输出任何其他内容。',
  ].join('\n');
  const user = [
    `技能名：${input.name}`,
    `描述：${input.description}`,
    `正文：`,
    input.rawContent.slice(0, BODY_PROMPT_LIMIT),
  ].join('\n');
  return { system, user };
}

/** 解析 LLM 输出为分类：容忍代码块/前后杂文，严格校验闭集 */
export function parseCategoryOutput(output: string): SkillFunction {
  const trimmed = output.trim();
  let jsonText = trimmed;
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed);
  if (fenced) jsonText = fenced[1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // 宽松兜底：提取第一个 {...} 对象再试
    const brace = /\{[^{}]*\}/.exec(jsonText);
    if (!brace) throw new Error('输出无法解析为 JSON');
    try {
      parsed = JSON.parse(brace[0]);
    } catch {
      throw new Error('输出无法解析为 JSON');
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('输出无法解析为 JSON');
  }
  const category = (parsed as Record<string, unknown>).category;
  if (typeof category !== 'string' || !(SKILL_FUNCTIONS as string[]).includes(category)) {
    throw new Error(`输出分类不合法：${String(category)}`);
  }
  return category as SkillFunction;
}

// ============ 分类执行 ============

export interface AiClassifyFailureItem {
  id: string;
  name: string;
  error: string;
}

export interface AiClassifyResult {
  /** 分类成功的技能（已应用 AI 结果，functionSource 为 'ai'） */
  classified: SkillInfo[];
  /** 其中直接命中内容缓存、未实际调用 LLM 的条数 */
  cacheHits: number;
  /** 已手动覆盖被跳过的技能（不消耗 LLM 调用） */
  skipped: Array<{ id: string; name: string }>;
  /** 失败明细（技能不存在 / 网络错误 / 输出不合法 / 输出无法解析），失败不写缓存 */
  failed: AiClassifyFailureItem[];
}

export interface ClassifySkillsDeps {
  fs: SkillFs;
  sources: SkillSources;
  /** 手动覆盖存储（用于识别手动覆盖技能与盘点） */
  store: SkillOverrideStore;
  cache: AiClassifyCacheStore;
  llm: LlmClient;
  /** 完整配置由调用方读取后传入；缺省或不完整时抛 AiConfigIncompleteError */
  config?: AiClassifyConfig;
  /** 缓存条目时间戳来源，测试可注入 */
  now?: () => string;
  /** 并发上限，缺省 4 */
  concurrency?: number;
}

/** 简单并发池：worker 永不 reject（内部已捕获），保持结果顺序 */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

/**
 * 执行 AI 分类（部分成功语义）。
 * @param input.ids 目标技能 id；缺省 = 全部非手动覆盖技能
 * @throws AiConfigIncompleteError 配置缺失或不完整时（不发起任何 LLM 调用）
 */
export async function classifySkillsWithAi(
  input: { ids?: string[] },
  deps: ClassifySkillsDeps,
): Promise<AiClassifyResult> {
  if (!deps.config || !isAiConfigComplete(deps.config)) {
    throw new AiConfigIncompleteError();
  }

  const all = listSkills({ fs: deps.fs, sources: deps.sources, store: deps.store }).items;
  const byId = new Map(all.map((s) => [s.id, s]));

  // 解析目标：ids 缺省取全部非手动覆盖；显式 ids 里手动覆盖的进 skipped
  const targets: SkillInfo[] = [];
  const skipped: Array<{ id: string; name: string }> = [];
  const failed: AiClassifyFailureItem[] = [];

  if (input.ids === undefined) {
    for (const skill of all) {
      if (skill.functionSource !== 'manual') targets.push(skill);
    }
  } else {
    for (const rawId of input.ids) {
      const skill = byId.get(rawId.toLowerCase());
      if (!skill) {
        failed.push({ id: rawId, name: rawId, error: `技能不存在：${rawId}` });
      } else if (skill.functionSource === 'manual') {
        skipped.push({ id: skill.id, name: skill.name });
      } else {
        targets.push(skill);
      }
    }
  }

  const result: AiClassifyResult = { classified: [], cacheHits: 0, skipped, failed };
  if (targets.length === 0) return result;

  const { system } = buildClassifyPrompt({ name: '', description: '', rawContent: '' });
  const now = deps.now ?? (() => new Date().toISOString());
  const model = deps.config.model;

  await runPool(targets, deps.concurrency ?? 4, async (skill) => {
    const rawContent = deps.fs.read(skill.sourcePath) ?? '';
    const hash = hashSkillContent(rawContent);

    // 缓存命中：不调 LLM，直接应用
    const cached = getCachedByHash(deps.cache, hash);
    if (cached) {
      result.cacheHits += 1;
      result.classified.push({ ...skill, functionCategory: cached.category, functionSource: 'ai' });
      return;
    }

    const { user } = buildClassifyPrompt({ name: skill.name, description: skill.description, rawContent });
    try {
      const output = await deps.llm.chat({ system, user });
      const category = parseCategoryOutput(output);
      saveCacheEntry(deps.cache, hash, { category, model, classifiedAt: now() });
      result.classified.push({ ...skill, functionCategory: category, functionSource: 'ai' });
    } catch (err) {
      result.failed.push({ id: skill.id, name: skill.name, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 稳定输出顺序（并发完成序不定）
  const byName = (a: SkillInfo, b: SkillInfo) => a.name.localeCompare(b.name);
  result.classified.sort(byName);
  result.failed.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
