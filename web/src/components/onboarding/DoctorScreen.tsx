/**
 * 体检屏（s4）：静态检查零模型 + AI 可选增强（add-zero-config-onboarding T14）
 *
 * spec Requirement 5：静态结果来自治理健康分（零 API Key 可完成）；
 * AI 区标「可选增强」，配置弹窗含厂商预设、只填地址与模型；
 * 未配置时绝不发起模型请求。
 * 视觉：健康分环 + 四维条形 + 严重度标签的问题清单。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiConfigDialog, type AiConfigPreset } from '@/components/skills/AiConfigDialog';
import { SkillsCheckupSection } from '@/components/doctor/SkillsCheckupSection';
import { cn } from '@/lib/utils';
import { severityMeta } from './onboarding-visual';
import {
  ONB_PRIMARY,
  ONB_SECONDARY,
  ONB_TITLE,
  OnbActions,
  OnbCard,
  OnbHeader,
  OnbScreen,
} from './ScreenFrame';
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

/** 维度分条：低分才用语义色，不用品牌色掩盖短板 */
function barTone(score: number): string {
  if (score < 60) return 'bg-destructive';
  if (score < 75) return 'bg-warning';
  return 'bg-primary';
}

function applicabilityText(appearance: 'applicable' | 'not-applicable' | 'data-missing'): string {
  if (appearance === 'not-applicable') return '不适用';
  if (appearance === 'data-missing') return '数据缺失';
  return '';
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
      className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, hsl(var(--muted)) 0deg)` }}
    >
      <span className="grid h-[70px] w-[70px] place-items-center rounded-full bg-card text-24 font-semibold leading-none tabular-nums">
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
    <OnbScreen testId="onboarding-doctor">
      <OnbHeader
        eyebrow="第 4 步 · 体检"
        title={<h2 className={ONB_TITLE}>做一次体检</h2>}
        description="静态检查已经跑完，不需要任何配置；AI 深度诊断需要接你自己的模型。"
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <OnbCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
              >
                <Stethoscope className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-14 font-semibold">资产健康</h3>
                <p className="mt-0.5 text-12 text-muted-foreground">静态规则判定 · 零 API 调用</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-12 font-medium text-success">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              已完成
            </span>
          </div>

          {healthQuery.isLoading ? (
            <div className="mt-5 space-y-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : health === undefined ? (
            <p className="mt-5 rounded-md border border-dashed px-3.5 py-3 text-12 text-muted-foreground">
              健康分暂不可用（不影响后续步骤）
            </p>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-5">
                <HealthRing score={health.score} />
                <div className="min-w-0">
                  <p className="text-14 font-semibold text-foreground">{gradeLabel(health)}</p>
                  <p className="mt-1 text-12 text-muted-foreground">
                    共 {health.totalAssets} 项资产 · 健康分 {health.score}
                  </p>
                  <p className="mt-2.5 flex items-baseline gap-1.5">
                    <span
                      className="text-20 font-semibold leading-none tabular-nums text-foreground"
                      data-testid="doctor-issue-count"
                    >
                      {totalIssues}
                    </span>
                    <span className="text-12 text-muted-foreground">项待处理</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 border-t pt-4">
                {health.dimensions.map((dimension) => {
                  const applicable = dimension.applicability === 'applicable';
                  const score = dimension.score ?? 0;
                  return (
                    <div key={dimension.id}>
                      <div className="flex items-center justify-between gap-3 text-12">
                        <span className="truncate text-muted-foreground">{dimension.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {applicable
                            ? `${score} 分${dimension.issueCount > 0 ? ` · ${dimension.issueCount} 个问题` : ''}`
                            : applicabilityText(dimension.applicability)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        {applicable && (
                          <div
                            className={cn('h-full rounded-full', barTone(score))}
                            style={{ width: `${score}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </OnbCard>

        <div className="flex flex-col gap-4">
          <OnbCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-14 font-semibold">待处理问题</h3>
              <span className="shrink-0 text-12 text-muted-foreground">
                {issues.length > 0 ? `展示前 ${issues.length} 项` : '静态检查'}
              </span>
            </div>

            {health === undefined ? (
              <p className="mt-3 rounded-md border border-dashed px-3.5 py-3 text-12 text-muted-foreground">
                问题清单暂不可用
              </p>
            ) : issues.length > 0 ? (
              <ul className="mt-2 divide-y divide-border/70">
                {issues.map((issue) => {
                  const meta = severityMeta(issue.severity);
                  return (
                    <li key={issue.id} className="flex items-start gap-2.5 py-2.5">
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-13 text-foreground">{issue.title}</p>
                        <p className="mt-0.5 truncate text-12 text-muted-foreground">
                          {issue.assetName}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-2 rounded-md bg-success-soft px-3.5 py-2.5 text-12 text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                未发现需要处理的问题
              </p>
            )}
          </OnbCard>

          <OnbCard className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"
                >
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-14 font-semibold">AI 深度诊断</h3>
                  <p className="mt-0.5 text-12 text-muted-foreground">
                    检查触发条件、语义清晰度与指令冲突
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-12 font-medium text-primary">
                可选
              </span>
            </div>

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
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Key 只存本机 ~/.assetplex/ai-config.json，请求直发你填写的端点</span>
                </p>
              </div>
            )}
          </OnbCard>
        </div>
      </div>

      <OnbActions
        primary={
          <Button className={ONB_PRIMARY} onClick={onNext} data-testid="onboarding-doctor-next">
            下一步：分发
          </Button>
        }
        secondary={
          <button type="button" className={ONB_SECONDARY} onClick={onSkip}>
            跳过，直接进入资产库
          </button>
        }
        hint="体检结果可在资产库逐条整改"
      />

      <AiConfigDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        onSaved={() => undefined}
        presets={AI_PRESETS}
      />
    </OnbScreen>
  );
}
