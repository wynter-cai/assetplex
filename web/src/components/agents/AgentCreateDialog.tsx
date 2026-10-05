/**
 * 新建保险箱智能体表单（名称/描述/系统提示词，描述与提示词可空）
 * 保存为 hub agents/<name>.md（Claude Code 子代理格式）
 * spec: add-skill-agent-write-management
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { AgentInfo } from '@/types/api';

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建成功后回调（父组件打开新智能体详情） */
  onCreated: (agent: AgentInfo) => void;
}

export function AgentCreateDialog({ open, onOpenChange, onCreated }: AgentCreateDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = (): void => {
    setName('');
    setDescription('');
    setContent('');
  };

  const submit = (): void => {
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    setSubmitting(true);
    api
      .createAgent({
        name: trimmedName,
        description: description.trim() || undefined,
        content,
      })
      .then((result) => {
        void queryClient.invalidateQueries({ queryKey: ['agents'] });
        resetForm();
        onOpenChange(false);
        onCreated(result.agent);
      })
      .catch((err: unknown) => {
        // 重名（400）/ 非法名称（400）等后端校验错误直接提示
        alert(err instanceof Error ? err.message : '创建智能体失败');
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建智能体</DialogTitle>
          <DialogDescription>保存到保险箱 agents/&lt;名称&gt;.md（子代理格式），可再分发到各工具</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium">名称</span>
            <Input
              aria-label="智能体名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：测试专家"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">描述（可选）</span>
            <Input
              aria-label="智能体描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：负责生成测试用例"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">系统提示词（可选）</span>
            <Textarea
              aria-label="系统提示词"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="智能体的 system prompt 正文"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? '创建中…' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
