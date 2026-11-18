/**
 * 单资产诊断摘要栏（refactor-asset-pipeline T7）
 *
 * 纯展示：打开详情即说明「上次什么时候查的、还算不算数、现在点一次会不会花钱」。
 * 数据来自 GET /api/doctor/summary（零模型），组件自身不发请求、不推断成本。
 *
 * 四态：never / valid / stale / available=false（读取失败，此时不再说「没诊断过」）。
 */

import { AlertCircle, Loader2, Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DiagnosisOverall, DoctorSummaryResponse } from '@/types/api';

export interface DiagnosisSummaryBarProps {
  /** null = 详情刚打开、摘要尚未返回 */
  summary: DoctorSummaryResponse | null;
  loading: boolean;
  diagnosing: boolean;
  onDiagnose: () => void;
  /** 未配置 AI 时打开配置对话框（不再跳技能页） */
  onConfigureAi: () => void;
}

const OVERALL_LABEL: Record<DiagnosisOverall, string> = {
  healthy: '健康',
  'needs-attention': '需关注',
  'at-risk': '有风险',
};

const STALE_REASON_LABEL: Record<'content' | 'rules' | 'model', string> = {
  content: '正文已变更',
  rules: '规则集已更新',
  model: '模型已更换',
};

function overallVariant(overall: DiagnosisOverall): 'success' | 'warning' | 'destructive' {
  if (overall === 'healthy') return 'success';
  if (overall === 'needs-attention') return 'warning';
  return 'destructive';
}

/** 「3 天前 / 2 小时前」这类相对时间；解析不出来就返回空串，不显示假时间 */
function relativeTime(iso: string): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';
  const diff = Date.now() - at;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

/** 主按钮文案随状态变化：没有记录才叫「开始诊断」 */
function diagnoseLabel(summary: DoctorSummaryResponse | null, diagnosing: boolean): string {
  if (diagnosing) return '诊断中…';
  if (summary === null || summary.state === 'never') return '开始诊断';
  return '重新诊断';
}

export function DiagnosisSummaryBar(props: DiagnosisSummaryBarProps): JSX.Element {
  const { summary, loading, diagnosing } = props;
  const lastRun = summary?.lastRun ?? null;

  return (
    <div
      role="region"
      aria-label="诊断摘要"
      className="mb-3 max-w-none rounded-md border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={props.onDiagnose}
          disabled={diagnosing}
        >
          {diagnosing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Stethoscope className="h-3.5 w-3.5 mr-1" />
          )}
          {diagnoseLabel(summary, diagnosing)}
        </Button>

        {loading && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            读取上次诊断…
          </span>
        )}

        {!loading && lastRun !== null && (
          <>
            <Badge variant={overallVariant(lastRun.overall)}>{OVERALL_LABEL[lastRun.overall]}</Badge>
            <span className="text-xs text-muted-foreground">
              {lastRun.issueCount} 个问题（高 {lastRun.highSeverityCount}）· 可修复 {lastRun.fixableCount}
              {lastRun.generatedAt !== '' && ` · 上次 ${relativeTime(lastRun.generatedAt)}`}
            </span>
          </>
        )}

        {!loading && (summary === null || (summary.state === 'never' && summary.available)) && (
          <span className="text-xs text-muted-foreground">还没有诊断过这个资产</span>
        )}
      </div>

      {summary !== null && summary.available === false && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          摘要暂不可用（本机记录或资产内容读取失败），不影响查看正文
        </p>
      )}

      {summary !== null && summary.state === 'valid' && (
        <p className="mt-2 text-xs text-muted-foreground">结果有效（不会调用模型）</p>
      )}

      {summary !== null && summary.state === 'stale' && (
        <p className="mt-2 text-xs text-muted-foreground">
          上次结果，已过期（
          {summary.staleReasons.map((reason) => STALE_REASON_LABEL[reason]).join(' / ')}
          ）
        </p>
      )}

      {summary !== null && summary.aiConfigured === false && (
        <p className="mt-2 text-xs text-muted-foreground">
          语义未评估：仅机械与静态规则
          <button
            type="button"
            className="ml-1 text-primary underline underline-offset-2"
            onClick={props.onConfigureAi}
          >
            配置 AI 端点
          </button>
        </p>
      )}

      {summary !== null && summary.aiConfigured && summary.willCallModel && !diagnosing && (
        <p className="mt-2 text-xs text-muted-foreground">本次将调用 1 次模型</p>
      )}

      {lastRun !== null && lastRun.mechanicalOnly && (
        <p className="mt-1 text-xs text-muted-foreground">上次只跑了机械检查，语义未评估</p>
      )}
    </div>
  );
}
