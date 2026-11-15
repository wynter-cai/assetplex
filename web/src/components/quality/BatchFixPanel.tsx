/**
 * 跨类别批量修复面板（refactor-governance-center T6）
 *
 * 影响清单（会动哪些资产、涉及哪些规则、预计几次调用）→ 二次确认 → 执行 → 汇总 → 整批撤销。
 * 只处理 fixable 项；不可修复 / 被过滤项如实列出原因，不静默丢弃；执行中禁止重复发起。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 4
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KIND_LABEL } from '@/components/quality/ClusterList';
import { api } from '@/lib/api';
import type {
  DiagnosisSeverity,
  DoctorAssetKind,
  RemediationApplyResponse,
  RemediationPlan,
  RemediationPlanRequest,
} from '@/types/api';

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

/** 类别分布摘要：技能 3 / 规则 2 */
export function formatKindDistribution(distribution: Partial<Record<DoctorAssetKind, number>>): string {
  return Object.entries(distribution)
    .map(([kind, count]) => `${KIND_LABEL[kind as DoctorAssetKind]} ${count ?? 0}`)
    .join(' / ');
}

export interface BatchFixPanelProps {
  ruleIds?: string[];
  clusterKeys?: string[];
}

export function BatchFixPanel({ ruleIds, clusterKeys }: BatchFixPanelProps): JSX.Element {
  const request: RemediationPlanRequest = {
    ...(ruleIds === undefined ? {} : { ruleIds }),
    ...(clusterKeys === undefined ? {} : { clusterKeys }),
  };
  const planQuery = useQuery({
    queryKey: ['remediation-plan', request],
    queryFn: () => api.getRemediationPlan(request),
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<RemediationApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan: RemediationPlan | null = planQuery.data ?? null;
  const canApply = plan !== null && plan.items.length > 0 && !applying;

  async function apply(): Promise<void> {
    if (plan === null) return;
    setApplying(true);
    setError(null);
    try {
      const response = await api.applyRemediation({
        itemIds: plan.items.map((item) => item.id),
        distribute: false,
        ...(ruleIds === undefined ? {} : { ruleIds }),
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量修复失败');
    } finally {
      setApplying(false);
      setConfirmOpen(false);
    }
  }

  async function undo(): Promise<void> {
    if (result === null) return;
    setApplying(true);
    setError(null);
    try {
      const undone = await api.undoRemediation(result.batchId);
      setResult(null);
      if (undone.failures.length > 0) {
        setError(`撤销完成，但 ${undone.failures.length} 个资产恢复失败`);
      }
      await planQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : '撤销失败');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="batch-fix-panel">
      {planQuery.isLoading && <p className="text-sm text-muted-foreground">正在生成影响清单…</p>}
      {planQuery.isError && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            影响清单生成失败：
            {planQuery.error instanceof Error ? planQuery.error.message : '请稍后重试'}
          </CardContent>
        </Card>
      )}

      {plan !== null && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Wrench className="h-4 w-4" />
              <span>将处理 {plan.totalAssets} 个资产</span>
              <span>预计调用 {plan.estimatedCalls} 次</span>
              {plan.totalAssets > 0 && <span>（{formatKindDistribution(plan.kindDistribution)}）</span>}
              {plan.truncated && <Badge variant="secondary">超出单批上限 {plan.batchLimit}，其余请在下一批处理</Badge>}
            </div>
            {plan.nonBatchableCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {plan.nonBatchableCount} 个资产的可修复项不满足当前圈选条件，未计入本批。
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              只改库内正文（改前自动备份），不分发给工具；执行后可整批撤销。
            </p>

            {plan.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前圈选没有可自动修复的问题。</p>
            ) : (
              <div className="space-y-1.5" data-testid="batch-fix-items">
                {plan.items.map((item) => (
                  <div key={item.id} className="rounded-md border px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant={severityVariant(item.severity)}>{SEVERITY_LABEL[item.severity]}</Badge>
                      <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
                      <span className="font-medium">{item.assetName}</span>
                      <span className="text-muted-foreground">{item.hubRelativePath}</span>
                      <span className="ml-auto text-muted-foreground">
                        {item.cached ? '草案命中缓存，不消耗调用' : `预计 ${item.estimatedCalls} 次调用`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.issueSummary}</p>
                    <p className="text-xs text-muted-foreground">规则：{item.ruleIds.join('、')}</p>
                  </div>
                ))}
              </div>
            )}

            {plan.skipped.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary>跳过 {plan.skipped.length} 项（含原因）</summary>
                <ul className="mt-1 space-y-0.5">
                  {plan.skipped.map((item) => (
                    <li key={`${item.hubRelativePath}:${item.reason}`}>
                      {item.assetName}：{item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!canApply} onClick={() => setConfirmOpen(true)}>
                {applying ? '执行中…' : `确认修复这 ${plan.totalAssets} 个资产`}
              </Button>
              {error !== null && <span className="text-xs text-destructive">{error}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {result !== null && (
        <Card data-testid="batch-fix-result">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              批量修复完成：成功 {result.succeeded} · 失败 {result.failed} · 跳过 {result.skipped}
            </p>
            {result.results
              .filter((item) => item.status !== 'fixed')
              .map((item) => (
                <p key={item.itemId} className="text-xs text-muted-foreground">
                  {item.hubRelativePath}：{item.reason ?? item.status}
                </p>
              ))}
            <Button variant="outline" disabled={result.succeeded === 0 || applying} onClick={() => void undo()}>
              撤销整批（{result.succeeded} 个）
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认执行批量修复？</DialogTitle>
            <DialogDescription>
              将改写 {plan?.totalAssets ?? 0} 个资产的库内正文，改前自动备份，预计调用模型{' '}
              {plan?.estimatedCalls ?? 0} 次。执行只改库、不分发给工具，完成后可整批撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void apply()}>确认执行</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
