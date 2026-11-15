/**
 * 质量中心问题聚类列表（refactor-governance-center T3）
 *
 * 只渲染接口返回的聚类与顺序，不重排、不再聚类；展开只影响本条，
 * 样例只给「在资产库中打开」深链，不内嵌诊断面板、不触发任何诊断请求。
 *
 * spec: governance-center.spec.md Scenario 2.2–2.5 / 7.1–7.2
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatHomeTimestamp } from '@/lib/use-home-dashboard';
import type {
  DiagnosisSeverity,
  DoctorAssetKind,
  QualityCoverage,
  QualityIssueCluster,
} from '@/types/api';

const KIND_LABEL: Record<DoctorAssetKind, string> = {
  identity: '身份',
  skill: '技能',
  rule: '规则',
  agent: '子代理',
  command: '命令',
  memory: '记忆',
};

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

export interface ClusterListProps {
  clusters: QualityIssueCluster[];
  coverage: QualityCoverage;
  lastCheckedAt: string;
}

function CoverageNote({ coverage }: { coverage: QualityCoverage }): JSX.Element {
  return (
    <Card data-testid="quality-coverage">
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-xs text-muted-foreground">
        <Badge variant="outline">规则集 v{coverage.rulesVersion}</Badge>
        <span>
          评估 {coverage.evaluatedRules} 条 · 跳过 {coverage.skippedRules} 条
        </span>
        {coverage.noChannelRules > 0 && (
          <span>另有 {coverage.noChannelRules} 条规则暂无诊断通道</span>
        )}
        {!coverage.semanticEvaluated && <Badge variant="secondary">语义未评估</Badge>}
        {coverage.ignoredCount > 0 && (
          <Badge variant="outline">已忽略 {coverage.ignoredCount} 条</Badge>
        )}
        {!coverage.semanticEvaluated && (
          <p className="w-full">
            语义规则本轮未评估，静态检查结果不代表通过；配置 AI 端点后可补充语义检查。
          </p>
        )}
        {coverage.ignoredCount > 0 && (
          <p className="w-full">已忽略的条目不参与扣分，也不计入健康结论。</p>
        )}
      </CardContent>
    </Card>
  );
}

function HealthyEmpty({
  rulesVersion,
  lastCheckedAt,
}: {
  rulesVersion: string;
  lastCheckedAt: string;
}): JSX.Element {
  return (
    <Card data-testid="empty-healthy">
      <CardContent className="space-y-2 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
        <p className="text-base font-medium">未发现违反规则集的问题</p>
        <p className="text-xs text-muted-foreground">规则集版本 v{rulesVersion}</p>
        <p className="text-xs text-muted-foreground">
          最近一次体检 {formatHomeTimestamp(lastCheckedAt) || '暂无记录'}
        </p>
      </CardContent>
    </Card>
  );
}

function ClusterRow({ cluster }: { cluster: QualityIssueCluster }): JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = `cluster-panel-${cluster.key}`;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        data-testid={`cluster-toggle-${cluster.key}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={severityVariant(cluster.severity)}>
              {SEVERITY_LABEL[cluster.severity]}
            </Badge>
            <span data-testid="cluster-title" className="text-sm font-medium">
              {cluster.title}
            </span>
            <Badge variant="outline">
              {cluster.keySource === 'rule' ? '按规则编号聚合' : '按规则标题聚合'}
            </Badge>
            {cluster.mode === 'llm' && <Badge variant="secondary">需模型</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            影响 {cluster.assetCount} 个资产 · 命中 {cluster.hitCount} 次 ·{' '}
            <span>
              高 {cluster.severityDistribution.high} / 中 {cluster.severityDistribution.medium} / 低{' '}
              {cluster.severityDistribution.low}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span data-testid={`cluster-fixable-${cluster.key}`}>
              {cluster.fixableAssetCount > 0
                ? `可修复 ${cluster.fixableAssetCount} 个`
                : '需人工判断'}
            </span>
            <span className="text-muted-foreground">预计调用 {cluster.estimatedCalls} 次</span>
          </div>
        </div>
      </button>

      {open && (
        <div
          id={panelId}
          data-testid={panelId}
          className="space-y-2 border-t px-3 py-3"
        >
          <p className="text-xs text-muted-foreground">影响样例（最多 3 条）</p>
          {cluster.samples.slice(0, 3).map((sample) => (
            <div
              key={`${sample.hubRelativePath}:${sample.assetName}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
            >
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-medium">{sample.assetName}</span>
                <Badge variant="outline">{KIND_LABEL[sample.kind]}</Badge>
                <Badge variant={severityVariant(sample.severity)}>
                  {SEVERITY_LABEL[sample.severity]}
                </Badge>
                {sample.fixable && <span className="text-muted-foreground">可修复</span>}
              </span>
              <Link
                to={sample.deepLink}
                className="text-xs text-primary underline underline-offset-2"
              >
                在资产库中打开
              </Link>
            </div>
          ))}
          {cluster.samples.length === 0 && (
            <p className="text-xs text-muted-foreground">暂无样例，可在对应类别页查看。</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ClusterList({ clusters, coverage, lastCheckedAt }: ClusterListProps): JSX.Element {
  const [showSortDetail, setShowSortDetail] = useState(false);

  return (
    <div className="space-y-3" data-testid="cluster-list">
      <CoverageNote coverage={coverage} />

      {clusters.length === 0 ? (
        <HealthyEmpty rulesVersion={coverage.rulesVersion} lastCheckedAt={lastCheckedAt} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              按影响面降序（受影响资产数 × 严重度权重）→ 同分按预计调用升序，依次排列。
            </p>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showSortDetail}
              onClick={() => setShowSortDetail((prev) => !prev)}
            >
              排序依据
            </Button>
          </div>
          {showSortDetail && (
            <p className="text-xs text-muted-foreground">
              影响面 = 受影响资产数 × 严重度权重（高 3 / 中 2 / 低 1），同分按预计调用升序；仍相同按规则集声明顺序，前端不重排。
            </p>
          )}

          <div className="space-y-2">
            {clusters.map((item) => (
              <ClusterRow key={item.key} cluster={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
