/**
 * 新建我的库技能表单（名称/描述/正文，描述与正文可空）
 * spec: add-skill-agent-write-management
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
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
import type { SkillInfo } from '@/types/api';

interface SkillCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 创建成功后回调（父组件打开新技能详情） */
  onCreated: (skill: SkillInfo) => void;
}

export function SkillCreateDialog({ open, onOpenChange, onCreated }: SkillCreateDialogProps): JSX.Element {
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
      .createSkill({
        name: trimmedName,
        description: description.trim() || undefined,
        content,
      })
      .then((result) => {
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
        resetForm();
        onOpenChange(false);
        onCreated(result.skill);
      })
      .catch((err: unknown) => {
        // 重名（400）/ 非法名称（400）等后端校验错误直接提示
        toast.error('创建技能失败', { description: errorMessage(err) });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建技能</DialogTitle>
          <DialogDescription>保存到我的库 skills/&lt;名称&gt;/SKILL.md，可再分发到各工具</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium">名称</span>
            <Input
              aria-label="技能名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：周报助手"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">描述（可选）</span>
            <Input
              aria-label="技能描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：生成中文周报"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">正文（可选）</span>
            <Textarea
              aria-label="技能正文"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="SKILL.md 正文，支持 Markdown"
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
