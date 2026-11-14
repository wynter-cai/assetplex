/**
 * 体检屏（s4）：静态检查零模型 + AI 可选增强（add-zero-config-onboarding T14）
 *
 * spec Requirement 5：静态结果来自治理健康分（零 API Key 可完成）；
 * AI 区标「可选增强」，配置弹窗含厂商预设、只填地址与模型；
 * 未配置时绝不发起模型请求。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiConfigDialog, type AiConfigPreset } from '@/components/skills/AiConfigDialog';
import { SkillsCheckupSection } from '@/components/doctor/SkillsCheckupSection';
import { severityMeta } from './onboarding-visual';
import { api } from '@/lib/api';
import type { GovernanceHealth, HealthIssueRef } from '@/types/api';

/** 厂商预设（与原型一致；只填地址与模型，Key 由用户自填） */
export const AI_PRESETS: AiConfigPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'doubao', label: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'ollama', label: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:14b' },
];

function gradeLabel(health: GovernanceHealth): string {
  switch (health.grade) {
    case 'excellent':
      return '优秀';
    case 'good':
      return '良好';
    case 'needs-attention':
      return '需关注';
    case 'at-risk':
      return '有风险';
    default:
      return '刚刚建库';
  }
}

/** 静态检查问题：优先真实 topIssues，没有明细时按维度计数兜底 */
function staticIssues(health: GovernanceHealth): HealthIssueRef[] {
  return health.dimensions.flatMap((dimension) => dimension.topIssues).slice(0, 4);
}

/** 健康分环：conic-gradient 只用 CSS 变量取色，不引入新依赖 */
function HealthRing({ score }: { score: number }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color =
    clamped >= 80
      ? 'hsl(var(--success))'
      : clamped >= 60
        ? 'hsl(var(--warning))'
        : 'hsl(var(--destructive))';
  return (
    <div
      role="img"
      aria-label={`健康分 ${clamped}`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, hsl(var(--muted)) 0deg)` }}
    >
      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-card text-12 font-bold tabular-nums">
        {clamped}
      </span>
    </div>
  );
}

export function DoctorScreen({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}): JSX.Element {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const healthQuery = useQuery({
    queryKey: ['governance-health'],
    queryFn: () => api.getGovernanceHealth(false),
    retry: 1,
  });
  const aiConfigQuery = useQuery({
    queryKey: ['ai-classify-config'],
    queryFn: () => api.getAiClassifyConfig(),
    retry: 1,
  });
  const aiConfigured = Boolean(
    aiConfigQuery.data?.hasApiKey && aiConfigQuery.data?.baseUrl && aiConfigQuery.data?.model,
  );
  const health = healthQuery.data;
  const totalIssues =
    health?.dimensions.reduce((sum, d) => sum + (d.issueCount ?? 0), 0) ?? null;
  const issues = health !== undefined ? staticIssues(health) : [];

  return (
    <section data-testid="onboarding-doctor">
      <h2 className="text-24 font-bold tracking-tight">收纳完成，先做一次体检</h2>
      <p className="mt-2 max-w-[720px] text-14 leading-relaxed text-muted-foreground">
        静态检查已经跑完，不需要任何配置；AI 深度诊断需要接你自己的模型。
      </p>

      <div className="mt-6 grid max-w-[860px] gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-success/20 bg-success-soft px-2 py-0.5 text-12 font-semibold text-success">
            <Check className="h-3 w-3" strokeWidth={3} />
            已完成
          </span>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Stethoscope className="h-4 w-4" />
            </span>
            <h3 className="text-16 font-semibold">静态检查</h3>
          </div>
          <p className="mt-2 text-12 leading-relaxed text-muted-foreground">
            规则可判定的问题，零 API 调用，本地完成。
          </p>

          {healthQuery.isLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : health === undefined ? (
            <p className="mt-4 rounded-lg border border-dashed px-3.5 py-2.5 text-12 text-muted-foreground">
              健康分暂不可用（不影响后续步骤）
            </p>
          ) : (
            <>
              {issues.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {issues.map((issue) => {
                    const meta = severityMeta(issue.severity);
                    return (
                      <li
                        key={issue.id}
                        className="flex items-start gap-2 text-12 leading-relaxed text-muted-foreground"
                      >
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-bold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="min-w-0">
                          <span className="text-foreground">{issue.title}</span>
                          <span className="text-muted-foreground/80"> · {issue.assetName}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft px-3.5 py-2.5 text-12 text-success">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  未发现需要处理的问题
                </p>
              )}

              <div className="mt-auto flex items-center gap-3.5 border-t border-dashed pt-4 md:pt-5">
                <HealthRing score={health.score} />
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5">
                    <span
                      className="text-[22px] font-extrabold leading-none tracking-tight tabular-nums"
                      data-testid="doctor-issue-count"
                    >
                      {totalIssues}
                    </span>
                    <span className="text-12 text-muted-foreground">项待处理</span>
                  </p>
                  <p className="mt-1 text-12 text-muted-foreground">
                    健康分 {health.score} · {gradeLabel(health)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-primary/25 bg-primary/[0.03] p-5 shadow-sm">
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-12 font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            可选增强
          </span>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <h3 className="text-16 font-semibold">AI 深度诊断</h3>
          </div>
          <p className="mt-2 text-12 leading-relaxed text-muted-foreground">
            检查触发条件、语义清晰度、指令冲突和最佳实践符合度。
          </p>

          {aiConfigured ? (
            <div className="mt-4">
              <SkillsCheckupSection />
            </div>
          ) : (
            <div className="mt-auto pt-4">
              <Button
                size="sm"
                className="h-9 rounded-lg px-3.5 text-13 font-semibold"
                onClick={() => setKeyDialogOpen(true)}
              >
                配置模型并诊断
              </Button>
              <p className="mt-2.5 flex items-start gap-1.5 text-12 leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Key 只存本机 ~/.assetplex/ai-config.json，请求直发你填写的端点</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Button
          className="h-10 rounded-lg px-5 text-14 font-semibold"
          onClick={onNext}
          data-testid="onboarding-doctor-next"
        >
          下一步：分发
        </Button>
        <button
          type="button"
          className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>

      <AiConfigDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        onSaved={() => undefined}
        presets={AI_PRESETS}
      />
    </section>
  );
}
