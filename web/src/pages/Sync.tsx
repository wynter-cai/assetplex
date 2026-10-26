import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { RefreshCw, Eye, CheckCircle2, Layers } from 'lucide-react';
import type { SyncPlan } from '@/types/api';
import { summarizeImpact } from '@/lib/sync-impact';
import { TargetToolCard } from '@/components/sync/TargetToolCard';
import { SyncActionBar } from '@/components/sync/SyncActionBar';
import { ToolPlanDetail } from '@/components/sync/ToolPlanDetail';
import { SyncResultCard } from '@/components/sync/SyncResultCard';

export default function Sync(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [dryRun, setDryRun] = useState(false);

  const selectedList = useMemo(() => Array.from(selectedTools), [selectedTools]);

  const { data: toolsData, isLoading: toolsLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
  });

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['sync-plan'],
    queryFn: () => api.getSyncPlan(),
  });

  const runMutation = useMutation({
    mutationFn: () => api.runSync(selectedList, dryRun),
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

  // 影响范围：从已选目标的计划中派生
  const selectedPlans = selectedList
    .map((t) => planByTool.get(t))
    .filter((p): p is SyncPlan => p !== undefined);
  const impact = summarizeImpact(selectedList.length, selectedPlans);

  const toggleTool = (name: string): void => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = (): void => {
    const installed = tools.filter((t) => t.installed && t.enabled !== false).map((t) => t.name);
    setSelectedTools(new Set(installed));
  };

  const clearAll = (): void => setSelectedTools(new Set());

  const results = runMutation.data?.results ?? [];
  // 右栏只渲染有实际条目的计划
  const detailPlans = selectedPlans.filter((p) => p.items.length > 0);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="同步中心"
        subtitle="选择要同步到的目标工具，预览变更后再执行"
        actions={
          <>
            <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
              <Switch
                checked={dryRun}
                onCheckedChange={setDryRun}
                aria-label="预览模式"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['sync-plan'] })}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </>
        }
      />

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
              ) : detailPlans.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                  <p className="text-sm">选中的工具均已是最新状态</p>
                </div>
              ) : (
                detailPlans.map((p) => <ToolPlanDetail key={p.tool} plan={p} />)
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
                  <SyncResultCard key={r.tool} result={r} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <SyncActionBar
        selectedCount={selectedList.length}
        impact={impact}
        dryRun={dryRun}
        pending={runMutation.isPending}
        onRun={() => runMutation.mutate()}
      />
    </div>
  );
}
