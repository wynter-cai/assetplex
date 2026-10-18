/**
 * AI 分类配置与内容缓存的 Node JSON 文件实现
 *
 * ai-config.json（baseUrl/apiKey/model，明文本机保存）与
 * skill-ai-classifications.json（Record<内容 sha256, 分类条目>），
 * 均在 Hub 元数据目录（默认 ~/.assetplex/），与 skill-overrides.json 同风格。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  loadAiClassifyConfig,
  type AiClassifyConfig,
  type AiConfigStore,
} from '../../core/ai-config.js';
import {
  sanitizeCacheEntries,
  type AiClassifyCacheEntry,
  type AiClassifyCacheStore,
} from '../../core/skill-ai-cache.js';
import {
  sanitizeArbitrationEntries,
  type ArbitrationCacheEntry,
  type ArbitrationCacheStore,
} from '../../core/arbitration-cache.js';
import {
  sanitizeDoctorEntries,
  type DoctorCacheEntry,
  type DoctorCacheStore,
} from '../../core/doctor-cache.js';
import {
  sanitizeFixDraftEntries,
  type FixDraftCacheEntry,
  type FixDraftCacheStore,
} from '../../core/doctor-fix.js';
import { expandHome } from '../../utils/paths.js';

/** 解析 Hub 元数据目录下的文件路径：$ASSETPLEX_DIR/<name> */
function resolveAssetplexFile(name: string): string {
  const hubRoot = process.env.ASSETPLEX_DIR ?? '~/.assetplex';
  return resolve(expandHome(hubRoot), name);
}

/** 读 JSON 文件为 unknown，缺失/损坏返回 null */
function readJson(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** 写 JSON 文件（自动建目录） */
function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

/** AI 配置文件存储（ai-config.json） */
export function createNodeAiConfigStore(filePath: string = resolveAssetplexFile('ai-config.json')): AiConfigStore {
  return {
    load(): Partial<AiClassifyConfig> {
      const raw = readJson(filePath);
      if (typeof raw !== 'object' || raw === null) return {};
      const obj = raw as Record<string, unknown>;
      const out: Partial<AiClassifyConfig> = {};
      if (typeof obj.baseUrl === 'string') out.baseUrl = obj.baseUrl;
      if (typeof obj.apiKey === 'string') out.apiKey = obj.apiKey;
      if (typeof obj.model === 'string') out.model = obj.model;
      return out;
    },
    save(config: AiClassifyConfig): void {
      writeJson(filePath, config);
    },
  };
}

/** AI 分类缓存存储（skill-ai-classifications.json，key = 内容 sha256） */
export function createNodeAiCacheStore(
  filePath: string = resolveAssetplexFile('skill-ai-classifications.json'),
): AiClassifyCacheStore {
  return {
    load(): Record<string, AiClassifyCacheEntry> {
      return sanitizeCacheEntries(readJson(filePath));
    },
    save(entries: Record<string, AiClassifyCacheEntry>): void {
      writeJson(filePath, entries);
    },
  };
}

/** 默认单例（真实路径） */
export const nodeAiConfigStore = createNodeAiConfigStore();
export const nodeAiCacheStore = createNodeAiCacheStore();

/** 仲裁建议缓存存储（arbitrations.json，key = 仲裁输入 sha256） */
export function createNodeArbitrationCacheStore(
  filePath: string = resolveAssetplexFile('arbitrations.json'),
): ArbitrationCacheStore {
  return {
    load(): Record<string, ArbitrationCacheEntry> {
      return sanitizeArbitrationEntries(readJson(filePath));
    },
    save(entries: Record<string, ArbitrationCacheEntry>): void {
      writeJson(filePath, entries);
    },
  };
}

export const nodeArbitrationCacheStore = createNodeArbitrationCacheStore();

/** 诊断报告缓存存储（doctor-reports.json，key = 诊断输入 sha256） */
export function createNodeDoctorCacheStore(
  filePath: string = resolveAssetplexFile('doctor-reports.json'),
): DoctorCacheStore {
  return {
    load(): Record<string, DoctorCacheEntry> {
      return sanitizeDoctorEntries(readJson(filePath));
    },
    save(entries: Record<string, DoctorCacheEntry>): void {
      writeJson(filePath, entries);
    },
  };
}

export const nodeDoctorCacheStore = createNodeDoctorCacheStore();

/** 修复草案缓存存储（doctor-drafts.json，key = 草案输入 sha256；与诊断报告分文件两本账） */
export function createNodeFixDraftCacheStore(
  filePath: string = resolveAssetplexFile('doctor-drafts.json'),
): FixDraftCacheStore {
  return {
    load(): Record<string, FixDraftCacheEntry> {
      return sanitizeFixDraftEntries(readJson(filePath));
    },
    save(entries: Record<string, FixDraftCacheEntry>): void {
      writeJson(filePath, entries);
    },
  };
}

export const nodeFixDraftCacheStore = createNodeFixDraftCacheStore();

/** 读取当前生效配置的便捷封装（路由层使用） */
export function loadCurrentAiConfig(store: AiConfigStore = nodeAiConfigStore): AiClassifyConfig {
  return loadAiClassifyConfig(store);
}
