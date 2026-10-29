/**
 * 资产医生体检面板（add-asset-doctor E6）
 *
 * 「资产医生」按钮触发单资产诊断（advisory-only：只读）。报告含可修复问题时（非机械降级）
 * 下方接入 FixFlow 修复流：草案→一屏确认→分发结果（落盘唯一入口在 Phase F 的显式点击）。
 * 诊断范围=资产侧：解析不出 Hub 相对路径（环境条目/Hub 外文件）时整个入口不渲染。
 * 报告披露机制与仲裁建议卡同构：结论徽标 / cached / 预算截断 / 机械降级引导 / 失败隔离。
 * spec: 设计文档/changes/add-asset-doctor/specs/asset-diagnosis.spec.md
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stethoscope, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toHubRelative } from '@/lib/hub-path';
import { FixFlow } from './FixFlow';
import type {
  DiagnosisOverall,
  DiagnosisReport,
  DiagnosisSeverity,
  DoctorAssetKind,
} from '@/types/api';

export interface DiagnosisPanelProps {
  kind: DoctorAssetKind;
  /** Hub 相对路径（资产库/规则/身份详情直用） */
  hubRelativePath?: string;
  /** 绝对路径（技能/agent 详情用）；组件经 hubRoot 换算并判定是否库内 */
  absolutePath?: string;
}

const OVERALL_LABEL: Record<DiagnosisOverall, string> = {
  healthy: '健康',
  'needs-attention': '需关注',
  'at-risk': '有风险',
};

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; report: DiagnosisReport }
  | { kind: 'failed'; message: string };

function overallVariant(overall: DiagnosisOverall): 'success' | 'warning' | 'destructive' {
  if (overall === 'healthy') return 'success';
  if (overall === 'needs-attention') return 'warning';
  return 'destructive';
}

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

export function DiagnosisPanel(props: DiagnosisPanelProps): JSX.Element | null {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });

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
  // 环境条目（Hub 外）不提供医生入口；路径尚不可解析时也不渲染
  if (hubRelativePath === null) return null;

  const diagnose = (): void => {
    setState({ kind: 'loading' });
    api
      .doctorDiagnose({ kind: props.kind, hubRelativePath })
      .then((report) => setState({ kind: 'done', report }))
      .catch((err: unknown) =>
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) }),
      );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={diagnose}
          disabled={state.kind === 'loading'}
        >
          {state.kind === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Stethoscope className="h-3.5 w-3.5 mr-1" />
          )}
          {state.kind === 'loading' ? '体检中…' : state.kind === 'idle' ? '资产医生' : '重新体检'}
        </Button>
      </div>

      {state.kind === 'failed' && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}

      {state.kind === 'done' && (
        <>
          <ReportView report={state.report} />
          {!state.report.mechanicalOnly &&
            state.report.issues.some((issue) => issue.fixable) && (
              <FixFlow kind={props.kind} hubRelativePath={hubRelativePath} report={state.report} />
            )}
        </>
      )}
    </div>
  );
}

/** 单份报告渲染（批量体检结果展开也复用，add-asset-doctor F5） */
export function ReportView({ report }: { report: DiagnosisReport }): JSX.Element {
  return (
    <div role="region" aria-label="体检报告" className="rounded border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={overallVariant(report.overall)}>{OVERALL_LABEL[report.overall]}</Badge>
        {report.cached && <Badge variant="secondary">来自缓存</Badge>}
        {!report.mechanicalOnly && report.model !== '' && (
          <span className="text-xs text-muted-foreground">{report.model}</span>
        )}
      </div>

      {report.issues.length === 0 ? (
        <p className="text-xs text-muted-foreground">未发现违反已启用准则的问题</p>
      ) : (
        <ul className="space-y-2">
          {report.issues.map((issue, idx) => (
            <li key={idx} className="text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={severityVariant(issue.severity)}>{SEVERITY_LABEL[issue.severity]}</Badge>
                {issue.criterion.startsWith('mechanical:') ? (
                  <Badge variant="outline">机械检查</Badge>
                ) : (
                  <a className="text-primary underline underline-offset-2" href={`/criteria?slug=${encodeURIComponent(issue.criterion)}`}>
                    {issue.criterion}
                  </a>
                )}
                {issue.fixable && <Badge variant="secondary">可修复</Badge>}
              </div>
              <p className="font-medium">{issue.finding}</p>
              <p className="text-muted-foreground">{issue.suggestion}</p>
            </li>
          ))}
        </ul>
      )}

      {report.mechanicalOnly && (
        <p className="text-xs text-muted-foreground">
          当前仅确定性检查结果——配置 AI 端点后可诊断语义质量问题。
          <a className="ml-1 text-primary underline underline-offset-2" href="/skills">去配置 AI 服务</a>
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
