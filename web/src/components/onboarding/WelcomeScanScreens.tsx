/**
 * 开场屏（s0）+ 盘点屏（s1）（add-zero-config-onboarding T12）
 *
 * 视觉以原型为准：hero 文案、「全程本地 · 不上传」徽标、工具行增量呈现。
 * 盘点数字全部来自真实扫描；请求未返回前只显示检测状态，不伪造进度。
 */

import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OnboardingToolSummary, ScanWithInsights } from '@/types/api';

/** 覆盖说明（产品事实，非扫描结果） */
const SUPPORTED_TOOLS = ['TRAE', 'Claude Code', 'Codex', 'WorkBuddy', 'Qoder'];

export function LocalBadge(): JSX.Element {
  return (
    <div
      data-testid="onboarding-local-badge"
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      全程本地 · 不上传
    </div>
  );
}

export function WelcomeScreen({
  tools,
  onStart,
  onSkip,
}: {
  tools: OnboardingToolSummary[];
  onStart: () => void;
  onSkip: () => void;
}): JSX.Element {
  const installed = tools.filter((t) => t.installed);
  return (
    <section data-testid="onboarding-welcome" className="mx-auto max-w-2xl text-center">
      <p className="text-xs text-primary font-medium">首次使用 · 约 60 秒</p>
      <h1 className="mt-3 text-3xl font-semibold leading-snug">
        你的 AI 资产，
        <br />
        正在<span className="text-primary">每个工具</span>里各存一份
      </h1>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
        人设、技能、规则、MCP——接入的工具越多，重复越多，也越容易不一致。更糟的是，你已经记不清哪一份才是最新的。
      </p>
      <div className="mt-6 flex items-center justify-center gap-4">
        <Button size="lg" onClick={onStart} data-testid="onboarding-start">
          开始盘点
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">不需要注册，全程本地</p>
      <div className="mt-8">
        <LocalBadge />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        已支持 <b>{SUPPORTED_TOOLS.join(' · ')}</b>
        {installed.length > 0 ? `，本机检测到 ${installed.length} 个` : ''}，适配器持续增加
      </p>
    </section>
  );
}

/** 单工具盘点行：扫描未返回时显示检测状态；返回后显示真实数量 */
function ToolScanRow({
  tool,
  scan,
}: {
  tool: OnboardingToolSummary;
  scan: ScanWithInsights | null;
}): JSX.Element {
  const inventory = scan?.inventories.find((t) => t.toolName === tool.toolId);
  const failed = scan !== null && tool.installed && inventory === undefined;
  let status: JSX.Element;
  if (!tool.installed) {
    status = <span className="text-xs text-muted-foreground">未安装</span>;
  } else if (scan === null) {
    status = (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        正在读取
      </span>
    );
  } else if (failed) {
    status = <span className="text-xs text-warning">读取失败</span>;
  } else {
    status = (
      <span className="text-sm font-medium" data-testid={`scan-count-${tool.toolId}`}>
        {inventory?.items.length ?? 0} 个资产
      </span>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{tool.displayName}</p>
        <p className="text-xs text-muted-foreground truncate">{tool.configDir}</p>
      </div>
      <div className="flex items-center gap-3">{status}</div>
    </div>
  );
}

export function ScanScreen({
  tools,
  scan,
  error,
  onNext,
  onSkip,
}: {
  tools: OnboardingToolSummary[];
  scan: ScanWithInsights | null;
  error: string | null;
  /** 盘点返回后才可用：显式进入结果屏，不做自动跳转 */
  onNext: () => void;
  onSkip: () => void;
}): JSX.Element {
  const total = scan?.inventories.reduce((sum, t) => sum + t.items.length, 0) ?? null;
  return (
    <section data-testid="onboarding-scan" className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">正在盘点本机工具</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">只读取配置目录，不改动任何文件。</p>

      <div className="mt-5 space-y-2">
        {tools.map((tool) => (
          <ToolScanRow key={tool.toolId} tool={tool} scan={scan} />
        ))}
      </div>

      {error !== null && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          盘点失败：{error}
        </p>
      )}

      {total !== null && (
        <div className="mt-6 text-center" data-testid="scan-total">
          <p className="text-3xl font-semibold text-primary">{total}</p>
          <p className="text-xs text-muted-foreground">个资产已发现</p>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        {total !== null && (
          <Button onClick={onNext} data-testid="onboarding-scan-next">
            查看盘点结果
          </Button>
        )}
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>
    </section>
  );
}
