/**
 * AI 智能分类统一触发逻辑（SkillsView / SkillDetail 共用）
 *
 * 流程（spec add-skill-ai-classification）：
 * 1. 触发前先读配置，未配置时弹配置对话框、不发起分类请求
 * 2. 配置保存成功后回到之前的触发意图（继续完成刚才想做的分类）
 * 3. 结果提示：成功 N（缓存命中 M）/ 跳过 N / 失败明细
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import type { AiClassifyResult } from '@/types/api';

/** 将分类结果以 toast 汇报：计数进描述，失败项进可折叠明细 */
function notifyResult(result: AiClassifyResult): void {
  const failedDetails = result.failed.map((f) => `${f.name}：${f.error}`);
  const summary: string[] = [];
  if (result.classified.length > 0) {
    summary.push(`成功 ${result.classified.length} 个（缓存命中 ${result.cacheHits} 个）`);
  }
  if (result.skipped.length > 0) {
    summary.push(`跳过 ${result.skipped.length} 个（已手动分类）`);
  }
  if (result.failed.length > 0) {
    summary.push(`失败 ${result.failed.length} 个`);
  }

  if (result.classified.length === 0 && result.failed.length > 0) {
    toast.error('AI 分类失败', { description: summary.join('；'), details: failedDetails });
    return;
  }
  if (summary.length === 0) {
    toast.info('AI 分类完成', { description: '没有可分类的技能' });
    return;
  }
  toast.success('AI 分类完成', {
    description: summary.join('；'),
    details: failedDetails.length > 0 ? failedDetails : undefined,
  });
}

export function useAiClassify(onRefresh?: () => void): {
  classify: (ids?: string[]) => void;
  configOpen: boolean;
  setConfigOpen: (open: boolean) => void;
  resumePending: () => void;
  running: boolean;
} {
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [running, setRunning] = useState(false);
  /** 待续跑的触发意图：null 表示本次打开配置对话框与分类无关（直接点配置入口） */
  const pending = useRef<{ ids?: string[] } | null>(null);
  const runningRef = useRef(false);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    onRefresh?.();
  };

  const run = (ids?: string[]): void => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    api
      .aiClassifySkills(ids)
      .then((result) => {
        notifyResult(result);
        refresh();
      })
      .catch((err: unknown) => {
        toast.error('AI 分类失败', { description: errorMessage(err) });
      })
      .finally(() => {
        runningRef.current = false;
        setRunning(false);
      });
  };

  const classify = (ids?: string[]): void => {
    if (runningRef.current) return;
    pending.current = { ids };
    api
      .getAiClassifyConfig()
      .then((config) => {
        // 未配置时不发起分类请求，弹配置对话框引导填写
        if (config.baseUrl && config.model && config.hasApiKey) run(ids);
        else setConfigOpen(true);
      })
      .catch((err: unknown) => {
        toast.error('读取 AI 分类配置失败', { description: errorMessage(err) });
      });
  };

  const resumePending = (): void => {
    if (!pending.current) return;
    run(pending.current.ids);
  };

  return { classify, configOpen, setConfigOpen, resumePending, running };
}
