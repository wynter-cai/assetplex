/**
 * API 契约：AI 智能分类（add-skill-ai-classification）
 *
 * 前后端共用类型。AI 分类 = 显式触发 LLM 按 9 职能闭集归类，
 * 结果按 SKILL.md 内容 sha256 缓存；盘点时按 手动 > AI > 关键词 应用。
 */

import type { SkillInfo, SkillFunction } from '../../web/src/types/api.js';

/** SkillInfo 扩展：分类来源（本变更新增，替换 functionOverridden 布尔字段） */
export type SkillFunctionSource = 'manual' | 'ai' | 'keyword';

/** 修改后的 SkillInfo 形态（本变更落地后 web/src/types/api.ts 同步） */
export interface SkillInfoWithSource extends SkillInfo {
  /** 分类来源：手动覆盖 / AI / 关键词兜底 */
  functionSource: SkillFunctionSource;
}

/** GET /api/skills/ai-classify/config 响应（apiKey 脱敏，不回传明文） */
export interface AiClassifyConfigResponse {
  baseUrl: string;
  model: string;
  /** 是否已配置 apiKey（明文永不回传） */
  hasApiKey: boolean;
}

/** PUT /api/skills/ai-classify/config 请求体 */
export interface SaveAiClassifyConfigRequest {
  /** OpenAI 兼容根地址，如 https://api.example.com/v1（必须是合法 URL） */
  baseUrl: string;
  /** API Key；缺省（undefined）表示保留已存值，传空字符串视为未提供（校验失败） */
  apiKey?: string;
  /** 模型名，Lite 级小模型即可 */
  model: string;
}

/** PUT /api/skills/ai-classify/config 响应（200，同 GET 形态） */
export type SaveAiClassifyConfigResponse = AiClassifyConfigResponse;

/** POST /api/skills/ai-classify 请求体 */
export interface AiClassifyRequest {
  /** 目标技能 id 列表；缺省 = 全部非手动覆盖技能 */
  ids?: string[];
}

/** AI 分类中单条失败明细 */
export interface AiClassifyFailure {
  id: string;
  /** 技能名（便于用户识别） */
  name: string;
  /** 失败原因：网络错误 / 鉴权失败 / 输出不合法 / 输出无法解析 等 */
  error: string;
}

/** POST /api/skills/ai-classify 响应（200，部分成功语义） */
export interface AiClassifyResponse {
  /** 分类成功的技能（已应用 AI 结果，functionSource 为 'ai'） */
  classified: SkillInfoWithSource[];
  /** 其中直接命中内容 hash 缓存、未实际调用 LLM 的条数 */
  cacheHits: number;
  /** 已手动覆盖被跳过的技能（不消耗 LLM 调用） */
  skipped: Array<{ id: string; name: string }>;
  /** 失败明细（网络/鉴权/输出不合法等），失败不写缓存 */
  failed: AiClassifyFailure[];
}

/** 错误响应格式（与既有接口一致）：{ error: string }，status 400/404/500 */
/** 配置未就绪时触发分类：400，error 提示先完成配置 */

/**
 * 路由一览（挂在既有 /api/skills 下，注意注册在 /:id 之前）
 * - GET  /api/skills/ai-classify/config        读取配置（脱敏）
 * - PUT  /api/skills/ai-classify/config        保存配置（apiKey 缺省保留旧值）
 * - POST /api/skills/ai-classify               执行分类（ids 缺省 = 全部非手动覆盖）
 *
 * 盘点 GET /api/skills 响应变化：SkillInfo.functionOverridden:boolean
 * 替换为 functionSource:'manual'|'ai'|'keyword'，分类优先级 手动 > AI(缓存命中) > 关键词。
 */
export type { SkillFunction };
