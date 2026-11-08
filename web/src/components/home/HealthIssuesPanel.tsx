/**
 * 健康分下钻问题清单（add-asset-governance H4）
 *
 * 点击健康卡某个维度后打开：按严重度排序列出该维度问题；
 * 点条目就地展开该资产详情与体检报告（DiagnosisPanel autoStart），
 * 不需要先跳到另一个页面再找入口。
 *
 * spec: specs/asset-health-score.spec.md Scenario 6
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEscapeKey } from '@/lib/use-escape-key';
import { api } from '@/lib/api';
import { DiagnosisPanel } from '@/components/doctor/DiagnosisPanel';
import type { DiagnosisSeverity, HealthDimensionId, HealthIssueRef } from '@/types/api';

export interface HealthIssuesPanelProps {
  dimension: HealthDimensionId;
  label: string;
  onClose: () => void;
}

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

export function HealthIssuesPanel({ dimension, label, onClose }: HealthIssuesPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<HealthIssueRef | null>(null);
  useEscapeKey(true, onClose);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['governance-issues', dimension],
    queryFn: () => api.getGovernanceIssues({ dimension, limit: 50 }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${label}问题清单`}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{label}问题清单</h2>
            <p className="text-xs text-muted-foreground">
              {data === undefined ? '正在读取…' : `共 ${data.total} 项，按严重度排序`}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
          {data?.items.map((issue) => {
            const isOpen = expanded?.id === issue.id;
            return (
              <div key={issue.id} className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : issue)}
                  aria-expanded={isOpen}
                >
                  <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
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
                {isOpen && (
                  <div className="border-t px-3 py-3 space-y-2">
                    <p className="text-xs text-muted-foreground break-all">{issue.hubRelativePath}</p>
                    <DiagnosisPanel kind={issue.kind} hubRelativePath={issue.hubRelativePath} autoStart />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
