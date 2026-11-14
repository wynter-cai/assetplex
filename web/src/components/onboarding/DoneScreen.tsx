/**
 * 完成屏（s6）：全部真实数字（add-zero-config-onboarding T16）
 *
 * spec 7.3：入库数/分发结果/静态问题数来自接口；未分发时不得显示「所有工具已同步」。
 */

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportResult, SyncRunResponse } from '@/types/api';

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
    <section data-testid="onboarding-done" className="mx-auto max-w-2xl text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
        <Check className="h-8 w-8 text-success" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold leading-snug">
        现在，所有工具
        <br />
        都认识同一个你
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">一份源，多处消费。以后改人设只需改一次。</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border px-4 py-3">
          <p className="text-xl font-semibold">{assetCount}</p>
          <p className="text-xs text-muted-foreground">资产已收藏</p>
        </div>
        <div className="rounded-lg border px-4 py-3" data-testid="done-distribute">
          {run === null ? (
            <p className="text-xl font-semibold text-muted-foreground">未执行</p>
          ) : (
            <p className={`text-xl font-semibold ${failedTools > 0 ? 'text-warning' : 'text-success'}`}>
              {succeededTools}/{run.results.length}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {run === null ? '同步未执行（可稍后在同步中心执行）' : '个工具同步成功'}
          </p>
        </div>
        <div className="rounded-lg border px-4 py-3">
          <p className="text-xl font-semibold">{issueCount ?? collect?.errors ?? 0}</p>
          <p className="text-xs text-muted-foreground">项待处理（静态体检）</p>
        </div>
      </div>

      <div className="mt-6 inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2">
        <code className="text-sm">npx assetplex</code>
        <button
          type="button"
          className="text-xs text-primary underline-offset-4 hover:underline"
          onClick={copyCmd}
        >
          {copied ? '已复制' : '复制命令'}
        </button>
      </div>

      <div className="mt-6">
        <Button size="lg" onClick={onEnter} data-testid="done-enter-vault">
          进入资产库
        </Button>
      </div>
      {issueCount !== null && issueCount > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          静态体检发现的问题已在资产库里排好队，可在首页健康卡下钻逐条整改。
        </p>
      )}
    </section>
  );
}
