/**
 * BatchCheckup 类别页批量体检（add-asset-doctor F5）
 *
 * 预算护栏（proposal D5 / Scenario 5）：先 estimate 显示「将调用 N 次模型」，N>50 二次确认；
 * 执行期前端并发池 ≤4、逐条进度；单条失败进清单不中断；完成后按
 * 有风险→需关注→健康→失败 排序，点条目展开单份报告。
 * 红线（fix-and-distribute Scenario 8）：批量只到诊断为止，不提供任何批量修复入口。
 * 清单由父页面注入（组件保持纯展示+编排，不拉资产列表）。
 */

import { useRef, useState } from 'react';
import { Loader2, Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  DIAGNOSIS_CONCURRENCY,
  useSkillDiagnosisPool,
  type DiagnosisRow,
} from '@/components/skills/use-skill-diagnosis-pool';
import { ReportView } from './DiagnosisPanel';
import type { DiagnosisOverall, DiagnoseEstimate, DoctorAssetKind } from '@/types/api';

export interface BatchCheckupAsset {
  label: string;
  hubRelativePath: string;
}

export interface BatchCheckupProps {
  kind: DoctorAssetKind;
  /** 发起前由页面拉取资产清单（避免组件碰列表 API）；失败进错误态可重试 */
  getAssets: () => Promise<BatchCheckupAsset[]>;
}

type BatchView =
  | { kind: 'closed' }
  | { kind: 'estimating' }
  | { kind: 'estimateError'; message: string }
  | { kind: 'ready'; estimate: DiagnoseEstimate }
  | { kind: 'needConfirm'; estimate: DiagnoseEstimate }
  | { kind: 'running'; estimate: DiagnoseEstimate }
  | { kind: 'done'; estimate: DiagnoseEstimate };

const CONFIRM_THRESHOLD = 50;

/** 排序口径：有风险 → 需关注 → 健康 → 失败（spec Scenario 5） */
const OVERALL_RANK: Record<DiagnosisOverall, number> = { 'at-risk': 0, 'needs-attention': 1, healthy: 2 };

