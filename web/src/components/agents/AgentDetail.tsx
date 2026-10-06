/**
 * 智能体详情面板：元信息 + 定义文件内容
 * 权限矩阵（spec: add-skill-agent-write-management）：
 * - tool=hub（我的库）→ 编辑/删除/同步分发
 * - 内置 Persona → 只读，无任何操作
 * - 插件/Expert/工具目录自建 → 只读，仅同步分发
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Pencil } from 'lucide-react';
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
import { KIND_LABELS, TOOL_LABELS, formatTime } from './agent-labels';
import type { AgentInfo } from '@/types/api';

interface AgentDetailProps {
  agent: AgentInfo;
  onClose: () => void;
}

/** 删除确认对话框：明示影响范围（spec 删除确认文案） */
function DeleteConfirmDialog({
  agent,
  open,
  onOpenChange,
  onConfirm,
}: {
  agent: AgentInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除智能体「{agent.name}」</DialogTitle>
          <DialogDescription>
            将从我的库及所有已分发工具中删除该智能体，此操作不可撤销。
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

export function AgentDetail({ agent, onClose }: AgentDetailProps): JSX.Element {
  useEscapeKey(true, onClose);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['agent', agent.id],
    queryFn: () => api.getAgent(agent.id),
  });

  const isHub = agent.tool === 'hub';
  const isBuiltinPersona = agent.kind === 'builtin-persona';

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['agents'] });
    void queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
  };

  const startEdit = (): void => {
    setEditContent(data?.rawContent ?? '');
    setEditing(true);
  };

  const saveEdit = (): void => {
    api
      .updateAgent(agent.id, editContent)
      .then(() => {
        setEditing(false);
        refresh();
      })
      .catch((err: unknown) => {
        // 404（智能体已不存在）等错误：提示并刷新列表
        alert(err instanceof Error ? err.message : '保存失败');
        refresh();
      });
  };

  const doDelete = (): void => {
    api
      .deleteAgent(agent.id)
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
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{agent.name}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto min-h-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{KIND_LABELS[agent.kind]}</Badge>
          <Badge variant="outline">{TOOL_LABELS[agent.tool]}</Badge>
          <Badge variant={agent.userCreated ? 'secondary' : 'outline'}>
            {agent.userCreated ? '用户自建' : '工具内置'}
          </Badge>
        </div>

        {agent.description && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">描述</h3>
            <p className="text-sm">{agent.description}</p>
          </div>
        )}

        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2">
            {isHub && (
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                编辑
              </Button>
            )}
            {isHub && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            {!isBuiltinPersona && <SyncDistribute onSynced={refresh} />}
            {!isHub && (
              <p className="text-xs text-muted-foreground">
                {isBuiltinPersona
                  ? '内置 Persona 为只读盘点，不支持编辑、删除或分发。'
                  : '该智能体为只读盘点，不支持编辑或删除。'}
              </p>
            )}
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">定义位置</h3>
          <code className="block text-xs bg-muted rounded p-2 break-all">{agent.sourcePath}</code>
          <p className="text-xs text-muted-foreground mt-1">最后修改：{formatTime(agent.lastModifiedAt)}</p>
        </div>

        {agent.extra && Object.keys(agent.extra).length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">工具专属字段</h3>
            <dl className="text-xs space-y-1">
              {Object.entries(agent.extra).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">{k}:</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">定义文件内容</h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                aria-label="编辑定义文件内容"
                rows={14}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-8 px-3 text-xs" onClick={saveEdit}>保存</Button>
              </div>
            </div>
          ) : (
            <div className="rounded border bg-muted/30 p-2.5 overflow-auto max-h-80">
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
        agent={agent}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={doDelete}
      />
    </div>
  );
}
