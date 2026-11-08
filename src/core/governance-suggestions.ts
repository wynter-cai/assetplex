/**
 * 治理建议合成（add-asset-governance L1）
 *
 * 纯函数：只吃确定性数据（健康分机械项、重复分组、分发状态、AI 配置），
 * 全程零模型调用；排序按「影响面 × 可执行性」，最多 3 条可执行 + 至多 1 条信息项。
 * spec: 设计文档/changes/add-asset-governance/specs/proactive-guidance.spec.md
 */

import type { GovernanceHealth, HealthDimensionId } from './governance-health.js';

export type SuggestionId = 'duplicates' | 'completeness' | 'quality' | 'distribution' | 'ai-config';

export interface SuggestionAction {
  label: string;
  /** 既有流程入口（前端内部路由） */
  route: string;
  /** 首页内联动作（如打开整改弹窗） */
  intent?: 'open-remediation';
}

export interface SuggestionScale {
  assets: number;
  estimatedCalls: number;
}

export interface GovernanceSuggestion {
  id: SuggestionId;
  executable: boolean;
  title: string;
  reason: string;
  scale: SuggestionScale;
  action: SuggestionAction;
  /** 影响面数值，仅用于排序，不对外展示 */
  impact: number;
}

export interface DuplicateSummaryForSuggestion {
  mergeableGroupCount: number;
  /** 预计可通过归档减少的重复条目数 */
  mergeableAssetCount: number;
  grayGroupCount: number;
  /** 灰区组涉及的资产数（缺省为 0，仅影响首屏措辞，不影响可执行建议） */
  grayAssetCount?: number;
}

export interface GovernanceSuggestionInput {
  health: GovernanceHealth | null;
  duplicates: DuplicateSummaryForSuggestion | null;
  aiConfigured: boolean;
  /** 是否已至少完成一次扫描（决定首屏引导是否出现） */
  scanned?: boolean;
  coverage?: { managedKindCount: number; totalKindCount: number } | null;
}

export interface FirstRunBriefing {
  headline: string;
  stats: { assetCount: number; duplicateCount: number; missingInfoCount: number };
  primary: SuggestionAction;
  secondary: { label: string };
  clean: boolean;
}

export interface GovernanceSuggestionResult {
  suggestions: GovernanceSuggestion[];
  info: Array<{ id: string; text: string }>;
  firstRun: FirstRunBriefing | null;
  aiConfigured: boolean;
  emptyMessage: string | null;
}

const EMPTY_MESSAGE = '状态良好，暂无需要处理的事项';
const AI_NOTE = '更多语义建议需配置 AI 端点';

function dimension(health: GovernanceHealth, id: HealthDimensionId): { issueCount: number; score: number | null } {
  const found = health.dimensions.find((item) => item.id === id);
  return { issueCount: found?.issueCount ?? 0, score: found?.score ?? null };
}

function missingInfoCount(health: GovernanceHealth): number {
  return dimension(health, 'completeness').issueCount;
}

function buildFirstRun(input: GovernanceSuggestionInput, counts: {
  duplicateCount: number;
  missingInfo: number;
}): FirstRunBriefing | null {
  if (input.health === null || input.scanned === false) return null;
  const assetCount = input.health.totalAssets;
  const clean = counts.duplicateCount === 0 && counts.missingInfo === 0;
  if (clean) {
    return {
      headline: `家底干净：${assetCount} 个资产没有重复或缺失`,
      stats: { assetCount, duplicateCount: 0, missingInfoCount: 0 },
      primary: { label: '接入 MCP', route: '/connections' },
      secondary: { label: '先看看' },
      clean: true,
    };
  }
  return {
    headline: `扫到 ${assetCount} 个资产，其中 ${counts.duplicateCount} 个重复/近重复，${counts.missingInfo} 个缺关键信息`,
    stats: { assetCount, duplicateCount: counts.duplicateCount, missingInfoCount: counts.missingInfo },
    primary:
      counts.duplicateCount > 0
        ? { label: '帮我收拾', route: '/duplicates' }
        : { label: '帮我收拾', route: '/', intent: 'open-remediation' },
    secondary: { label: '先看看' },
    clean: false,
  };
}

