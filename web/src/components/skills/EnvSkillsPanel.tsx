/**
 * 「本机技能环境」折叠入口（spec refactor-skill-asset-first-view Scenario 1/2/8）
 * 环境技能（未入库的市场/插件/内置）不是资产、默认不公示：
 * 底部常驻一格折叠入口，展开时才以 scope=environment 查询；收藏操作经详情面板保留
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { SkillCard } from './SkillCard';
import { ENV_PROVENANCE_ORDER, PROVENANCE_LABELS } from './skill-labels';
import type { SkillInfo, SkillListResult } from '@/types/api';

interface EnvSkillsPanelProps {
  open: boolean;
  onToggle: () => void;
  /** 环境条目数（来自资产口径响应的 countByScope.environment，随收藏联动 -1） */
  environmentCount: number;
  selectedId: string | null;
  onSelect: (s: SkillInfo) => void;
}

/** 环境列表分组（仅显示有技能的分组，顺序固定：市场安装 → 插件自带 → 官方内置） */
function buildEnvGroups(items: SkillListResult['items']): Array<{ key: string; label: string; items: SkillInfo[] }> {
  const groups: Array<{ key: string; label: string; items: SkillInfo[] }> = [];
  for (const key of ENV_PROVENANCE_ORDER) {
    const groupItems = items.filter((s) => s.provenance === key);
    if (groupItems.length > 0) groups.push({ key, label: PROVENANCE_LABELS[key], items: groupItems });
  }
  return groups;
}

export function EnvSkillsPanel({
  open,
  onToggle,
  environmentCount,
  selectedId,
  onSelect,
}: EnvSkillsPanelProps): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['skills', 'environment'],
    queryFn: () => api.listSkills({ scope: 'environment' }),
    enabled: open,
    // 收起再展开时沿用上一份数据渲染，不闪骨架（与主视图同一惯例）
    placeholderData: keepPreviousData,
  });

  const groups = data ? buildEnvGroups(data.items) : [];

  return (
    <section className="mt-8 border-t pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        本机技能环境 {environmentCount}
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        市场安装 / 插件自带 / 官方内置技能属于本机环境，随时可重装；收藏后才进入资产管理
      </p>

      {open && (
        <div className="mt-4 space-y-6">
          {isLoading && !data && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          )}
          {!isLoading && groups.length === 0 && (
            <p className="text-sm text-muted-foreground">环境中暂无未入库技能</p>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {group.label}
                <span className="text-xs font-normal text-muted-foreground">{group.items.length}</span>
              </h2>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
                {group.items.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    active={selectedId === skill.id}
                    checked={false}
                    onSelect={onSelect}
                    onCheckChange={() => undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
