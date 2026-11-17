/**
 * 技能卡：复选框 + 职能/出处徽章 + 右上角「调整分类」入口（点击才展开确认区）
 * spec refactor-design-system skill-card-badges（卡面常驻徽章 ≤2）；
 * spec inline-function-confirm（改分类必须显式确认、成功可撤销）。
 * spec refactor-skill-catalog R1.2/T9：问题数/未体检/已过期状态标记（纯文本，不占徽章位）。
 */

import { Sparkles, Tag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FUNCTION_LABELS, FUNCTION_ORDER, provenanceBadgeLabel } from './skill-labels';
import { FunctionDot } from './FunctionDot';
import { useFunctionChange } from './use-function-change';
import type { DiagnosisOverall, SkillDiagnosisSummaryView, SkillInfo, SkillFunction } from '@/types/api';

const OVERALL_LABELS: Record<DiagnosisOverall, string> = {
  healthy: '健康',
  'needs-attention': '需关注',
  'at-risk': '有风险',
};

const OVERALL_DOT: Record<DiagnosisOverall, string> = {
  healthy: 'bg-emerald-500',
  'needs-attention': 'bg-amber-500',
  'at-risk': 'bg-destructive',
};

function issueTotal(summary: SkillDiagnosisSummaryView): number {
  return summary.issueCounts.high + summary.issueCounts.medium + summary.issueCounts.low;
}

/** 摘要状态标记文案；非 catalog 来源（状态未知）返回 null，不冒充「未体检」 */
function diagnosisMarkerText(skill: SkillInfo): string | null {
  if (skill.provenanceGroup === undefined) return null;
  const summary = skill.diagnosis;
  if (summary === undefined) return '未体检';
  if (summary.stale) return `已过期 · ${OVERALL_LABELS[summary.overall]}`;
  const total = issueTotal(summary);
  return total > 0 ? `${OVERALL_LABELS[summary.overall]} · ${total} 个问题` : OVERALL_LABELS[summary.overall];
}

function DiagnosisMarker({ skill }: { skill: SkillInfo }): JSX.Element | null {
  const text = diagnosisMarkerText(skill);
  if (text === null) return null;
  const dot = skill.diagnosis === undefined ? 'bg-muted-foreground/50' : OVERALL_DOT[skill.diagnosis.overall];
  return (
    <span
      data-testid="skill-diagnosis-marker"
      className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded', dot)} aria-hidden="true" />
      {text}
    </span>
  );
}

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
  const fn = useFunctionChange(skill);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${active ? '收起' : '展开'} ${skill.name} 卡片`}
      onClick={() => onSelect(skill)}
      onKeyDown={(e) => {
        // 卡内控件（复选/调整分类/下拉）自己处理键盘，不触发整卡展开
        if (e.target !== e.currentTarget) return;
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
        <span className="text-sm font-medium truncate flex-1">{skill.name}</span>
        <button
          ref={fn.triggerRef}
          type="button"
          aria-label={`调整 ${skill.name} 的分类`}
          aria-expanded={fn.open}
          aria-controls={`function-editor-${skill.id}`}
          onClick={(e) => {
            e.stopPropagation();
            fn.begin();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {skill.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{skill.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {FUNCTION_LABELS[skill.functionCategory] && (
          <Badge variant="outline" className="text-xs h-5 px-1 gap-1">
            <FunctionDot fn={skill.functionCategory} />
            {FUNCTION_LABELS[skill.functionCategory]}
          </Badge>
        )}
        {provenanceBadgeLabel(skill) && (
          <Badge variant="outline" className="text-xs h-5 px-1">{provenanceBadgeLabel(skill)}</Badge>
        )}
        <DiagnosisMarker skill={skill} />
      </div>
      {fn.open && (
        <div
          id={`function-editor-${skill.id}`}
          className="mt-2 flex items-center gap-1.5 border-t pt-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <select
            aria-label={`${skill.name} 的新职能分类`}
            className="h-7 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-xs"
            value={fn.draft}
            onChange={(e) => fn.setDraft(e.target.value as SkillFunction)}
          >
            {FUNCTION_ORDER.map((f) => (
              <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>
            ))}
          </select>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={fn.apply} disabled={fn.pending}>
            {fn.pending ? '提交中…' : '应用'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={fn.cancel}>
            取消
          </Button>
        </div>
      )}
    </Card>
  );
}
