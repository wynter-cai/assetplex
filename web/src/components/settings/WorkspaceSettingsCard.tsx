/**
 * 工作区发现管理卡片（设置页）
 *
 * - TRAE storage.json 自动发现开关
 * - 工作区列表（来源、技能计数、路径），自动工作区可禁用/启用
 * - 手动工作区根添加/移除
 * - 发现错误与数量截断提示
 *
 * spec: add-project-skills-discovery / specs/project-skills.spec.md
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FolderTree, Plus, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { UpdateWorkspacesInput, WorkspaceInfo, WorkspacesResponse } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';

function WorkspaceRow({
  workspace,
  onToggleDisabled,
  onRemoveRoot,
}: {
  workspace: WorkspaceInfo;
  onToggleDisabled: (path: string, disabled: boolean) => void;
  onRemoveRoot: (path: string) => void;
}) {
  const isDisabled = workspace.disabled === true;
  return (
    <li className={`flex items-start justify-between gap-3 rounded-md border p-2.5 ${isDisabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{workspace.name}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {workspace.source === 'manual' ? '手动' : '自动'}
          </Badge>
          {isDisabled && <Badge variant="secondary" className="text-[10px] h-4 px-1">已禁用</Badge>}
          <Badge variant="secondary" className="text-[10px] h-4 px-1">
            {workspace.skillsDirExists ? `${workspace.skillCount} 个技能` : '未发现技能目录'}
          </Badge>
        </div>
        <code className="block mt-1 text-[11px] text-muted-foreground break-all">{workspace.path}</code>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {workspace.source === 'auto' || isDisabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-label={`${isDisabled ? '启用' : '禁用'}工作区 ${workspace.name}`}
            onClick={() => onToggleDisabled(workspace.path, !isDisabled)}
          >
            {isDisabled ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          </Button>
        ) : null}
        {workspace.source === 'manual' && !isDisabled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-label={`移除手动根 ${workspace.name}`}
            onClick={() => onRemoveRoot(workspace.path)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function WorkspaceSettingsCard(): JSX.Element {
  const queryClient = useQueryClient();
  const [newRoot, setNewRoot] = useState('');
  const { data } = useQuery<WorkspacesResponse>({ queryKey: ['workspaces'], queryFn: api.getWorkspaces });

  const mutation = useMutation({
    mutationFn: (patch: UpdateWorkspacesInput) => api.updateWorkspaces(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(['workspaces'], next);
      void queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (err: unknown) => {
      toast.error('工作区设置保存失败', { description: errorMessage(err) });
    },
  });

  const roots = data?.config.roots ?? [];
  const disabledWorkspaces = data?.config.disabledWorkspaces ?? [];

  const addRoot = (): void => {
    const root = newRoot.trim();
    if (!root || mutation.isPending) return;
    mutation.mutate({ roots: [...roots, root] }, { onSuccess: () => setNewRoot('') });
  };

  const removeRoot = (path: string): void => {
    mutation.mutate({ roots: roots.filter((root) => root !== path) });
  };

  const toggleDisabled = (path: string, disabled: boolean): void => {
    const next = disabled
      ? [...disabledWorkspaces, path]
      : disabledWorkspaces.filter((item) => item !== path);
    mutation.mutate({ disabledWorkspaces: next });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderTree className="h-4 w-4" />
          项目技能工作区
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="workspace-auto-discover">从 TRAE 自动发现工作区</Label>
            <p className="text-[11px] text-muted-foreground">读取 TRAE 最近打开的工作区，扫描其中 .trae/skills 下的项目技能</p>
          </div>
          <Switch
            id="workspace-auto-discover"
            checked={data?.config.autoDiscover ?? true}
            disabled={mutation.isPending || !data}
            onCheckedChange={(value) => mutation.mutate({ autoDiscover: value })}
          />
        </div>

        {data?.errors.map((message) => (
          <p key={message} className="text-xs text-amber-600 dark:text-amber-400">
            {message}
          </p>
        ))}

        {data?.truncated && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            工作区数量超过上限 {data.maxWorkspaces}，仅展示前 {data.maxWorkspaces} 个；可禁用不需要的自动工作区
          </p>
        )}

        <ul className="space-y-2">
          {data?.workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.path}
              workspace={workspace}
              onToggleDisabled={toggleDisabled}
              onRemoveRoot={removeRoot}
            />
          ))}
          {data && data.workspaces.length === 0 && (
            <li className="text-xs text-muted-foreground">尚未发现含项目技能的工作区，可在下方手动添加工作区根。</li>
          )}
        </ul>

        <div className="flex gap-2">
          <Input
            className="text-xs"
            placeholder="工作区或其父目录的绝对路径"
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addRoot();
            }}
          />
          <Button variant="outline" size="sm" className="shrink-0" disabled={mutation.isPending} onClick={addRoot}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加工作区根
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
