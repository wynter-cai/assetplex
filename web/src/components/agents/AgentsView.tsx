import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Bot, User as UserIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AgentInfo, AgentKind, AgentTool } from '@/types/api';

const KIND_LABELS: Record<AgentKind, string> = {
  'custom-subagent': '自建子代理',
  expert: 'CodeBuddy 专家',
  'builtin-persona': '内置 Persona',
  'plugin-agent': '插件智能体',
};

const TOOL_LABELS: Record<AgentTool, string> = {
  trae: 'TRAE',
  codebuddy: 'CodeBuddy',
  claude: 'Claude Code',
  codex: 'Codex',
};

const ALL_KINDS: AgentKind[] = ['custom-subagent', 'expert', 'builtin-persona', 'plugin-agent'];
const ALL_TOOLS: AgentTool[] = ['trae', 'codebuddy', 'claude', 'codex'];

function formatTime(iso: string | null): string {
  if (!iso) return '时间未知';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

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
          <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
            <UserIcon className="h-2.5 w-2.5 mr-0.5" />
            自建
          </Badge>
        )}
      </div>
      {agent.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{agent.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px] h-4 px-1">{KIND_LABELS[agent.kind]}</Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1">{TOOL_LABELS[agent.tool]}</Badge>
      </div>
    </button>
  );
}

/** 只读详情面板 */
function AgentDetail({ agent, onClose }: { agent: AgentInfo; onClose: () => void }): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['agent', agent.id],
    queryFn: () => api.getAgent(agent.id),
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card lg:max-w-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{agent.name}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{KIND_LABELS[agent.kind]}</Badge>
          <Badge variant="outline">{TOOL_LABELS[agent.tool]}</Badge>
          <Badge variant={agent.userCreated ? 'secondary' : 'outline'}>
            {agent.userCreated ? '用户自建' : '工具内置'}
          </Badge>
        </div>

        {agent.description && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">描述</h3>
            <p className="text-sm">{agent.description}</p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">定义位置</h3>
          <code className="block text-xs bg-muted rounded p-2 break-all">{agent.sourcePath}</code>
          <p className="text-xs text-muted-foreground mt-1">最后修改：{formatTime(agent.lastModifiedAt)}</p>
        </div>

        {agent.extra && Object.keys(agent.extra).length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">工具专属字段</h3>
            <dl className="text-xs space-y-1">
              {Object.entries(agent.extra).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">{k}:</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">原始定义</h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-72 whitespace-pre-wrap break-words">
              {data?.rawContent || '（无内容）'}
            </pre>
          )}
        </div>

        <p className="text-xs text-muted-foreground">智能体为只读盘点，暂不支持编辑或分发。</p>
      </div>
    </div>
  );
}

/** 智能体只读盘点主视图（在资产库 /vault/agent 下渲染） */
export function AgentsView(): JSX.Element {
  const [kindFilter, setKindFilter] = useState<AgentKind | null>(null);
  const [toolFilter, setToolFilter] = useState<AgentTool | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AgentInfo | null>(null);

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
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索智能体名称或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {error && (
          <Card className="p-6 text-center text-red-500">
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
