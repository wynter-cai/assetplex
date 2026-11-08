/**
 * MCP 工具处理逻辑（add-asset-governance J2/J3）
 *
 * 纯逻辑层：所有文件/网络副作用通过 McpToolDeps 注入，core 不依赖 server/cli。
 * 契约见设计文档 changes/add-asset-governance/mcp-contract.ts。
 *
 * spec: specs/mcp-entry.spec.md Scenario 1/3/4/5/7/9
 */

import { createHash } from 'node:crypto';
import { McpToolError, asMcpToolError } from './mcp-errors.js';
import { buildUnifiedDiff } from './unified-diff.js';
import { DOCTOR_ASSET_KINDS, type DiagnosisIssue, type DoctorAssetKind } from './types.js';
import { assertWritablePath, defaultCreatePath, isDoctorKind } from './mcp-path.js';
import {
  ASSET_CONTENT_LIMIT,
  type McpAssetCommitInput,
  type McpAssetCommitResult,
  type McpAssetDiagnoseInput,
  type McpAssetDiagnoseResult,
  type McpAssetGetInput,
  type McpAssetGetResult,
  type McpAssetProposeInput,
  type McpAssetProposeResult,
  type McpAssetsListInput,
  type McpHealthSummary,
  type McpIdentityGetResult,
  type McpToolDeps,
  type McpToolHandlers,
} from './mcp-types.js';

export {
  ASSET_CONTENT_LIMIT,
  type McpAssetCommitInput,
  type McpAssetCommitResult,
  type McpAssetDiagnoseInput,
  type McpAssetDiagnoseResult,
  type McpAssetGetInput,
  type McpAssetGetResult,
  type McpAssetProposeInput,
  type McpAssetProposeResult,
  type McpAssetSummary,
  type McpAssetsListInput,
  type McpHealthSource,
  type McpHealthSummary,
  type McpIdentityGetResult,
  type McpToolDeps,
  type McpToolHandlers,
  type DoctorDispatchItem,
} from './mcp-types.js';

const SEVERITY_RANK: Record<DiagnosisIssue['severity'], number> = { high: 0, medium: 1, low: 2 };

