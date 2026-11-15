/**
 * 质量中心 · 跨类别批量诊断（refactor-governance-center T5）
 *
 * 两种圈选（类别多选 + 问题类型多选）→ 必须预估（缓存命中 / 需调用分开）→
 * 超过 50 次二次确认 → 并发 4 逐资产诊断 → 按「问题类型 → 资产」聚合。
 * 页面只读：任何路径都不写库，失败项可单独重试。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 3
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, PlayCircle } from 'lucide-react';
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
import {
  BatchDiagnosisResults,
  runItemKey,
  type BatchRunItem,
} from '@/components/quality/BatchDiagnosisResults';
import { api } from '@/lib/api';
import type { BatchDiagnoseEstimate, DoctorAssetKind } from '@/types/api';

const KINDS: DoctorAssetKind[] = ['identity', 'skill', 'rule', 'agent', 'command', 'memory'];
const CONCURRENCY = 4;

/** 发起闸门：缺成本字段 / 超上限 / 无可诊断资产时返回禁用原因（前端不自行推算成本） */
export function startBlockReason(estimate: BatchDiagnoseEstimate | null, running: boolean): string | null {
  if (running) return '批量诊断进行中…';
  if (estimate === null) return '正在估算成本…';
  if (typeof estimate.cacheHits !== 'number' || typeof estimate.willCall !== 'number') {
    return '无法估算成本，暂不能发起';
  }
  if (estimate.totalAssets === 0) return '当前圈选没有可诊断的资产';
  if (estimate.totalAssets > estimate.limits.maxAssets) {
    return `单次最多 ${estimate.limits.maxAssets} 个资产，请删减类别或问题类型后分批发起`;
  }
  if (estimate.willCall > estimate.limits.hardMaxCalls) {
    return `单次实际调用上限 ${estimate.limits.hardMaxCalls} 次，请分批发起`;
  }
  return null;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function QualityBatch(): JSX.Element {
  const [kinds, setKinds] = useState<DoctorAssetKind[]>(KINDS);
  const [clusterKeys, setClusterKeys] = useState<string[]>([]);
  const [items, setItems] = useState<Record<string, BatchRunItem>>({});
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ranRulesVersion, setRanRulesVersion] = useState('');
  const [ranMechanicalOnly, setRanMechanicalOnly] = useState(false);

  const overviewQuery = useQuery({ queryKey: ['quality-overview'], queryFn: () => api.getQualityOverview(false) });
  const clusters = overviewQuery.data?.clusters ?? [];

  const estimateQuery = useQuery({
    queryKey: ['batch-diagnose-estimate', kinds.join(','), clusterKeys.join(',')],
    queryFn: () =>
      api.estimateBatchDiagnosis({
        kinds,
        ...(clusterKeys.length > 0 ? { clusterKeys } : {}),
      }),
    enabled: kinds.length > 0,
  });

  const estimate = estimateQuery.data ?? null;
  const blockReason = startBlockReason(estimate, running);
  const itemList = useMemo(() => Object.values(items), [items]);

  async function runTargets(targets: BatchDiagnoseEstimate['targets']): Promise<void> {
    if (targets.length === 0) return;
    setRunning(true);
    setRanRulesVersion(estimate?.rulesVersion ?? '');
    setRanMechanicalOnly(estimate !== null && estimate.willCall === 0 && estimate.semanticSkipped > 0);
    const queue = [...targets];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const key = runItemKey(next);
        setItems((prev) => ({ ...prev, [key]: { ...next, status: 'running' } }));
        try {
          const report = await api.doctorDiagnose(next);
          setItems((prev) => ({ ...prev, [key]: { ...next, status: 'done', report } }));
        } catch (err) {
          setItems((prev) => ({
            ...prev,
            [key]: { ...next, status: 'failed', error: err instanceof Error ? err.message : '诊断失败' },
          }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));
    setRunning(false);
  }

  function start(): void {
    if (estimate === null || blockReason !== null) return;
    if (estimate.willCall > estimate.limits.confirmAboveCalls) {
      setConfirmOpen(true);
      return;
    }
    void runTargets(estimate.targets);
  }

  function retryFailed(): void {
    const failed = itemList.filter((item) => item.status === 'failed');
    void runTargets(failed.map(({ kind, hubRelativePath }) => ({ kind, hubRelativePath })));
  }

  const doneCount = itemList.filter((item) => item.status === 'done').length;

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <Link to="/quality" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />
          返回体检报告
        </Link>
        <h1 className="text-xl font-semibold">跨类别批量诊断</h1>
        <p className="text-sm text-muted-foreground">
          圈定一批资产复检；发起前先看到会花多少次模型调用，诊断只读、不改任何文件。
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">按类别</p>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant={kinds.includes(kind) ? 'default' : 'outline'}
                  aria-pressed={kinds.includes(kind)}
                  onClick={() => setKinds((prev) => toggle(prev, kind))}
                >
                  {KIND_LABEL[kind]}
                </Button>
              ))}
              <Badge variant="outline" title="MCP 资产暂无诊断通道">
                MCP（暂不支持诊断）
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">按问题类型（与类别取交集）</p>
            {clusters.length === 0 ? (
              <p className="text-xs text-muted-foreground">当前体检没有发现问题类型，可不选直接按类别复检。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {clusters.map((cluster) => (
                  <Button
                    key={cluster.key}
                    size="sm"
                    variant={clusterKeys.includes(cluster.key) ? 'default' : 'outline'}
                    aria-pressed={clusterKeys.includes(cluster.key)}
                    onClick={() => setClusterKeys((prev) => toggle(prev, cluster.key))}
                  >
                    {cluster.title}（{cluster.assetCount}）
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="batch-estimate">
        <CardContent className="space-y-2 p-4">
          {estimateQuery.isLoading && <p className="text-sm text-muted-foreground">正在估算成本…</p>}
          {estimateQuery.isError && (
            <p className="text-sm text-destructive">
              预估失败：{estimateQuery.error instanceof Error ? estimateQuery.error.message : '请稍后重试'}
              <span className="ml-1 text-muted-foreground">（无法估算成本，暂不能发起）</span>
            </p>
          )}
          {estimate !== null && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>共 {estimate.totalAssets} 个资产</span>
                <span>缓存命中 {estimate.cacheHits} 个</span>
                <span>需调用 {estimate.willCall} 次</span>
                <span>不可诊断 {estimate.unDiagnosable.length} 个</span>
                {estimate.semanticSkipped > 0 && <span>本轮跳过 {estimate.semanticSkipped} 条语义规则</span>}
                <Badge variant="outline">规则集 v{estimate.rulesVersion}</Badge>
              </div>
              {estimate.semanticSkipped > 0 && (
                <p className="text-xs text-muted-foreground">
                  跳过的语义规则不会显示为通过：未配置 AI 端点或语义开关关闭时，本次只跑静态规则。
                </p>
              )}
              {estimate.unDiagnosable.length > 0 && (
                <div className="space-y-1 text-xs text-muted-foreground" data-testid="batch-undiagnosable">
                  {estimate.unDiagnosable.map((item) => (
                    <p key={`${item.kind}:${item.hubRelativePath}`}>
                      {KIND_LABEL[item.kind]} · {item.hubRelativePath}：
                      {item.reason === 'env-asset'
                        ? '不在库内的环境条目，医生不服务'
                        : item.reason === 'unreadable'
                          ? '文件读不到'
                          : item.reason === 'unsupported-kind'
                            ? '该类别暂无诊断通道'
                            : '规则集未加载'}
                    </p>
                  ))}
                </div>
              )}
              {(estimate.totalAssets > estimate.limits.maxAssets ||
                estimate.willCall > estimate.limits.hardMaxCalls) && (
                <p className="text-xs text-destructive">
                  单次最多 {estimate.limits.maxAssets} 个资产 · 实际调用上限 {estimate.limits.hardMaxCalls} 次；
                  已选集合不会被截断，请自行删减后分批发起。
                </p>
              )}
              {estimate.willCall > estimate.limits.confirmAboveCalls &&
                estimate.willCall <= estimate.limits.hardMaxCalls && (
                  <p className="text-xs text-muted-foreground">预计调用超过 {estimate.limits.confirmAboveCalls} 次，发起前会再确认一次。</p>
                )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={blockReason !== null} onClick={start}>
              <PlayCircle className="mr-1.5 h-4 w-4" />
              {running ? `诊断中… ${doneCount}/${itemList.length}` : '发起批量诊断'}
            </Button>
            {blockReason !== null && <span className="text-xs text-muted-foreground">{blockReason}</span>}
          </div>
        </CardContent>
      </Card>

      {itemList.length > 0 && (
        <BatchDiagnosisResults
          items={itemList}
          rulesVersion={ranRulesVersion}
          mechanicalOnly={ranMechanicalOnly}
          running={running}
          onRetryFailed={retryFailed}
        />
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认发起批量诊断？</DialogTitle>
            <DialogDescription>
              本轮预计调用模型 {estimate?.willCall ?? 0} 次（缓存命中 {estimate?.cacheHits ?? 0} 个不消耗调用）。
              诊断只读，不会修改任何资产。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                if (estimate !== null) void runTargets(estimate.targets);
              }}
            >
              确认发起
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
