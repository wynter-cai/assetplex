/**
 * 首页资产健康卡（add-asset-governance H4）
 *
 * 用接口真实四维健康分替换旧版 `60 + 资产数 × 4` 的假分数：
 * - 总分 + 四个维度条 + 最大扣分项一句话
 * - 点击维度 → 问题清单下钻
 * - 零资产不展示 0 分，改为「先把家底搬进来」
 * - 维度无对象标「不适用」，读取失败标「数据缺失」，都不伪造 0
 *
 * spec: 设计文档/changes/add-asset-governance/specs/asset-health-score.spec.md
 */

import { Boxes, Loader2, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { GovernanceHealth, HealthDimension, HealthDimensionId, HealthGrade } from '@/types/api';

export interface HomeHeroProps {
  hubInitialized: boolean;
  health: GovernanceHealth | null;
  healthLoading: boolean;
  healthError: boolean;
  healthRefreshing?: boolean;
  onStartOnboarding?: () => void;
  onRefreshHealth?: () => void;
  onOpenIssues?: (dimension: HealthDimensionId) => void;
  onConfigureAi?: () => void;
  /** 一键整改入口（打开两段式确认弹窗，不代表跳过确认） */
  onStartRemediation?: () => void;
}

const GRADE_LABEL: Record<HealthGrade, string> = {
  empty: '待盘点',
  'at-risk': '有风险',
  'needs-attention': '需要打理',
  good: '状态良好',
  excellent: '家底干净',
};

const GRADE_TONE: Record<HealthGrade, string> = {
  empty: 'text-muted-foreground',
  'at-risk': 'text-destructive',
  'needs-attention': 'text-amber-600',
  good: 'text-primary',
  excellent: 'text-primary',
};

/** 维度条颜色：只做状态编码，不用品牌色掩饰低分 */
function barTone(score: number): string {
  if (score < 60) return 'bg-destructive';
  if (score < 75) return 'bg-amber-500';
  return 'bg-primary';
}

function applicabilityText(dimension: HealthDimension): string {
  if (dimension.applicability === 'not-applicable') return '不适用';
  if (dimension.applicability === 'data-missing') return '数据缺失';
  return `${dimension.score ?? 0}`;
}

/** 最大扣分项：唯一一句结论，避免把整张报表塞回首屏 */
function worstSentence(health: GovernanceHealth): string {
  const applicable = health.dimensions.filter((d) => d.applicability === 'applicable');
  if (applicable.length === 0) return '暂无可评估维度';
  const worst = applicable.reduce((min, d) => ((d.score ?? 100) < (min.score ?? 100) ? d : min));
  if ((worst.score ?? 100) >= 90) return '家底干净，未发现明显短板';
  return `最大扣分项：${worst.label}（${worst.score ?? 0} 分，${worst.issueCount} 个问题）`;
}

export function HomeHero({
  hubInitialized,
  health,
  healthLoading,
  healthError,
  healthRefreshing = false,
  onStartOnboarding,
  onRefreshHealth,
  onOpenIssues,
  onConfigureAi,
  onStartRemediation,
}: HomeHeroProps): JSX.Element {
  if (!hubInitialized) {
    return (
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-8 text-center">
          <Boxes className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">欢迎使用 AssetPlex</h2>
          <p className="text-muted-foreground mb-6">
            你的 AI 资产库 — 掌控身份、技能、规则、MCP，换工具不丢东西
          </p>
          <button
            type="button"
            onClick={onStartOnboarding}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            开始盘点你的 AI 资产
          </button>
        </CardContent>
      </Card>
    );
  }

  if (healthLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-10 w-16" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (healthError || health === null) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">健康分暂不可用</h2>
            <p className="text-sm text-muted-foreground">资产仍安全存储，只是这次没算出来。</p>
          </div>
          {onRefreshHealth !== undefined && (
            <Button variant="outline" size="sm" onClick={onRefreshHealth}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              重试
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Scenario 3：零资产不展示 0 分
  if (health.grade === 'empty') {
    return (
      <Card data-testid="health-card-empty">
        <CardContent className="p-8 text-center">
          <Boxes className="h-10 w-10 mx-auto text-primary mb-3" />
          <h2 className="text-xl font-semibold mb-2">先把你的家底搬进来</h2>
          <p className="text-sm text-muted-foreground mb-5">
            导入身份、技能、规则后，AssetPlex 会告诉你哪里需要打理。
          </p>
          <Button onClick={onStartOnboarding}>导入我的 AI 资产</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                资产健康
                {health.cached && <Badge variant="secondary">来自缓存</Badge>}
                {health.qualityMode === 'mechanical-only' && (
                  <Badge variant="outline">语义质量未评估</Badge>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {worstSentence(health)}
              </p>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <div className={`text-3xl font-bold ${GRADE_TONE[health.grade]}`} data-testid="health-score">
                {health.score}
              </div>
              <div className="text-xs text-muted-foreground">
                {GRADE_LABEL[health.grade]} · 共 {health.totalAssets} 项
              </div>
            </div>
            {onStartRemediation !== undefined && (
              <Button variant="outline" size="sm" onClick={onStartRemediation}>
                <Wrench className="h-3.5 w-3.5 mr-1.5" />
                一键整改
              </Button>
            )}
            {onRefreshHealth !== undefined && (
              <Button variant="ghost" size="sm" onClick={onRefreshHealth} disabled={healthRefreshing}>
                {healthRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                重新体检
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {health.dimensions.map((dimension) => (
            <button
              key={dimension.id}
              type="button"
              data-testid={`dimension-${dimension.id}`}
              onClick={() => onOpenIssues?.(dimension.id)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{dimension.label}</span>
                <span className="text-muted-foreground">
                  {applicabilityText(dimension)}
                  {dimension.applicability === 'applicable' && dimension.issueCount > 0
                    ? ` · ${dimension.issueCount} 个问题`
                    : ''}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                {dimension.applicability === 'applicable' && (
                  <div
                    className={`h-full rounded-full ${barTone(dimension.score ?? 0)}`}
                    style={{ width: `${dimension.score ?? 0}%` }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>

        {health.qualityMode === 'mechanical-only' && onConfigureAi !== undefined && (
          <p className="text-xs text-muted-foreground">
            当前只做了机械检查。配置 AI 端点后可评估语义质量，
            <button type="button" className="text-primary underline underline-offset-2" onClick={onConfigureAi}>
              去配置
            </button>
            。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
