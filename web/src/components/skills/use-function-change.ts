/**
 * 「调整分类」控制器（spec inline-function-confirm / refine-skill-cards-wizard T8-T9）
 *
 * 卡面与详情共用：展开 → 选择 → 显式「应用」才发请求；成功后 30 秒内可撤销。
 * 撤销前先取一次当前分类：已被他处改动则不发请求，只提示失效（避免覆盖用户后续手改）。
 */

import { useCallback, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { useEscapeKey } from '@/lib/use-escape-key';
import { FUNCTION_LABELS } from './skill-labels';
import type { SkillFunction } from '@/types/api';

export interface FunctionChangeController {
  open: boolean;
  draft: SkillFunction;
  pending: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
  setDraft: (fn: SkillFunction) => void;
  begin: () => void;
  cancel: () => void;
  apply: () => void;
}

export function useFunctionChange(skill: {
  id: string;
  functionCategory: SkillFunction;
}): FunctionChangeController {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SkillFunction>(skill.functionCategory);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['skill', skill.id] });
  }, [queryClient, skill.id]);

  const begin = useCallback((): void => {
    setDraft(skill.functionCategory);
    setOpen(true);
  }, [skill.functionCategory]);

  const cancel = useCallback((): void => setOpen(false), []);

  useEscapeKey(open, cancel, { returnFocusRef: triggerRef });

  /** 撤销：仅当当前分类仍等于「本次改成的值」才写回，否则提示已失效 */
  const undo = useCallback(
    (previous: SkillFunction, applied: SkillFunction): void => {
      void api
        .getSkill(skill.id)
        .then((res) => {
          if (res.skill.functionCategory !== applied) {
            toast.info('分类已被修改，撤销已失效');
            refresh();
            return undefined;
          }
          return api.overrideSkillFunction(skill.id, previous).then(() => {
            toast.success(`已撤销，恢复为 ${FUNCTION_LABELS[previous]}`);
            refresh();
          });
        })
        .catch((err: unknown) => {
          toast.error('撤销失败', { description: errorMessage(err) });
          refresh();
        });
    },
    [skill.id, refresh],
  );

  const apply = useCallback((): void => {
    const previous = skill.functionCategory;
    const next = draft;
    if (next === previous) {
      setOpen(false);
      return;
    }
    setPending(true);
    void api
      .overrideSkillFunction(skill.id, next)
      .then(() => {
        setOpen(false);
        refresh();
        toast.success(`已改为 ${FUNCTION_LABELS[next]}`, {
          action: { label: '撤销', onClick: () => undo(previous, next) },
        });
      })
      .catch((err: unknown) => {
        // 失败即回到列表真实值，不残留「以为改成功」的确认区
        setOpen(false);
        toast.error('修改分类失败', { description: errorMessage(err) });
        refresh();
      })
      .finally(() => setPending(false));
  }, [draft, skill.id, skill.functionCategory, refresh, undo]);

  return { open, draft, pending, triggerRef, setDraft, begin, cancel, apply };
}
