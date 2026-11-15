/**
 * 首页今日待办队列（refactor-home-action-panel T7）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * Requirement 2：按严重度排序、首屏前 5 条、行内「查看」就地展开体检报告、
 * 可修复项给「去资产库修改」；忽略/稍后/一键修复属于质量中心，这里一律不出现。
 * 0 条与数据不可用由上层渲染空态，本组件返回 null。
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DiagnosisPanel } from '@/components/doctor/DiagnosisPanel';
import { useEscapeKey } from '@/lib/use-escape-key';
import { homeFixTargetPath } from '@/lib/use-home-dashboard';
import type { DiagnosisSeverity, HealthIssueRef, HomeIssueQueue } from '@/types/api';

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };
const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2 };
const VISIBLE_LIMIT = 5;

const LINK_CLASS =
  'rounded text-12 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

/** 严重度降序 + 同严重度按资产名升序（后端已排序，这里防御性再排一次） */
function sortIssues(items: readonly HealthIssueRef[]): HealthIssueRef[] {
  return [...items].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.assetName.localeCompare(b.assetName, 'zh-CN');
  });
}

export interface TodayQueueProps {
  issues: HomeIssueQueue;
}

export function TodayQueue({ issues }: TodayQueueProps): JSX.Element | null {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEscapeKey(expandedId !== null, () => setExpandedId(null), { returnFocusRef: triggerRef });

  if (!issues.available || issues.items.length === 0) return null;

  const visible = sortIssues(issues.items).slice(0, VISIBLE_LIMIT);
  const total = issues.total ?? issues.items.length;

  /** ↑/↓ 或 J/K 在条目间移动焦点（Scenario 2.6） */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
    const delta =
      event.key === 'ArrowDown' || event.key === 'j' || event.key === 'J'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'k' || event.key === 'K'
          ? -1
          : 0;
    if (delta === 0 || listRef.current === null) return;
    const buttons = Array.from(
      listRef.current.querySelectorAll<HTMLButtonElement>('[data-queue-view]'),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[(index + delta + buttons.length) % buttons.length].focus();
  };

  return (
    <section aria-label="今日待办" data-testid="today-queue" className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-14 font-semibold">今日待办</h2>
        <span className="text-12 text-muted-foreground">共 {total} 项，按严重度排序</span>
      </header>

      <ul ref={listRef} onKeyDown={handleKeyDown}>
        {visible.map((issue) => {
          const isOpen = expandedId === issue.id;
          return (
            <li key={issue.id} data-testid="queue-item" className="border-t">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <Badge variant={severityVariant(issue.severity)}>
                  {SEVERITY_LABEL[issue.severity]}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-13 font-medium leading-snug">{issue.title}</p>
                  <p className="text-12 text-muted-foreground">{issue.assetName}</p>
                </div>
                <Link
                  to={homeFixTargetPath(issue.kind, issue.hubRelativePath)}
                  className={LINK_CLASS}
                >
                  在资产库中打开
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-12"
                  data-queue-view
                  aria-expanded={isOpen}
                  aria-controls={`queue-report-${issue.id}`}
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    setExpandedId(isOpen ? null : issue.id);
                  }}
                >
                  {isOpen ? '收起' : '查看'}
                </Button>
              </div>

              {isOpen && (
                <div
                  id={`queue-report-${issue.id}`}
                  className="space-y-2 border-t bg-muted/20 px-4 py-3"
                >
                  <p className="break-all text-11 text-muted-foreground">{issue.hubRelativePath}</p>
                  <DiagnosisPanel
                    kind={issue.kind}
                    hubRelativePath={issue.hubRelativePath}
                    autoStart
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="border-t px-4 py-2.5 text-right">
        <Link to="/quality" className={LINK_CLASS}>
          查看全部 {total} 项
        </Link>
      </footer>
    </section>
  );
}
