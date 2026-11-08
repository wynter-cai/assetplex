/**
 * MCP Node 依赖实现（add-asset-governance J2/J3/J5）
 *
 * 把 core 纯逻辑接到真实文件系统 / 适配器 / 分发通道：
 * - 数据源与 HUB（server 层 hubContext）完全同一份，不另建索引（Scenario 9）
 * - 只读工具零模型调用；仅 useAi=true 的诊断会走用户自配端点（Scenario 7/8）
 *
 * 说明：为复用既有 Node 端口（swap 分发、AI 客户端、分发索引），
 * 本文件单向依赖 server/lib；server 不反向依赖 mcp，无循环。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { getHubRoot } from '../utils/paths.js';
import { listHubFiles, readHubFile, writeHubFile, type HubFileCategory } from '../core/hub-files.js';
import { backupHubFileForDoctor } from '../core/doctor-backup.js';
import { invalidateDistributionIndex } from '../core/distribution-index.js';
import { diagnoseAsset } from '../core/doctor.js';
import { runMechanicalChecks } from '../core/doctor-mechanical.js';
import { computeDoctorCacheKey, sanitizeDoctorEntries } from '../core/doctor-cache.js';
import { hashCriteria, listCriteria } from '../core/criteria.js';
import { loadAiClassifyConfig, isAiConfigComplete } from '../core/ai-config.js';
import { assembleGovernanceHealth } from '../core/governance-assembly.js';
import {
  collectDimensionIssues,
  HEALTH_DIMENSION_IDS,
  type GovernanceHealth,
  type HealthIssueRef,
} from '../core/governance-health.js';
import type { AssetDistributionInfo } from '../core/distribution-status.js';
import { DOCTOR_ASSET_KINDS, type DoctorAssetKind, type DiagnosisOverall } from '../core/types.js';
import { createPendingChangeStore, sanitizePendingEntries, type PendingChangeEntry } from '../core/mcp-pending.js';
import { McpToolError } from '../core/mcp-errors.js';
import type { DoctorDispatchItem, McpAssetSummary, McpHealthSource, McpToolDeps } from '../core/mcp-types.js';
import { hubContext } from '../server/lib/hub-context.js';
import { getDistributions } from '../server/lib/distribution-context.js';
import { dispatchToolViaSwap, resolveDefaultTargets, type DispatchDeps } from '../server/lib/doctor-dispatch.js';
import { nodeAiConfigStore, nodeDoctorCacheStore } from '../server/lib/node-ai-classify-store.js';
import { createOpenAiLlmClient } from '../server/lib/openai-llm-client.js';

const KIND_TO_HUB_DIR: Record<DoctorAssetKind, HubFileCategory> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

/** Hub 越界守卫（与 server/routes/doctor.ts 同口径） */
export function isHubInternalPath(hubRelativePath: string): boolean {
  if (hubRelativePath.trim() === '' || /^[A-Za-z]:[\\/]/.test(hubRelativePath)) return false;
  const hubRoot = getHubRoot();
  const full = resolve(hubRoot, hubRelativePath);
  return full !== hubRoot && full.startsWith(hubRoot + sep);
}

function listKindAssets(kind: DoctorAssetKind): string[] {
  const files = listHubFiles(KIND_TO_HUB_DIR[kind]);
  return files
    .filter((f) => !f.isDirectory)
    .filter((f) => (kind === 'skill' ? f.relativePath.endsWith('/SKILL.md') : f.relativePath.endsWith('.md')))
    .map((f) => f.relativePath);
}

function readAsset(hubRelativePath: string): string | null {
  if (!isHubInternalPath(hubRelativePath)) return null;
  const file = readHubFile(hubRelativePath);
  return file?.content ?? null;
}

function assetName(hubRelativePath: string): string {
  const fileName = basename(hubRelativePath);
  if (fileName === 'SKILL.md') {
    const dir = basename(dirname(hubRelativePath));
    if (dir !== '' && dir !== 'skills') return dir;
  }
  return fileName.replace(/\.md$/i, '');
}

