/**
 * 单资产问题清单（refactor-asset-pipeline T8）
 *
 * 优先读 `findings`（含规则编号、置信度、来源、证据）；旧响应缺 findings 时
 * 回退 `issues`，保证不空屏。单条问题可展开看证据：路径 + 行号 + 原文片段。
 * 证据不足固定文案「证据不足，无法确定」，且不冒充可修复。
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type {
  DiagnosisIssue,
  DiagnosisReport,
  DiagnosisSeverity,
  RuleFinding,
} from '@/types/api';

const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

interface FindingRowProps {
  finding: RuleFinding;
}

function FindingRow({ finding }: FindingRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const evidence = finding.evidence;

  return (
    <li className="text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={severityVariant(finding.severity)}>{SEVERITY_LABEL[finding.severity]}</Badge>
        <span className="font-mono text-[11px] text-muted-foreground">{finding.ruleId}</span>
        <Badge variant="outline">{finding.source === 'llm' ? 'AI' : '规则'}</Badge>
        <Badge variant="outline">置信度 {finding.confidence}</Badge>
        {finding.fixable && !finding.insufficientEvidence && <Badge variant="secondary">可修复</Badge>}
        {finding.ignored && <Badge variant="outline">已忽略</Badge>}
        <button
          type="button"
          className="ml-auto text-[11px] text-primary underline underline-offset-2"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
        >
          {open ? '收起证据' : '查看证据'}
        </button>
      </div>
      <p className="font-medium">{finding.title || finding.finding}</p>
      {finding.finding !== '' && finding.finding !== finding.title && (
        <p className="text-muted-foreground">{finding.finding}</p>
      )}
      {finding.insufficientEvidence && (
        <p className="text-muted-foreground">证据不足，无法确定</p>
      )}
      {open && (
        <div className="rounded border bg-muted/30 p-2 space-y-1">
          {evidence.length === 0 ? (
            <p className="text-muted-foreground">证据不足，无法确定</p>
          ) : (
            evidence.map((item, index) => (
              <div key={`${item.hubRelativePath}-${index}`}>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {item.hubRelativePath}
                  {item.line !== null && `:${item.line}`}
                </p>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">{item.snippet}</pre>
              </div>
            ))
          )}
          {finding.suggestion !== '' && (
            <p className="text-muted-foreground">建议：{finding.suggestion}</p>
          )}
          {finding.impact !== '' && <p className="text-muted-foreground">影响：{finding.impact}</p>}
        </div>
      )}
    </li>
  );
}

/** 旧响应（无 findings）的兼容渲染：保持既有文案与准则链接 */
function LegacyRow({ issue }: { issue: DiagnosisIssue }): JSX.Element {
  return (
    <li className="text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={severityVariant(issue.severity)}>{SEVERITY_LABEL[issue.severity]}</Badge>
        {issue.criterion.startsWith('mechanical:') ? (
          <Badge variant="outline">机械检查</Badge>
        ) : (
          <a
            className="text-primary underline underline-offset-2"
            href={`/criteria?slug=${encodeURIComponent(issue.criterion)}`}
          >
            {issue.criterion}
          </a>
        )}
        {issue.fixable && <Badge variant="secondary">可修复</Badge>}
      </div>
      <p className="font-medium">{issue.finding}</p>
      <p className="text-muted-foreground">{issue.suggestion}</p>
    </li>
  );
}

export interface IssueListProps {
  report: DiagnosisReport;
}

export function IssueList({ report }: IssueListProps): JSX.Element {
  const findings = report.findings;
  if (findings !== undefined && findings.length > 0) {
    const ignoredCount = findings.filter((item) => item.ignored).length;
    return (
      <div className="space-y-2">
        <ul className="space-y-2">
          {findings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </ul>
        {ignoredCount > 0 && (
          <p className="text-xs text-muted-foreground">已忽略 {ignoredCount} 条</p>
        )}
      </div>
    );
  }

  if (report.issues.length === 0) {
    return <p className="text-xs text-muted-foreground">未发现违反已启用准则的问题</p>;
  }

  return (
    <ul className="space-y-2">
      {report.issues.map((issue, index) => (
        <LegacyRow key={`${issue.criterion}-${index}`} issue={issue} />
      ))}
    </ul>
  );
}
