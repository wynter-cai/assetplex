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

  return (
    <section data-testid="onboarding-result" className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">
        盘点完成，你有 <span className="text-primary">{total}</span> 个资产
      </h2>
      {total === 0 ? (
        <div className="mt-6 rounded-lg border p-6 text-center">
          <p className="text-sm font-medium">没有检测到可导入的资产</p>
          <p className="mt-2 text-xs text-muted-foreground">
            可以先去使用 AI 工具积累配置，之后从「连接」或「收藏到我的库」随时导入。
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-muted-foreground">
            分布在 {toolCount} 个已安装的工具中，此前没有任何一处能看到全貌。
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(CATEGORY_LABELS)
              .filter(([code]) => (byCategory[code] ?? 0) > 0)
              .map(([code, label]) => (
                <div key={code} className="rounded-lg border px-4 py-3 text-center">
                  <p className="text-2xl font-semibold">{byCategory[code]}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
          </div>

          {duplicates.length > 0 ? (
            <div className="mt-6 rounded-lg border border-warning/40 bg-warning-soft p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-warning" />
                发现重复维护
                {mismatched.length > 0 ? '，其中一部分已经不一致' : ''}
              </p>
              <ul className="mt-3 space-y-2">
                {duplicates.slice(0, 8).map((g) => (
                  <li key={g.hubTargetPath} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {g.tools.join(' · ')}
                    </span>
                    <span className="text-xs font-medium text-warning whitespace-nowrap">
                      {mismatchSet.has(g.hubTargetPath) ? `内容不一致（${g.distinctVersions} 版）` : `重复 ${g.tools.length} 份`}
                    </span>
                  </li>
                ))}
                {duplicates.length > 8 && (
                  <li className="text-xs text-muted-foreground">还有 {duplicates.length - 8} 组重复</li>
                )}
              </ul>
            </div>
          ) : (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              未发现重复维护
            </p>
          )}

          {coverage.length > 0 && (
            <div className="mt-4 rounded-lg border p-4">
              <p className="text-sm font-medium">只在部分工具中存在</p>
              <ul className="mt-2 space-y-1.5">
                {coverage.slice(0, 5).map((g) => (
                  <li key={g.hubTargetPath} className="text-xs text-muted-foreground">
                    {g.name}：只在 {g.tools.join('、')} 中存在（已安装 {insights?.installedTools.length ?? 0} 个工具）
                  </li>
                ))}
                {coverage.length > 5 && (
                  <li className="text-xs text-muted-foreground">还有 {coverage.length - 5} 项</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={onCollect} disabled={total === 0} data-testid="onboarding-collect-start">
          全部收进资产库
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">原文件不动，任何一步都可撤销</p>
    </section>
  );
}
