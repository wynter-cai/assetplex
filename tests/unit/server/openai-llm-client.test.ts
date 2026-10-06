/**
 * OpenAI 兼容 LLM 客户端测试
 *
 * 关键约束：火山方舟 doubao-seed-2.x 系列默认开启深度思考，分类闭集任务
 * 不需要思考链（并发下思考延迟会撞 30s 超时），请求体必须显式
 * thinking.type=disabled（方舟 Chat API 扩展字段，OpenAI 兼容服务会忽略未知字段）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOpenAiLlmClient } from '../../../src/server/lib/openai-llm-client.js';
import type { AiClassifyConfig } from '../../../src/core/ai-config.js';

const config: AiClassifyConfig = {
  baseUrl: 'https://ark.example.com/api/v3/',
  apiKey: 'test-key',
  model: 'doubao-test',
};

interface Capture {
  url?: string;
  init?: RequestInit;
  body?: Record<string, unknown>;
}

function mockFetchOk(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    (mockCapture as Capture).url = String(url);
    (mockCapture as Capture).init = init;
    (mockCapture as Capture).body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"category":"data"}' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const mockCapture: Capture = {};

describe('createOpenAiLlmClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST 到 baseUrl/chat/completions（去掉尾斜杠）并携带 Bearer 鉴权', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    await createOpenAiLlmClient(config).chat({ system: 's', user: 'u' });
    expect(mockCapture.url).toBe('https://ark.example.com/api/v3/chat/completions');
    const headers = mockCapture.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('请求体显式关闭深度思考 thinking.type=disabled，并带模型/消息/确定性参数', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    await createOpenAiLlmClient(config).chat({ system: 'sys', user: 'usr' });
    expect(mockCapture.body).toMatchObject({
      model: 'doubao-test',
      temperature: 0,
      stream: false,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'usr' },
      ],
    });
  });

  it('成功时返回 choices[0].message.content 文本', async () => {
    vi.stubGlobal('fetch', mockFetchOk());
    const out = await createOpenAiLlmClient(config).chat({ system: 's', user: 'u' });
    expect(out).toBe('{"category":"data"}');
  });

  it('非 2xx 响应抛出含 HTTP 状态码的错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unauthorized', { status: 401 })));
    await expect(createOpenAiLlmClient(config).chat({ system: 's', user: 'u' })).rejects.toThrow(/401/);
  });

  it('响应缺少 choices[0].message.content 时抛出结构错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );
    await expect(createOpenAiLlmClient(config).chat({ system: 's', user: 'u' })).rejects.toThrow(
      /choices/,
    );
  });

  // 测试注入：用记录式 sleep 避免真实等待
  const noWait = (ms: number): Promise<void> => {
    (noWait as unknown as { calls: number[] }).calls.push(ms);
    return Promise.resolve();
  };
  (noWait as unknown as { calls: number[] }).calls = [];
  const retryOpts = { maxRetries: 3, baseDelayMs: 100, sleep: noWait };

  const okResponse = (): Response =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"category":"data"}' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('429 限流时按指数退避重试，重试成功则返回内容', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    (noWait as unknown as { calls: number[] }).calls = [];

    const out = await createOpenAiLlmClient(config, 30000, retryOpts).chat({
      system: 's',
      user: 'u',
    });
    expect(out).toBe('{"category":"data"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((noWait as unknown as { calls: number[] }).calls).toEqual([100, 200]);
  });

  it('429 响应带 Retry-After（秒）时优先采用该等待时长', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '5' } }),
      )
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    (noWait as unknown as { calls: number[] }).calls = [];

    await createOpenAiLlmClient(config, 30000, retryOpts).chat({ system: 's', user: 'u' });
    expect((noWait as unknown as { calls: number[] }).calls).toEqual([5000]);
  });

  it('429 持续超过重试上限后抛出含 429 的错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    (noWait as unknown as { calls: number[] }).calls = [];

    await expect(
      createOpenAiLlmClient(config, 30000, retryOpts).chat({ system: 's', user: 'u' }),
    ).rejects.toThrow(/429/);
    // 初次 + 3 次重试 = 4 次调用，退避 3 次
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((noWait as unknown as { calls: number[] }).calls).toHaveLength(3);
  });

  it('400 类非 429 错误不重试', async () => {
    const fetchMock = vi.fn(async () => new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createOpenAiLlmClient(config, 30000, retryOpts).chat({ system: 's', user: 'u' }),
    ).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
