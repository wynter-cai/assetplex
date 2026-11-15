/**
 * 资产医生体检面板（add-asset-doctor E6 → refactor-asset-pipeline T7-T9）
 *
 * 详情打开即读「上次诊断摘要」（零模型），再决定要不要点一次诊断：
 * 摘要栏说明四态与成本，报告区展示问题与证据，修复流应用后自动复检一次。
 * advisory-only：草案阶段库内零变化，落盘唯一入口是确认屏的显式点击。
 * spec: 设计文档/changes/add-asset-doctor/specs/asset-diagnosis.spec.md
 *      设计文档/changes/refactor-asset-pipeline/specs/asset-pipeline.spec.md
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toHubRelative } from '@/lib/hub-path';
import { AiConfigDialog } from '@/components/skills/AiConfigDialog';
import { DiagnosisSummaryBar } from './DiagnosisSummaryBar';
import { IssueList } from './IssueList';
import { FixFlow } from './FixFlow';
import { DistributionGate } from './DistributionGate';
import type { DiagnosisOverall, DiagnosisReport, DoctorAssetKind, RuleFinding } from '@/types/api';

const OVERALL_LABEL: Record<DiagnosisOverall, string> = {
  healthy: '健康',
  'needs-attention': '需关注',
  'at-risk': '有风险',
};

/** 设置页开关：修复后自动复检（默认开，'0' 为关） */
export const AUTO_RECHECK_KEY = 'assetplex:auto-recheck-after-fix';

function autoRecheckEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUTO_RECHECK_KEY) !== '0';
  } catch {
    return true;
  }
}

function overallVariant(overall: DiagnosisOverall): 'success' | 'warning' | 'destructive' {
  if (overall === 'healthy') return 'success';
  if (overall === 'needs-attention') return 'warning';
  return 'destructive';
}

export interface DiagnosisPanelProps {
  kind: DoctorAssetKind;
  /** Hub 相对路径（资产库/规则/身份详情直用） */
  hubRelativePath?: string;
  /** 绝对路径（技能/agent 详情用）；组件经 hubRoot 换算并判定是否库内 */
  absolutePath?: string;
  /** 挂载即发起一次体检（健康分下钻：点问题直接看到报告） */
  autoStart?: boolean;
  /** 详情内「分发到工具」：复用资产库既有的同步管理对话框 */
  onDistribute?: () => void;
}

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; report: DiagnosisReport }
  | { kind: 'failed'; message: string };

