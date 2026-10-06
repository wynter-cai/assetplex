/**
 * OpenAI 兼容 LLM 客户端（LlmClient 的 Node fetch 实现）
 *
 * POST {baseUrl}/chat/completions，Bearer 鉴权，非流式。
 * 默认 thinking.type=disabled：火山方舟 doubao-seed-2.x 系列默认开启深度思考，
 * 九分类闭集任务不需要思维链，思考延迟在并发下会撞超时；该字段是方舟 Chat API
 * 扩展参数，标准 OpenAI 兼容服务对未知字段通常忽略。
 * 429 限流按指数退避自动重试（优先采用 Retry-After），实测 Agent Plan 账号级
 * 频率墙是瞬态的；其他非 2xx / 结构错误 / 超时不重试，直接抛出计入 failed。
 */

import type { LlmClient } from '../../core/skill-ai-classification.js';
import type { AiClassifyConfig } from '../../core/ai-config.js';

/** 默认请求超时（分类是小任务，30s 足够） */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 429 默认重试次数（初次 + 5 次重试，覆盖账号级限流冷却窗口） */
const DEFAULT_MAX_RETRIES = 5;
/** 指数退避基数：1s → 2s → 4s */
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
/** 单次退避上限（Retry-After 特别大时兜底） */
const MAX_RETRY_DELAY_MS = 30_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/** 重试策略（测试可注入 sleep 与参数） */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 解析 Retry-After：仅支持数字秒形式，缺失/非法返回 null */
function parseRetryAfterMs(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number(header.trim()) * 1000;
}

/** 创建 OpenAI 兼容客户端 */
export function createOpenAiLlmClient(
  config: AiClassifyConfig,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retry: RetryOptions = {
    maxRetries: DEFAULT_MAX_RETRIES,
    baseDelayMs: DEFAULT_RETRY_BASE_DELAY_MS,
    sleep: realSleep,
  },
): LlmClient {
  return {
    async chat(input: { system: string; user: string }): Promise<string> {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const body = JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        temperature: 0,
        stream: false,
        thinking: { type: 'disabled' },
      });

      let lastError = '';
      for (let attempt = 0; attempt <= retry.maxRetries; attempt += 1) {
        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          throw new Error(`LLM 请求失败：${err instanceof Error ? err.message : String(err)}`);
        }

        if (res.status === 429 && attempt < retry.maxRetries) {
          const retryAfter = parseRetryAfterMs(res.headers.get('Retry-After'));
          const backoff = Math.min(
            retryAfter ?? retry.baseDelayMs * 2 ** attempt,
            MAX_RETRY_DELAY_MS,
          );
          await retry.sleep(backoff);
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          lastError = `LLM 返回 ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`;
          throw new Error(lastError);
        }

        const json = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
          throw new Error('LLM 响应缺少 choices[0].message.content');
        }
        return content;
      }
      throw new Error(lastError);
    },
  };
}
