/**
 * 质量中心页单维度问题清单（refactor-home-action-panel T11）
 *
 * 复用健康分下钻的查询口径（queryKey `['governance-issues', dimension]` + limit 50），
 * 点条目在页内就地渲染体检报告（DiagnosisPanel autoStart），不跳页、不写库。
 * 不提供筛选、排序切换、批量、忽略、稍后与应用修复。
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/navigation.spec.md Requirement 7
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiagnosisPanel } from '@/components/doctor/DiagnosisPanel';
import { api } from '@/lib/api';
import type { DiagnosisSeverity, HealthDimensionId, HealthIssueRef } from '@/types/api';

export interface DimensionIssuesProps {
  dimension: HealthDimensionId;
  label: string;
}

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

function IssueRow({ issue }: { issue: HealthIssueRef }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={severityVariant(issue.severity)}>{SEVERITY_LABEL[issue.severity]}</Badge>
            <span className="text-sm font-medium">{issue.assetName}</span>
            {issue.fixable ? (
              <Badge variant="secondary">可修复</Badge>
            ) : (
              <Badge variant="outline">需人工判断</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{issue.title}</p>
        </div>
      </button>
      {open && (
        <div className="border-t px-3 py-3 space-y-2">
          <p className="text-xs text-muted-foreground break-all">{issue.hubRelativePath}</p>
          <DiagnosisPanel kind={issue.kind} hubRelativePath={issue.hubRelativePath} autoStart />
        </div>
      )}
    </div>
  );
}

export function DimensionIssues({ dimension, label }: DimensionIssuesProps): JSX.Element {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['governance-issues', dimension],
    queryFn: () => api.getGovernanceIssues({ dimension, limit: 50 }),
  });

  return (
    <Card data-testid={`issues-${dimension}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span>{label}问题清单</span>
          <span className="text-xs font-normal text-muted-foreground">
            {data === undefined ? '正在读取…' : `共 ${data.total} 项`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {isError && (
          <div className="flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">问题清单读取失败。</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              重试
            </Button>
          </div>
        )}
        {data !== undefined && data.items.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            这个维度暂无问题。
          </div>
        )}
        {data?.items.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
      </CardContent>
    </Card>
  );
}