export function DiagnosisPanel(props: DiagnosisPanelProps): JSX.Element | null {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoStarted = useRef(false);
  const queryClient = useQueryClient();

  // 只有拿到绝对路径才查 hub-health；Hub 相对路径直用
  const needsResolve = props.hubRelativePath === undefined && props.absolutePath !== undefined;
  const { data: health } = useQuery({
    queryKey: ['hub-health'],
    queryFn: api.getHubHealth,
    enabled: needsResolve,
  });

  const hubRelativePath =
    props.hubRelativePath ??
    (needsResolve && health !== undefined && props.absolutePath !== undefined
      ? toHubRelative(health.hubRoot, props.absolutePath)
      : null);

  // 摘要：打开详情就读，零模型；失败只降级摘要，不影响正文
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['doctor-summary', props.kind, hubRelativePath],
    queryFn: () =>
      api.getDoctorSummary({ kind: props.kind, hubRelativePath: hubRelativePath as string }),
    enabled: hubRelativePath !== null,
    retry: false,
  });

  const invalidateSummary = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['doctor-summary', props.kind] });
  };

  /** 忽略只影响展示与计分：本地先落状态，失败再提示，不悄悄吞错 */
  const applyIgnored = (ruleId: string, ignored: boolean): void => {
    setState((prev) =>
      prev.kind === 'done'
        ? {
            kind: 'done',
            report: {
              ...prev.report,
              findings: (prev.report.findings ?? []).map((item) =>
                item.ruleId === ruleId ? { ...item, ignored } : item,
              ),
            },
          }
        : prev,
    );
  };

  const ignoreFinding = (finding: RuleFinding): void => {
    if (hubRelativePath === null) return;
    setActionError(null);
    void api
      .ignoreDiagnosisFinding({ kind: props.kind, hubRelativePath, ruleId: finding.ruleId })
      .then(() => {
        applyIgnored(finding.ruleId, true);
        invalidateSummary();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : String(err));
      });
  };

  const restoreFinding = (finding: RuleFinding): void => {
    if (hubRelativePath === null) return;
    setActionError(null);
    void api
      .restoreDiagnosisFinding({ hubRelativePath, ruleId: finding.ruleId })
      .then(() => {
        applyIgnored(finding.ruleId, false);
        invalidateSummary();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : String(err));
      });
  };

  const runDiagnose = (): Promise<DiagnosisReport> => {
    setState({ kind: 'loading' });
    return api
      .doctorDiagnose({ kind: props.kind, hubRelativePath: hubRelativePath as string })
      .then((report) => {
        setState({ kind: 'done', report });
        invalidateSummary();
        return report;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
        throw err;
      });
  };

  // 下钻直达：仅自动触发一次，后续「重新诊断」仍由用户点击
  useEffect(() => {
    if (props.autoStart !== true || autoStarted.current || state.kind !== 'idle') return;
    if (hubRelativePath === null) return;
    autoStarted.current = true;
    void runDiagnose().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoStart, state.kind, hubRelativePath]);

  if (hubRelativePath === null) return null;

  return (
    <div className="space-y-2">
      <DiagnosisSummaryBar
        summary={summary ?? null}
        loading={summaryLoading}
        diagnosing={state.kind === 'loading'}
        onDiagnose={() => {
          void runDiagnose().catch(() => undefined);
        }}
        onConfigureAi={() => setAiDialogOpen(true)}
      />

      {state.kind === 'failed' && <p className="text-xs text-destructive">{state.message}</p>}

      {state.kind === 'done' && (
        <>
          <p role="status" aria-live="polite" className="sr-only">
            {`诊断完成：${(state.report.findings ?? state.report.issues).filter((item) => !('ignored' in item && item.ignored)).length} 个问题`}
          </p>
          <ReportView report={state.report} onIgnore={ignoreFinding} onRestore={restoreFinding} />
          {actionError !== null && <p className="text-xs text-destructive">{actionError}</p>}
          {!state.report.mechanicalOnly && state.report.issues.some((issue) => issue.fixable) && (
            <FixFlow
              kind={props.kind}
              hubRelativePath={hubRelativePath}
              report={state.report}
              onRecheck={async () => {
                try {
                  return await runDiagnose();
                } catch {
                  return null;
                }
              }}
              onUndone={invalidateSummary}
              autoRecheck={autoRecheckEnabled()}
              recheckWillCallModel={summary?.willCallModel === true}
            />
          )}
          {props.onDistribute !== undefined && (
            <DistributionGate report={state.report} onDistribute={props.onDistribute} />
          )}
        </>
      )}

      <AiConfigDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onSaved={() => {
          setAiDialogOpen(false);
          invalidateSummary();
        }}
      />
    </div>
  );
}

/** 单份报告渲染（批量体检结果展开也复用，add-asset-doctor F5；批量不传回调 = 只读） */
export function ReportView({
  report,
  onIgnore,
  onRestore,
}: {
  report: DiagnosisReport;
  onIgnore?: (finding: RuleFinding) => void;
  onRestore?: (finding: RuleFinding) => void;
}): JSX.Element {
  const modelLabel = !report.mechanicalOnly && report.model !== '' ? report.model : null;
  return (
    <div role="region" aria-label="体检报告" className="rounded border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={overallVariant(report.overall)}>{OVERALL_LABEL[report.overall]}</Badge>
        {report.cached && <Badge variant="secondary">来自缓存</Badge>}
        {modelLabel !== null && <span className="text-xs text-muted-foreground">{modelLabel}</span>}
      </div>

      <IssueList
        report={report}
        {...(onIgnore === undefined ? {} : { onIgnore })}
        {...(onRestore === undefined ? {} : { onRestore })}
      />

      {report.mechanicalOnly && (
        <p className="text-xs text-muted-foreground">
          当前仅确定性检查结果——配置 AI 端点后可诊断语义质量问题。
        </p>
      )}
      {!report.mechanicalOnly && report.criteriaSkipped > 0 && (
        <p className="text-xs text-muted-foreground">
          提示：{report.criteriaSkipped} 条准则未参与本次诊断（预算截断）
        </p>
      )}
      {!report.mechanicalOnly && report.criteriaUsed.length === 0 && (
        <p className="text-xs text-muted-foreground">
          当前无自定义准则，结论基于内置基线——保存准则后诊断会更贴合你的标准
        </p>
      )}
    </div>
  );
}
