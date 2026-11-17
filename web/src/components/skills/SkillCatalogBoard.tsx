/**
 * 技能分类全貌看板（refactor-skill-catalog T8）
 *
 * 两组分类行（来源 / 用途）+ 数量 + 最近更新 + 问题数分布 + 展开收起。
 * 只读展示，筛选状态由 SkillsView 持有并共用：点击分组行只切换该维度筛选，
 * 展开内容取自同一份筛选结果，不另存一份数据。
 * 统计接口失败时只降级看板（「统计暂不可用」+ 重试），下方技能列表照常加载。
 * spec: 设计文档/changes/refactor-skill-catalog/specs/skill-catalog.spec.md（R1/R3）
 */

import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Stethoscope, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SkillCatalogGroup, SkillCatalogOverview, SkillInfo } from '@/types/api';

export type CatalogDimension = 'provenance' | 'function';

export interface SkillCatalogBoardProps {
  overview: SkillCatalogOverview | undefined;
  /** 与列表同源的条目（catalog 响应 items），用于展开预览与分组操作 */
  items: SkillInfo[];
  loading?: boolean;
  /** 统计接口失败：只降级本区域，不影响下方列表 */
  error?: unknown;
  onRetry?: () => void;
  onOpenSkill?: (skill: SkillInfo) => void;
  /** 分组行「诊断本类 / 分发本类」（T10）；缺省不渲染入口 */
  onDiagnoseGroup?: (items: SkillInfo[]) => void;
  onDistributeGroup?: (items: SkillInfo[]) => void;
}

