/**
 * AI 分类配置存取纯逻辑测试
 *
 * spec: 设计文档/changes/add-skill-ai-classification/specs/skill-ai-classification.spec.md
 * - 配置三项 baseUrl/apiKey/model，读取脱敏（hasApiKey），保存 apiKey 缺省保留旧值
 */

import { describe, expect, it } from 'vitest';
import {
  loadAiClassifyConfig,
  saveAiClassifyConfig,
  toAiConfigView,
  type AiClassifyConfig,
  type AiConfigStore,
} from '../../../src/core/ai-config.js';

/** 内存实现：模拟 JSON 文件读写 */
class MemoryAiConfigStore implements AiConfigStore {
  data: Partial<AiClassifyConfig> | null = null;
  saves = 0;

  load(): Partial<AiClassifyConfig> {
    return this.data ?? {};
  }

  save(config: AiClassifyConfig): void {
    this.data = config;
    this.saves += 1;
  }
}

describe('loadAiClassifyConfig', () => {
  it('从未保存过时返回空配置，不抛错', () => {
    const config = loadAiClassifyConfig(new MemoryAiConfigStore());
    expect(config).toEqual({ baseUrl: '', apiKey: '', model: '' });
  });

  it('保存后读取返回完整配置（含 apiKey，供服务端调用 LLM 使用）', () => {
    const store = new MemoryAiConfigStore();
    saveAiClassifyConfig(store, { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-xxx', model: 'lite' });
    expect(loadAiClassifyConfig(store)).toEqual({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-xxx',
      model: 'lite',
    });
  });
});

describe('saveAiClassifyConfig', () => {
  it('正常保存三项并返回脱敏视图（不回传 apiKey 明文）', () => {
    const store = new MemoryAiConfigStore();
    const view = saveAiClassifyConfig(store, {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-xxx',
      model: 'lite-model',
    });
    expect(view).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'lite-model', hasApiKey: true });
  });

  it('apiKey 缺省时保留已存值（合并语义）', () => {
    const store = new MemoryAiConfigStore();
    saveAiClassifyConfig(store, { baseUrl: 'https://a.com/v1', apiKey: 'sk-keep', model: 'm1' });
    const view = saveAiClassifyConfig(store, { baseUrl: 'https://b.com/v1', model: 'm2' });
    expect(view.hasApiKey).toBe(true);
    expect(loadAiClassifyConfig(store).apiKey).toBe('sk-keep');
    expect(loadAiClassifyConfig(store).baseUrl).toBe('https://b.com/v1');
  });

  it('首次保存且未提供 apiKey 时抛错（配置不完整）', () => {
    const store = new MemoryAiConfigStore();
    expect(() =>
      saveAiClassifyConfig(store, { baseUrl: 'https://a.com/v1', model: 'm1' }),
    ).toThrow(/apiKey/);
    expect(store.saves).toBe(0);
  });

  it('model 为空时抛错且不写入', () => {
    const store = new MemoryAiConfigStore();
    expect(() =>
      saveAiClassifyConfig(store, { baseUrl: 'https://a.com/v1', apiKey: 'sk-x', model: '  ' }),
    ).toThrow(/model/);
    expect(store.saves).toBe(0);
  });

  it('baseUrl 非法 URL 时抛错且不写入', () => {
    const store = new MemoryAiConfigStore();
    expect(() =>
      saveAiClassifyConfig(store, { baseUrl: 'not-a-url', apiKey: 'sk-x', model: 'm1' }),
    ).toThrow(/baseUrl/);
    expect(store.saves).toBe(0);
  });

  it('baseUrl 非 http(s) 协议时抛错', () => {
    const store = new MemoryAiConfigStore();
    expect(() =>
      saveAiClassifyConfig(store, { baseUrl: 'ftp://a.com/v1', apiKey: 'sk-x', model: 'm1' }),
    ).toThrow(/baseUrl/);
    expect(store.saves).toBe(0);
  });

  it('apiKey 为空字符串视为未提供：有旧值则保留旧值，无旧值则抛错', () => {
    const store = new MemoryAiConfigStore();
    saveAiClassifyConfig(store, { baseUrl: 'https://a.com/v1', apiKey: 'sk-old', model: 'm1' });
    saveAiClassifyConfig(store, { baseUrl: 'https://a.com/v1', apiKey: '', model: 'm1' });
    expect(loadAiClassifyConfig(store).apiKey).toBe('sk-old');

    const fresh = new MemoryAiConfigStore();
    expect(() =>
      saveAiClassifyConfig(fresh, { baseUrl: 'https://a.com/v1', apiKey: '', model: 'm1' }),
    ).toThrow(/apiKey/);
  });
});

describe('toAiConfigView', () => {
  it('未配置时 hasApiKey=false', () => {
    expect(toAiConfigView({ baseUrl: '', apiKey: '', model: '' })).toEqual({
      baseUrl: '',
      model: '',
      hasApiKey: false,
    });
  });
});
