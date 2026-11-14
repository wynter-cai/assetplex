/**
 * 开场屏（s0）+ 盘点屏（s1）（add-zero-config-onboarding T12）
 *
 * 开场改为「主张 + 本机真实环境」双栏：右侧不再是漂浮装饰，而是真实工具清单。
 * 盘点数字全部来自真实扫描；请求未返回前只显示检测状态，不伪造进度。
 */

import { ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ToolBadge } from './onboarding-visual';
import {
  ONB_HERO_TITLE,
  ONB_PRIMARY,
  ONB_SECONDARY,
  ONB_TITLE,
  OnbActions,
  OnbCard,
  OnbHeader,
  OnbScreen,
} from './ScreenFrame';
import type { OnboardingToolSummary, ScanWithInsights } from '@/types/api';

/** 覆盖说明（产品事实，非扫描结果） */
const SUPPORTED_TOOLS = ['TRAE', 'Claude Code', 'Codex', 'WorkBuddy', 'Qoder'];

/** 开场三条价值点：都是向导接下来真会做的事，不写营销话术 */
const HIGHLIGHTS = [
  '识别本机已安装的 AI 工具',
  '汇总重复、不一致与缺失的副本',
  '收成一份源，之后只维护这里',
];

export function LocalBadge(): JSX.Element {
  return (
    <div
      data-testid="onboarding-local-badge"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-success/25 bg-success-soft px-2 py-1 text-12 font-medium text-success"
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      本地运行 · 不上传
    </div>
  );
}

