/**
 * 完成屏（s6）：全部真实数字（add-zero-config-onboarding T16）
 *
 * spec 7.3：入库数/分发结果/静态问题数来自接口；未分发时不得显示「所有工具已同步」。
 */

import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="rounded-xl border bg-card px-4 py-3.5" data-testid={testId}>
      <p className={`text-[22px] font-bold leading-none tracking-tight tabular-nums ${tone ?? 'text-foreground'}`}>
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
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-12 text-muted-foreground">{label}</span>
      <b className={`text-12 font-bold ${tone}`}>{value}</b>
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
    <section data-testid="onboarding-done" className="max-w-[720px] py-2 md:py-6">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-success/20 bg-success-soft">
        <Check className="h-7 w-7 text-success" strokeWidth={3} />
      </div>
      <h1 className="mt-5 text-[26px] font-bold leading-[1.25] tracking-[-0.022em] md:text-[30px]">
        现在，所有工具
        <br />
        都认识同一个你
      </h1>
      <p className="mt-3 text-14 leading-relaxed text-muted-foreground">
        一份源，多处消费。以后改人设只需改一次。
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryStat value={String(assetCount)} label="个资产在资产库" />
        <SummaryStat
          value={
            run === null
              ? '未执行'
              : `${succeededTools ?? 0}/${run.results.length}`
          }
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 px-4 py-3.5">
          <p className="text-12 font-semibold tracking-wide text-muted-foreground/80">过去</p>
          <div className="mt-2">
            <CompareRow label="配置副本" value="多份" tone="text-destructive" />
            <CompareRow label="维护方式" value="逐处重复维护" tone="text-destructive" />
            <CompareRow label="换工具成本" value="重写一遍" tone="text-destructive" />
          </div>
        </div>
        <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3.5">
          <p className="text-12 font-semibold tracking-wide text-primary/80">现在</p>
          <div className="mt-2">
            <CompareRow label="配置副本" value="1 份源" tone="text-success" />
            <CompareRow label="维护方式" value="统一维护" tone="text-success" />
            <CompareRow label="换工具成本" value="一条命令" tone="text-success" />
          </div>
        </div>
      </div>

      <div className="mt-6 flex w-fit max-w-full items-center gap-3 rounded-lg bg-foreground px-4 py-2.5">
        <code className="truncate font-mono text-12 text-background">npx assetplex</code>
        <button
          type="button"
          className="shrink-0 rounded-md bg-background/15 px-2.5 py-1 text-12 font-semibold text-background transition-colors hover:bg-background/25"
          onClick={copyCmd}
        >
          {copied ? '已复制' : '复制命令'}
        </button>
      </div>

      <div className="mt-6">
        <Button
          size="lg"
          className="h-11 rounded-lg px-7 text-14 font-semibold"
          onClick={onEnter}
          data-testid="done-enter-vault"
        >
          进入资产库
        </Button>
      </div>

      {issueCount !== null && issueCount > 0 && (
        <div className="mt-6 flex items-start gap-3 border-t pt-4">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-12 font-semibold text-warning">
            <AlertTriangle className="h-3 w-3" />
            {issueCount} 项待处理
          </span>
          <span className="text-12 leading-relaxed text-muted-foreground">
            静态体检发现的问题已在资产库里排好队，进入后可逐条整改。
          </span>
        </div>
      )}
    </section>
  );
}
