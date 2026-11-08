/**
 * 首页主动性建议条（add-asset-governance L3）
 *
 * spec: specs/proactive-guidance.spec.md Scenario 1/3/5/6
 * 只在首页呈现，不弹模态框、不加红点；忽略按会话生效。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { GovernanceSuggestionItem, SuggestionAction } from '@/types/api';

const IGNORED_KEY = 'assetplex:suggestions:ignored';
const FIRST_RUN_KEY = 'assetplex:suggestions:first-run-dismissed';

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 会话存储不可用时仅影响「本次忽略」，不阻断建议展示
  }
}

function ActionControl({
  action,
  onOpenRemediation,
}: {
  action: SuggestionAction;
  onOpenRemediation?: () => void;
}): JSX.Element {
  if (action.intent === 'open-remediation') {
    return (
      <Button size="sm" onClick={onOpenRemediation} disabled={onOpenRemediation === undefined}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button size="sm" asChild>
      <Link to={action.route}>{action.label}</Link>
    </Button>
  );
}

function scaleText(item: GovernanceSuggestionItem): string {
  const parts = [`涉及 ${item.scale.assets} 个资产`];
  if (item.scale.estimatedCalls > 0) parts.push(`预计调用 ${item.scale.estimatedCalls} 次模型`);
  return parts.join(' / ');
}

export interface SuggestionRailProps {
  onOpenRemediation?: () => void;
}

export function SuggestionRail({ onOpenRemediation }: SuggestionRailProps): JSX.Element | null {
  const { data, isError } = useQuery({
    queryKey: ['governance-suggestions'],
    queryFn: api.getGovernanceSuggestions,
    retry: 1,
  });
  const [ignored, setIgnored] = useState<string[]>(() => readSession<string[]>(IGNORED_KEY, []));
  const [firstRunDismissed, setFirstRunDismissed] = useState<boolean>(() => readSession<boolean>(FIRST_RUN_KEY, false));

  if (isError || data === undefined) return null;

  const visible = data.suggestions.filter((item) => !ignored.includes(item.id));
  const firstRun = data.firstRun !== null && !firstRunDismissed ? data.firstRun : null;

  if (firstRun === null && visible.length === 0 && data.emptyMessage === null) {
    return null;
  }

  const ignore = (id: string): void => {
    const next = [...ignored, id];
    setIgnored(next);
    writeSession(IGNORED_KEY, next);
  };

  const dismissFirstRun = (): void => {
    setFirstRunDismissed(true);
    writeSession(FIRST_RUN_KEY, true);
  };

  return (
    <Card data-testid="suggestion-rail">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4" />
          治理建议
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {firstRun !== null && (
          <div className="rounded-md border bg-muted/30 p-3" data-testid="first-run-briefing">
            <p className="text-sm font-medium">{firstRun.headline}</p>
            {!firstRun.clean && (
              <p className="mt-1 text-xs text-muted-foreground">
                重复 {firstRun.stats.duplicateCount} 项 · 缺关键信息 {firstRun.stats.missingInfoCount} 项
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionControl action={firstRun.primary} onOpenRemediation={onOpenRemediation} />
              <Button size="sm" variant="ghost" onClick={dismissFirstRun} data-testid="first-run-dismiss">
                {firstRun.secondary.label}
              </Button>
            </div>
          </div>
        )}

        {data.emptyMessage !== null ? (
          <p className="text-sm text-muted-foreground">{data.emptyMessage}</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <li key={item.id} className="rounded-md border px-3 py-2" data-testid={`suggestion-${item.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{scaleText(item)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <ActionControl action={item.action} onOpenRemediation={onOpenRemediation} />
                    <Button size="sm" variant="ghost" onClick={() => ignore(item.id)}>
                      本次忽略
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data.info.map((item) => (
          <p key={item.id} className="text-xs text-muted-foreground">
            {item.text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