export function createMcpToolHandlers(deps: McpToolDeps): McpToolHandlers {
  return {
    identityGet(): McpIdentityGetResult {
      const identity = deps.readIdentity();
      if (identity === null) {
        throw new McpToolError('NOT_FOUND', '尚未建立身份资产', '在 HUB 中创建身份（identity/），或运行 assetplex init 后重试');
      }
      return {
        content: identity.content,
        hubRelativePath: identity.hubRelativePath,
        versionHash: createHash('sha256').update(identity.content).digest('hex'),
        updatedAt: identity.updatedAt,
      };
    },

    async assetsList(input: McpAssetsListInput) {
      if (input.kind !== undefined && !isDoctorKind(input.kind)) {
        throw new McpToolError('INVALID_INPUT', `不支持的资产类别：${String(input.kind)}`, `可用类别：${DOCTOR_ASSET_KINDS.join(' / ')}`);
      }
      if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit <= 0)) {
        throw new McpToolError('INVALID_INPUT', 'limit 必须是正整数', '不传 limit 则返回全部');
      }
      const items = await deps.listAssets(input);
      const total = (await deps.listAssets({ kind: input.kind })).length;
      return { items, total };
    },

    assetGet(input: McpAssetGetInput): McpAssetGetResult {
      const path = assertWritablePath(deps, input.kind, input.hubRelativePath);
      const content = deps.readAsset(path);
      if (content === null) {
        throw new McpToolError('NOT_FOUND', `资产不存在：${path}`, '先用 assetplex_assets_list 确认路径');
      }
      return {
        content: content.slice(0, ASSET_CONTENT_LIMIT),
        hubRelativePath: path,
        truncated: content.length > ASSET_CONTENT_LIMIT,
      };
    },

    async healthGet(): Promise<McpHealthSummary> {
      const source = await deps.health();
      return {
        score: source.health.score,
        grade: source.health.grade,
        totalAssets: source.health.totalAssets,
        qualityMode: source.health.qualityMode,
        computedAt: source.health.computedAt,
        cached: source.health.cached,
        dimensions: source.health.dimensions.map((d) => ({
          id: d.id,
          label: d.label,
          score: d.score,
          weight: d.weight,
          effectiveWeight: d.effectiveWeight,
          applicability: d.applicability,
          issueCount: d.issueCount,
        })),
        topIssues: [...source.issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 3),
      };
    },

    async assetDiagnose(input: McpAssetDiagnoseInput): Promise<McpAssetDiagnoseResult> {
      const path = assertWritablePath(deps, input.kind, input.hubRelativePath);
      if (!deps.fileExists(path)) {
        throw new McpToolError('NOT_FOUND', `资产不存在：${path}`, '先用 assetplex_assets_list 确认路径');
      }
      try {
        return await deps.diagnose({ ...input, hubRelativePath: path, useAi: input.useAi === true });
      } catch (err) {
        throw asMcpToolError(err);
      }
    },

    assetPropose(input: McpAssetProposeInput): McpAssetProposeResult {
      if (!isDoctorKind(input.kind)) {
        throw new McpToolError('INVALID_INPUT', `不支持的资产类别：${String(input.kind)}`, `可用类别：${DOCTOR_ASSET_KINDS.join(' / ')}`);
      }
      if (input.mode !== 'create' && input.mode !== 'update') {
        throw new McpToolError('INVALID_INPUT', 'mode 只能是 create 或 update', '新增用 create，修改现有资产用 update');
      }
      if (typeof input.content !== 'string' || input.content.trim() === '') {
        throw new McpToolError('INVALID_INPUT', 'content 不能为空', '提供完整文件内容（含 frontmatter）');
      }

      let path: string;
      let oldContent: string | null = null;
      if (input.mode === 'update') {
        if (input.hubRelativePath === undefined) {
          throw new McpToolError('INVALID_INPUT', 'update 必须提供 hubRelativePath', '先 assets_list 找到目标资产路径');
        }
        path = assertWritablePath(deps, input.kind, input.hubRelativePath);
        oldContent = deps.readAsset(path);
        if (oldContent === null) {
          throw new McpToolError('NOT_FOUND', `要修改的资产不存在：${path}`, '改用 mode=create 新增');
        }
      } else {
        path = input.hubRelativePath === undefined
          ? defaultCreatePath(deps, input.kind, input.content)
          : assertWritablePath(deps, input.kind, input.hubRelativePath);
        if (deps.fileExists(path)) {
          throw new McpToolError('INVALID_INPUT', `目标文件已存在：${path}`, '改用 mode=update 修改现有资产');
        }
      }

      const entry = deps.pending.propose({
        kind: input.kind,
        mode: input.mode,
        hubRelativePath: path,
        content: input.content,
        ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
      });

      return {
        pendingChangeId: entry.pendingChangeId,
        mode: input.mode,
        hubRelativePath: path,
        previewContent: input.content,
        unifiedDiff: buildUnifiedDiff(path, oldContent, input.content),
        expiresAt: entry.expiresAt,
      };
    },

    async assetCommit(input: McpAssetCommitInput): Promise<McpAssetCommitResult> {
      if (typeof input.pendingChangeId !== 'string' || input.pendingChangeId.trim() === '') {
        throw new McpToolError('INVALID_INPUT', '缺少 pendingChangeId', '先调用 assetplex_asset_propose 获取草稿 id');
      }
      const entry = deps.pending.get(input.pendingChangeId);
      // 提交前重新校验：缓存可能被手改，不能仅信 propose 时的判断
      const path = assertWritablePath(deps, entry.kind, entry.hubRelativePath);
      if (entry.mode === 'update' && !deps.fileExists(path)) {
        throw new McpToolError('NOT_FOUND', `目标资产已被删除：${path}`, '重新 propose（mode=create）后再提交');
      }
      if (entry.mode === 'create' && deps.fileExists(path)) {
        throw new McpToolError('INVALID_INPUT', `目标文件已存在：${path}`, '重新 propose（mode=update）后再提交');
      }

      // create 模式没有旧版可备份，backupRef 为空串是如实表达，不伪造备份
      const backupRef = entry.mode === 'update' ? deps.commit.backup(path) : '';
      try {
        deps.commit.write(path, entry.content);
      } catch (err) {
        throw asMcpToolError(err);
      }
      deps.pending.drop(input.pendingChangeId);

      let dispatch: McpAssetCommitResult['dispatch'] = [];
      if (input.distribute === true) {
        try {
          dispatch = await deps.commit.distribute(path, input.targets);
        } catch (err) {
          const wrapped = asMcpToolError(err);
          throw new McpToolError(
            wrapped.code,
            wrapped.message,
            `资产已写入 Hub（${path}，backupRef=${backupRef || 'create'}），分发失败：${wrapped.hint}`,
          );
        }
      }

      return { saved: true, hubRelativePath: path, backupRef, dispatch };
    },
  };
}

/** 供外部（server 层）判断类别是否合法 */
export { isDoctorKind };
export type { DoctorAssetKind };
