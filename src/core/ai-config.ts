/**
 * AI 分类配置存取纯逻辑
 *
 * OpenAI 兼容配置三项（baseUrl/apiKey/model），由注入的 AiConfigStore 持久化
 * （Node 实现读写 ~/.assetplex/ai-config.json）。读取视图脱敏：apiKey 只回传
 * 是否已配置（hasApiKey），明文永不离开本机文件。
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 */

/** OpenAI 兼容分类配置（服务端内部形态，含明文 apiKey） */
export interface AiClassifyConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** AI 配置文件存储抽象（Node 实现读写 ai-config.json） */
export interface AiConfigStore {
  load(): Partial<AiClassifyConfig>;
  save(config: AiClassifyConfig): void;
}

/** 脱敏配置视图（对 API / UI 暴露的形态） */
export interface AiConfigView {
  baseUrl: string;
  model: string;
  /** 是否已配置 apiKey（明文永不回传） */
  hasApiKey: boolean;
}

/** 保存入参：apiKey 缺省表示保留已存值 */
export interface SaveAiConfigInput {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/** 读取完整配置；存储缺失时返回空配置，不抛错 */
export function loadAiClassifyConfig(store: AiConfigStore): AiClassifyConfig {
  const raw = store.load();
  return {
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    model: typeof raw.model === 'string' ? raw.model : '',
  };
}

/** 校验 baseUrl：非空且为 http(s) URL */
function validateBaseUrl(baseUrl: string): void {
  if (!baseUrl.trim()) throw new Error('baseUrl 不能为空');
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`baseUrl 不是合法 URL：${baseUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`baseUrl 协议必须是 http/https：${baseUrl}`);
  }
}

/** 校验并保存配置；返回脱敏视图。任何校验失败都不写存储 */
export function saveAiClassifyConfig(store: AiConfigStore, input: SaveAiConfigInput): AiConfigView {
  validateBaseUrl(input.baseUrl);
  if (!input.model.trim()) throw new Error('model 不能为空');

  const current = loadAiClassifyConfig(store);
  const apiKey = input.apiKey === undefined || input.apiKey === '' ? current.apiKey : input.apiKey;
  if (!apiKey.trim()) throw new Error('apiKey 不能为空（首次保存必须提供）');

  const next: AiClassifyConfig = {
    baseUrl: input.baseUrl.trim(),
    apiKey,
    model: input.model.trim(),
  };
  store.save(next);
  return toAiConfigView(next);
}

/** 转脱敏视图（apiKey 只回传存在性） */
export function toAiConfigView(config: AiClassifyConfig): AiConfigView {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: config.apiKey.trim() !== '',
  };
}

/** 配置是否完整（三项齐备），触发分类前检查用 */
export function isAiConfigComplete(config: AiClassifyConfig): boolean {
  return config.baseUrl.trim() !== '' && config.apiKey.trim() !== '' && config.model.trim() !== '';
}
