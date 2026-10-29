import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { SkillCard } from './SkillCard';
import { SkillDetail } from './SkillDetail';
import { SkillCreateDialog } from './SkillCreateDialog';
import { SkillsToolbar, type SkillsDimension, type LibraryStatusFilter } from './SkillsToolbar';
import { SkillsBatchBar } from './SkillsBatchBar';
import { EnvSkillsPanel } from './EnvSkillsPanel';
import { SkillsCheckupSection } from '@/components/doctor/SkillsCheckupSection';
import { FUNCTION_LABELS, PROVENANCE_LABELS, FUNCTION_ORDER, PROVENANCE_ORDER } from './skill-labels';
import { useAiClassify } from './use-ai-classify';
import { AiConfigDialog } from './AiConfigDialog';
import type { SkillInfo, SkillFunction, SkillProvenance } from '@/types/api';

/** 技能分类全貌主视图（资产库 /vault/skill 下渲染） */
export function SkillsView(): JSX.Element {
  const queryClient = useQueryClient();
  const [dimension, setDimension] = useState<SkillsDimension>('provenance');
  const [functionFilter, setFunctionFilter] = useState<SkillFunction | null>(null);
  const [provenanceFilter, setProvenanceFilter] = useState<SkillProvenance | null>(null);
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SkillInfo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchFunction, setBatchFunction] = useState<SkillFunction>('other');
  const [applying, setApplying] = useState(false);
  const [curating, setCurating] = useState(false);
  // 环境折叠入口（spec refactor-skill-asset-first-view：环境默认不公示，仅底部一格）
  const [envOpen, setEnvOpen] = useState(false);

  /** 新建成功后打开新技能详情 */
  const handleCreated = (skill: SkillInfo): void => setSelected(skill);

  const statusParam = statusFilter === 'all' ? undefined : statusFilter;
  const { data, isLoading, error } = useQuery({
    queryKey: ['skills', 'asset', functionFilter, provenanceFilter, statusFilter, search],
    queryFn: () =>
      api.listSkills({
        scope: 'asset',
        function: functionFilter ?? undefined,
        provenance: provenanceFilter ?? undefined,
        status: statusParam,
        search: search || undefined,
      }),
    // 切 tab/筛选时沿用上一份数据渲染，数字不闪 0（spec fix-scan-count-gaps）
    placeholderData: keepPreviousData,
  });

  // 筛选/维度/搜索变化时清空勾选（勾选集合只对当前结果有意义）
  useEffect(() => {
    setCheckedIds(new Set());
  }, [dimension, functionFilter, provenanceFilter, statusFilter, search]);

  // AI 分类统一触发逻辑（未配置时先弹配置对话框，保存后自动续跑）
  const ai = useAiClassify();

  // 全量清单（无筛选）用于「全部 AI 分类」待分类计数：
  // 手动跳过、AI 源为缓存命中，仅关键词源需要实际调用 LLM
  const { data: allData } = useQuery({
    queryKey: ['skills', 'asset', null, null, 'all', ''],
    queryFn: () => api.listSkills({ scope: 'asset' }),
    staleTime: 30_000,
  });
  const pendingAiCount = allData
    ? allData.items.filter((s) => s.functionSource === 'keyword').length
    : 0;
  // 环境入口计数用全量资产口径（不带筛选），避免库状态/搜索影响入口数字
  const environmentCount = allData?.countByScope.environment ?? data?.countByScope.environment ?? 0;

  const switchDimension = (next: SkillsDimension): void => {
    setDimension(next);
    // 切换维度时清空出处/职能筛选（库状态与维度正交，保持不变）
    setFunctionFilter(null);
    setProvenanceFilter(null);
  };

  const checkAll = (): void => {
    if (!data) return;
    setCheckedIds(new Set(data.items.map((s) => s.id)));
  };
  const clearChecked = (): void => setCheckedIds(new Set());

  const applyBatch = (): void => {
    if (checkedIds.size === 0 || applying) return;
    setApplying(true);
    const ids = Array.from(checkedIds);
    api
      .batchSetSkillFunction(ids, batchFunction)
      .then((result) => {
        if (result.missing.length > 0) {
          toast.info('部分技能未应用修改', {
            description: `${result.missing.length} 个技能未找到，可能已被删除`,
            details: result.missing,
          });
        }
        setCheckedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        toast.error('批量修改失败', { description: errorMessage(err) });
      })
      .finally(() => setApplying(false));
  };

  /** 批量收藏：仅收藏勾选中的未入库技能，结果汇总提示（spec add-skill-curation） */
  const applyCurate = (): void => {
    if (!data || curating) return;
    const checked = data.items.filter((s) => checkedIds.has(s.id));
    const targets = checked.filter((s) => !s.inLibrary);
    const skipped = checked.filter((s) => s.inLibrary);
    if (targets.length === 0) return;
    setCurating(true);
    api
      .curateSkillsBatch(targets.map((s) => s.id))
      .then((result) => {
        const skipParts = [
          ...skipped.map((s) => `${s.name}：已在我的库`),
          ...result.failed.map((f) => `${f.name}：${f.error}`),
        ];
        if (result.created.length > 0) {
          toast.success(`收藏完成：成功 ${result.created.length} 个`, {
            description: skipParts.length > 0 ? `跳过 ${skipParts.length} 个` : undefined,
            details: skipParts.length > 0 ? skipParts : undefined,
          });
        } else {
          toast.error('收藏失败', {
            description: `${skipParts.length} 个技能未能收藏`,
            details: skipParts,
          });
        }
        setCheckedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        toast.error('批量收藏失败', { description: errorMessage(err) });
      })
      .finally(() => setCurating(false));
  };

  const hasActiveFilter =
    functionFilter !== null ||
    provenanceFilter !== null ||
    statusFilter !== 'all' ||
    search.trim() !== '';
  const clearFilter = (): void => {
    setFunctionFilter(null);
    setProvenanceFilter(null);
    setStatusFilter('all');
    setSearch('');
  };

  // 按当前维度分组（仅展示有技能的分组）
  const groups: Array<{ key: string; label: string; items: SkillInfo[] }> = [];
  if (data) {
    const order: string[] = dimension === 'function' ? FUNCTION_ORDER : PROVENANCE_ORDER;
    const labels: Record<string, string> = dimension === 'function' ? FUNCTION_LABELS : PROVENANCE_LABELS;
    for (const key of order) {
      const items = data.items.filter((s) =>
        dimension === 'function' ? s.functionCategory === key : s.provenance === key,
      );
      if (items.length > 0) groups.push({ key, label: labels[key], items });
    }
  }

  const showCurate = Boolean(data && data.items.some((s) => checkedIds.has(s.id) && !s.inLibrary));

  return (
    <div className="flex min-w-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* 页头（spec refactor-design-system page-headers：类别 H1 + 主操作） */}
      <PageHeader
        title="技能"
        subtitle="盘点各工具安装的技能，收藏到我的库后统一同步到工具"
        actions={
          <div className="flex items-center gap-3">
            <SkillsCheckupSection />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              新建技能
            </Button>
          </div>
        }
      />
      <SkillsToolbar
        dimension={dimension}
        statusFilter={statusFilter}
        provenanceFilter={provenanceFilter}
        functionFilter={functionFilter}
        counts={data}
        search={search}
        hasActiveFilter={hasActiveFilter}
        pendingAiCount={pendingAiCount}
        ai={ai}
        onDimensionSwitch={switchDimension}
        onStatusChange={setStatusFilter}
        onProvenanceChip={(p) => {
          setDimension('provenance');
          setFunctionFilter(null);
          setProvenanceFilter(provenanceFilter === p ? null : p);
        }}
        onFunctionChip={(f) => {
          setDimension('function');
          setProvenanceFilter(null);
          setFunctionFilter(functionFilter === f ? null : f);
        }}
        onSearchChange={setSearch}
        onClearFilter={clearFilter}
      />

      {/* 批量操作条（有勾选时出现） */}
      {checkedIds.size > 0 && (
        <SkillsBatchBar
          checkedCount={checkedIds.size}
          showCurate={showCurate}
          aiRunning={ai.running}
          applying={applying}
          curating={curating}
          batchFunction={batchFunction}
          onCheckAll={checkAll}
          onClearChecked={clearChecked}
          onClassifyChecked={() => ai.classify(Array.from(checkedIds))}
          onCurate={applyCurate}
          onBatchFunctionChange={setBatchFunction}
          onApply={applyBatch}
        />
      )}

      <p className="text-xs text-muted-foreground mb-3">
        {hasActiveFilter
          ? `当前视图 ${data?.items.length ?? 0} 个技能`
          : `去重后共 ${data?.total ?? 0} 个技能（同名副本已合并）`}
      </p>

      {error && (
        <Card className="p-6 text-center text-destructive">
          加载失败: {error instanceof Error ? error.message : String(error)}
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && data && (
        groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">没有匹配的技能</h3>
            <p className="text-sm text-muted-foreground">试试清除筛选或更换关键字</p>
            {/* Scenario 4：空态说明搜索限资产口径，一键展开环境入口（不自动切视图） */}
            <p className="text-sm text-muted-foreground mt-2">
              当前只搜索资产（我的库与自建技能）；市场 / 插件 / 内置技能可在下方「本机技能环境」查看
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setEnvOpen(true)}>
              展开本机技能环境 {environmentCount}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs font-normal text-muted-foreground">{group.items.length}</span>
                </h2>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
                  {group.items.map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      active={selected?.id === skill.id}
                      checked={checkedIds.has(skill.id)}
                      onSelect={(s) => setSelected((prev) => (prev?.id === s.id ? null : s))}
                      onCheckChange={(id, checked) =>
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      )}

      {/* 底部常驻折叠入口：环境不公示，展开才查询（Scenario 1/2） */}
      {data && (
        <EnvSkillsPanel
          open={envOpen}
          onToggle={() => setEnvOpen((v) => !v)}
          environmentCount={environmentCount}
          selectedId={selected?.id ?? null}
          onSelect={(s) => setSelected((prev) => (prev?.id === s.id ? null : s))}
        />
      )}
      </div>

      {/* key 绑定选中 id：换技能时重建面板，内部滚动位置随新对象回到顶部 */}
      {selected && (
        <SkillDetail
          key={selected.id}
          skill={selected}
          onClose={() => setSelected(null)}
          onCurated={(s) => setSelected(s)}
        />
      )}

      <SkillCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <AiConfigDialog
        open={ai.configOpen}
        onOpenChange={ai.setConfigOpen}
        onSaved={ai.resumePending}
      />
    </div>
  );
}
