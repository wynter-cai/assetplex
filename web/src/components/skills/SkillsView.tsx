import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { SkillCard } from './SkillCard';
import { SkillDetail } from './SkillDetail';
import { SkillCreateDialog } from './SkillCreateDialog';
import { SkillsToolbar, type SkillsDimension, type LibraryStatusFilter } from './SkillsToolbar';
import { SkillsBatchBar } from './SkillsBatchBar';
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

  /** 新建成功后打开新技能详情 */
  const handleCreated = (skill: SkillInfo): void => setSelected(skill);

  const statusParam = statusFilter === 'all' ? undefined : statusFilter;
  const { data, isLoading, error } = useQuery({
    queryKey: ['skills', functionFilter, provenanceFilter, statusFilter, search],
    queryFn: () =>
      api.listSkills({
        function: functionFilter ?? undefined,
        provenance: provenanceFilter ?? undefined,
        status: statusParam,
        search: search || undefined,
      }),
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
    queryKey: ['skills', null, null, 'all', ''],
    queryFn: () => api.listSkills(),
    staleTime: 30_000,
  });
  const pendingAiCount = allData
    ? allData.items.filter((s) => s.functionSource === 'keyword').length
    : 0;

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
          alert(`以下技能未找到（可能已被删除）：${result.missing.join('、')}`);
        }
        setCheckedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '批量修改失败');
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
        const parts: string[] = [];
        if (result.created.length > 0) parts.push(`成功 ${result.created.length} 个`);
        const skipParts = [
          ...skipped.map((s) => `${s.name}：已在我的库`),
          ...result.failed.map((f) => `${f.name}：${f.error}`),
        ];
        if (skipParts.length > 0) parts.push(`跳过 ${skipParts.length} 个（${skipParts.join('、')}）`);
        if (parts.length > 0) alert(`收藏完成：${parts.join('；')}`);
        setCheckedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '批量收藏失败');
      })
      .finally(() => setCurating(false));
  };

  const hasActiveFilter = functionFilter !== null || provenanceFilter !== null || statusFilter !== 'all';
  const clearFilter = (): void => {
    setFunctionFilter(null);
    setProvenanceFilter(null);
    setStatusFilter('all');
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
        onCreate={() => setCreateOpen(true)}
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
        去重后共 {data?.total ?? 0} 个技能（同名副本已合并）
      </p>

      {error && (
        <Card className="p-6 text-center text-red-500">
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
      </div>

      {selected && (
        <SkillDetail
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
