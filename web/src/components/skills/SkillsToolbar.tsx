/**
 * 技能视图工具条：维度切换（按来源/按职能）+ 库状态三档分段 + 当前维度计数 chips + 搜索与操作行
 * 库状态与出处 chips 正交组合（spec refactor-skill-origin-taxonomy）
 */

import { Search, Bot, Settings, Factory, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAiClassify } from './use-ai-classify';
import {
  FUNCTION_LABELS,
  FUNCTION_ORDER,
  PROVENANCE_LABELS,
  PROVENANCE_ORDER,
  LIBRARY_STATUS_LABELS,
} from './skill-labels';
import type { SkillFunction, SkillProvenance, SkillListResult } from '@/types/api';

export type SkillsDimension = 'function' | 'provenance';
export type LibraryStatusFilter = 'all' | 'in' | 'out';

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

interface SkillsToolbarProps {
  dimension: SkillsDimension;
  statusFilter: LibraryStatusFilter;
  provenanceFilter: SkillProvenance | null;
  functionFilter: SkillFunction | null;
  counts: Pick<SkillListResult, 'countByProvenance' | 'countByFunction' | 'countByStatus'> | undefined;
  search: string;
  hasActiveFilter: boolean;
  pendingAiCount: number;
  ai: ReturnType<typeof useAiClassify>;
  onDimensionSwitch: (d: SkillsDimension) => void;
  onStatusChange: (s: LibraryStatusFilter) => void;
  onProvenanceChip: (p: SkillProvenance) => void;
  onFunctionChip: (f: SkillFunction) => void;
  onSearchChange: (v: string) => void;
  onClearFilter: () => void;
}

export function SkillsToolbar({
  dimension,
  statusFilter,
  provenanceFilter,
  functionFilter,
  counts,
  search,
  hasActiveFilter,
  pendingAiCount,
  ai,
  onDimensionSwitch,
  onStatusChange,
  onProvenanceChip,
  onFunctionChip,
  onSearchChange,
  onClearFilter,
}: SkillsToolbarProps): JSX.Element {
  const statusCounts: Record<LibraryStatusFilter, number> = {
    all: (counts?.countByStatus.in ?? 0) + (counts?.countByStatus.out ?? 0),
    in: counts?.countByStatus.in ?? 0,
    out: counts?.countByStatus.out ?? 0,
  };

  return (
    <>
      {/* 维度切换（来源为主维度，排在首位）与库状态分段控件（与出处 chips 正交） */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => onDimensionSwitch('provenance')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs',
              dimension === 'provenance' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Factory className="h-3.5 w-3.5" />
            按来源
          </button>
          <button
            type="button"
            onClick={() => onDimensionSwitch('function')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs',
              dimension === 'function' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            按职能
          </button>
        </div>
        <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="库状态筛选">
          {(['all', 'in', 'out'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={statusFilter === s}
              onClick={() => onStatusChange(s)}
              className={cn(
                'rounded-md px-3 py-1 text-xs',
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {LIBRARY_STATUS_LABELS[s]} {statusCounts[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 当前维度分类计数条（子选项卡跟随维度切换） */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {dimension === 'provenance'
          ? PROVENANCE_ORDER.map((p) => (
              <CountChip
                key={p}
                active={provenanceFilter === p}
                label={PROVENANCE_LABELS[p]}
                count={counts?.countByProvenance[p] ?? 0}
                onClick={() => onProvenanceChip(p)}
              />
            ))
          : FUNCTION_ORDER.map((f) => (
              <CountChip
                key={f}
                active={functionFilter === f}
                label={FUNCTION_LABELS[f]}
                count={counts?.countByFunction[f] ?? 0}
                onClick={() => onFunctionChip(f)}
              />
            ))}
      </div>

      {/* 搜索与操作 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索技能名称或描述..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {hasActiveFilter && (
          <button type="button" onClick={onClearFilter} className="text-xs text-muted-foreground underline">
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
      </div>
    </>
  );
}
