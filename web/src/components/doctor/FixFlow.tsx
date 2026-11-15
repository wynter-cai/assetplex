/**
 * FixFlow 修复流状态机（add-asset-doctor F4）
 *
 * 状态机：select（勾选可修复问题）→ drafting → draft（草案可编辑+逐问题说明）→
 * confirm（一屏确认：原文对照 + 草案编辑 + 工具勾选 + 备份说明 + identity 警示）→
 * result（逐工具分发结果 + 撤销本次修复 / 回滚本次分发）。
 * advisory-only 红线：草案阶段库内零变化，落盘唯一入口是 confirm 后的一次显式点击。
 * 子视图在 FixFlowViews.tsx（守 300 行上限），本文件只做状态与 API 编排。
 * spec: 设计文档/changes/add-asset-doctor/specs/fix-and-distribute.spec.md
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { ConfirmView, DraftView, ResultView, SelectView } from './FixFlowViews';
import type { DiagnosisReport, DoctorApplyResponse, DoctorAssetKind, FixDraftResponse, AssetWriteToolCandidate } from '@/types/api';

export interface FixFlowProps {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  report: DiagnosisReport;
  /** 应用成功后自动复检一次（refactor-asset-pipeline T9）；缺省不自动跑 */
  onRecheck?: () => Promise<DiagnosisReport | null>;
  /** 撤销成功回调：父级据此把摘要置为过期，且不触发诊断 */
  onUndone?: () => void;
  /** 自动复检开关（设置页可关，默认开） */
  autoRecheck?: boolean;
  /** 复检是否会真实调用模型（服务端判定；仅用于确认屏披露） */
  recheckWillCallModel?: boolean;
}

type FlowView =
  | { kind: 'select' }
  | { kind: 'drafting' }
  | { kind: 'draftError'; message: string }
  | { kind: 'draft'; draft: FixDraftResponse }
  | { kind: 'confirm'; draft: FixDraftResponse }
  | { kind: 'applying' }
  | { kind: 'applyError'; message: string; draft: FixDraftResponse }
  | { kind: 'result'; apply: DoctorApplyResponse };

