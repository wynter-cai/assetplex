/**
 * 治理快照共享装配（refactor-home-action-panel T3）
 *
 * 把 routes/governance.ts 里「资产枚举 + 语义缓存只读 + 分发索引 + 30 秒缓存」
 * 抽成可复用函数：治理路由与首页聚合接口共用同一套装配，避免两份口径分叉。
 *
 * 行为与抽取前逐项一致：
 * - 30 秒 TTL；`load(true)` 绕过缓存强制重算
 * - 命中缓存时 `health.cached = true`，磁盘不再重读
 * - `invalidate()` 清空缓存（整改 / 重复治理写库后调用）
 * - 语义诊断只读医生缓存，绝不在聚合时调用模型
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getHubRoot } from '../../utils/paths.js';
import { listHubFiles, type HubFileCategory } from '../../core/hub-files.js';
import { listAssets } from '../../core/assets.js';
import type { DoctorAssetKind } from '../../core/types.js';
import { assembleGovernanceHealth, type GovernanceAssemblyDeps } from '../../core/governance-assembly.js';
import type {
  GovernanceAssetInput,
  GovernanceHealth,
  HealthDuplicateGroup,
} from '../../core/governance-health.js';
import type { AssetDistributionInfo } from '../../core/distribution-status.js';
import { loadAiClassifyConfig, isAiConfigComplete, type AiConfigStore } from '../../core/ai-config.js';
import { computeDoctorCacheKey, sanitizeDoctorEntries, type DoctorCacheStore } from '../../core/doctor-cache.js';
import { hashCriteria, listCriteria } from '../../core/criteria.js';
import { nodeAiConfigStore, nodeDoctorCacheStore } from './node-ai-classify-store.js';
import { getDistributions } from './distribution-context.js';
import { isHubInternalPath } from '../routes/doctor.js';

/** 一次治理快照（健康分与问题清单共用同一份资产快照） */
export interface GovernanceSnapshot {
  health: GovernanceHealth;
  assets: GovernanceAssetInput[];
  groups: HealthDuplicateGroup[];
}

/** 共享装配依赖（routes/governance.ts 与 routes/home.ts 注入同一形状） */
export interface GovernanceSnapshotDeps {
  listAssets?: (kind: DoctorAssetKind) => string[];
  read?: (hubRelativePath: string) => string | null;
  distributions?: (hubRelativePath: string) => AssetDistributionInfo[];
  semantic?: GovernanceAssemblyDeps['semantic'];
  aiConfigured?: () => boolean;
  aiConfigStore?: AiConfigStore;
  cache?: DoctorCacheStore;
  duplicateGroups?: () => HealthDuplicateGroup[];
  /** 我的库资产总数（首页快照与治理页共用口径；缺省读真实 Hub） */
  libraryCount?: () => number | Promise<number>;
  now?: () => string;
}

export interface GovernanceSnapshotStore {
  /** 取快照；force=true 绕过 30 秒缓存 */
  load(force?: boolean): Promise<GovernanceSnapshot>;
  /** 写库后失效缓存 */
  invalidate(): void;
}

/** 缓存有效期（与分发索引同口径的短 TTL） */
const CACHE_TTL_MS = 30_000;

/** 医生类别 → Hub 目录（与 routes/doctor.ts 同口径） */
const KIND_TO_HUB_DIR: Record<DoctorAssetKind, HubFileCategory> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

/** 默认资产枚举：技能只取包主文件 SKILL.md，其余类别取目录内全部文件 */
export function nodeListAssets(kind: DoctorAssetKind): string[] {
  const files = listHubFiles(KIND_TO_HUB_DIR[kind]);
  return files
    .filter((file) => !file.isDirectory)
    .filter((file) => (kind === 'skill' ? file.relativePath.endsWith('/SKILL.md') : true))
    .map((file) => file.relativePath);
}

/** 默认正文读取：只读 Hub 内路径，读不到返回 null */
export function nodeRead(hubRelativePath: string): string | null {
  try {
    if (!isHubInternalPath(hubRelativePath)) return null;
    const full = resolve(getHubRoot(), hubRelativePath);
    if (!existsSync(full)) return null;
    return readFileSync(full, 'utf-8');
  } catch {
    return null;
  }
}

/** 语义诊断只读缓存：未命中即「未评估」，绝不在健康分聚合时调用模型 */
export function makeSemanticProvider(
  model: string,
  cache: DoctorCacheStore,
): NonNullable<GovernanceAssemblyDeps['semantic']> {
  const criteria = listCriteria();
  const criteriaHash = hashCriteria(criteria);
  return ({ kind, content }) => {
    const key = computeDoctorCacheKey({ kind, content, criteriaHash, model });
    const entry = sanitizeDoctorEntries(cache.load())[key];
    if (entry === undefined) return { semanticIssues: [], evaluated: false };
    return { semanticIssues: entry.issues, evaluated: true };
  };
}

interface SnapshotCache {
  at: number;
  health: GovernanceHealth;
  assets: GovernanceAssetInput[];
  groups: HealthDuplicateGroup[];
}

/** 创建可复用的治理快照装配（每个实例各自持有 30 秒缓存） */
export function createGovernanceSnapshot(deps: GovernanceSnapshotDeps = {}): GovernanceSnapshotStore {
  let cache: SnapshotCache | null = null;

  /** 我的库资产总数：与资产库 listAssets 同源；资产库未把 agent 纳入一等类别，这里补上 */
  const libraryCount =
    deps.libraryCount ??
    (async () => {
      const { total } = await listAssets();
      return total + (deps.listAssets ?? nodeListAssets)('agent').length;
    });

  /** 装配一次：健康分与问题清单共用同一份资产快照 */
  async function load(force = false): Promise<GovernanceSnapshot> {
    if (!force && cache !== null && Date.now() - cache.at < CACHE_TTL_MS) {
      return { health: { ...cache.health, cached: true }, assets: cache.assets, groups: cache.groups };
    }

    const config = loadAiClassifyConfig(deps.aiConfigStore ?? nodeAiConfigStore);
    const aiConfigured = deps.aiConfigured === undefined ? isAiConfigComplete(config) : deps.aiConfigured();
    const semantic =
      deps.semantic ??
      (aiConfigured ? makeSemanticProvider(config.model, deps.cache ?? nodeDoctorCacheStore) : undefined);

    let distributionIndex: Record<string, AssetDistributionInfo[]> | null = null;
    if (deps.distributions === undefined) {
      distributionIndex = (await getDistributions()).index;
    }
    const groups = (deps.duplicateGroups ?? (() => []))();

    const assembled = assembleGovernanceHealth({
      listAssets: deps.listAssets ?? nodeListAssets,
      read: deps.read ?? nodeRead,
      distributions:
        deps.distributions ??
        ((hubRelativePath) => (distributionIndex as Record<string, AssetDistributionInfo[]>)[hubRelativePath] ?? []),
      ...(semantic === undefined ? {} : { semantic }),
      duplicateGroups: groups,
      aiConfigured,
      ...(deps.now === undefined ? {} : { now: deps.now }),
    });

    // 资产总数收敛到「我的库」口径（含 mcp / agent，命令不计）：
    // 参与评分的只是可诊断的文档资产，数字口径与评分范围分开，避免两个总数
    const totalAssets = await libraryCount();
    const health: GovernanceHealth =
      totalAssets === assembled.health.totalAssets ? assembled.health : { ...assembled.health, totalAssets };

    cache = { at: Date.now(), health, assets: assembled.assets, groups };
    return { health, assets: assembled.assets, groups };
  }

  return {
    load,
    invalidate: () => {
      cache = null;
    },
  };
}
