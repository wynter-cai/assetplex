/**
 * 结果屏（s2）：真实总数、类别分布、重复/不一致/覆盖洞察（add-zero-config-onboarding T12）
 *
 * spec Requirement 3：全部来自扫描数据，不写死、不编造时间成本；
 * 没有重复时如实显示「未发现重复维护」；0 资产显示空态与建议。
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ScanWithInsights, ToolInventory } from '@/types/api';

const CATEGORY_LABELS: Record<string, string> = {
  identity: '身份 / 人设',
  skill: '技能',
  rule: '规则',
  mcp: 'MCP 服务器',
  agent: '智能体',
  memory: '记忆',
};

/** 洞察行统一口径：名称 + 分布说明 + 右侧标签 */
interface InsightRow {
  key: string;
  name: string;
  detail: string;
  tag: string;
  tone: string;
}

const MAX_ROWS = 8;

const TAG_TONE = {
  mismatch: 'bg-destructive/10 text-destructive',
  duplicate: 'bg-warning-soft text-warning',
  coverage: 'bg-muted text-muted-foreground',
} as const;

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
    ...duplicates.map((g) => {
      const isMismatch = mismatchSet.has(g.hubTargetPath);
      return {
        key: `dup-${g.hubTargetPath}`,
        name: g.name,
        detail: g.tools.join(' · '),
        tag: isMismatch ? `内容不一致 · ${g.distinctVersions} 版` : `重复 ${g.tools.length} 份`,
        tone: isMismatch ? TAG_TONE.mismatch : TAG_TONE.duplicate,
      };
    }),
    ...coverage.map((g) => ({
      key: `cov-${g.hubTargetPath}`,
      name: g.name,
      detail: `只在 ${g.tools.join('、')} 中存在`,
      tag: '覆盖不全',
      tone: TAG_TONE.coverage,
    })),
  ];
  const visibleRows = rows.slice(0, MAX_ROWS);
  const restRows = rows.length - visibleRows.length;

  return (
    <section data-testid="onboarding-result">
      <h2 className="text-24 font-bold tracking-tight">
        盘点完成，你有 <span className="text-primary">{total}</span> 个资产
      </h2>
      {total === 0 ? (
        <div className="mt-6 max-w-[720px] rounded-xl border border-dashed bg-muted/20 px-6 py-8 text-center">
          <p className="text-14 font-medium">没有检测到可导入的资产</p>
          <p className="mt-2 text-12 leading-relaxed text-muted-foreground">
            可以先去使用 AI 工具积累配置，之后从「连接」或「收藏到我的库」随时导入。
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-14 text-muted-foreground">
            分布在 {toolCount} 个已安装的工具中，此前没有任何一处能看到全貌。
          </p>

          <div className="mt-5 grid max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(CATEGORY_LABELS)
              .filter(([code]) => (byCategory[code] ?? 0) > 0)
              .map(([code, label]) => (
                <div key={code} className="rounded-xl border bg-card px-4 py-3.5">
                  <p className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
                    {byCategory[code]}
                  </p>
                  <p className="mt-2 text-12 text-muted-foreground">{label}</p>
                </div>
              ))}
          </div>

          {rows.length > 0 ? (
            <div className="mt-5 max-w-[720px] overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5">
              <div className="flex items-center gap-2 border-b border-destructive/15 px-5 py-3 text-13 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {mismatched.length > 0
                  ? '发现重复维护，其中一部分已经不一致'
                  : '发现重复维护'}
              </div>
              <ul className="divide-y divide-destructive/10">
                {visibleRows.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-[84px] shrink-0 truncate text-13 font-medium text-foreground">
                      {row.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-12 text-muted-foreground">
                      {row.detail}
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-12 font-semibold ${row.tone}`}
                    >
                      {row.tag}
                    </span>
                  </li>
                ))}
                {restRows > 0 && (
                  <li className="px-5 py-2 text-12 text-muted-foreground">还有 {restRows} 组</li>
                )}
              </ul>
            </div>
          ) : (
            <div className="mt-5 flex max-w-[720px] items-center gap-2 rounded-xl border bg-card px-5 py-3.5 text-13 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              未发现重复维护
            </div>
          )}

          <p className="mt-4 max-w-[720px] text-13 leading-relaxed text-muted-foreground">
            收进资产库后，这些内容只需要维护 <b className="font-semibold text-foreground">1 份</b>，
            换工具时不必再重写一遍。
          </p>
        </>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Button
          className="h-10 rounded-lg px-5 text-14 font-semibold"
          onClick={onCollect}
          disabled={total === 0}
          data-testid="onboarding-collect-start"
        >
          全部收进资产库
        </Button>
        <button
          type="button"
          className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>
      <p className="mt-2.5 text-12 text-muted-foreground/80">原文件不动，任何一步都可撤销</p>
    </section>
  );
}
