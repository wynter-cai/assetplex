/**
 * 工具热切换页（enable-tool-hot-swap T8/T9）
 *
 * 选目标工具 → 冲突预览(六类分组+覆盖开关) → 执行(覆盖前备份) → 验证结果 → 撤销 → 历史。
 * 诚实边界：结果仅表示"已写入并校验"，不代表工具已加载(spec: swap-verify-rollback)。
 * 全流程本机文件读写，数据不出机器。
 */

import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import type { SwapExecuteResult, SwapOverwriteDecision, SwapPreview, SwapToolCandidate } from '@/types/api';
import { SwapPreviewPanel } from '@/components/swap/SwapPreviewPanel';
import { SwapResultPanel } from '@/components/swap/SwapResultPanel';
import { SwapHistoryList } from '@/components/swap/SwapHistoryList';
import { SWAP_CATEGORY_LABELS } from '@/components/swap/swap-labels';

/** 工具候选卡片：未安装禁用并说明；项目级工具显示能力说明而非六类徽章 */
function ToolCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: SwapToolCandidate;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const supported = (Object.keys(candidate.supportMatrix) as Array<keyof typeof candidate.supportMatrix>).filter(
    (c) => candidate.supportMatrix[c].supported,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!candidate.installed}
      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'hover:bg-accent/50'
      } ${!candidate.installed ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className="flex items-center gap-2 font-medium">
        {candidate.displayName}
        {!candidate.installed && <span className="text-xs text-muted-foreground">未安装</span>}
      </span>
      {candidate.projectLevel ? (
        <span className="mt-1 block text-xs text-muted-foreground">本工具按项目同步</span>
      ) : (
        <span className="mt-1 flex flex-wrap gap-1">
          {supported.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px]">
              {SWAP_CATEGORY_LABELS[c]}
            </Badge>
          ))}
        </span>
      )}
    </button>
  );
}

export default function Swap(): JSX.Element {
  const queryClient = useQueryClient();
  const toolsQ = useQuery({ queryKey: ['swap-tools'], queryFn: api.getSwapTools });
  const historyQ = useQuery({ queryKey: ['swap-history'], queryFn: api.getSwapHistory });

  const [selectedTool, setSelectedTool] = useState<SwapToolCandidate | null>(null);
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [overwriteMap, setOverwriteMap] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<SwapExecuteResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  async function pickTool(candidate: SwapToolCandidate): Promise<void> {
    setSelectedTool(candidate);
    setPreview(null);
    setResult(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setOverwriteMap({});
    setPreviewing(true);
    try {
      setPreview(await api.swapPreview(candidate.name));
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function execute(): Promise<void> {
    if (!preview || !selectedTool) return;
    const decisions: SwapOverwriteDecision[] = preview.groups
      .flatMap((g) => g.items)
      .filter((i) => i.conflict === 'differs' && overwriteMap[i.hubRelativePath] === true)
      .map((i) => ({ hubRelativePath: i.hubRelativePath, overwrite: true }));
    setExecuting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const r = await api.swapExecute(selectedTool.name, preview.generatedAt, decisions);
      setResult(r);
      toast.success(`已切换到 ${selectedTool.displayName}`, {
        description: `写入 ${r.counts.written} · 跳过 ${r.counts.skipped} · 失败 ${r.counts.failed}`,
      });
      void queryClient.invalidateQueries({ queryKey: ['swap-history'] });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setExecuting(false);
    }
  }

  async function rollback(swapId: string): Promise<void> {
    setRollingBackId(swapId);
    setErrorMsg(null);
    try {
      const r = await api.swapRollback(swapId);
      if (r.success) {
        setSuccessMsg(`已恢复：覆盖项还原 ${r.restored} 个，本次新增移除 ${r.removed} 个`);
        setResult(null);
        toast.success('切换已撤销');
        void queryClient.invalidateQueries({ queryKey: ['swap-history'] });
      } else {
        setErrorMsg(r.error ?? '撤销失败');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="切换" subtitle="把资产一键投放到目标 AI 工具：预览冲突 → 执行 → 验证 → 可撤销" />

      {/* 目标工具选择 */}
      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Repeat className="h-4 w-4 text-primary" />
          选择目标工具
        </h3>
        {toolsQ.isLoading && <Skeleton className="h-16 w-full" />}
        {toolsQ.isError && (
          <ErrorState
            title="加载工具列表失败"
            description={(toolsQ.error as Error).message}
            onRetry={() => void toolsQ.refetch()}
          />
        )}
        {toolsQ.data && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {toolsQ.data.tools.map((candidate) => (
              <ToolCard
                key={candidate.name}
                candidate={candidate}
                selected={selectedTool?.name === candidate.name}
                onSelect={() => void pickTool(candidate)}
              />
            ))}
          </div>
        )}
      </section>

      {errorMsg && (
        <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      {previewing && <Skeleton className="h-40 w-full" />}
      {!previewing && !preview && !result && selectedTool === null && (
        <p className="text-sm text-muted-foreground">选择目标工具后，这里会列出六类资产的投放预览与冲突。</p>
      )}

      {preview && !result && (
        <SwapPreviewPanel
          preview={preview}
          overwriteMap={overwriteMap}
          onToggleOverwrite={(path, checked) => setOverwriteMap((m) => ({ ...m, [path]: checked }))}
          onExecute={() => void execute()}
          executing={executing}
        />
      )}

      {result && (
        <>
          <SwapResultPanel result={result} onRollback={(id) => void rollback(id)} rollingBack={rollingBackId !== null} />
          <div>
            <Button variant="outline" size="sm" onClick={() => selectedTool && void pickTool(selectedTool)}>
              重新预览
            </Button>
          </div>
        </>
      )}

      <SwapHistoryList
        history={historyQ.data?.history ?? []}
        onRollback={(id) => void rollback(id)}
        rollingBackId={rollingBackId}
      />
    </div>
  );
}
