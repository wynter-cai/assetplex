/**
 * 开场屏（s0）+ 盘点屏（s1）（add-zero-config-onboarding T12）
 *
 * 视觉以原型为准：左侧 hero + 右侧工具分布示意、工具行增量呈现。
 * 盘点数字全部来自真实扫描；请求未返回前只显示检测状态，不伪造进度。
 */

import { ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToolBadge } from './onboarding-visual';
import type { OnboardingToolSummary, ScanWithInsights } from '@/types/api';

/** 覆盖说明（产品事实，非扫描结果） */
const SUPPORTED_TOOLS = ['TRAE', 'Claude Code', 'Codex', 'WorkBuddy', 'Qoder'];

/** 开场示意图的落位（写死完整类名，避免 Tailwind 漏扫） */
const CHIP_POSITIONS = [
  'left-1 top-1',
  'right-0 top-14',
  'left-9 top-28',
  'right-5 top-40',
  'left-0 top-52',
  'right-10 top-64',
];

export function LocalBadge(): JSX.Element {
  return (
    <div
      data-testid="onboarding-local-badge"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-success/20 bg-success-soft px-2.5 py-1 text-12 font-semibold text-success"
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
  /** 示意图优先用真实检测到的工具，状态未返回时退回适配器清单 */
  const chips =
    tools.length > 0
      ? tools.slice(0, CHIP_POSITIONS.length)
      : SUPPORTED_TOOLS.map((name) => ({ toolId: name, displayName: name }));

  return (
    <section
      data-testid="onboarding-welcome"
      className="relative md:flex md:min-h-[560px] md:flex-col md:justify-center"
    >
      <div className="relative z-10 max-w-[600px] py-2 md:py-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-12 font-semibold text-primary">
          首次使用 · 约 60 秒
        </span>

        <h1 className="mt-5 text-[28px] font-bold leading-[1.25] tracking-[-0.022em] md:text-[34px]">
          你的 AI 资产，
          <br />
          正在<span className="text-primary">每个工具</span>里各存一份
        </h1>

        <p className="mt-4 max-w-[510px] text-14 leading-7 text-muted-foreground">
          人设、技能、规则、MCP——接入的工具越多，重复越多，也越容易不一致。更糟的是，你已经记不清哪一份才是最新的。
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button
            size="lg"
            className="h-11 rounded-lg px-6 text-14 font-semibold"
            onClick={onStart}
            data-testid="onboarding-start"
          >
            开始盘点
          </Button>
          <span className="text-12 text-muted-foreground">不需要注册，全程本地</span>
        </div>

        <div className="mt-5 flex max-w-[480px] items-start gap-2 text-13 leading-relaxed text-muted-foreground">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>盘点结束后，你会看到所有工具里的资产清单，并且以后只需要维护一份。</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
          <button
            type="button"
            className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
            onClick={onSkip}
          >
            跳过，直接进入资产库
          </button>
          <span className="text-12 leading-relaxed text-muted-foreground/80">
            已支持 <b className="font-semibold text-muted-foreground">{SUPPORTED_TOOLS.join(' · ')}</b>
            {installed.length > 0 ? `，本机检测到 ${installed.length} 个` : ''}
          </span>
        </div>
      </div>

      {/* 开场示意图：工具散落在各处的视觉隐喻，纯装饰 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-2 hidden h-[390px] w-[370px] lg:block"
      >
        <div className="absolute inset-x-8 inset-y-14 rounded-full border border-dashed border-border" />
        {chips.map((tool, index) => (
          <div
            key={tool.toolId}
            className={`onb-float absolute flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-12 font-semibold text-muted-foreground shadow-sm ${CHIP_POSITIONS[index]}`}
            style={{ animationDelay: `${index * 0.5}s` }}
          >
            <ToolBadge toolId={tool.toolId} name={tool.displayName} size="sm" />
            {tool.displayName}
          </div>
        ))}
        <div className="absolute bottom-0 left-16 rounded-xl border border-dashed bg-muted/40 px-3 py-2 text-12 font-semibold text-muted-foreground/80">
          + 更多工具
        </div>
      </div>
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
    status = <span className="text-12 text-muted-foreground/80">未安装</span>;
  } else if (scan === null) {
    status = (
      <span className="flex items-center gap-1.5 text-12 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        正在读取
      </span>
    );
  } else if (failed) {
    status = <span className="text-12 font-medium text-warning">读取失败</span>;
  } else {
    status = (
      <span className="flex items-center gap-2">
        <span
          className="text-13 font-bold tabular-nums text-foreground"
          data-testid={`scan-count-${tool.toolId}`}
        >
          {inventory?.items.length ?? 0} 个资产
        </span>
        <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />
      </span>
    );
  }
  return (
    <div
      className={`flex items-center gap-3.5 rounded-xl border bg-card px-4 py-3 ${
        tool.installed ? '' : 'border-dashed bg-muted/20'
      }`}
    >
      <ToolBadge toolId={tool.toolId} name={tool.displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-13 font-semibold leading-snug text-foreground">{tool.displayName}</p>
        <p className="mt-0.5 truncate text-12 text-muted-foreground/80">{tool.configDir}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{status}</div>
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
    <section data-testid="onboarding-scan" className="max-w-[720px]">
      <h2 className="text-24 font-bold tracking-tight">正在盘点本机工具</h2>
      <p className="mt-2 text-14 text-muted-foreground">只读取配置目录，不改动任何文件。</p>

      <div className="mt-6 space-y-2.5">
        {tools.map((tool) => (
          <ToolScanRow key={tool.toolId} tool={tool} scan={scan} />
        ))}
      </div>

      {error !== null && (
        <p
          className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-13 text-destructive"
          role="alert"
        >
          盘点失败：{error}
        </p>
      )}

      {total !== null && (
        <div className="mt-6 flex items-baseline gap-2" data-testid="scan-total">
          <span className="text-[30px] font-extrabold leading-none tracking-tight text-primary tabular-nums">
            {total}
          </span>
          <span className="text-13 text-muted-foreground">个资产已发现</span>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        {total !== null && (
          <Button
            className="h-10 rounded-lg px-5 text-14 font-semibold"
            onClick={onNext}
            data-testid="onboarding-scan-next"
          >
            查看盘点结果
          </Button>
        )}
        <button
          type="button"
          className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
          onClick={onSkip}
        >
          跳过，直接进入资产库
        </button>
      </div>
    </section>
  );
}
