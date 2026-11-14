/**
 * 体检屏（s4）：静态检查零模型 + AI 可选增强（add-zero-config-onboarding T14）
 *
 * spec Requirement 5：静态结果来自治理健康分（零 API Key 可完成）；
 * AI 区标「可选增强」，配置弹窗含厂商预设、只填地址与模型；
 * 未配置时绝不发起模型请求。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stethoscope, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiConfigDialog, type AiConfigPreset } from '@/components/skills/AiConfigDialog';
import { SkillsCheckupSection } from '@/components/doctor/SkillsCheckupSection';
import { api } from '@/lib/api';
import type { GovernanceHealth } from '@/types/api';

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
  const totalIssues =
    healthQuery.data?.dimensions.reduce((sum, d) => sum + (d.issueCount ?? 0), 0) ?? null;

  return (
    <section data-testid="onboarding-doctor" className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">收纳完成，先做一次体检</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        静态检查已经跑完，不需要任何配置；AI 深度诊断需要接你自己的模型。
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-success font-medium">✓ 已完成</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            <Stethoscope className="h-4 w-4" />
            静态检查
          </p>
          {healthQuery.isLoading ? (
            <p className="mt-3 text-xs text-muted-foreground">正在检查…</p>
          ) : healthQuery.isError || healthQuery.data === undefined ? (
            <p className="mt-3 text-xs text-muted-foreground">健康分暂不可用（不影响后续步骤）</p>
          ) : (
            <>
              <p className="mt-3 text-xs text-muted-foreground">规则可判定的问题，零 API 调用，本地完成。</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-semibold" data-testid="doctor-issue-count">
                  {totalIssues}
                </span>
                <span className="text-xs text-muted-foreground">项待处理</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  健康分 {healthQuery.data.score} · {gradeLabel(healthQuery.data)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-primary/40 p-4">
          <p className="text-xs text-primary font-medium">可选增强</p>
          <p className="mt-1 text-sm font-medium">AI 深度诊断</p>
          <p className="mt-3 text-xs text-muted-foreground">
            检查触发条件、语义清晰度、指令冲突和最佳实践符合度。
          </p>
          {aiConfigured ? (
            <div className="mt-3">
              <SkillsCheckupSection />
            </div>
          ) : (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => setKeyDialogOpen(true)}>
                配置模型并诊断
              </Button>
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Key 只存本机 ~/.assetplex/ai-config.json，请求直发你填写的端点
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <Button onClick={onNext} data-testid="onboarding-doctor-next">
          下一步：同步
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
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
