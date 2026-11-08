/**
 * 一键整改弹窗（add-asset-governance I4）
 *
 * 流程严格两段：先出计划（勾选 + 调用估算 + 不可修复项原因），
 * 用户点「确认执行」后才逐项写库；结束时给成功/失败/跳过汇总与「撤销本批」。
 * 「一键整改」不等于跳过确认——确认按钮是硬门槛。
 *
 * spec: specs/asset-health-score.spec.md Scenario 7/8/9
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEscapeKey } from '@/lib/use-escape-key';
import { api } from '@/lib/api';
import type {
  RemediationApplyResponse,
  RemediationPlan,
  RemediationPlanItem,
} from '@/types/api';

export interface RemediationDialogProps {
  onClose: () => void;
  /** 写库成功后通知首页刷新健康分 */
  onCompleted?: () => void;
}

type Phase =
  | { kind: 'planning' }
  | { kind: 'ready'; plan: RemediationPlan }
  | { kind: 'running'; plan: RemediationPlan }
  | { kind: 'done'; response: RemediationApplyResponse }
  | { kind: 'failed'; message: string };

const STATUS_LABEL: Record<RemediationApplyResponse['results'][number]['status'], string> = {
  fixed: '已修复',
  failed: '失败',
  skipped: '跳过',
};

export function RemediationDialog({ onClose, onCompleted }: RemediationDialogProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'planning' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undoState, setUndoState] = useState<string | null>(null);
  useEscapeKey(true, onClose);

  useEffect(() => {
    let alive = true;
    api
      .getRemediationPlan({})
      .then((plan) => {
        if (!alive) return;
        setSelected(new Set(plan.items.map((item) => item.id)));
        setPhase({ kind: 'ready', plan });
      })
      .catch((err: unknown) => {
        if (alive) setPhase({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const execute = async (plan: RemediationPlan): Promise<void> => {
    setPhase({ kind: 'running', plan });
    try {
      const response = await api.applyRemediation({
        itemIds: plan.items.filter((item) => selected.has(item.id)).map((item) => item.id),
        distribute: false,
      });
      setPhase({ kind: 'done', response });
      if (response.succeeded > 0) onCompleted?.();
    } catch (err) {
      setPhase({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const undo = async (batchId: string): Promise<void> => {
    setUndoState('正在撤销…');
    try {
      const result = await api.undoRemediation(batchId);
      setUndoState(
        result.failures.length === 0
          ? `已恢复 ${result.restored.length} 项`
          : `已恢复 ${result.restored.length} 项，${result.failures.length} 项未恢复`,
      );
      onCompleted?.();
    } catch (err) {
      setUndoState(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="一键整改"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">一键整改</h2>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {phase.kind === 'planning' && <p className="text-sm text-muted-foreground">正在生成整改计划…</p>}
          {phase.kind === 'failed' && (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">{phase.message}</span>
            </div>
          )}

          {(phase.kind === 'ready' || phase.kind === 'running') && (
            <>
              <PlanSummary plan={phase.plan} />
              <div className="space-y-2">
                {phase.plan.items.map((item) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    checked={selected.has(item.id)}
                    disabled={phase.kind === 'running'}
                    onToggle={() => toggle(item.id)}
                  />
                ))}
              </div>
              {phase.plan.skipped.length > 0 && (
                <details className="rounded-md border px-3 py-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    {phase.plan.skipped.length} 项不在本批范围（需人工判断或超出上限）
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {phase.plan.skipped.map((item) => (
                      <li key={item.hubRelativePath} className="text-xs text-muted-foreground">
                        {item.assetName}：{item.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {phase.kind === 'running' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在逐项生成草案并写库…
                </div>
              )}
            </>
          )}

          {phase.kind === 'done' && <ApplySummary response={phase.response} undoState={undoState} />}
        </div>

        {(phase.kind === 'ready' || phase.kind === 'running') && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              已选 {selected.size} 项 · 预计调用 {phase.plan.items.filter((i) => selected.has(i.id) && i.estimatedCalls === 1).length} 次模型
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={phase.kind === 'running'}>
                取消
              </Button>
              <Button
                size="sm"
                disabled={phase.kind === 'running' || selected.size === 0}
                onClick={() => {
                  if (phase.kind === 'ready') void execute(phase.plan);
                }}
              >
                {phase.kind === 'running' ? '执行中…' : '确认执行（只改库）'}
              </Button>
            </div>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
            {phase.response.rollbackAvailable && (
              <Button
                variant="secondary"
                size="sm"
                disabled={undoState === '正在撤销…'}
                onClick={() => void undo(phase.response.batchId)}
              >
                {undoState ?? '撤销本批'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanSummary({ plan }: { plan: RemediationPlan }): JSX.Element {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      共 {plan.totalAssets} 个资产可整改，预计 {plan.estimatedCalls} 次模型调用（缓存命中的不消耗）。
      {plan.truncated && ` 单批上限 ${plan.batchLimit} 个，其余请下一批处理。`}
    </div>
  );
}

function PlanRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: RemediationPlanItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <label className="flex items-start gap-2 rounded-md border px-3 py-2">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`选择 ${item.assetName}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{item.assetName}</span>
          <Badge variant={item.severity === 'high' ? 'destructive' : item.severity === 'medium' ? 'warning' : 'secondary'}>
            {item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低'}
          </Badge>
          {item.cached ? <Badge variant="secondary">缓存命中 · 不消耗</Badge> : <Badge variant="outline">1 次调用</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.issueSummary}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground break-all">{item.hubRelativePath}</p>
      </div>
    </label>
  );
}

function ApplySummary({
  response,
  undoState,
}: {
  response: RemediationApplyResponse;
  undoState: string | null;
}): JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        成功 {response.succeeded} / 失败 {response.failed} / 跳过 {response.skipped}
      </div>
      {undoState !== null && <p className="text-xs text-muted-foreground">{undoState}</p>}
      <div className="space-y-1">
        {response.results.map((result) => (
          <div key={result.itemId} className="flex items-start gap-2 text-xs">
            {result.status === 'fixed' ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
            ) : result.status === 'failed' ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
            ) : (
              <CircleSlash className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              {result.hubRelativePath} · {STATUS_LABEL[result.status]}
              {result.reason !== undefined ? `：${result.reason}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