function fileExists(hubRelativePath: string): boolean {
  if (!isHubInternalPath(hubRelativePath)) return false;
  return existsSync(join(getHubRoot(), hubRelativePath));
}

function mechanicalOverall(issues: ReturnType<typeof runMechanicalChecks>): DiagnosisOverall {
  if (issues.some((i) => i.severity === 'high')) return 'at-risk';
  if (issues.length > 0) return 'needs-attention';
  return 'healthy';
}

/** 身份快照：优先 identity/profile.md，其次目录内第一个 Markdown */
function readIdentity(): { content: string; hubRelativePath: string; updatedAt: string } | null {
  const files = listHubFiles('identity').filter((f) => !f.isDirectory && f.relativePath.endsWith('.md'));
  const preferred = files.find((f) => f.relativePath === 'identity/profile.md') ?? files[0];
  if (preferred === undefined) return null;
  const content = readAsset(preferred.relativePath);
  if (content === null) return null;
  return { content, hubRelativePath: preferred.relativePath, updatedAt: preferred.modified };
}

/** 草稿缓存落盘（损坏时丢弃，不阻断 MCP 启动） */
function createNodePendingStore() {
  const filePath = join(getHubRoot(), '.mcp-pending.json');
  let initial: unknown = [];
  try {
    initial = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  } catch {
    initial = sanitizePendingEntries([]);
  }
  return createPendingChangeStore({
    initial,
    onChange: (entries: PendingChangeEntry[]) => {
      try {
        writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
      } catch {
        // 持久化失败不影响本次会话的两段式写入
      }
    },
  });
}

function dispatchDeps(): DispatchDeps {
  return {
    getSwapEngine: () => hubContext.getSwapEngine(),
    listInstalledTools: async () => {
      const out: string[] = [];
      for (const adapter of hubContext.getAllAdapters()) {
        try {
          if ((await adapter.detect()).installed) out.push(adapter.name);
        } catch {
          // detect 失败视为未安装
        }
      }
      return out;
    },
  };
}

async function distribute(hubRelativePath: string, targets?: string[]): Promise<DoctorDispatchItem[]> {
  const deps = dispatchDeps();
  const tools = targets !== undefined && targets.length > 0
    ? targets
    : await resolveDefaultTargets(deps, hubRelativePath);
  const out: DoctorDispatchItem[] = [];
  for (const tool of tools) {
    try {
      out.push(await dispatchToolViaSwap(deps, tool, hubRelativePath));
    } catch (err) {
      out.push({ tool, action: 'failed', reason: err instanceof Error ? err.message : String(err) });
    }
  }
  invalidateDistributionIndex();
  return out;
}

export interface McpNodeDepsOptions {
  /** 测试注入：避免真实读取 Hub / 模型 */
  listAssets?: (kind: DoctorAssetKind) => string[];
  read?: (hubRelativePath: string) => string | null;
  aiConfigured?: () => boolean;
  pending?: McpToolDeps['pending'];
}

