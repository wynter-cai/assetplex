import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles, Layers, Factory, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useEscapeKey } from '@/lib/use-escape-key';
import { Markdown, stripFrontmatter } from '@/components/common/Markdown';
import { cn } from '@/lib/utils';
import type { SkillInfo, SkillFunction, SkillOrigin } from '@/types/api';

const FUNCTION_LABELS: Record<SkillFunction, string> = {
  coding: '编码开发',
  writing: '文档写作',
  browser: '浏览器自动化',
  data: '数据处理',
  devops: 'DevOps/部署',
  'ai-integration': 'AI 集成',
  design: '设计创意',
  workflow: '工作流自动化',
  other: '其他',
};

const ORIGIN_LABELS: Record<SkillOrigin, string> = {
  builtin: '官方内置',
  plugin: '插件自带',
  personal: '个人自建',
  marketplace: '市场安装',
};

const FUNCTION_ORDER: SkillFunction[] = [
  'coding', 'writing', 'browser', 'data', 'devops', 'ai-integration', 'design', 'workflow', 'other',
];
const ORIGIN_ORDER: SkillOrigin[] = ['personal', 'plugin', 'marketplace', 'builtin'];

type Dimension = 'function' | 'origin';

/** 技能卡：职能/来源/版本/副本数 + 职能覆盖下拉 + 查看详情按钮 */
function SkillCard({ skill, active, onSelect }: { skill: SkillInfo; active: boolean; onSelect: (s: SkillInfo) => void }): JSX.Element {
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
      )}
    >
      <div className="flex items-center gap-2 mb-1">
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
        {skill.functionOverridden && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1">已手动分类</Badge>
        )}
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

/** 技能详情面板（Esc 可关闭）：元信息 + 所有副本位置 + SKILL.md 原文 */
function SkillDetail({ skill, onClose }: { skill: SkillInfo; onClose: () => void }): JSX.Element {
  useEscapeKey(true, onClose);
  const { data, isLoading } = useQuery({
    queryKey: ['skill', skill.id],
    queryFn: () => api.getSkill(skill.id),
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card lg:max-w-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{skill.name}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{FUNCTION_LABELS[skill.functionCategory]}</Badge>
          <Badge variant="outline">{ORIGIN_LABELS[skill.origin]}</Badge>
          {skill.version && <Badge variant="secondary">v{skill.version}</Badge>}
          {skill.functionOverridden && <Badge variant="secondary">已手动分类</Badge>}
        </div>

        {skill.description && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">描述</h3>
            <p className="text-sm">{skill.description}</p>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">
            文件位置（共 {skill.variants.length + 1} 个副本）
          </h3>
          <ul className="space-y-1">
            <li>
              <code className="block text-xs bg-muted rounded p-2 break-all">{skill.sourcePath}</code>
            </li>
            {skill.variants.map((v) => (
              <li key={v}>
                <code className="block text-xs bg-muted rounded p-2 break-all">{v}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col flex-1 min-h-48">
          <h3 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1 shrink-0">
            <FileText className="h-3 w-3" />
            SKILL.md 文档
          </h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="flex-1 min-h-0 overflow-auto rounded border bg-muted/30 p-3">
              {data?.rawContent ? (
                <Markdown content={stripFrontmatter(data.rawContent)} />
              ) : (
                <p className="text-xs text-muted-foreground">（无内容）</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [dimension, setDimension] = useState<Dimension>('function');
  const [functionFilter, setFunctionFilter] = useState<SkillFunction | null>(null);
  const [originFilter, setOriginFilter] = useState<SkillOrigin | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SkillInfo | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['skills', functionFilter, originFilter, search],
    queryFn: () =>
      api.listSkills({
        function: functionFilter ?? undefined,
        origin: originFilter ?? undefined,
        search: search || undefined,
      }),
  });

  const switchDimension = (next: Dimension): void => {
    setDimension(next);
    // 切换维度时清空筛选状态
    setFunctionFilter(null);
    setOriginFilter(null);
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
      </div>

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
                      onSelect={(s) => setSelected((prev) => (prev?.id === s.id ? null : s))}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      )}
      </div>

      {selected && <SkillDetail skill={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
