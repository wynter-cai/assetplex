/**
 * 完成屏（s6）：全部真实数字（add-zero-config-onboarding T16）
 *
 * spec 7.3：资产数/分发结果/静态问题数来自接口；未分发时不得显示「所有工具已同步」。
 * 视觉：完成态摘要卡 + 过去/现在对照 + 命令块，收束整个向导。
 */

import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ONB_HERO_TITLE, OnbActions, OnbCard, OnbScreen } from './ScreenFrame';
import type { ImportResult, SyncRunResponse } from '@/types/api';

/** 摘要卡：一眼看到本次向导留下的真实结果 */
function SummaryStat({
  value,
  label,
  tone,
  testId,
}: {
  value: string;
  label: string;
  tone?: string;
  testId?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-card px-4 py-4" data-testid={testId}>
      <p
        className={cn(
          'text-24 font-semibold leading-none tracking-tight tabular-nums',
          tone ?? 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-12 leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

/** 过去 / 现在对比行（只做定性描述，不编造计数） */
function CompareRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-12 text-muted-foreground">{label}</span>
      <b className={cn('shrink-0 text-12 font-semibold', tone)}>{value}</b>
    </div>
  );
}

export function DoneScreen({
  collect,
  run,
  issueCount,
  assetCount,
  onEnter,
}: {
  collect: ImportResult | null;
  run: SyncRunResponse | null;
  /** 静态体检待处理问题数（未体检时 null） */
  issueCount: number | null;
  /** 资产库真实计数 */
  assetCount: number;
  onEnter: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const succeededTools = run?.results.filter((r) => r.success).length ?? null;
  const failedTools = run?.results.filter((r) => !r.success).length ?? 0;

  const copyCmd = (): void => {
    const done = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText('npx assetplex').then(done).catch(done);
    } else {
      done();
    }
  };

  return (
    <OnbScreen testId="onboarding-done" className="mx-auto w-full max-w-[820px]">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-lg border border-success/20 bg-success-soft"
        >
          <Check className="h-4 w-4 text-success" strokeWidth={3} />
        </span>
        <span className="text-12 font-semibold text-muted-foreground">设置完成</span>
      </div>

      <h1 className={cn(ONB_HERO_TITLE, 'mt-4')}>
        所有工具，
        <br className="hidden sm:block" />
        现在认识同一个你
      </h1>
      <p className="mt-3 text-14 leading-6 text-muted-foreground">
        一份源，多处消费。以后改人设只需改一次。
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryStat value={String(assetCount)} label="个资产在资产库" />
        <SummaryStat
          value={run === null ? '未执行' : `${succeededTools ?? 0}/${run.results.length}`}
          label={run === null ? '分发未执行，可稍后在同步中心执行' : '个工具分发成功'}
          tone={
            run === null
              ? 'text-muted-foreground'
              : failedTools > 0
                ? 'text-warning'
                : 'text-success'
          }
          testId="done-distribute"
        />
        <SummaryStat
          value={String(issueCount ?? collect?.errors ?? 0)}
          label="项待处理（静态体检）"
          tone={(issueCount ?? 0) > 0 ? 'text-warning' : 'text-foreground'}
        />
      </div>

      <OnbCard className="mt-4 overflow-hidden">
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-12 font-semibold text-muted-foreground">过去</p>
            <div className="mt-2">
              <CompareRow label="配置副本" value="多份" tone="text-destructive" />
              <CompareRow label="维护方式" value="逐处重复维护" tone="text-destructive" />
              <CompareRow label="换工具成本" value="重写一遍" tone="text-destructive" />
            </div>
          </div>
          <div className="p-5">
            <p className="text-12 font-semibold text-primary">现在</p>
            <div className="mt-2">
              <CompareRow label="配置副本" value="1 份源" tone="text-success" />
              <CompareRow label="维护方式" value="统一维护" tone="text-success" />
              <CompareRow label="换工具成本" value="一条命令" tone="text-success" />
            </div>
          </div>
        </div>
      </OnbCard>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex w-fit max-w-full items-center gap-3 rounded-lg bg-foreground px-4 py-2.5">
          <code className="truncate font-mono text-12 text-background">npx assetplex</code>
          <button
            type="button"
            className="shrink-0 rounded-md bg-background/15 px-2.5 py-1 text-12 font-semibold text-background transition-colors hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
            onClick={copyCmd}
          >
            {copied ? '已复制' : '复制命令'}
          </button>
        </div>
        <span className="text-12 text-muted-foreground">之后也可在「连接」页继续分发</span>
      </div>

      {issueCount !== null && issueCount > 0 && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-12 leading-relaxed text-warning">
            <b className="font-semibold">{issueCount} 项待处理</b>
            <span> · 静态体检发现的问题已在资产库里排好队，进入后可逐条整改。</span>
          </p>
        </div>
      )}

      <OnbActions
        primary={
          <Button
            size="lg"
            className="h-11 w-full rounded-lg px-7 text-14 font-semibold sm:w-auto"
            onClick={onEnter}
            data-testid="done-enter-vault"
          >
            进入资产库
          </Button>
        }
        hint="完成状态已记录，之后不再自动弹出向导"
      />
    </OnbScreen>
  );
}