export function createNodeMcpDeps(options: McpNodeDepsOptions = {}): McpToolDeps {
  const list = options.listAssets ?? listKindAssets;
  const read = options.read ?? readAsset;
  const pending = options.pending ?? createNodePendingStore();

  const aiConfigured = (): boolean => {
    if (options.aiConfigured !== undefined) return options.aiConfigured();
    return isAiConfigComplete(loadAiClassifyConfig(nodeAiConfigStore));
  };

  let distributionCache: Record<string, AssetDistributionInfo[]> | null = null;

  return {
    isHubInternalPath,
    fileExists,
    readIdentity,

    listAssets: async ({ kind, limit }) => {
      const kinds: DoctorAssetKind[] = kind === undefined ? [...DOCTOR_ASSET_KINDS] : [kind];
      const configured = aiConfigured();
      const model = loadAiClassifyConfig(nodeAiConfigStore).model;
      const criteriaHash = hashCriteria(listCriteria());
      const cached = configured ? sanitizeDoctorEntries(nodeDoctorCacheStore.load()) : {};
      distributionCache ??= (await getDistributions()).index;

      const items: McpAssetSummary[] = [];
      for (const currentKind of kinds) {
        for (const path of list(currentKind)) {
          const content = read(path);
          let overall: DiagnosisOverall | 'unknown' = 'unknown';
          if (configured && content !== null) {
            const key = computeDoctorCacheKey({ kind: currentKind, content, criteriaHash, model });
            const entry = cached[key];
            if (entry !== undefined) overall = entry.overall;
          }
          const distribution = distributionCache[path] ?? [];
          items.push({
            name: assetName(path),
            kind: currentKind,
            hubRelativePath: path,
            diagnosisOverall: overall,
            distribution: distribution.map((d) => ({ toolId: d.toolId, status: d.status })),
          });
        }
      }
      return limit === undefined ? items : items.slice(0, limit);
    },

    readAsset: read,

    async health(): Promise<McpHealthSource> {
      const configured = aiConfigured();
      const config = loadAiClassifyConfig(nodeAiConfigStore);
      const criteriaHash = hashCriteria(listCriteria());
      distributionCache ??= (await getDistributions()).index;
      const semantic = configured
        ? ({ kind, content }: { kind: DoctorAssetKind; content: string }) => {
            const key = computeDoctorCacheKey({ kind, content, criteriaHash, model: config.model });
            const entry = sanitizeDoctorEntries(nodeDoctorCacheStore.load())[key];
            return entry === undefined
              ? { semanticIssues: [], evaluated: false }
              : { semanticIssues: entry.issues, evaluated: true };
          }
        : undefined;

      const assembled = assembleGovernanceHealth({
        listAssets: list,
        read,
        distributions: (hubRelativePath) => distributionCache?.[hubRelativePath] ?? [],
        ...(semantic === undefined ? {} : { semantic }),
        duplicateGroups: [],
        aiConfigured: configured,
        cached: false,
      });

      const health: GovernanceHealth = assembled.health;
      const merged = new Map<string, HealthIssueRef>();
      for (const dimension of HEALTH_DIMENSION_IDS) {
        for (const issue of collectDimensionIssues(assembled.assets, [], dimension)) {
          if (!merged.has(issue.id)) merged.set(issue.id, issue);
        }
      }
      return { health, issues: [...merged.values()] };
    },

    async diagnose({ kind, hubRelativePath, useAi }) {
      const content = read(hubRelativePath);
      if (content === null) {
        throw new McpToolError('NOT_FOUND', `资产不存在：${hubRelativePath}`, '先用 assetplex_assets_list 确认路径');
      }
      if (useAi !== true) {
        const issues = runMechanicalChecks(kind, content);
        return { overall: mechanicalOverall(issues), issues, mechanicalOnly: true, aiUsed: false };
      }
      const config = loadAiClassifyConfig(nodeAiConfigStore);
      if (!isAiConfigComplete(config)) {
        throw new McpToolError('AI_UNAVAILABLE', 'AI 端点未配置', '在 HUB 设置中配置 OpenAI 兼容端点，或改用 useAi=false 只跑机械项');
      }
      const report = await diagnoseAsset(
        { kind, hubRelativePath },
        {
          fs: { read },
          getCriteria: listCriteria,
          cache: nodeDoctorCacheStore,
          llm: createOpenAiLlmClient(config),
          config,
        },
      );
      return { overall: report.overall, issues: report.issues, mechanicalOnly: report.mechanicalOnly, aiUsed: !report.mechanicalOnly };
    },

    pending,

    commit: {
      backup: (hubRelativePath) => backupHubFileForDoctor(hubRelativePath),
      write: (hubRelativePath, content) => {
        writeHubFile(hubRelativePath, content);
        invalidateDistributionIndex();
      },
      distribute,
    },
  };
}
