/**
 * 结果屏（s2）：真实总数、类别分布、重复/不一致/覆盖洞察（add-zero-config-onboarding T12）
 *
 * spec Requirement 3：全部来自扫描数据，不写死、不编造时间成本；
 * 没有重复时如实显示「未发现重复维护」；0 资产显示空态与建议。
 * 视觉：左侧构成卡（大数字 + 占比条），右侧洞察卡（色点图例 + 分组列表）。
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  getCategoryConfig,
} from '@/config/asset-categories';
import {
  ONB_PRIMARY,
  ONB_SECONDARY,
  ONB_TITLE,
  OnbActions,
  OnbCard,
  OnbHeader,
  OnbScreen,
} from './ScreenFrame';
import type { ScanWithInsights, ToolInventory } from '@/types/api';

const CATEGORY_LABELS: Record<string, string> = {
  identity: '身份 / 人设',
  skill: '技能',
  rule: '规则',
  mcp: 'MCP 服务器',
  agent: '智能体',
  memory: '记忆',
};

type InsightTone = 'mismatch' | 'duplicate' | 'coverage';

/** 洞察行统一口径：名称 + 分布说明 + 右侧标签 */
interface InsightRow {
  key: string;
  name: string;
  detail: string;
  tag: string;
  tone: InsightTone;
}

const MAX_ROWS = 8;

const TONE_META: Record<InsightTone, { chip: string; dot: string; label: string }> = {
  mismatch: {
    chip: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    label: '内容不一致',
  },
  duplicate: {
    chip: 'bg-warning-soft text-warning',
    dot: 'bg-warning',
    label: '重复副本',
  },
  coverage: {
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
    label: '覆盖不全',
  },
};

export function inventoryTotals(inventories: ToolInventory[]): {
  total: number;
  byCategory: Record<string, number>;
  toolCount: number;
} {
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const tool of inventories) {
    if (!tool.installed) continue;
    total += tool.items.length;
    for (const item of tool.items) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    }
  }
  return {
    total,
    byCategory,
    toolCount: inventories.filter((t) => t.installed).length,
  };
}

