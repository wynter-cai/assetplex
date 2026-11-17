/**
 * 批量诊断结果聚合面板（refactor-skill-catalog T12 / spec R5）
 *
 * 分组顺序：有风险 → 需关注 → 健康 → 失败；组内按问题严重度从高到低。
 * 行内「去修复」只打开单个技能详情并定位到资产医生——不提供任何批量修复。
 * 失败项可只重试失败 id（重试编排由对话框负责，本组件只给入口）。
 * 底部披露本次规则集版本、模型、生成时间与是否仅机械检查。
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wrench } from 'lucide-react';
import type { DiagnosisOverall, DiagnosisReport } from '@/types/api';
import type { DiagnosisRow } from './use-skill-diagnosis-pool';

type Bucket = DiagnosisOverall | 'failed';

const BUCKET_ORDER: Bucket[] = ['at-risk', 'needs-attention', 'healthy', 'failed'];

const BUCKET_LABEL: Record<Bucket, string> = {
  'at-risk': '有风险',
  'needs-attention': '需关注',
  healthy: '健康',
  failed: '失败',
};

const BUCKET_VARIANT: Record<DiagnosisOverall, 'destructive' | 'warning' | 'success'> = {
  'at-risk': 'destructive',
  'needs-attention': 'warning',
  healthy: 'success',
};

function countsOf(report: DiagnosisReport): { high: number; medium: number; low: number } {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const issue of report.issues) counts[issue.severity] += 1;
  return counts;
}

function topSeverity(report: DiagnosisReport): number {
  const counts = countsOf(report);
  if (counts.high > 0) return 0;
  if (counts.medium > 0) return 1;
  return 2;
}

function bucketOf(row: DiagnosisRow): Bucket {
  if (row.report === null) return 'failed';
  return row.report.overall;
}

/** 组内按最高严重度、再按问题数降序 */
export function sortDiagnosisRows(rows: DiagnosisRow[]): DiagnosisRow[] {
  return [...rows].sort((a, b) => {
    const bucketDiff = BUCKET_ORDER.indexOf(bucketOf(a)) - BUCKET_ORDER.indexOf(bucketOf(b));
    if (bucketDiff !== 0) return bucketDiff;
    if (a.report === null || b.report === null) return 0;
    const sevDiff = topSeverity(a.report) - topSeverity(b.report);
    if (sevDiff !== 0) return sevDiff;
    return b.report.issues.length - a.report.issues.length;
  });
}

function formatTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** 底部披露：取首份成功报告的口径；混合机械/语义时明确标注 */
function Disclosure({ rows }: { rows: DiagnosisRow[] }): JSX.Element {
  const reports = rows.map((row) => row.report).filter((report): report is DiagnosisReport => report !== null);
  const first = reports[0];
  const mechanicalCount = reports.filter((report) => report.mechanicalOnly).length;
  const mechanicalLabel =
    reports.length === 0
      ? null
      : mechanicalCount === reports.length
        ? '本次仅机械检查'
        : mechanicalCount > 0
          ? `部分仅机械检查（${mechanicalCount}/${reports.length}）`
          : null;

  return (
    <p className="border-t pt-2 text-[11px] text-muted-foreground">
      规则集 v{first?.rulesVersion ?? '未知'} · 模型 {first?.model !== undefined && first.model !== '' ? first.model : '未调用'} ·
      生成于 {first === undefined ? '未知' : formatTime(first.generatedAt)}
      {mechanicalLabel !== null && ` · ${mechanicalLabel}`}
    </p>
  );
}

export interface SkillDiagnosisResultsProps {
  rows: DiagnosisRow[];
  retrying?: boolean;
  /** 打开该技能详情并滚动到资产医生（不提供批量修复） */
  onOpenFix?: (row: DiagnosisRow) => void;
  /** 只重跑失败项 */
  onRetryFailed?: (ids: string[]) => void;
}

export function SkillDiagnosisResults(props: SkillDiagnosisResultsProps): JSX.Element {
  const ordered = sortDiagnosisRows(props.rows);
  const failedIds = props.rows.filter((row) => row.error !== null).map((row) => row.target.id);
  const successCount = props.rows.filter((row) => row.report !== null).length;

  let lastBucket: Bucket | null = null;

  return (
    <div role="region" aria-label="诊断结果" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium">
          成功 {successCount} · 失败 {failedIds.length}
        </p>
        {failedIds.length > 0 && props.onRetryFailed !== undefined && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={props.retrying === true}
            onClick={() => props.onRetryFailed?.(failedIds)}
          >
            {props.retrying === true ? '重试中…' : `重试失败项（${failedIds.length}）`}
          </Button>
        )}
        <p className="text-[11px] text-muted-foreground">批量只到诊断为止，逐项修复请在详情里单点确认</p>
      </div>

      <ul className="space-y-1">
        {ordered.map((row) => {
          const bucket = bucketOf(row);
          const header = bucket !== lastBucket ? BUCKET_LABEL[bucket] : null;
          lastBucket = bucket;
          const counts = row.report === null ? null : countsOf(row.report);
          return (
            <li key={row.target.id} className="space-y-1">
              {header !== null && <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{header}</p>}
              <div className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-xs">
                {row.report !== null ? (
                  <Badge variant={BUCKET_VARIANT[row.report.overall]}>{BUCKET_LABEL[row.report.overall]}</Badge>
                ) : (
                  <Badge variant="destructive">失败</Badge>
                )}
                <span className="font-medium" data-testid="diagnosis-result-name">{row.target.name}</span>
                {counts !== null && (
                  <span className="text-muted-foreground">
                    高 {counts.high} · 中 {counts.medium} · 低 {counts.low}
                  </span>
                )}
                {row.report !== null && (
                  <span className="text-muted-foreground">体检 {formatTime(row.report.generatedAt)}</span>
                )}
                {row.error !== null && <span className="min-w-0 flex-1 truncate text-destructive">{row.error}</span>}
                {row.report !== null && props.onOpenFix !== undefined && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-6 px-2 text-[11px]"
                    onClick={() => props.onOpenFix?.(row)}
                  >
                    <Wrench className="mr-0.5 h-3 w-3" />
                    去修复
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Disclosure rows={props.rows} />
    </div>
  );
}

/** 结果 → 摘要回写入参（只取成功项；哈希由服务端计算） */
export function toSummaryInputs(rows: DiagnosisRow[]): Array<{
  id: string;
  overall: DiagnosisOverall;
  issueCounts: { high: number; medium: number; low: number };
  mechanicalOnly: boolean;
  rulesVersion: string;
  model: string;
  checkedAt: string;
}> {
  return rows
    .filter((row): row is DiagnosisRow & { report: DiagnosisReport } => row.report !== null)
    .map((row) => ({
      id: row.target.id,
      overall: row.report.overall,
      issueCounts: countsOf(row.report),
      mechanicalOnly: row.report.mechanicalOnly,
      rulesVersion: row.report.rulesVersion ?? '',
      model: row.report.model,
      checkedAt: row.report.generatedAt,
    }));
}
