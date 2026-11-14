/**
 * 首页首跑入口（add-zero-config-onboarding 走查修复）
 *
 * 已有资产的用户不会自动进入向导（spec Requirement 1 的首次判定），
 * 但从未跑过引导时需要在首页给一个显式入口，否则新功能不可发现。
 * 跑过（completed/skipped）或已标记 onboarded 后不再出现。
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function OnboardingResumeCard(): JSX.Element | null {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const { data } = useQuery({
    queryKey: ['onboarding-state'],
    queryFn: api.getOnboardingState,
    retry: 0,
  });

  if (dismissed || data === undefined || data.onboarded || data.lastOutcome !== null) {
    return null;
  }

  return (
    <div
      data-testid="onboarding-resume"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </span>
        <div>
          <p className="text-14 font-semibold leading-snug">首次使用引导</p>
          <p className="mt-0.5 text-12 leading-relaxed text-muted-foreground">
            约 60 秒盘点本机 AI 工具，把散落在各处的资产收进一个库；任何一步都可跳过。
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-9 rounded-lg px-3.5 text-13 font-semibold"
          onClick={() => navigate('/onboarding')}
          data-testid="onboarding-resume-start"
        >
          开始引导
        </Button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="暂时关闭首次引导入口"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
