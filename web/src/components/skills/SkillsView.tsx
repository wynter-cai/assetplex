import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, Layers, Factory, Bot, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SkillDetail } from './SkillDetail';
import { SkillCreateDialog } from './SkillCreateDialog';
import { FUNCTION_LABELS, ORIGIN_LABELS, FUNCTION_SOURCE_LABELS, FUNCTION_ORDER, ORIGIN_ORDER } from './skill-labels';
import { useAiClassify } from './use-ai-classify';
import { AiConfigDialog } from './AiConfigDialog';
import type { SkillInfo, SkillFunction, SkillOrigin } from '@/types/api';

type Dimension = 'function' | 'origin';

/** 技能卡：复选框 + 职能/来源/版本/副本数 + 职能覆盖下拉 + 查看详情按钮 */
function SkillCard({
  skill,
  active,
  checked,
  onSelect,
  onCheckChange,
}: {
  skill: SkillInfo;
  active: boolean;
  checked: boolean;
  onSelect: (s: SkillInfo) => void;
  onCheckChange: (id: string, checked: boolean) => void;
}): JSX.Element {
  const queryClient = useQueryClient();

  const handleChange = (next: SkillFunction): void => {
    if (next === skill.functionCategory) return;
    void api
      .overrideSkillFunction(skill.id, next)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        // 简单提示：失败时刷新回真实状态
        alert(err instanceof Error ? err.message : '修改分类失败');
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      });
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${active ? '收起' : '展开'} ${skill.name} 卡片`}
      onClick={() => onSelect(skill)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(skill);
        }
      }}
      className={cn(
        'p-3 cursor-pointer hover:border-primary/40 transition-colors text-left',
        active && 'border-primary bg-accent/30',
        checked && !active && 'border-primary/50 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          aria-label={`选择技能 ${skill.name}`}
          checked={checked}
          onChange={(e) => onCheckChange(skill.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 shrink-0 accent-primary cursor-pointer"
        />
        <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{skill.name}</span>
        {skill.version && (
          <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">v{skill.version}</Badge>
        )}
        {skill.variants.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
            {skill.variants.length + 1} 副本
          </Badge>
        )}
      </div>
      {skill.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        <Badge variant="outline" className="text-[10px] h-4 px-1">{FUNCTION_LABELS[skill.functionCategory]}</Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1">{ORIGIN_LABELS[skill.origin]}</Badge>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">
          {FUNCTION_SOURCE_LABELS[skill.functionSource]}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <label
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          职能分类
          <select
            aria-label={`修改 ${skill.name} 的职能分类`}
            className="h-7 rounded-md border bg-background px-1.5 text-xs cursor-pointer"
            value={skill.functionCategory}
            onChange={(e) => handleChange(e.target.value as SkillFunction)}
          >
            {FUNCTION_ORDER.map((f) => (
              <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(skill);
          }}
          aria-label={`查看 ${skill.name} 详情`}
        >
          查看详情
        </Button>
      </div>
    </Card>
  );
}

/** 技能详情面板改为独立组件（SkillDetail.tsx）：保险箱技能支持编辑/删除/同步分发 */

function CountChip({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {label} {count}
    </button>
  );
}

/** 技能分类全貌主视图（资产库 /vault/skill 下渲染） */
export function SkillsView(): JSX.Element {
  const queryClient = useQueryClient();
  const [dimension, setDimension] = useState<Dimension>('function');
  const [functionFilter, setFunctionFilter] = useState<SkillFunction | null>(null);
  const [originFilter, setOriginFilter] = useState<SkillOrigin | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SkillInfo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [batchFunction, setBatchFunction] = useState<SkillFunction>('other');
  const [applying, setApplying] = useState(false);
  const [curating, setCurating] = useState(false);

  /** 新建成功后打开新技能详情 */
  const handleCreated = (skill: SkillInfo): void => setSelected(skill);

  const { data, isLoading, error } = useQuery({
    queryKey: ['skills', functionFilter, originFilter, search],
    queryFn: () =>
      api.listSkills({
        function: functionFilter ?? undefined,
        origin: originFilter ?? undefined,
        search: search || undefined,
      }),
  });

  // 筛选/维度/搜索变化时清空勾选（勾选集合只对当前结果有意义）
  useEffect(() => {
    setCheckedIds(new Set());
  }, [dimension, functionFilter, originFilter, search]);

  // AI 分类统一触发逻辑（未配置时先弹配置对话框，保存后自动续跑）
  const ai = useAiClassify();

  // 全量清单（无筛选）用于「全部 AI 分类」待分类计数：
  // 手动跳过、AI 源为缓存命中，仅关键词源需要实际调用 LLM
  const { data: allData } = useQuery({
    queryKey: ['skills', null, null, ''],
    queryFn: () => api.listSkills(),
    staleTime: 30_000,
  });
  const pendingAiCount = allData
    ? allData.items.filter((s) => s.functionSource === 'keyword').length
    : 0;

  const switchDimension = (next: Dimension): void => {
    setDimension(next);
    // 切换维度时清空筛选状态
    setFunctionFilter(null);
    setOriginFilter(null);
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

  /** 批量沉淀：仅沉淀勾选中的非保险箱技能，结果汇总提示（spec add-skill-curation） */
  const applyCurate = (): void => {
    if (!data || curating) return;
    const checked = data.items.filter((s) => checkedIds.has(s.id));
    const targets = checked.filter((s) => s.origin !== 'vault');
    const skipped = checked.filter((s) => s.origin === 'vault');
    if (targets.length === 0) return;
    setCurating(true);
    api
      .curateSkillsBatch(targets.map((s) => s.id))
      .then((result) => {
        const parts: string[] = [];
        if (result.created.length > 0) parts.push(`成功 ${result.created.length} 个`);
        const skipParts = [
          ...skipped.map((s) => `${s.name}：已是保险箱技能`),
          ...result.failed.map((f) => `${f.name}：${f.error}`),
        ];
        if (skipParts.length > 0) parts.push(`跳过 ${skipParts.length} 个（${skipParts.join('、')}）`);
        if (parts.length > 0) alert(`沉淀完成：${parts.join('；')}`);
        setCheckedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '批量沉淀失败');
      })
      .finally(() => setCurating(false));
  };

  const activeKey: SkillFunction | SkillOrigin | null =
    dimension === 'function' ? functionFilter : originFilter;
  const clearFilter = (): void => {
    setFunctionFilter(null);
    setOriginFilter(null);
  };

  // 按当前维度分组（仅展示有技能的分组）
  const groups: Array<{ key: string; label: string; items: SkillInfo[] }> = [];
  if (data) {
    const order: string[] = dimension === 'function' ? FUNCTION_ORDER : ORIGIN_ORDER;
    const labels: Record<string, string> = dimension === 'function' ? FUNCTION_LABELS : ORIGIN_LABELS;
    for (const key of order) {
      const items = data.items.filter((s) =>
        dimension === 'function' ? s.functionCategory === key : s.origin === key,
      );
      if (items.length > 0) groups.push({ key, label: labels[key], items });
    }
  }

  return (
    <div className="flex min-w-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* 维度切换 */}
      <div className="inline-flex rounded-lg border p-0.5 mb-4 self-start">
        <button
          type="button"
          onClick={() => switchDimension('function')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs',
            dimension === 'function' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          按职能
        </button>
        <button
          type="button"
          onClick={() => switchDimension('origin')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs',
            dimension === 'origin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Factory className="h-3.5 w-3.5" />
          按来源
        </button>
      </div>

      {/* 两套分类计数条（始终展示全貌计数） */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {FUNCTION_ORDER.map((f) => (
            <CountChip
              key={f}
              active={dimension === 'function' && functionFilter === f}
              label={FUNCTION_LABELS[f]}
              count={data?.countByFunction[f] ?? 0}
              onClick={() => {
                setDimension('function');
                setOriginFilter(null);
                setFunctionFilter(functionFilter === f ? null : f);
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ORIGIN_ORDER.map((o) => (
            <CountChip
              key={o}
              active={dimension === 'origin' && originFilter === o}
              label={ORIGIN_LABELS[o]}
              count={data?.countByOrigin[o] ?? 0}
              onClick={() => {
                setDimension('origin');
                setFunctionFilter(null);
                setOriginFilter(originFilter === o ? null : o);
              }}
            />
          ))}
        </div>
      </div>

      {/* 搜索与清除 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索技能名称或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {activeKey && (
          <button type="button" onClick={clearFilter} className="text-xs text-muted-foreground underline">
            清除筛选
          </button>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 text-xs"
          onClick={() => ai.classify()}
          disabled={ai.running}
        >
          <Bot className="h-3.5 w-3.5 mr-1" />
          {ai.running ? 'AI 分类中…' : `全部 AI 分类（待分类 ${pendingAiCount}）`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3 text-xs"
          onClick={() => ai.setConfigOpen(true)}
        >
          <Settings className="h-3.5 w-3.5 mr-1" />
          AI 配置
        </Button>
        <Button size="sm" className="h-9 px-3 text-xs" onClick={() => setCreateOpen(true)}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          新建技能
        </Button>
      </div>

      {/* 批量操作条（有勾选时出现） */}
      {checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium">已选 {checkedIds.size} 个技能</span>
          <button
            type="button"
            onClick={checkAll}
            className="text-xs text-muted-foreground underline"
            aria-label="全选当前筛选结果"
          >
            全选
          </button>
          <button
            type="button"
            onClick={clearChecked}
            className="text-xs text-muted-foreground underline"
            aria-label="清空勾选"
          >
            清空
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={() => ai.classify(Array.from(checkedIds))}
            disabled={ai.running}
          >
            <Bot className="h-3.5 w-3.5 mr-1" />
            {ai.running ? 'AI 分类中…' : 'AI 分类'}
          </Button>
          {data && data.items.some((s) => checkedIds.has(s.id) && s.origin !== 'vault') && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              onClick={applyCurate}
              disabled={curating}
            >
              {curating ? '沉淀中…' : '沉淀到保险箱'}
            </Button>
          )}
          <select
            aria-label="批量设置职能分类"
            value={batchFunction}
            onChange={(e) => setBatchFunction(e.target.value as SkillFunction)}
            className="h-8 rounded-md border bg-background px-2 text-xs cursor-pointer"
          >
            {FUNCTION_ORDER.map((f) => (
              <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>
            ))}
          </select>
          <Button size="sm" className="h-8 px-3 text-xs" onClick={applyBatch} disabled={applying}>
            {applying ? '应用中…' : '应用'}
          </Button>
        </div>
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
