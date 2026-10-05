/**
 * 技能详情面板：元信息 + 副本位置 + SKILL.md 原文
 * 保险箱（origin=vault）技能提供 编辑/删除/同步分发；其他来源只读、仅同步分发。
 * spec: add-skill-agent-write-management
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, FileText, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useEscapeKey } from '@/lib/use-escape-key';
import { Markdown, stripFrontmatter } from '@/components/common/Markdown';
import { SyncDistribute } from '@/components/common/SyncDistribute';
import { FUNCTION_LABELS, ORIGIN_LABELS } from './skill-labels';
import type { SkillInfo } from '@/types/api';

interface SkillDetailProps {
  skill: SkillInfo;
  onClose: () => void;
}

/** 删除确认对话框：明示影响范围（spec 删除确认文案） */
function DeleteConfirmDialog({
  skill,
  open,
  onOpenChange,
  onConfirm,
}: {
  skill: SkillInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除技能「{skill.name}」</DialogTitle>
          <DialogDescription>
            将从保险箱及所有已分发工具中删除该技能，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>确认删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillDetail({ skill, onClose }: SkillDetailProps): JSX.Element {
  useEscapeKey(true, onClose);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['skill', skill.id],
    queryFn: () => api.getSkill(skill.id),
  });

  const isVault = skill.origin === 'vault';

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['skill', skill.id] });
  };

  const startEdit = (): void => {
    setEditContent(data?.rawContent ?? '');
    setEditing(true);
  };

  const saveEdit = (): void => {
    api
      .updateSkill(skill.id, editContent)
      .then(() => {
        setEditing(false);
        refresh();
      })
      .catch((err: unknown) => {
        // 404（技能已不存在）等错误：提示并刷新列表
        alert(err instanceof Error ? err.message : '保存失败');
        refresh();
      });
  };

  const doDelete = (): void => {
    api
      .deleteSkill(skill.id)
      .then(() => {
        refresh();
        onClose();
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '删除失败');
        setConfirmDelete(false);
      });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card lg:max-w-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{skill.name}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{FUNCTION_LABELS[skill.functionCategory]}</Badge>
          <Badge variant="outline">{ORIGIN_LABELS[skill.origin]}</Badge>
          {skill.version && <Badge variant="secondary">v{skill.version}</Badge>}
          {skill.functionOverridden && <Badge variant="secondary">已手动分类</Badge>}
        </div>

        {skill.description && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">描述</h3>
            <p className="text-sm">{skill.description}</p>
          </div>
        )}

        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2">
            {isVault && (
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                编辑
              </Button>
            )}
            {isVault && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            <SyncDistribute onSynced={refresh} />
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">
            文件位置（共 {skill.variants.length + 1} 个副本）
          </h3>
          <ul className="space-y-1">
            <li>
              <code className="block text-xs bg-muted rounded p-2 break-all">{skill.sourcePath}</code>
            </li>
            {skill.variants.map((v) => (
              <li key={v}>
                <code className="block text-xs bg-muted rounded p-2 break-all">{v}</code>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col flex-1 min-h-48">
          <h3 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1 shrink-0">
            <FileText className="h-3 w-3" />
            SKILL.md 文档
          </h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : editing ? (
            <div className="flex flex-col gap-2 flex-1">
              <Textarea
                aria-label="编辑 SKILL.md 内容"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-h-48 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-8 px-3 text-xs" onClick={saveEdit}>保存</Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto rounded border bg-muted/30 p-3">
              {data?.rawContent ? (
                <Markdown content={stripFrontmatter(data.rawContent)} />
              ) : (
                <p className="text-xs text-muted-foreground">（无内容）</p>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        skill={skill}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={doDelete}
      />
    </div>
  );
}
