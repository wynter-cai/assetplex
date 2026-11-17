/**
 * 技能子集诊断对话框（refactor-skill-catalog T11）
 *
 * 流程：预估（零模型）→ 展示 total/cacheHits/willCall/mechanicalOnly/不可诊断明细
 * → 需要时二次确认（超确认阈值或超硬上限给出原因并禁用）
 * → 逐条并发执行（只跑 estimate.targets，不可诊断项不静默丢弃）。
 * 成本未知（预估失败、字段缺失、超上限）一律禁用发起，绝不在未预估时调用模型。
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { useSkillDiagnosisPool, type DiagnosisRow } from './use-skill-diagnosis-pool';
import { SkillDiagnosisResults, toSummaryInputs } from './SkillDiagnosisResults';
import type { SkillDiagnoseEstimate, SkillUnDiagnosableReason } from '@/types/api';

const UN_DIAGNOSABLE_LABEL: Record<SkillUnDiagnosableReason, string> = {
  'not-in-library': '未入库，收藏后可诊断',
  'missing-file': '文件读不到，不可诊断',
  'not-found': '技能已不存在',
};

type View =
  | { kind: 'estimating' }
  | { kind: 'estimateError'; message: string }
  | { kind: 'ready'; estimate: SkillDiagnoseEstimate }
  | { kind: 'confirm'; estimate: SkillDiagnoseEstimate }
  | { kind: 'running'; estimate: SkillDiagnoseEstimate }
  | { kind: 'done'; estimate: SkillDiagnoseEstimate };

export interface SkillDiagnosisDialogProps {
  /** 本次所选技能 id；父组件只在非空时挂载 */
  ids: string[];
  onClose: () => void;
  /** 执行完毕回调（父组件可刷新看板） */
  onCompleted?: (rows: DiagnosisRow[]) => void;
  /** 结果行「去修复」：打开单技能详情并定位到资产医生 */
  onOpenFix?: (row: DiagnosisRow) => void;
}

/** 发起条件：有目标、未超选择上限、未超调用硬上限 */
function launchBlockReason(estimate: SkillDiagnoseEstimate): string | null {
  if (estimate.overSelectionLimit) {
    return `一次最多 ${estimate.limits.maxSelection} 个，请分批（当前选择 ${estimate.total} 个）`;
  }
  if (estimate.overCallLimit) {
    return `本次预计调用 ${estimate.willCall} 次，超过单次上限 ${estimate.limits.maxCalls} 次，请分批`;
  }
  if (estimate.targets.length === 0) return '所选技能均不可诊断';
  return null;
}

function EstimateLines({ estimate }: { estimate: SkillDiagnoseEstimate }): JSX.Element {
  return (
    <div className="space-y-1 text-xs">
      <p>
        共 {estimate.total} 项，{estimate.cacheHits} 条命中缓存不消耗，将调用 {estimate.willCall} 次模型；
        可诊断 {estimate.diagnosable} 项。
      </p>
      {estimate.mechanicalOnly && (
        <p className="text-muted-foreground">
          未配置 AI 端点：将只跑机械检查，零模型调用——本次不含语义诊断。
        </p>
      )}
      {!estimate.mechanicalOnly && estimate.willCall > 0 && (
        <p className="text-muted-foreground">数据边界：仅技能正文与适用准则发往你自配的端点，不经第三方。</p>
      )}
      {estimate.unDiagnosable.length > 0 && (
        <div className="rounded border bg-muted/30 p-2">
          <p className="mb-1 font-medium">不可诊断 {estimate.unDiagnosable.length} 项</p>
          <ul className="space-y-0.5">
            {estimate.unDiagnosable.map((item) => (
              <li key={item.id} className="flex gap-1.5">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-muted-foreground">{UN_DIAGNOSABLE_LABEL[item.reason]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SkillDiagnosisDialog(props: SkillDiagnosisDialogProps): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'estimating' });
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<DiagnosisRow[]>([]);
  const queryClient = useQueryClient();
  const pool = useSkillDiagnosisPool();

  useEffect(() => {
    let alive = true;
    setView({ kind: 'estimating' });
    api
      .estimateSkillDiagnosis(props.ids)
      .then((estimate) => {
        if (alive) setView({ kind: 'ready', estimate });
      })
      .catch((err: unknown) => {
        if (alive) setView({ kind: 'estimateError', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [props.ids, attempt]);

  /** 结果回写摘要（T12）：服务端算哈希；部分失败只提示不整体失败，随后刷新看板 */
  const writeSummaries = (finished: DiagnosisRow[]): void => {
    const items = toSummaryInputs(finished);
    if (items.length === 0) return;
    api
      .putSkillDiagnosisSummaries(items)
      .then((result) => {
        if (result.rejected.length > 0) {
          toast.info('部分摘要未写入', { description: `${result.rejected.length} 个技能被拒绝（未入库或已删除）` });
        }
      })
      .catch((err: unknown) => {
        toast.error('摘要回写失败', { description: errorMessage(err) });
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      });
  };

  const start = (estimate: SkillDiagnoseEstimate): void => {
    setView({ kind: 'running', estimate });
    void pool.run(estimate.targets).then((finished) => {
      setRows(finished);
      setView({ kind: 'done', estimate });
      writeSummaries(finished);
      props.onCompleted?.(finished);
    });
  };

  /** 只重跑失败项，成功后合并结果并只回写这批 */
  const retryFailed = (ids: string[]): void => {
    const targets = rows.filter((row) => ids.includes(row.target.id)).map((row) => row.target);
    if (targets.length === 0) return;
    void pool.run(targets).then((retried) => {
      setRows((prev) => prev.map((row) => retried.find((item) => item.target.id === row.target.id) ?? row));
      writeSummaries(retried);
    });
  };

  const estimate = 'estimate' in view ? view.estimate : null;
  const blockReason = estimate === null ? null : launchBlockReason(estimate);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Stethoscope className="h-4 w-4" />
            诊断选中 {props.ids.length} 个技能
          </DialogTitle>
          <DialogDescription>先估算成本，确认后才逐条执行；批量只到诊断为止，不提供批量修复。</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {view.kind === 'estimating' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              成本估算中…
            </p>
          )}

          {view.kind === 'estimateError' && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              无法估算成本，暂不能发起：{view.message}
            </p>
          )}

          {estimate !== null && <EstimateLines estimate={estimate} />}

          {blockReason !== null && view.kind === 'ready' && <p className="text-xs text-destructive">{blockReason}</p>}

          {view.kind === 'confirm' && (
            <p className="text-xs font-medium text-destructive">
              本次将调用 {view.estimate.willCall} 次模型（超过 {view.estimate.limits.confirmThreshold} 次需确认），
              请确认继续。
            </p>
          )}

          {view.kind === 'running' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              诊断中 {pool.done} / {view.estimate.targets.length}（单条失败不中断）
            </p>
          )}

          {view.kind === 'done' && (
            <SkillDiagnosisResults
              rows={rows}
              retrying={pool.running}
              onRetryFailed={retryFailed}
              onOpenFix={props.onOpenFix}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            {view.kind === 'done' ? '关闭' : '取消'}
          </Button>
          {view.kind === 'ready' && (
            <Button
              size="sm"
              disabled={blockReason !== null}
              onClick={() => (view.estimate.confirmRequired ? setView({ kind: 'confirm', estimate: view.estimate }) : start(view.estimate))}
            >
              发起诊断
            </Button>
          )}
          {view.kind === 'confirm' && (
            <Button size="sm" onClick={() => start(view.estimate)}>仍然发起</Button>
          )}
          {view.kind === 'estimateError' && (
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>重试预估</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
