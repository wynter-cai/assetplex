/**
 * 技能卡：复选框 + 职能/出处/版本/副本数 + 职能覆盖下拉 + 查看详情按钮
 */

import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import { FUNCTION_LABELS, FUNCTION_SOURCE_LABELS, FUNCTION_ORDER, provenanceBadgeLabel } from './skill-labels';
import type { SkillInfo, SkillFunction } from '@/types/api';

export function SkillCard({
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
        // 失败提示并刷新，受控 Select 随查询数据回到真实分类
        toast.error('修改分类失败', { description: errorMessage(err) });
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
          <Badge variant="outline" className="text-xs h-5 px-1 shrink-0">v{skill.version}</Badge>
        )}
        {skill.variants > 0 && (
          <Badge variant="secondary" className="text-xs h-5 px-1 shrink-0">
            {skill.variants + 1} 副本
          </Badge>
        )}
      </div>
      {skill.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        <Badge variant="outline" className="text-xs h-5 px-1">{FUNCTION_LABELS[skill.functionCategory]}</Badge>
        <Badge variant="outline" className="text-xs h-5 px-1">
          {provenanceBadgeLabel(skill)}
        </Badge>
        <Badge variant="secondary" className="text-xs h-5 px-1">
          {FUNCTION_SOURCE_LABELS[skill.functionSource]}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
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