export function BatchCheckup(props: BatchCheckupProps): JSX.Element {
  const [view, setView] = useState<BatchView>({ kind: 'closed' });
  const [expanded, setExpanded] = useState<number | null>(null);
  const assetsRef = useRef<BatchCheckupAsset[]>([]);
  const pool = useSkillDiagnosisPool();

  const open = (): void => {
    setExpanded(null);
    setView({ kind: 'estimating' });
    props
      .getAssets()
      .then((assets) => {
        assetsRef.current = assets;
        return api.doctorEstimate(props.kind);
      })
      .then((estimate) => setView({ kind: 'ready', estimate }))
      .catch((err: unknown) =>
        setView({ kind: 'estimateError', message: err instanceof Error ? err.message : String(err) }),
      );
  };

  const startRun = (estimate: DiagnoseEstimate): void => {
    setExpanded(null);
    setView({ kind: 'running', estimate });
    const targets = assetsRef.current.map((asset, index) => ({
      id: String(index),
      name: asset.label,
      hubRelativePath: asset.hubRelativePath,
    }));
    void pool.run(targets).then(() => setView({ kind: 'done', estimate }));
  };

  const onLaunchClick = (estimate: DiagnoseEstimate): void => {
    if (estimate.willCall > CONFIRM_THRESHOLD) {
      setView({ kind: 'needConfirm', estimate });
      return;
    }
    startRun(estimate);
  };

  if (view.kind === 'closed') {
    return (
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={open}>
        <Stethoscope className="h-3.5 w-3.5 mr-1" />
        全部体检
      </Button>
    );
  }

  const estimate = view.kind === 'ready' || view.kind === 'needConfirm' || view.kind === 'running' || view.kind === 'done' ? view.estimate : null;
  const completedRows = pool.rows.filter((row): row is DiagnosisRow => row !== null);
  const failedCount = completedRows.filter((r) => r.error !== null).length;
  const okCount = completedRows.filter((r) => r.report !== null).length;

  // 完成态排序：失败（report=null）恒最后；其余按 overall 三档
  const orderedRows: Array<DiagnosisRow & { sourceIndex: number }> = [];
  if (view.kind === 'done') {
    const withIndex = pool.rows.map((row, i) => {
      const asset = assetsRef.current[i];
      return {
        row: row ?? { target: { id: String(i), name: asset?.label ?? '', hubRelativePath: '' }, report: null, error: '未获得结果' },
        sourceIndex: i,
      };
    });
    withIndex.sort((a, b) => {
      const rankA = a.row.report === null ? 3 : OVERALL_RANK[a.row.report.overall];
      const rankB = b.row.report === null ? 3 : OVERALL_RANK[b.row.report.overall];
      return rankA - rankB;
    });
    orderedRows.push(...withIndex.map((e) => ({ ...e.row, sourceIndex: e.sourceIndex })));
  }

  return (
    <div role="region" aria-label="批量体检" className="rounded border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5" />
          批量体检
        </p>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setView({ kind: 'closed' })}>
          收起
        </Button>
      </div>

      {view.kind === 'estimating' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          预算估算中…
        </p>
      )}

      {view.kind === 'estimateError' && <p className="text-xs text-destructive">{view.message}</p>}

      {estimate !== null && (view.kind === 'ready' || view.kind === 'needConfirm' || view.kind === 'running' || view.kind === 'done') && (
        <p className="text-xs text-muted-foreground">
          将调用 {estimate.willCall} 次模型（{estimate.cacheHits} 条来自缓存不消耗），共 {estimate.total} 项资产。
        </p>
      )}

      {estimate !== null && estimate.willCall === 0 && view.kind === 'ready' && (
        <p className="text-xs text-muted-foreground">
          当前未配置 AI 端点或全部命中缓存——批量将只跑机械检查并明确标注。
        </p>
      )}

      {estimate !== null && estimate.willCall > 0 && view.kind === 'ready' && (
        <p className="text-xs text-muted-foreground">
          隐私边界：仅资产正文与适用准则发往你自配的 AI 端点，不经第三方。
        </p>
      )}

      {view.kind === 'ready' && (
        <Button size="sm" className="h-8 text-xs" onClick={() => onLaunchClick(view.estimate)}>
          发起体检
        </Button>
      )}

      {view.kind === 'needConfirm' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-destructive">
            超过 50 次实际调用（本次 {view.estimate.willCall} 次），将产生可观的模型用量，请确认继续。
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 text-xs" onClick={() => startRun(view.estimate)}>
              仍然发起
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView({ kind: 'ready', estimate: view.estimate })}>
              返回
            </Button>
          </div>
        </div>
      )}

      {view.kind === 'running' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          体检中 {pool.done} / {assetsRef.current.length}（并发 ≤{DIAGNOSIS_CONCURRENCY}，单条失败不中断）
        </p>
      )}

      {view.kind === 'done' && (
        <div className="space-y-2">
          <p className="text-xs font-medium">体检完成：成功 {okCount} · 失败 {failedCount}</p>
          <ul className="space-y-1">
            {orderedRows.map((row, displayIndex) => (
              <li key={row.sourceIndex} className="space-y-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
                  onClick={() => setExpanded(expanded === displayIndex ? null : displayIndex)}
                >
                  {row.report !== null ? (
                    <OverallBadge overall={row.report.overall} />
                  ) : (
                    <Badge variant="destructive">失败</Badge>
                  )}
                  <span className="font-medium">{row.target.name}</span>
                  {row.error !== null && <span className="text-destructive truncate">{row.error}</span>}
                </button>
                {expanded === displayIndex && row.report !== null && <ReportView report={row.report} />}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            批量只到诊断为止——不提供批量修复；逐条修复请在资产详情里走「资产医生 → 生成修复草案」的单点确认。
          </p>
        </div>
      )}
    </div>
  );
}

function OverallBadge({ overall }: { overall: DiagnosisOverall }): JSX.Element {
  const label: Record<DiagnosisOverall, string> = { healthy: '健康', 'needs-attention': '需关注', 'at-risk': '有风险' };
  const variant: Record<DiagnosisOverall, 'success' | 'warning' | 'destructive'> = {
    healthy: 'success',
    'needs-attention': 'warning',
    'at-risk': 'destructive',
  };
  return <Badge variant={variant[overall]}>{label[overall]}</Badge>;
}
