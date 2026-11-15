/**
 * 跨类别批量诊断结果（refactor-governance-center T5）
 *
 * 只做展示：按「问题类型 → 资产」两层聚合，行内只给资产库深链，不提供就地修复。
 * 失败项单独列出并可只重试失败项；成功项不重跑（spec Scenario 3.4 / 3.5）。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 3
 */

import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { KIND_LABEL } from '@/components/quality/ClusterList';
import type { DiagnosisReport, DiagnosisSeverity, DoctorAssetKind } from '@/types/api';

export type BatchRunStatus = 'pending' | 'running' | 'done' | 'failed';

export interface BatchRunItem {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  status: BatchRunStatus;
  report?: DiagnosisReport;
  error?: string;
}

export interface ResultFinding {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  severity: DiagnosisSeverity;
  suggestion: string;
}

export interface ResultGroup {
  title: string;
  severity: DiagnosisSeverity;
  items: ResultFinding[];
}

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

export function runItemKey(item: { kind: DoctorAssetKind; hubRelativePath: string }): string {
  return `${item.kind}:${item.hubRelativePath}`;
}

export function assetLink(item: { kind: DoctorAssetKind; hubRelativePath: string }): string {
  return `/vault/${item.kind}?asset=${encodeURIComponent(item.hubRelativePath)}`;
}

/** 聚合：问题类型（标题）→ 资产；组按最严重级别、再按资产数降序 */
export function groupFindingsByTitle(items: BatchRunItem[]): ResultGroup[] {
  const groups = new Map<string, ResultGroup>();
  for (const item of items) {
    const report = item.report;
    if (item.status !== 'done' || report === undefined) continue;
    for (const finding of report.findings ?? []) {
      if (finding.ignored) continue;
      const existing = groups.get(finding.title);
      const entry: ResultFinding = {
        kind: item.kind,
        hubRelativePath: item.hubRelativePath,
        severity: finding.severity,
        suggestion: finding.suggestion,
      };
      if (existing === undefined) {
        groups.set(finding.title, { title: finding.title, severity: finding.severity, items: [entry] });
        continue;
      }
      existing.items.push(entry);
      if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[existing.severity]) {
        existing.severity = finding.severity;
      }
    }
  }
  const list = [...groups.values()];
  for (const group of list) {
    group.items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }
  list.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return rank !== 0 ? rank : b.items.length - a.items.length;
  });
  return list;
}

export interface BatchDiagnosisResultsProps {
  items: BatchRunItem[];
  rulesVersion: string;
  mechanicalOnly: boolean;
  running: boolean;
  onRetryFailed: () => void;
}

export function BatchDiagnosisResults({
  items,
  rulesVersion,
  mechanicalOnly,
  running,
  onRetryFailed,
}: BatchDiagnosisResultsProps): JSX.Element {
  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed');
  const groups = groupFindingsByTitle(items);

  return (
    <div className="space-y-3" data-testid="batch-diagnosis-results">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-xs">
          <Badge variant="outline">规则集 v{rulesVersion}</Badge>
          <span>
            完成 {done} / 共 {items.length} 个资产
          </span>
          {failed.length > 0 && <Badge variant="destructive">失败 {failed.length}</Badge>}
          {mechanicalOnly && <Badge variant="secondary">本次不评估语义质量</Badge>}
          {failed.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={running}
              onClick={onRetryFailed}
            >
              重试失败项（{failed.length}）
            </Button>
          )}
        </CardContent>
      </Card>

      {failed.length > 0 && (
        <Card data-testid="batch-failed-list">
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              失败项（可单独重试，不影响已完成项）
            </div>
            {failed.map((item) => (
              <div key={runItemKey(item)} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {KIND_LABEL[item.kind]} · {item.hubRelativePath}
                </span>
                <span className="text-destructive">{item.error ?? '诊断失败'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {done === 0 ? '尚未完成任何资产的诊断。' : '本轮未发现需要处理的问题。'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <Card key={group.title} data-testid={`result-group-${group.title}`}>
              <CardContent className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={severityVariant(group.severity)}>{SEVERITY_LABEL[group.severity]}</Badge>
                  <span className="text-sm font-medium">{group.title}</span>
                  <span className="text-xs text-muted-foreground">影响 {group.items.length} 个资产</span>
                </div>
                {group.items.map((item) => (
                  <div
                    key={`${runItemKey(item)}:${group.title}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
                      <span className="truncate font-medium">{item.hubRelativePath}</span>
                      <span className="text-muted-foreground">{item.suggestion}</span>
                    </span>
                    <Link to={assetLink(item)} className="text-xs text-primary underline underline-offset-2">
                      在资产库中打开
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
