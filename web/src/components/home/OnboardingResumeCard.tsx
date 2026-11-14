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
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-medium">首次使用引导</p>
          <p className="text-xs text-muted-foreground">
            约 60 秒盘点本机 AI 工具，把散落在各处的资产收进一个库；任何一步都可跳过。
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => navigate('/onboarding')} data-testid="onboarding-resume-start">
          开始引导
        </Button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="暂时关闭首次引导入口"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
