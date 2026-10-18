/**
 * 业内准则包导入对话框（add-llm-conflict-arbitration A6，spec Scenario 1b/3）
 *
 * 列出内置模板（名称/描述/来源），仅按勾选导入；同名准则后端拒绝、不覆盖，
 * 结果在对话框内如实披露（不静默）。
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { criterionAppliesToLabel } from './criteria-model';
import type { CriteriaPackImportResult } from '@/types/api';

interface CriteriaPackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CriteriaPackDialog({ open, onOpenChange }: CriteriaPackDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<CriteriaPackImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['criteria-pack'],
    queryFn: () => api.listCriteriaPack(),
    enabled: open,
  });

  // 每次打开重置勾选与上次结果
  useEffect(() => {
    if (open) {
      setSelected([]);
      setResult(null);
    }
  }, [open]);

  const toggle = (slug: string): void => {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  };

  const submit = (): void => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    api
      .importCriteriaPack(selected)
      .then((res) => {
        setResult(res);
        setSelected([]);
        void queryClient.invalidateQueries({ queryKey: ['criteria'] });
      })
      .catch((err: unknown) => {
        toast.error('导入准则包失败', { description: errorMessage(err) });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>导入业内准则包</DialogTitle>
          <DialogDescription>
            精选的业内最佳实践改写模板，勾选后导入到我的库；同名条目不覆盖
          </DialogDescription>
        </DialogHeader>

        {isLoading && <Skeleton className="h-40 rounded-md" />}
        {error && (
          <p className="text-sm text-destructive">
            加载准则包失败: {error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {data && (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {data.templates.map((t) => (
              <label
                key={t.slug}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:border-primary/40"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(t.slug)}
                  onChange={() => toggle(t.slug)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-xs h-5 px-1">
                      {criterionAppliesToLabel(t.appliesTo)}
                    </Badge>
                    <Badge variant="outline" className="text-xs h-5 px-1">
                      优先级 {t.priority}
                    </Badge>
                  </span>
                  {t.description && (
                    <span className="block text-xs text-muted-foreground mt-1">{t.description}</span>
                  )}
                  <span className="block text-xs text-muted-foreground mt-1">来源：{t.source}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {result && (
          <div className="rounded-md border bg-accent/40 p-3 text-xs space-y-1">
            {result.inserted.length > 0 && (
              <p>已导入 {result.inserted.length} 条：{result.inserted.join('、')}</p>
            )}
            {result.rejected.length > 0 && (
              <p className="text-destructive">
                已存在，未覆盖：{result.rejected.join('、')}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="sm" onClick={submit} disabled={selected.length === 0 || submitting}>
            {submitting ? '导入中…' : '导入选中'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
