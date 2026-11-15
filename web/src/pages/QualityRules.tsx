/**
 * 质量中心 · 规则清单（add-diagnosis-rules T7）
 *
 * 只读展示诊断引擎实际使用的规则集：版本、计数、编号、判定信号、改法与依据。
 * 与诊断报告、编写指南共用同一份 `GET /api/diagnosis/rules`，页面不另写规则文案。
 *
 * spec: specs/diagnosis-rules.spec.md Scenario 1.1 / 1.3、统计口径（cross 单列）
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import type {
  DiagnosisRule,
  DiagnosisRuleCategory,
  DiagnosisRuleMode,
  DiagnosisSeverity,
} from '@/types/api';

type CategoryFilter = DiagnosisRuleCategory | 'all';

const CATEGORY_ORDER: DiagnosisRuleCategory[] = [
  'identity',
  'skill',
  'rule',
  'mcp',
  'command',
  'agent',
  'memory',
  'cross',
];

const CATEGORY_LABEL: Record<DiagnosisRuleCategory, string> = {
  identity: '身份',
  skill: '技能',
  rule: '规则',
  mcp: 'MCP',
  command: '命令',
  agent: '子代理',
  memory: '记忆',
  cross: '跨资产通用',
};

const MODE_LABEL: Record<DiagnosisRuleMode, string> = { static: '静态', llm: 'AI 语义' };
const SEVERITY_LABEL: Record<DiagnosisSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityVariant(severity: DiagnosisSeverity): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'high') return 'destructive';
  if (severity === 'medium') return 'warning';
  return 'secondary';
}

function RuleCard({ rule }: { rule: DiagnosisRule }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copyId = (): void => {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) return;
    void clipboard
      .writeText(rule.id)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <Card data-testid={`rule-card-${rule.id}`}>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono">
            {rule.id}
          </Badge>
          <Badge variant={severityVariant(rule.severity)}>{SEVERITY_LABEL[rule.severity]}</Badge>
          <Badge variant="secondary">{MODE_LABEL[rule.mode]}</Badge>
          <Badge variant="outline">{CATEGORY_LABEL[rule.category]}</Badge>
          {rule.category === 'cross' && rule.appliesTo !== undefined && (
            <span className="text-xs text-muted-foreground">
              适用于 {rule.appliesTo.map((kind) => CATEGORY_LABEL[kind]).join(' / ')}
            </span>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={copyId}>
            {copied ? '已复制' : '复制编号'}
          </Button>
        </div>
        <p className="text-sm">{rule.signal}</p>
        <p className="text-xs text-muted-foreground">改法：{rule.recommendation}</p>
        <p className="text-xs text-muted-foreground">依据：{rule.source}</p>
      </CardContent>
    </Card>
  );
}

export default function QualityRules(): JSX.Element {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const rulesQuery = useQuery({
    queryKey: ['diagnosis-rules'],
    queryFn: () => api.getDiagnosisRules(),
  });

  const data = rulesQuery.data ?? null;
  const visibleCategories =
    data === null ? [] : CATEGORY_ORDER.filter((category) => data.counts[category] > 0);
  const visibleRules =
    data === null ? [] : data.rules.filter((rule) => filter === 'all' || rule.category === filter);

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ListChecks className="h-5 w-5" />
          规则清单
        </h1>
        <p className="text-sm text-muted-foreground">
          诊断报告里的每一条问题都来自这里的规则；规则集随版本内置，不是用户配置。
        </p>
        {data !== null && (
          <p className="text-xs text-muted-foreground" data-testid="rule-set-summary">
            规则集 v{data.version} · 共 {data.rules.length} 条（静态 {data.modeCounts.static} · AI{' '}
            {data.modeCounts.llm}）· 跨资产通用 {data.counts.cross} 条单列计数
          </p>
        )}
      </header>

      {rulesQuery.isLoading && <p className="text-sm text-muted-foreground">规则清单读取中…</p>}

      {rulesQuery.isError && data === null && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <h2 className="text-base font-semibold">规则清单读取失败</h2>
                <p className="text-sm text-muted-foreground">
                  规则集未能加载，诊断引擎本轮也不会给出结论；请稍后重试。
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void rulesQuery.refetch()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {data !== null && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
            >
              全部 {data.rules.length}
            </Button>
            {visibleCategories.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={filter === category ? 'default' : 'outline'}
                onClick={() => setFilter(category)}
              >
                {CATEGORY_LABEL[category]} {data.counts[category]}
              </Button>
            ))}
          </div>

          <div className="space-y-2" data-testid="rule-list">
            {visibleRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
