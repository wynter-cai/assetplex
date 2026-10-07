import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Bot, User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AgentDetail } from './AgentDetail';
import { AgentCreateDialog } from './AgentCreateDialog';
import { KIND_LABELS, TOOL_LABELS, ALL_KINDS, ALL_TOOLS } from './agent-labels';
import type { AgentInfo, AgentKind, AgentTool } from '@/types/api';

/** 单张智能体卡片（只读） */
function AgentCard({ agent, active, onSelect }: { agent: AgentInfo; active: boolean; onSelect: (a: AgentInfo) => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent)}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors hover:border-primary/40',
        active ? 'border-primary bg-accent/40' : 'bg-card',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{agent.name}</span>
        {agent.userCreated && (
          <Badge variant="secondary" className="text-xs h-5 px-1 shrink-0">
            <UserIcon className="h-2.5 w-2.5 mr-0.5" />
            自建
          </Badge>
        )}
      </div>
      {agent.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{agent.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-xs h-5 px-1">{KIND_LABELS[agent.kind]}</Badge>
        <Badge variant="outline" className="text-xs h-5 px-1">{TOOL_LABELS[agent.tool]}</Badge>
      </div>
    </button>
  );
}

/** 详情面板改为独立组件（AgentDetail.tsx）：我的库智能体支持编辑/删除/同步分发 */

/** 智能体盘点主视图（在资产库 /vault/agent 下渲染） */
export function AgentsView(): JSX.Element {
  const [kindFilter, setKindFilter] = useState<AgentKind | null>(null);
  const [toolFilter, setToolFilter] = useState<AgentTool | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AgentInfo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  /** 新建成功后打开新智能体详情 */
  const handleCreated = (agent: AgentInfo): void => setSelected(agent);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agents', kindFilter, toolFilter, search],
    queryFn: () =>
      api.listAgents({
        kind: kindFilter ?? undefined,
        tool: toolFilter ?? undefined,
        search: search || undefined,
      }),
  });

  return (
    <div className="flex min-w-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 页头（spec refactor-design-system page-headers：类别 H1 + 主操作） */}
        <PageHeader
          title="智能体"
          subtitle="盘点各工具中的子智能体配置"
          actions={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Bot className="h-3.5 w-3.5 mr-1.5" />
              新建智能体
            </Button>
          }
        />

        {/* 计数与筛选条 */}
        <div className="space-y-2 mb-4">
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={kindFilter === null}
              label={`全部类型${data ? ` ${data.items.length}` : ''}`}
              onClick={() => setKindFilter(null)}
            />
            {ALL_KINDS.map((k) => (
              <FilterChip
                key={k}
                active={kindFilter === k}
                label={`${KIND_LABELS[k]}${data ? ` ${data.countByKind[k]}` : ''}`}
                onClick={() => setKindFilter(kindFilter === k ? null : k)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TOOLS.map((t) => (
              <FilterChip
                key={t}
                active={toolFilter === t}
                label={`${TOOL_LABELS[t]}${data ? ` ${data.countByTool[t]}` : ''}`}
                onClick={() => setToolFilter(toolFilter === t ? null : t)}
                subtle
              />
            ))}
          </div>
        </div>

        {/* 搜索 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索智能体名称或描述..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {error && (
          <Card className="p-6 text-center text-destructive">
            加载失败: {error instanceof Error ? error.message : String(error)}
          </Card>
        )}

        {isLoading && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && data && (
          <>
            <p className="text-xs text-muted-foreground mb-2">共 {data.total} 个智能体</p>
            {data.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">未发现匹配的智能体</h3>
                <p className="text-sm text-muted-foreground">试试调整筛选条件或关键字</p>
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
                {data.items.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    active={selected?.id === agent.id}
                    onSelect={(a) => setSelected((prev) => (prev?.id === a.id ? null : a))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selected && <AgentDetail agent={selected} onClose={() => setSelected(null)} />}

      <AgentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

function FilterChip({ active, label, onClick, subtle }: { active: boolean; label: string; onClick: () => void; subtle?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : subtle
            ? 'bg-muted/50 text-muted-foreground hover:bg-accent'
            : 'bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}
