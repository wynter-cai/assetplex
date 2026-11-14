/**
 * 分发屏（s5）：工具勾选 + 四分类影响预览 + 二次确认（add-zero-config-onboarding T15）
 *
 * spec Requirement 6：新增/覆盖/冲突/无变化口径来自 sync plan + 分发索引；
 * 点击主按钮只开确认弹窗（不发 run）；取消零写请求；确认后 backup=1 先备份。
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toolDisplayName } from '@/components/sync/sync-display';
import {
  summarizeDistribute,
} from '@/lib/onboarding-distribute';
import type { SyncRunResponse } from '@/types/api';

const MAX_LIST_FILES = 30;

export function DistributeScreen({
  onDone,
  onSkip,
}: {
  onDone: (result: SyncRunResponse) => void;
  onSkip: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toolsQuery = useQuery({ queryKey: ['tools'], queryFn: api.getTools });
  const planQuery = useQuery({ queryKey: ['sync-plan'], queryFn: () => api.getSyncPlan() });
  const distQuery = useQuery({ queryKey: ['distributions'], queryFn: () => api.getDistributions() });

  const tools = toolsQuery.data?.tools ?? [];
  const plans = planQuery.data?.plans ?? [];
  const installed = tools.filter((t) => t.installed);

  const selectedTools: string[] =
    selected !== null ? [...selected] : installed.filter((t) => t.enabled !== false).map((t) => t.name);
  const selectedSet = new Set(selectedTools);

  const selectedPlans = useMemo(
    () => plans.filter((p) => selectedSet.has(p.tool)),
    [plans, selectedTools.join(',')],
  );
  const summary = useMemo(
    () =>
      summarizeDistribute(selectedPlans, planQuery.isLoading || distQuery.isLoading ? null : distQuery.data ?? null),
    [selectedPlans, distQuery.data, distQuery.isLoading],
  );

  const runMutation = useMutation({
    mutationFn: () => api.runSync(selectedTools, false, { backup: true }),
    onSuccess: (data) => onDone(data),
  });

  const actionable = summary.counts.create + summary.counts.overwrite + summary.counts.conflict;
  const files = summary.files.slice(0, MAX_LIST_FILES);

  const toggle = (name: string): void => {
    const next = new Set(selectedTools);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const disabledReason =
    selectedTools.length === 0
      ? '请先选择目标工具'
      : actionable === 0
        ? '没有需要同步的文件（目标已一致）'
        : null;

  return (
    <section data-testid="onboarding-distribute" className="mx-auto max-w-3xl">
      <h2 className="text-xl font-semibold">同步到工具</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        勾选要接收资产的工具。原文件会先备份，可回滚。
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">同步目标</p>
          <p className="text-xs text-muted-foreground">已检测到的工具</p>
          <div className="mt-3 space-y-2" data-testid="distribute-tools">
            {tools.map((tool) => (
              <label
                key={tool.name}
                className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                  tool.installed ? 'cursor-pointer hover:bg-muted/50' : 'opacity-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`选择同步目标 ${toolDisplayName(tool.name)}`}
                    checked={selectedSet.has(tool.name)}
                    onChange={() => toggle(tool.name)}
                    disabled={!tool.installed}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {toolDisplayName(tool.name)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tool.installed ? `${summary.byTool[tool.name] ?? 0} 项` : '未安装'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">影响预览</p>
          {planQuery.isLoading || distQuery.isLoading ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在计算影响…
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-1.5 text-sm" data-testid="distribute-impact">
                {actionable === 0 ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {tools.length === 0 ? '未检测到已安装工具' : '没有需要同步的文件'}
                  </p>
                ) : (
                  <>
                    {summary.counts.create > 0 && <p>新增 <b>{summary.counts.create}</b> 个文件</p>}
                    {summary.counts.overwrite > 0 && <p>覆盖 <b>{summary.counts.overwrite}</b> 个已有文件</p>}
                    {summary.counts.conflict > 0 && (
                      <p className="text-warning">
                        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                        冲突 <b>{summary.counts.conflict}</b> 个（工具侧偏离资产库）
                      </p>
                    )}
                    {summary.counts.unchanged > 0 && (
                      <p className="text-xs text-muted-foreground">{summary.counts.unchanged} 项已一致，不写入</p>
                    )}
                  </>
                )}
              </div>
              {actionable > 0 && (
                <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded bg-muted/40 p-2" data-testid="distribute-files">
                  {files.map((f) => (
                    <li key={`${f.toolId}:${f.targetPath}`} className="font-mono text-xs text-muted-foreground truncate">
                      [{f.action}] {f.targetPath}
                    </li>
                  ))}
                  {summary.files.length > MAX_LIST_FILES && (
                    <li className="text-xs text-muted-foreground">还有 {summary.files.length - MAX_LIST_FILES} 个文件</li>
                  )}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">冲突项默认以资产库为准；原文件会先备份，可一键回滚</p>
            </>
          )}
          <div className="mt-4">
            <Button
              className="w-full"
              disabled={disabledReason !== null || runMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              data-testid="distribute-open-confirm"
            >
              {runMutation.isPending ? '正在同步…' : `同步到 ${selectedTools.length} 个工具`}
            </Button>
            {disabledReason !== null && <p className="mt-1.5 text-xs text-muted-foreground">{disabledReason}</p>}
            {runMutation.isError && (
              <p className="mt-1.5 text-xs text-destructive">同步失败：{String(runMutation.error)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="distribute-confirm-dialog">
          <DialogHeader>
            <DialogTitle>
              确认覆盖 {summary.counts.overwrite + summary.counts.conflict} 个文件？
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              同步会用资产库里的版本替换目标文件。
              {summary.counts.conflict > 0
                ? `其中 ${summary.counts.conflict} 个文件在工具侧被改动过，默认以资产库为准。`
                : ''}
            </p>
            {actionable > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded bg-muted/40 p-2">
                {files.slice(0, 8).map((f) => (
                  <li key={`c-${f.toolId}:${f.targetPath}`} className="font-mono text-xs truncate">
                    {f.targetPath}
                  </li>
                ))}
                {summary.files.length > 8 && (
                  <li className="text-xs text-muted-foreground">还有 {summary.files.length - 8} 个文件</li>
                )}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              被覆盖的原文件已备份到 ~/.assetplex/.backups，可在文件系统中回滚。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onSkip}>
              先不同步，进资产库
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} data-testid="distribute-cancel">
              取消
            </Button>
            <Button
              size="sm"
              disabled={actionable === 0 || runMutation.isPending}
              onClick={() => runMutation.mutate()}
              data-testid="distribute-confirm"
            >
              {runMutation.isPending ? '正在同步…' : '确认同步'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
