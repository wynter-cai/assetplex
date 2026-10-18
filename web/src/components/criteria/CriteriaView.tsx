/**
 * 裁决准则页（add-llm-conflict-arbitration A6，资产库 /vault/criteria 下渲染）
 *
 * 准则即资产：列表来自 /api/criteria（priority→slug 排序），启用开关与删除
 * 全部走通用 /files 写通道，前端序列化与后端解析往返一致。
 * 空库绝不自动播种任何准则文件（spec Scenario 1b）。
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Scale, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { criterionAppliesToLabel, serializeCriterion } from './criteria-model';
import { CriterionCreateDialog } from './CriterionCreateDialog';
import { CriteriaPackDialog } from './CriteriaPackDialog';
import type { CriterionAsset } from '@/types/api';

/** 单条准则卡：启用开关、元信息徽章、正文预览、删除 */
function CriterionCard({
  criterion,
  onToggle,
  onDelete,
}: {
  criterion: CriterionAsset;
  onToggle: (c: CriterionAsset, next: boolean) => void;
  onDelete: (c: CriterionAsset) => void;
}): JSX.Element {
  return (
    <div
      data-testid={`criterion-card-${criterion.slug}`}
      className="space-y-2 rounded-lg border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{criterion.name}</span>
        <Switch
          checked={criterion.enabled}
          onCheckedChange={(next) => onToggle(criterion, next)}
          aria-label={`启用准则 ${criterion.name}`}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="h-5 px-1 text-xs">
          优先级 {criterion.priority}
        </Badge>
        <Badge variant="outline" className="h-5 px-1 text-xs">
          {criterionAppliesToLabel(criterion.appliesTo)}
        </Badge>
        {!criterion.enabled && (
          <Badge variant="secondary" className="h-5 px-1 text-xs">
            已停用
          </Badge>
        )}
      </div>

      {criterion.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{criterion.description}</p>
      )}
      {criterion.body && (
        <p className="text-xs text-muted-foreground/80 line-clamp-3 whitespace-pre-line">
          {criterion.body}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {criterion.source ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            来源：<span className="text-foreground/80">{criterion.source}</span>
          </span>
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          aria-label={`删除 ${criterion.name}`}
          onClick={() => onDelete(criterion)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          删除
        </Button>
      </div>
    </div>
  );
}

/** 裁决准则主视图（在资产库 /vault/criteria 下渲染） */
export function CriteriaView(): JSX.Element {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CriterionAsset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['criteria'],
    queryFn: () => api.listCriteria(),
  });

  const criteria = data?.criteria ?? [];

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['criteria'] });
  };

  /** 启用开关：以重新序列化的全文写回原文件（不产生第二套写库通道） */
  const handleToggle = (criterion: CriterionAsset, next: boolean): void => {
    api
      .writeFile(criterion.relativePath, serializeCriterion({ ...criterion, enabled: next }))
      .then(refresh)
      .catch((err: unknown) => {
        toast.error('更新准则失败', { description: errorMessage(err) });
      });
  };

  const confirmDelete = (): void => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    api
      .deleteFile(deleteTarget.relativePath)
      .then(() => {
        setDeleteTarget(null);
        refresh();
      })
      .catch((err: unknown) => {
        toast.error('删除准则失败', { description: errorMessage(err) });
      })
      .finally(() => setDeleting(false));
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        title="裁决准则"
        subtitle="冲突仲裁与资产诊断依据的最佳实践准则——准则本身也是资产"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setPackOpen(true)}>
              <Package className="h-3.5 w-3.5 mr-1.5" />
              导入业内准则包
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              新建准则
            </Button>
          </>
        }
      />

      {error && (
        <Card className="p-6 text-center text-destructive">
          加载失败: {error instanceof Error ? error.message : String(error)}
        </Card>
      )}

      {isLoading && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && !error && criteria.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Scale className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">还没有准则</h3>
          <p className="text-sm text-muted-foreground mb-4">
            准则是裁决模型仲裁冲突、诊断资产时的依据。可从页头新建，或导入业内精选准则包快速起步
          </p>
        </div>
      )}

      {!isLoading && criteria.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground mb-2">
            共 {criteria.length} 条准则，按优先级生效；裁决时依序取入直至预算耗尽
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
            {criteria.map((c) => (
              <CriterionCard
                key={c.slug}
                criterion={c}
                onToggle={handleToggle}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </div>
      )}

      <CriterionCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingSlugs={criteria.map((c) => c.slug)}
      />
      <CriteriaPackDialog open={packOpen} onOpenChange={setPackOpen} />

      {/* 删除确认：准则影响仲裁与诊断质量，警示后手动确认（spec Scenario 4） */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除准则「{deleteTarget?.name}」？</DialogTitle>
            <DialogDescription>
              删除后该准则不再进入仲裁与诊断的 prompt，相关裁决质量可能下降。
              若只想暂时停用，可在卡片上关闭启用开关。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
