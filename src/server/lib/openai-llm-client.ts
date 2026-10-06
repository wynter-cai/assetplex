/**
 * OpenAI 兼容 LLM 客户端（LlmClient 的 Node fetch 实现）
 *
 * POST {baseUrl}/chat/completions，Bearer 鉴权，非流式。
 * 非 2xx / 响应结构不完整 / 超时都抛带上下文的 Error（由分类纯逻辑计入 failed）。
 */

import type { LlmClient } from '../../core/skill-ai-classification.js';
import type { AiClassifyConfig } from '../../core/ai-config.js';

/** 默认请求超时（分类是小任务，30s 足够） */
const DEFAULT_TIMEOUT_MS = 30_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/** 创建 OpenAI 兼容客户端 */
export function createOpenAiLlmClient(config: AiClassifyConfig, timeoutMs = DEFAULT_TIMEOUT_MS): LlmClient {
  return {
    async chat(input: { system: string; user: string }): Promise<string> {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
            temperature: 0,
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new Error(`LLM 请求失败：${err instanceof Error ? err.message : String(err)}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM 返回 ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`);
      }

      const body = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('LLM 响应缺少 choices[0].message.content');
      }
      return content;
    },
  };
}
