/**
 * 技能详情对话框：删除确认 + 收藏到我的库
 * spec: add-skill-agent-write-management / add-skill-curation
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/** 删除确认对话框：明示影响范围（spec 删除确认文案） */
export function DeleteConfirmDialog({
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
            将从我的库及所有已同步工具中删除该技能，此操作不可撤销。
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

/** 收藏对话框：名称预填可改，确认后复制到我的库（spec add-skill-curation，行为不变） */
export function CurateDialog({
  skill,
  onOpenChange,
  onCurated,
}: {
  skill: SkillInfo;
  onOpenChange: (open: boolean) => void;
  onCurated: (skill: SkillInfo) => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(skill.name);
  const [submitting, setSubmitting] = useState(false);

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    api
      .curateSkill({ id: skill.id, name: trimmed })
      .then((result) => {
        void queryClient.invalidateQueries({ queryKey: ['skills'] });
        onOpenChange(false);
        onCurated(result.skill);
      })
      .catch((err: unknown) => {
        // 同名冲突（400）/ 名称非法（400）等后端校验错误直接提示，对话框保持打开
        toast.error('收藏失败', { description: errorMessage(err) });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>收藏到我的库</DialogTitle>
          <DialogDescription>
            复制「{skill.name}」到我的库 skills/&lt;名称&gt;/SKILL.md，源技能保留不动
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <span className="text-xs font-medium">名称</span>
          <Input
            aria-label="收藏技能名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? '收藏中…' : '确认收藏'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
