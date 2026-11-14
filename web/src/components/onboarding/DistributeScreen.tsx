/**
 * 分发屏（s5）：工具勾选 + 四分类影响预览 + 二次确认（add-zero-config-onboarding T15）
 *
 * spec Requirement 6：新增/覆盖/冲突/无变化口径来自 sync plan + 分发索引；
 * 点击主按钮只开确认弹窗（不发 run）；取消零写请求；确认后 backup=1 先备份。
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { toolDisplayName } from '@/components/sync/sync-display';
import { ToolBadge } from './onboarding-visual';
import { summarizeDistribute, type DistributeAction } from '@/lib/onboarding-distribute';
import type { SyncRunResponse } from '@/types/api';

const MAX_LIST_FILES = 30;

/** 四分类的动作文案与配色（点、chip 共用一套语义色） */
const ACTION_META: Record<DistributeAction, { label: string; chip: string; dot: string }> = {
  create: { label: '新增', chip: 'bg-success-soft text-success', dot: 'bg-success' },
  overwrite: { label: '覆盖', chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  conflict: { label: '冲突', chip: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  unchanged: { label: '一致', chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/40' },
};

const STRATEGY_LABELS: Record<string, string> = {
  symlink: '软链接',
  copy: '复制',
  'native-import': '原生导入',
  'per-project': '项目级写入',
};

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

  const strategies = useMemo<string[]>(() => {
    const found = new Set<string>();
    for (const plan of selectedPlans) {
      for (const item of plan.items) {
        if (item.action === 'skip') continue;
        found.add(STRATEGY_LABELS[item.target.strategy] ?? item.target.strategy);
      }
    }
    return [...found];
  }, [selectedPlans]);

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
        ? '没有需要分发的文件（目标已一致）'
        : null;

  return (
    <section data-testid="onboarding-distribute">
      <h2 className="text-24 font-bold tracking-tight">分发到工具</h2>
      <p className="mt-2 text-14 text-muted-foreground">
        勾选要接收资产的工具。原文件会先备份，可回滚。
      </p>

      <div className="mt-6 grid max-w-[880px] gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="text-16 font-semibold">分发目标</h3>
          <p className="mt-1 text-12 text-muted-foreground">已检测到的工具</p>
          <div className="mt-3 space-y-2" data-testid="distribute-tools">
            {tools.map((tool) => (
              <label
                key={tool.name}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                  tool.installed
                    ? 'cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02]'
                    : 'cursor-not-allowed opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择分发目标 ${toolDisplayName(tool.name)}`}
                  checked={selectedSet.has(tool.name)}
                  onChange={() => toggle(tool.name)}
                  disabled={!tool.installed}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
                <ToolBadge toolId={tool.name} name={toolDisplayName(tool.name)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-13 font-medium">
                  {toolDisplayName(tool.name)}
                </span>
                <span className="shrink-0 text-12 text-muted-foreground tabular-nums">
                  {tool.installed ? `${summary.byTool[tool.name] ?? 0} 项` : '未安装'}
                </span>
              </label>
            ))}
            {tools.length === 0 && (
              <p className="rounded-lg border border-dashed px-3.5 py-3 text-12 text-muted-foreground">
                未检测到可用的工具适配器
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="text-16 font-semibold">影响预览</h3>
          <p className="mt-1 text-12 text-muted-foreground">
            写入前先看清楚会改什么 · 目标 {selectedTools.length} 个工具
          </p>

          {planQuery.isLoading || distQuery.isLoading ? (
            <p className="mt-4 flex items-center gap-1.5 text-12 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在计算影响…
            </p>
          ) : (
            <>
              <div className="mt-4 space-y-2" data-testid="distribute-impact">
                {tools.length === 0 ? (
                  <p className="flex items-center gap-2 text-13 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    未检测到已安装工具
                  </p>
                ) : actionable === 0 ? (
                  <p className="flex items-center gap-2 text-13 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    没有需要分发的文件（目标已一致）
                  </p>
                ) : (
                  <>
                    {(['create', 'overwrite', 'conflict'] as const).map((action) => (
                      <p
                        key={action}
                        className="flex items-center gap-2 text-13 text-muted-foreground"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-[7px] w-[7px] shrink-0 rounded-full ${ACTION_META[action].dot}`}
                        />
                        {ACTION_META[action].label}
                        <b className="font-bold tabular-nums text-foreground">
                          {summary.counts[action]}
                        </b>
                        个文件
                      </p>
                    ))}
                    {summary.counts.unchanged > 0 && (
                      <p className="flex items-center gap-2 text-12 text-muted-foreground/80">
                        <span
                          aria-hidden="true"
                          className={`h-[7px] w-[7px] shrink-0 rounded-full ${ACTION_META.unchanged.dot}`}
                        />
                        {summary.counts.unchanged} 项已一致，不写入
                      </p>
                    )}
                  </>
                )}
              </div>

              {actionable > 0 && (
                <p className="mt-2 text-12 leading-relaxed text-muted-foreground/80">
                  冲突项默认以资产库为准；原文件会先备份，可一键回滚
                </p>
              )}

              {actionable > 0 && (
                <div
                  className="mt-3 overflow-hidden rounded-lg border"
                  data-testid="distribute-files"
                >
                  <div className="grid grid-cols-[52px_1fr] gap-x-3 border-b bg-muted/40 px-3 py-1.5 text-12 font-medium text-muted-foreground sm:grid-cols-[52px_84px_1fr]">
                    <span>动作</span>
                    <span className="hidden sm:block">工具</span>
                    <span>目标路径</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {files.map((f) => (
                      <div
                        key={`${f.toolId}:${f.targetPath}`}
                        className="grid grid-cols-[52px_1fr] items-center gap-x-3 border-b border-border/60 px-3 py-1.5 last:border-0 sm:grid-cols-[52px_84px_1fr]"
                      >
                        <span
                          className={`w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold ${ACTION_META[f.action].chip}`}
                        >
                          {ACTION_META[f.action].label}
                        </span>
                        <span className="hidden truncate text-12 text-muted-foreground sm:block">
                          {toolDisplayName(f.toolId)}
                        </span>
                        <span
                          className="truncate font-mono text-[11px] text-muted-foreground"
                          title={f.targetPath}
                        >
                          {f.targetPath}
                        </span>
                      </div>
                    ))}
                    {summary.files.length > MAX_LIST_FILES && (
                      <p className="px-3 py-1.5 text-12 text-muted-foreground">
                        还有 {summary.files.length - MAX_LIST_FILES} 个文件
                      </p>
                    )}
                  </div>
                </div>
              )}

              {strategies.length > 0 && actionable > 0 && (
                <p className="mt-3 rounded-lg bg-muted/40 px-3.5 py-2.5 text-12 leading-relaxed text-muted-foreground">
                  本次写入方式：<b className="font-semibold text-foreground">{strategies.join(' · ')}</b>
                </p>
              )}

              <p className="mt-3 flex items-start gap-1.5 text-12 leading-relaxed text-muted-foreground/80">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                分发前自动备份到 ~/.assetplex/.backups
              </p>
            </>
          )}

          <div className="mt-auto pt-4">
            <Button
              className="h-10 w-full rounded-lg text-14 font-semibold"
              disabled={disabledReason !== null || runMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              data-testid="distribute-open-confirm"
            >
              {runMutation.isPending ? '正在分发…' : `分发到 ${selectedTools.length} 个工具`}
            </Button>
            {disabledReason !== null && (
              <p className="mt-1.5 text-12 text-muted-foreground">{disabledReason}</p>
            )}
            {runMutation.isError && (
              <p className="mt-1.5 text-12 text-destructive">分发失败：{String(runMutation.error)}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-7">
        <button
          type="button"
          className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[520px]" data-testid="distribute-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="text-18">
              确认覆盖 {summary.counts.overwrite + summary.counts.conflict} 个文件？
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-13 leading-relaxed text-muted-foreground">
            <p>分发会用资产库里的版本替换目标文件。这是切换工具后的正常同步行为。</p>
            {summary.counts.conflict > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-12 text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                其中 {summary.counts.conflict} 个文件在工具侧被改动过，默认以资产库为准。
              </p>
            )}
            {actionable > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border bg-muted/30 p-2">
                {files.slice(0, 8).map((f) => (
                  <p
                    key={`c-${f.toolId}:${f.targetPath}`}
                    className="truncate font-mono text-[11px] text-muted-foreground"
                  >
                    {f.targetPath}
                  </p>
                ))}
                {summary.files.length > 8 && (
                  <p className="text-12 text-muted-foreground">
                    还有 {summary.files.length - 8} 个文件
                  </p>
                )}
              </div>
            )}
            <p className="flex items-start gap-1.5 text-12 text-muted-foreground/80">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              被覆盖的原文件已备份到 ~/.assetplex/.backups，可在文件系统中回滚。
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-13" onClick={onSkip}>
              先不分发，进资产库
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-13"
              onClick={() => setConfirmOpen(false)}
              data-testid="distribute-cancel"
            >
              取消
            </Button>
            <Button
              size="sm"
              className="text-13"
              disabled={actionable === 0 || runMutation.isPending}
              onClick={() => runMutation.mutate()}
              data-testid="distribute-confirm"
            >
              {runMutation.isPending ? '正在分发…' : '确认分发'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