/** ISO → 「2026-11-14」；解析不出来返回空串，不伪造时间 */
function formatDay(iso: string | null): string {
  if (iso === null) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/** 分组内的技能：来源按三分组，用途按九类 */
function groupSkills(items: SkillInfo[], dimension: CatalogDimension, key: string): SkillInfo[] {
  const matched =
    dimension === 'provenance'
      ? items.filter((skill) => skill.provenanceGroup === key)
      : items.filter((skill) => skill.functionCategory === key);
  return [...matched].sort((a, b) => (b.lastModifiedAt ?? '').localeCompare(a.lastModifiedAt ?? ''));
}

function diagnosisDistribution(group: SkillCatalogGroup, unavailable: boolean): string {
  if (unavailable) return '诊断分布统计暂不可用';
  const parts = [
    `有风险 ${group.diagnosis.atRisk}`,
    `需关注 ${group.diagnosis.needsAttention}`,
    `健康 ${group.diagnosis.healthy}`,
    `未体检 ${group.diagnosis.unchecked}`,
  ];
  if (group.diagnosis.stale > 0) parts.push(`已过期 ${group.diagnosis.stale}`);
  return parts.join(' · ');
}

interface GroupRowProps {
  dimension: CatalogDimension;
  group: SkillCatalogGroup;
  open: boolean;
  skills: SkillInfo[];
  diagnosisUnavailable: boolean;
  onToggle: () => void;
  onOpenSkill?: (skill: SkillInfo) => void;
  onDiagnoseGroup?: (items: SkillInfo[]) => void;
  onDistributeGroup?: (items: SkillInfo[]) => void;
}

function ExpandedSkills({
  skills,
  onOpenSkill,
}: {
  skills: SkillInfo[];
  onOpenSkill?: (skill: SkillInfo) => void;
}): JSX.Element {
  return (
    <ul className="border-t px-2 py-1">
      {skills.map((skill) => (
        <li key={skill.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
            onClick={() => onOpenSkill?.(skill)}
          >
            <span className="truncate">{skill.name}</span>
            {skill.diagnosis !== undefined && (
              <span className="shrink-0 text-muted-foreground">
                {skill.diagnosis.stale
                  ? '已过期'
                  : `${skill.diagnosis.issueCounts.high + skill.diagnosis.issueCounts.medium + skill.diagnosis.issueCounts.low} 个问题`}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function GroupActions(props: GroupRowProps): JSX.Element {
  return (
    <>
      {props.onDiagnoseGroup !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-1.5 text-[11px]"
          onClick={() => props.onDiagnoseGroup?.(props.skills)}
        >
          <Stethoscope className="h-3 w-3 mr-0.5" />
          诊断本类
        </Button>
      )}
      {props.onDistributeGroup !== undefined && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 shrink-0 px-1.5 text-[11px]"
          onClick={() => props.onDistributeGroup?.(props.skills)}
        >
          <Upload className="h-3 w-3 mr-0.5" />
          分发本类
        </Button>
      )}
    </>
  );
}

function GroupRow(props: GroupRowProps): JSX.Element {
  const { group, open, skills, diagnosisUnavailable } = props;
  const empty = group.count === 0;
  const latest = formatDay(group.latestModifiedAt);

  return (
    <div className="rounded-md border" data-testid={`catalog-group-${props.dimension}-${group.key}`}>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          aria-expanded={empty ? undefined : open}
          disabled={empty}
          aria-label={`${open ? '收起' : '展开'}${group.label}分组`}
          onClick={props.onToggle}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent',
            empty && 'cursor-default opacity-50 hover:bg-transparent',
          )}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="font-medium">{group.label}</span>
          <span className="text-muted-foreground">{group.count}</span>
          {latest !== '' && <span className="text-muted-foreground">最近更新 {latest}</span>}
          <span className="truncate text-muted-foreground">{diagnosisDistribution(group, diagnosisUnavailable)}</span>
        </button>
        {!empty && <GroupActions {...props} />}
      </div>
      {open && !empty && <ExpandedSkills skills={skills} {...(props.onOpenSkill === undefined ? {} : { onOpenSkill: props.onOpenSkill })} />}
    </div>
  );
}

export function SkillCatalogBoard(props: SkillCatalogBoardProps): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { overview, items, error } = props;

  if (error !== undefined) {
    return (
      <section aria-label="技能分类看板" className="mb-4 rounded-lg border bg-card p-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          统计暂不可用，下方技能列表不受影响
        </p>
        {props.onRetry !== undefined && (
          <Button variant="outline" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={props.onRetry}>
            重试
          </Button>
        )}
      </section>
    );
  }

  if (overview === undefined) {
    return (
      <section aria-label="技能分类看板" className="mb-4 rounded-lg border bg-card p-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {props.loading === true ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          统计加载中…
        </p>
      </section>
    );
  }

  const diagnosisUnavailable = overview.partial?.diagnosisUnavailable === true;

  const renderGroup = (dimension: CatalogDimension, group: SkillCatalogGroup): JSX.Element => {
    const key = `${dimension}:${group.key}`;
    return (
      <GroupRow
        key={key}
        dimension={dimension}
        group={group}
        open={expanded === key}
        skills={groupSkills(items, dimension, group.key)}
        diagnosisUnavailable={diagnosisUnavailable}
        onToggle={() => setExpanded((prev) => (prev === key ? null : key))}
        {...(props.onOpenSkill === undefined ? {} : { onOpenSkill: props.onOpenSkill })}
        {...(props.onDiagnoseGroup === undefined ? {} : { onDiagnoseGroup: props.onDiagnoseGroup })}
        {...(props.onDistributeGroup === undefined ? {} : { onDistributeGroup: props.onDistributeGroup })}
      />
    );
  };

  return (
    <section aria-label="技能分类看板" className="mb-4 rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">技能全貌</h2>
        <span className="text-xs text-muted-foreground">资产技能 {overview.total} 个</span>
        <span className="text-xs text-muted-foreground">
          待体检 {overview.diagnosis.unchecked} · 未过期摘要 {overview.diagnosis.checked}
          {overview.diagnosis.stale > 0 ? ` · 已过期 ${overview.diagnosis.stale}` : ''}
        </span>
      </div>
      {overview.total === 0 ? (
        <p className="text-xs text-muted-foreground">暂无技能</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">按来源</h3>
            <div className="space-y-1">{overview.groups.provenance.map((group) => renderGroup('provenance', group))}</div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">按用途</h3>
            <div className="space-y-1">{overview.groups.function.map((group) => renderGroup('function', group))}</div>
          </div>
        </div>
      )}
    </section>
  );
}