export function ResultScreen({
  scan,
  onCollect,
  onSkip,
}: {
  scan: ScanWithInsights;
  onCollect: () => void;
  onSkip: () => void;
}): JSX.Element {
  const { total, byCategory, toolCount } = inventoryTotals(scan.inventories);
  const insights = scan.insights;
  const duplicates = insights?.duplicateGroups ?? [];
  const mismatched = insights?.versionMismatchGroups ?? [];
  const coverage = insights?.coverageGroups ?? [];
  const mismatchSet = new Set(mismatched.map((g) => g.hubTargetPath));

  const rows: InsightRow[] = [
    ...duplicates.map((g): InsightRow => {
      const isMismatch = mismatchSet.has(g.hubTargetPath);
      return {
        key: `dup-${g.hubTargetPath}`,
        name: g.name,
        detail: g.tools.join(' · '),
        tag: isMismatch ? `内容不一致 · ${g.distinctVersions} 版` : `重复 ${g.tools.length} 份`,
        tone: isMismatch ? 'mismatch' : 'duplicate',
      };
    }),
    ...coverage.map((g): InsightRow => ({
      key: `cov-${g.hubTargetPath}`,
      name: g.name,
      detail: `只在 ${g.tools.join('、')} 中存在`,
      tag: '覆盖不全',
      tone: 'coverage',
    })),
  ];
  const visibleRows = rows.slice(0, MAX_ROWS);
  const restRows = rows.length - visibleRows.length;
  const legend: InsightTone[] = (['mismatch', 'duplicate', 'coverage'] as const).filter((tone) =>
    rows.some((row) => row.tone === tone),
  );

  const categoryRows = Object.entries(byCategory)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      code,
      count,
      label: CATEGORY_LABELS[code] ?? getCategoryConfig(code)?.label ?? code,
      Icon: CATEGORY_ICONS[code] ?? DEFAULT_CATEGORY_ICON,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  return (
    <OnbScreen testId="onboarding-result">
      <OnbHeader
        eyebrow="第 2 步 · 盘点结果"
        title={
          <h2 className={ONB_TITLE}>
            盘点完成，你有{' '}
            <span className="tabular-nums text-primary">{total}</span> 个资产
          </h2>
        }
        description={
          total === 0
            ? undefined
            : `这些资产分布在 ${toolCount} 个工具里，此前没有任何一处能看到全貌。`
        }
      />

      {total === 0 ? (
        <div className="mt-6 max-w-[720px] rounded-lg border border-dashed bg-card px-6 py-10 text-center">
          <p className="text-14 font-medium">没有检测到可导入的资产</p>
          <p className="mx-auto mt-2 max-w-[420px] text-12 leading-relaxed text-muted-foreground">
            可以先去使用 AI 工具积累配置，之后从「连接」或「收藏到我的库」随时导入。
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* 构成卡：大数字 + 每类占比条 */}
          <OnbCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-14 font-semibold">资产构成</h3>
              <span className="text-12 text-muted-foreground">{toolCount} 个工具</span>
            </div>

            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                {total}
              </span>
              <span className="text-13 text-muted-foreground">个资产</span>
            </p>

            <ul className="mt-4 space-y-3">
              {categoryRows.map((row) => {
                const Icon = row.Icon;
                return (
                  <li key={row.code}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-13 text-foreground">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-13 font-semibold tabular-nums text-foreground">
                        {row.count}
                        <span className="ml-0.5 text-12 font-normal text-muted-foreground">项</span>
                      </span>
                      <span className="w-9 shrink-0 text-right text-12 tabular-nums text-muted-foreground">
                        {row.share}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${row.share}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </OnbCard>

          {/* 洞察卡：色点图例 + 分组列表 */}
          <OnbCard className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div className="flex items-center gap-2">
                {rows.length > 0 && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                )}
                <h3 className="text-14 font-semibold">
                  {rows.length > 0
                    ? mismatched.length > 0
                      ? '重复维护，且已出现不一致'
                      : '发现重复维护'
                    : '重复与不一致'}
                </h3>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-12 tabular-nums text-muted-foreground">
                {rows.length} 组
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="flex items-center gap-2.5 px-5 py-6 text-13 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                未发现重复维护，各工具里的配置目前互不冲突。
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-muted/20 px-5 py-2.5">
                  {legend.map((tone) => (
                    <span
                      key={tone}
                      className="inline-flex items-center gap-1.5 text-12 text-muted-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('h-1.5 w-1.5 rounded-full', TONE_META[tone].dot)}
                      />
                      {TONE_META[tone].label}
                    </span>
                  ))}
                </div>
                <ul className="divide-y divide-border/70">
                  {visibleRows.map((row) => (
                    <li key={row.key} className="flex items-start gap-3 px-5 py-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          TONE_META[row.tone].dot,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-13 font-medium text-foreground">{row.name}</p>
                        <p className="mt-0.5 truncate text-12 text-muted-foreground">{row.detail}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-12 font-medium',
                          TONE_META[row.tone].chip,
                        )}
                      >
                        {row.tag}
                      </span>
                    </li>
                  ))}
                  {restRows > 0 && (
                    <li className="px-5 py-2.5 text-12 text-muted-foreground">
                      还有 {restRows} 组未展开
                    </li>
                  )}
                </ul>
              </>
            )}
          </OnbCard>
        </div>
      )}

      {total > 0 && (
        <p className="mt-4 max-w-[720px] text-13 leading-relaxed text-muted-foreground">
          收进资产库后，这些内容只需要维护{' '}
          <b className="font-semibold text-foreground">1 份</b>，换工具时不必再重写一遍。
        </p>
      )}

      <OnbActions
        primary={
          <Button
            className={ONB_PRIMARY}
            onClick={onCollect}
            disabled={total === 0}
            data-testid="onboarding-collect-start"
          >
            全部收进资产库
          </Button>
        }
        secondary={
          <button type="button" className={ONB_SECONDARY} onClick={onSkip}>
            跳过，直接进入资产库
          </button>
        }
        hint="原文件不动，任何一步都可撤销"
      />
    </OnbScreen>
  );
}