/** 由确定性数据合成建议；不调模型、不读磁盘 */
export function buildGovernanceSuggestions(input: GovernanceSuggestionInput): GovernanceSuggestionResult {
  const executable: GovernanceSuggestion[] = [];
  const health = input.health;

  if (input.duplicates !== null && input.duplicates.mergeableAssetCount > 0) {
    executable.push({
      id: 'duplicates',
      executable: true,
      title: `${input.duplicates.mergeableGroupCount} 组重复/近重复可合并`,
      reason: `预计减少 ${input.duplicates.mergeableAssetCount} 个重复条目；只归档不删除，可一键还原`,
      scale: { assets: input.duplicates.mergeableAssetCount, estimatedCalls: 0 },
      action: { label: '去合并', route: '/duplicates' },
      impact: input.duplicates.mergeableAssetCount,
    });
  }

  if (health !== null) {
    const missing = missingInfoCount(health);
    if (missing > 0) {
      executable.push({
        id: 'completeness',
        executable: true,
        title: `${missing} 个资产缺少关键信息`,
        reason: '补齐触发描述等缺失字段，提升 AI 工具选中率',
        scale: { assets: missing, estimatedCalls: 0 },
        action: { label: '去整改', route: '/', intent: 'open-remediation' },
        impact: missing,
      });
    }

    const quality = dimension(health, 'quality');
    if (quality.issueCount > 0) {
      executable.push({
        id: 'quality',
        executable: true,
        title: `${quality.issueCount} 个资产存在质量问题`,
        reason: input.aiConfigured ? '按机械项与已缓存的语义诊断结果生成修复草案' : '当前仅机械项可修；语义问题需配置 AI（不写成确定结论）',
        scale: { assets: quality.issueCount, estimatedCalls: input.aiConfigured ? quality.issueCount : 0 },
        action: { label: '去整改', route: '/', intent: 'open-remediation' },
        impact: quality.issueCount,
      });
    }

    const distribution = dimension(health, 'distribution');
    if (distribution.issueCount > 0) {
      executable.push({
        id: 'distribution',
        executable: true,
        title: `${distribution.issueCount} 个资产分发未更新`,
        reason: '工具侧副本与 Hub 不一致，重新分发即可对齐',
        scale: { assets: distribution.issueCount, estimatedCalls: 0 },
        action: { label: '去同步', route: '/sync' },
        impact: distribution.issueCount,
      });
    }
  }

  if (!input.aiConfigured && health !== null && health.totalAssets > 0) {
    executable.push({
      id: 'ai-config',
      executable: true,
      title: '尚未配置 AI 端点',
      reason: '配置后可获得语义级建议；不配置也仍可完成全部机械治理',
      scale: { assets: 0, estimatedCalls: 0 },
      action: { label: '去配置', route: '/settings' },
      impact: 2,
    });
  }

  const suggestions = executable
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map((item) => ({ ...item }));

  const info: Array<{ id: string; text: string }> = [];
  const missingKinds =
    input.coverage === null || input.coverage === undefined
      ? 0
      : input.coverage.totalKindCount - input.coverage.managedKindCount;
  // 信息项至多 1 条；AI 未配置时优先解释口径（Scenario 7），否则提示覆盖缺口
  if (!input.aiConfigured && suggestions.length > 0) {
    info.push({ id: 'ai-note', text: AI_NOTE });
  } else if (missingKinds > 0) {
    info.push({ id: 'coverage', text: `还有 ${missingKinds} 类资产尚未纳入管理` });
  }

  const firstRun = buildFirstRun(input, {
    duplicateCount:
      (input.duplicates?.mergeableAssetCount ?? 0) +
      (input.duplicates?.grayAssetCount ?? (input.duplicates?.grayGroupCount ?? 0) * 2),
    missingInfo: health === null ? 0 : missingInfoCount(health),
  });

  return {
    suggestions,
    info,
    firstRun,
    aiConfigured: input.aiConfigured,
    emptyMessage: suggestions.length === 0 ? EMPTY_MESSAGE : null,
  };
}
