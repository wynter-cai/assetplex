import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Link2,
  Copy,
  SkipForward,
  Layers,
} from 'lucide-react';
import type { SyncPlan, SyncResult } from '@/types/api';

const TOOL_DISPLAY_NAME: Record<string, string> = {
  'trae-cn': 'TRAE 中国版',
  'trae': 'TRAE',
  'workbuddy': 'WorkBuddy',
  'claude-code': 'Claude Code',
  'codex': 'OpenAI Codex',
  'qoder': 'Qoder',
};

const ACTION_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'success'; icon: typeof Play }> = {
  symlink: { label: '链接', variant: 'default', icon: Link2 },
  copy: { label: '复制', variant: 'secondary', icon: Copy },
  skip: { label: '跳过', variant: 'outline', icon: SkipForward },
};

/** 统计单个计划中各 action 的数量 */
function countActions(plan: SyncPlan): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of plan.items) {
    counts[item.action] = (counts[item.action] ?? 0) + 1;
  }
  return counts;
}

/** 目标工具卡片（可勾选） */
function TargetToolCard({
  name,
  installed,
  enabled,
  selected,
  onToggle,
  plan,
}: {
  name: string;
  installed: boolean;
  enabled?: boolean;
  selected: boolean;
  onToggle: () => void;
  plan?: SyncPlan;
}): JSX.Element {
  const counts = plan ? countActions(plan) : {};
  const actionable = plan ? plan.items.filter((i) => i.action !== 'skip').length : 0;
  const warnings = plan ? plan.items.filter((i) => i.warning).length : 0;
  const display = TOOL_DISPLAY_NAME[name] ?? name;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-accent/40'
      } ${!installed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
          }`}
        >
          {selected && <CheckCircle2 className="h-3 w-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{display}</span>
            {!installed ? (
              <Badge variant="outline" className="text-[10px] shrink-0">未安装</Badge>
            ) : enabled === false ? (
              <Badge variant="secondary" className="text-[10px] shrink-0">未启用</Badge>
            ) : (
              <Badge variant="success" className="text-[10px] shrink-0">就绪</Badge>
            )}
          </div>
          {plan && installed && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {actionable > 0 ? (
                <span className="font-medium text-primary">{actionable} 项待同步</span>
              ) : (
                <span className="text-muted-foreground">已是最新</span>
              )}
              {warnings > 0 && (
                <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {warnings}
                </span>
              )}
              {Object.entries(counts).map(([action, n]) => {
                const meta = ACTION_META[action];
                if (!meta || action === 'skip') return null;
                return (
                  <Badge key={action} variant={meta.variant} className="text-[10px] px-1 py-0">
                    {meta.label} {n}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/** 单个工具的同步详情预览 */
function ToolPlanDetail({ plan }: { plan: SyncPlan }): JSX.Element | null {
  const display = TOOL_DISPLAY_NAME[plan.tool] ?? plan.tool;
  if (plan.items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">{display}</span>
        <Badge variant={plan.toolInstalled ? 'success' : 'secondary'}>
          {plan.toolInstalled ? '已安装' : '未安装'}
        </Badge>
      </div>
      <div className="divide-y">
        {plan.items.map((item, i) => {
          const meta = ACTION_META[item.action] ?? { label: item.action, variant: 'outline' as const, icon: Layers };
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-start gap-2.5 px-3 py-2 text-xs">
              <Badge variant={meta.variant} className="shrink-0 gap-1 px-1.5 py-0">
                <Icon className="h-3 w-3" />
                {meta.label}
              </Badge>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-mono truncate">{item.item.relativePath || '(根)'}</div>
                {item.reason && <div className="text-muted-foreground">→ {item.reason}</div>}
                {item.warning && (
                  <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {item.warning}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 执行结果卡片 */
function ResultCard({ result }: { result: SyncResult }): JSX.Element {
  const display = TOOL_DISPLAY_NAME[result.tool] ?? result.tool;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{display}</span>
        <Badge variant={result.success ? 'success' : 'destructive'}>
          {result.success ? '成功' : '失败'}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        同步 {result.itemCount} 项，跳过 {result.skippedCount} 项，耗时 {result.durationMs}ms
      </div>
      {result.errors.map((e, i) => (
        <div key={i} className="mt-1 text-xs text-destructive">错误：{e}</div>
      ))}
      {result.warnings.map((w, i) => (
        <div key={i} className="mt-1 text-xs text-amber-600 dark:text-amber-400">警告：{w}</div>
      ))}
    </div>
  );
}

export default function Sync(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(false);

  const selectedList = useMemo(() => Array.from(selectedTools), [selectedTools]);

  const { data: toolsData, isLoading: toolsLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
  });

  // 始终拉取全部计划用于卡片摘要；选中后详情同样使用该数据
  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['sync-plan'],
    queryFn: () => api.getSyncPlan(),
  });

  const runMutation = useMutation({
    mutationFn: () => api.runSync(selectedList.length ? selectedList : undefined, dryRun),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-history'] });
      queryClient.invalidateQueries({ queryKey: ['sync-plan'] });
    },
  });

  const plans = planData?.plans ?? [];
  const planByTool = useMemo(() => {
    const m = new Map<string, SyncPlan>();
    for (const p of plans) m.set(p.tool, p);
    return m;
  }, [plans]);

  const tools = toolsData?.tools ?? [];
  const selectedPlans = selectedList
    .map((t) => planByTool.get(t))
    .filter((p): p is SyncPlan => p !== undefined && p.items.length > 0);

  const totalActionable = selectedPlans.reduce(
    (sum, p) => sum + p.items.filter((i) => i.action !== 'skip').length,
    0,
  );
  const totalWarnings = selectedPlans.reduce(
    (sum, p) => sum + p.items.filter((i) => i.warning).length,
    0,
  );

  const toggleTool = (name: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    const installed = tools.filter((t) => t.installed && t.enabled !== false).map((t) => t.name);
    setSelectedTools(new Set(installed));
  };

  const clearAll = () => setSelectedTools(new Set());

  const results = runMutation.data?.results ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 标题 + 全局操作 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">同步中心</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            选择要同步到的目标工具，预览变更后再执行
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">预览模式</span>
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['sync-plan'] })}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* 左栏：目标工具选择 */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">同步目标</CardTitle>
            <div className="flex gap-1 text-xs">
              <button onClick={selectAll} className="text-primary hover:underline">全选</button>
              <span className="text-muted-foreground">/</span>
              <button onClick={clearAll} className="text-muted-foreground hover:underline">清空</button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {toolsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : tools.length === 0 ? (
              <div className="text-sm text-muted-foreground">未检测到工具</div>
            ) : (
              tools.map((tool) => (
                <TargetToolCard
                  key={tool.name}
                  name={tool.name}
                  installed={tool.installed}
                  enabled={tool.enabled}
                  selected={selectedTools.has(tool.name)}
                  onToggle={() => toggleTool(tool.name)}
                  plan={planByTool.get(tool.name)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* 右栏：预览 / 结果 */}
        <div className="flex min-h-0 flex-col gap-4">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" />
                变更预览
                {selectedList.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{selectedList.length} 个目标</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {planLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : selectedList.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <Layers className="h-8 w-8 opacity-50" />
                  <p className="text-sm">从左侧选择要同步的目标工具</p>
                  <p className="text-xs">可多选，实时预览每个工具的变更项</p>
                </div>
              ) : selectedPlans.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <p className="text-sm">选中的工具均已是最新状态</p>
                </div>
              ) : (
                selectedPlans.map((p) => <ToolPlanDetail key={p.tool} plan={p} />)
              )}
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">最近执行结果</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {results.map((r) => (
                  <ResultCard key={r.tool} result={r} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-lg border bg-card/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3 text-sm">
          {selectedList.length === 0 ? (
            <span className="text-muted-foreground">未选择目标（将同步到全部已启用工具）</span>
          ) : (
            <>
              <span>
                已选 <b>{selectedList.length}</b> 个目标
              </span>
              {totalActionable > 0 && (
                <Badge variant="default">{totalActionable} 项待同步</Badge>
              )}
              {totalWarnings > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {totalWarnings} 项覆盖预警
                </Badge>
              )}
            </>
          )}
        </div>
        <Button
          className="ml-auto"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <Play className="h-4 w-4 mr-1.5" />
          {dryRun ? '预览执行' : '执行同步'}
          {selectedList.length > 0 && `到 ${selectedList.length} 个工具`}
        </Button>
      </div>
    </div>
  );
}