/** 开场右栏：本机真实环境（检测到的工具 + 已支持清单） */
function ToolEnvironment({ tools }: { tools: OnboardingToolSummary[] }): JSX.Element {
  const installed = tools.filter((tool) => tool.installed);

  return (
    <aside className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-13 font-semibold">本机环境</p>
        <span className="shrink-0 text-12 tabular-nums text-muted-foreground">
          {tools.length > 0 ? `${installed.length} / ${tools.length} 个已安装` : '尚未读取'}
        </span>
      </div>

      {tools.length > 0 ? (
        <ul className="mt-3 divide-y divide-border/70">
          {tools.slice(0, 6).map((tool) => (
            <li key={tool.toolId} className="flex items-center gap-3 py-2.5">
              <ToolBadge toolId={tool.toolId} name={tool.displayName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-13 font-medium text-foreground">{tool.displayName}</p>
                <p className="truncate font-mono text-[11px] leading-4 text-muted-foreground/80">
                  {tool.configDir}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-12 font-medium',
                  tool.installed
                    ? 'bg-success-soft text-success'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tool.installed ? '已安装' : '未安装'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-md border border-dashed px-3.5 py-3 text-12 leading-relaxed text-muted-foreground">
          暂未检测到已安装的工具，仍可开始盘点。
        </p>
      )}

      <div className="mt-4 border-t pt-3.5">
        <p className="text-12 text-muted-foreground">已支持</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUPPORTED_TOOLS.map((name) => (
            <span
              key={name}
              className="rounded-md border bg-muted/30 px-2 py-1 text-12 text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </aside>
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
  return (
    <OnbScreen testId="onboarding-welcome">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center">
        <div>
          <p className="inline-flex items-center gap-2 text-12 font-semibold text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
            本地盘点 · 约 60 秒
          </p>

          <h1 className={cn(ONB_HERO_TITLE, 'mt-3')}>
            你的 AI 资产，
            <br />
            在每个工具里各存了一份
          </h1>

          <p className="mt-4 max-w-[520px] text-14 leading-6 text-muted-foreground">
            人设、技能、规则与 MCP 各存一份，接的工具越多，副本越多、越难对齐。
            更麻烦的是，你已经很难判断哪一份才是最新的。
          </p>

          <ul className="mt-6 grid gap-2.5">
            {HIGHLIGHTS.map((text) => (
              <li key={text} className="flex items-center gap-2.5 text-13 text-foreground">
                <span
                  aria-hidden="true"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <ToolEnvironment tools={tools} />
      </div>

      <OnbActions
        primary={
          <Button className={ONB_PRIMARY} onClick={onStart} data-testid="onboarding-start">
            开始盘点
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </Button>
        }
        secondary={
          <button type="button" className={ONB_SECONDARY} onClick={onSkip}>
            跳过，直接进入资产库
          </button>
        }
        hint="不需要注册，全程本地"
      />
    </OnbScreen>
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
    status = (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-12 text-muted-foreground">
        未安装
      </span>
    );
  } else if (scan === null) {
    status = (
      <span className="flex shrink-0 items-center gap-1.5 text-12 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        正在读取
      </span>
    );
  } else if (failed) {
    status = <span className="shrink-0 text-12 font-medium text-warning">读取失败</span>;
  } else {
    status = (
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="text-14 font-semibold tabular-nums text-foreground"
          data-testid={`scan-count-${tool.toolId}`}
        >
          {inventory?.items.length ?? 0}
          <span className="ml-1 text-12 font-normal text-muted-foreground">个资产</span>
        </span>
        <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }

  return (
    <li className="flex items-center gap-3.5 px-4 py-3">
      <ToolBadge toolId={tool.toolId} name={tool.displayName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-13 font-medium leading-snug text-foreground">
          {tool.displayName}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] leading-4 text-muted-foreground/80">
          {tool.configDir}
          {!tool.installed ? ' · 未检测到配置目录' : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">{status}</div>
    </li>
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
  const installedInventories = (scan?.inventories ?? []).filter((t) => t.installed);
  const total = scan === null ? null : installedInventories.reduce((sum, t) => sum + t.items.length, 0);
  const installedCount = tools.filter((t) => t.installed).length;
  const categoryCount = new Set(
    installedInventories.flatMap((t) => t.items.map((item) => item.category)),
  ).size;

  return (
    <OnbScreen testId="onboarding-scan">
      <OnbHeader
        eyebrow="第 1 步 · 盘点"
        title={<h2 className={ONB_TITLE}>正在读取本机工具</h2>}
        description="只读取各工具的配置目录，不改动任何文件。"
      />

      <OnbCard className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-12 font-medium text-muted-foreground">配置目录</p>
          {scan === null ? (
            <span className="flex items-center gap-1.5 text-12 font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              读取中
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-12 font-medium text-success">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              读取完成
            </span>
          )}
        </div>

        {scan === null && error === null && (
          <div aria-hidden="true" className="h-0.5 w-full overflow-hidden bg-primary/10">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
          </div>
        )}

        {tools.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {tools.map((tool) => (
              <ToolScanRow key={tool.toolId} tool={tool} scan={scan} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-12 text-muted-foreground">
            未检测到任何工具适配器
          </p>
        )}
      </OnbCard>

      {error !== null && (
        <p
          className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-13 text-destructive"
          role="alert"
        >
          盘点失败：{error}
        </p>
      )}

      {total !== null && (
        <div
          className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-lg border bg-card px-5 py-4"
          data-testid="scan-total"
          aria-live="polite"
        >
          <p className="flex items-baseline gap-2">
            <span className="text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
              {total}
            </span>
            <span className="text-13 text-muted-foreground">个资产</span>
          </p>
          <p className="pb-0.5 text-12 text-muted-foreground">
            来自 {installedCount} 个已安装工具
            {categoryCount > 0 ? ` · ${categoryCount} 个类别` : ''}
          </p>
        </div>
      )}

      <OnbActions
        primary={
          total !== null ? (
            <Button
              className={ONB_PRIMARY}
              onClick={onNext}
              data-testid="onboarding-scan-next"
            >
              查看盘点结果
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <span className="text-12 text-muted-foreground">读取完成后可继续</span>
          )
        }
        secondary={
          <button type="button" className={ONB_SECONDARY} onClick={onSkip}>
            跳过，直接进入资产库
          </button>
        }
      />
    </OnbScreen>
  );
}
