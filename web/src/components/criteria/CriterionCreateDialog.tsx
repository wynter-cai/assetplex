/**
 * 新建裁决准则对话框（add-llm-conflict-arbitration A6，spec Scenario 2）
 *
 * 保存走通用 /files 写通道 createFile('criteria/<slug>.md')，不新建专用写库接口。
 * 正文即进仲裁/诊断 prompt 的准则内容；frontmatter 由 serializeCriterion 组装。
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
import {
  CRITERION_CATEGORY_OPTIONS,
  serializeCriterion,
  slugifyCriterionName,
  uniqueCriterionSlug,
} from './criteria-model';
import type { CriterionAppliesTo } from '@/types/api';

interface CriterionCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 现有准则 slug，用于新建时去重 */
  existingSlugs: string[];
}

export function CriterionCreateDialog({
  open,
  onOpenChange,
  existingSlugs,
}: CriterionCreateDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('100');
  const [appliesTo, setAppliesTo] = useState<CriterionAppliesTo[]>(['all']);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = (): void => {
    setName('');
    setDescription('');
    setPriority('100');
    setAppliesTo(['all']);
    setBody('');
  };

  const toggleAppliesTo = (code: CriterionAppliesTo): void => {
    setAppliesTo((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const slug = uniqueCriterionSlug(slugifyCriterionName(trimmed), existingSlugs);
    const parsedPriority = Number.parseInt(priority, 10);
    const effectiveAppliesTo: CriterionAppliesTo[] = appliesTo.length > 0 ? appliesTo : ['all'];
    const asset = {
      slug,
      relativePath: `criteria/${slug}.md`,
      name: trimmed,
      description: description.trim(),
      priority: Number.isFinite(parsedPriority) ? parsedPriority : 100,
      enabled: true,
      appliesTo: effectiveAppliesTo,
      body,
    };
    api
      .createFile(asset.relativePath, serializeCriterion(asset))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['criteria'] });
        resetForm();
        onOpenChange(false);
      })
      .catch((err: unknown) => {
        toast.error('创建准则失败', { description: errorMessage(err) });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建准则</DialogTitle>
          <DialogDescription>
            保存为 criteria/&lt;slug&gt;.md，正文将作为冲突仲裁与资产诊断的依据
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-medium">名称</span>
            <Input
              aria-label="准则名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：规则保持单一主题"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">描述（可选）</span>
            <Input
              aria-label="准则描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明这条准则约束什么"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1 w-28">
              <span className="text-xs font-medium">优先级</span>
              <Input
                aria-label="优先级"
                inputMode="numeric"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium block mb-1">适用范围</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {CRITERION_CATEGORY_OPTIONS.map((opt) => (
                  <label key={opt.code} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={appliesTo.includes(opt.code)}
                      onChange={() => toggleAppliesTo(opt.code)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium">正文（进 prompt 的准则内容）</span>
            <Textarea
              aria-label="准则正文"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'要做 X，不做 Y……\n写给裁决模型看的可执行表述'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
