/**
 * 忽略清单管理（refactor-governance-center T7）
 *
 * 只读展示 + 单条恢复：忽略按「路径 + 规则 + 内容哈希」绑定，内容变更后自动失效。
 * spec: governance-center.spec.md Scenario 5.5 / 5.7
 */

import { useQuery } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

export function IgnoreListSection(): JSX.Element {
  const ignoresQuery = useQuery({ queryKey: ['diagnosis-ignores'], queryFn: () => api.getDiagnosisIgnores() });
  const data = ignoresQuery.data ?? null;

  async function restore(hubRelativePath: string, ruleId: string): Promise<void> {
    await api.restoreDiagnosisFinding({ hubRelativePath, ruleId });
    await ignoresQuery.refetch();
  }

  return (
    <section className="space-y-2" data-testid="ignore-list-section">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Ban className="h-4 w-4" />
        忽略清单
      </h2>
      <p className="text-sm text-muted-foreground">
        忽略按「资产 + 规则 + 内容哈希」绑定：资产内容一改，忽略自动失效并重新提示。
      </p>

      {ignoresQuery.isLoading && <p className="text-sm text-muted-foreground">忽略清单读取中…</p>}
      {ignoresQuery.isError && (
        <p className="text-sm text-destructive">
          忽略清单读取失败：{ignoresQuery.error instanceof Error ? ignoresQuery.error.message : '请稍后重试'}
        </p>
      )}

      {data !== null && data.expired > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="ignore-expired-hint">
          其中 {data.expired} 条因资产内容变更已自动失效，下次诊断会重新提示。
        </p>
      )}

      {data !== null && data.items.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">暂无忽略项。</CardContent>
        </Card>
      )}

      {data !== null && data.items.length > 0 && (
        <div className="space-y-1.5">
          {data.items.map((item) => (
            <Card key={`${item.hubRelativePath}:${item.ruleId}`}>
              <CardContent className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
                <Badge variant="outline" className="font-mono">
                  {item.ruleId}
                </Badge>
                <span className="truncate">{item.hubRelativePath}</span>
                <span className="text-muted-foreground">忽略于 {item.ignoredAt.slice(0, 10)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs"
                  onClick={() => void restore(item.hubRelativePath, item.ruleId)}
                >
                  恢复提示
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