export function FixFlow(props: FixFlowProps): JSX.Element {
  const fixableIssues = props.report.issues
    .map((issue, index) => ({ issue, index }))
    .filter((entry) => entry.issue.fixable);

  const [view, setView] = useState<FlowView>({ kind: 'select' });
  const [checked, setChecked] = useState<number[]>(fixableIssues.map((entry) => entry.index));
  const [draftText, setDraftText] = useState('');
  const [lastDraft, setLastDraft] = useState<FixDraftResponse | null>(null);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [toolCandidates, setToolCandidates] = useState<AssetWriteToolCandidate[]>([]);
  const [undoMessage, setUndoMessage] = useState('');
  const [recheckMessage, setRecheckMessage] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const autoRecheck = props.autoRecheck ?? false;
  const rechecked = useRef(false);

  // 医生类别是分发类别子集（command 除外，适配器矩阵暂无该键）
  const supportsKind = (tool: AssetWriteToolCandidate): boolean => {
    if (props.kind === 'command') return true;
    return tool.supportMatrix[props.kind].supported === true;
  };

  // 进入确认屏才拉工具清单（默认全勾已安装且支持该类别的工具）
  useEffect(() => {
    if (view.kind !== 'confirm' && view.kind !== 'result') return;
    if (toolCandidates.length > 0) return;
    api
      .getDistributionTools()
      .then((res) => {
        const installed = res.tools.filter((t) => t.installed && supportsKind(t));
        setToolCandidates(installed);
        setToolNames((prev) => (prev.length > 0 ? prev : installed.map((t) => t.name)));
      })
      .catch(() => setToolCandidates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, toolCandidates.length, props.kind]);

  const generateDraft = (): void => {
    setView({ kind: 'drafting' });
    api
      .doctorFixDraft({
        kind: props.kind,
        hubRelativePath: props.hubRelativePath,
        issueIndexes: checked,
      })
      .then((draft) => {
        setDraftText(draft.draftContent);
        setLastDraft(draft);
        setView({ kind: 'draft', draft });
      })
      .catch((err: unknown) =>
        setView({ kind: 'draftError', message: err instanceof Error ? err.message : String(err) }),
      );
  };

  const runRecheck = (): void => {
    if (props.onRecheck === undefined) return;
    setRechecking(true);
    setRecheckMessage('');
    props
      .onRecheck()
      .then((fresh) => {
        if (fresh === null) {
          setRecheckMessage('复检失败：未能取得新结论');
          return;
        }
        const remaining =
          fresh.findings !== undefined && fresh.findings.length > 0
            ? fresh.findings.filter((finding) => !finding.ignored).length
            : fresh.issues.length;
        setRecheckMessage(`已修复 ${checked.length} 项，剩余 ${remaining} 项`);
      })
      .catch((err: unknown) =>
        setRecheckMessage(`复检失败：${err instanceof Error ? err.message : String(err)}`),
      )
      .finally(() => setRechecking(false));
  };

  const submitApply = (): void => {
    const distribute = toolNames.length > 0;
    setView({ kind: 'applying' });
    api
      .doctorApply({
        kind: props.kind,
        hubRelativePath: props.hubRelativePath,
        finalContent: draftText,
        distribute,
        ...(distribute ? { targets: toolNames } : {}),
      })
      .then((apply) => {
        setView({ kind: 'result', apply });
        // 写库已成功：自动复检只补充结论，失败不回滚写库事实
        if (autoRecheck && !rechecked.current) {
          rechecked.current = true;
          runRecheck();
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const fallback: FixDraftResponse =
          lastDraft ?? { draftContent: draftText, changeNotes: [], contentTruncated: false, cached: false, model: '' };
        setView({ kind: 'applyError', message, draft: fallback });
      });
  };

  const undoFix = (backupRef: string): void => {
    api
      .doctorUndo(backupRef)
      .then(() => {
        setUndoMessage('已撤销：库内已恢复修复前的旧版本');
        // 撤销后不自动复检（不调用模型），只让摘要标记过期
        props.onUndone?.();
      })
      .catch((err: unknown) =>
        setUndoMessage(err instanceof Error ? err.message : String(err)),
      );
  };

  const rollbackDispatch = (writeId: string): void => {
    api
      .rollbackRemediation(writeId)
      .then(() => setUndoMessage('已回滚本次分发（工具文件已恢复到分发前）'))
      .catch((err: unknown) =>
        setUndoMessage(err instanceof Error ? err.message : String(err)),
      );
  };

  return (
    <div role="region" aria-label="修复流" className="rounded border border-border bg-background p-3 space-y-2">
      {view.kind === 'select' && (
        <SelectView
          issues={fixableIssues}
          checked={checked}
          onToggle={(index) =>
            setChecked((prev) =>
              prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b),
            )
          }
          onGenerate={generateDraft}
          disabled={checked.length === 0}
        />
      )}

      {view.kind === 'drafting' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在生成修复草案…（库内暂无变化）
        </p>
      )}

      {view.kind === 'draftError' && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{view.message}</p>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView({ kind: 'select' })}>
            返回重选
          </Button>
        </div>
      )}

      {(view.kind === 'draft' || view.kind === 'confirm') && (
        <DraftView
          draft={view.draft}
          draftText={draftText}
          onTextChange={setDraftText}
          onBackToSelect={() => setView({ kind: 'select' })}
          onRegenerate={generateDraft}
          onConfirm={view.kind === 'draft' ? () => setView({ kind: 'confirm', draft: view.draft }) : undefined}
        />
      )}

      {view.kind === 'confirm' && props.kind === 'identity' && (
        <p className="text-xs font-medium text-destructive">
          ⚠ 这是人格基座（identity）资产——改写将影响所有工具中的人格设定，请逐字核对草案。
        </p>
      )}

      {view.kind === 'confirm' && autoRecheck && (
        <p className="text-xs text-muted-foreground">
          保存后将自动复检
          {props.recheckWillCallModel === true ? '（将调用 1 次模型）' : '（语义结论已缓存，不调用模型）'}
        </p>
      )}

      {view.kind === 'confirm' && (
        <ConfirmView
          originalPath={props.hubRelativePath}
          toolCandidates={toolCandidates}
          toolNames={toolNames}
          onToggleTool={(name) =>
            setToolNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
          }
          onSubmit={submitApply}
        />
      )}

      {view.kind === 'applying' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在备份旧版并写入，逐工具同步中…
        </p>
      )}

      {view.kind === 'applyError' && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{view.message}</p>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView({ kind: 'confirm', draft: view.draft })}>
            返回确认屏
          </Button>
        </div>
      )}

      {view.kind === 'result' && (
        <ResultView
          apply={view.apply}
          toolCandidates={toolCandidates}
          onUndo={() => undoFix(view.apply.backupRef)}
          onRollback={rollbackDispatch}
        />
      )}

      {undoMessage !== '' && <p className="text-xs text-muted-foreground">{undoMessage}</p>}

      {rechecking && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在复检修复结果…
        </p>
      )}
      {!rechecking && recheckMessage !== '' && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-2"
        >
          <p className={`text-xs ${recheckMessage.startsWith('复检失败') ? 'text-destructive' : 'text-muted-foreground'}`}>
            {recheckMessage}
          </p>
          {recheckMessage.startsWith('复检失败') && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={runRecheck}>
              重试复检
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
