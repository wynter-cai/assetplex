/**
 * 详情内分发入口闸门（refactor-asset-pipeline T10）
 *
 * 复检通过（无 high/medium）→ 主按钮「分发到工具」；
 * 未通过 → 主入口收起，只留次要「仍要分发」并说明风险。
 * 真正的工具清单与执行复用资产库既有的同步管理对话框（runSync + backup）。
 */

import { Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiagnosisReport, DiagnosisSeverity } from '@/types/api';

export interface DistributionGateProps {
  report: DiagnosisReport;
  onDistribute: () => void;
}

/** 复检是否通过：无高/中问题即通过（低与建议项可发） */
function blockingIssues(report: DiagnosisReport): DiagnosisSeverity[] {
  const severities: DiagnosisSeverity[] = [];
  if (report.findings !== undefined && report.findings.length > 0) {
    for (const finding of report.findings) {
      if (finding.ignored || finding.insufficientEvidence) continue;
      if (finding.severity === 'high' || finding.severity === 'medium') severities.push(finding.severity);
    }
    return severities;
  }
  for (const issue of report.issues) {
    if (issue.severity === 'high' || issue.severity === 'medium') severities.push(issue.severity);
  }
  return severities;
}

export function DistributionGate({ report, onDistribute }: DistributionGateProps): JSX.Element {
  const blocking = blockingIssues(report);
  const passed = blocking.length === 0;

  if (passed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onDistribute}>
          <Send className="h-3.5 w-3.5 mr-1.5" />
          分发到工具
        </Button>
        <span className="text-xs text-muted-foreground">复检通过：没有高 / 中风险问题</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDistribute}>
          <Send className="h-3.5 w-3.5 mr-1.5" />
          仍要分发
        </Button>
        <span className="flex items-center gap-1 text-xs text-warning">
          <ShieldAlert className="h-3.5 w-3.5" />
          复检未通过：还有 {blocking.length} 个高 / 中风险问题
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        建议先修复再分发：带问题发出去会同时影响所有已连接工具。
      </p>
    </div>
  );
}
