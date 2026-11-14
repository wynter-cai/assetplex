/**
 * 收纳屏（s3）：调用既有 execute-import，展示真实计数（add-zero-config-onboarding T13）
 *
 * spec Requirement 4：pending 期间禁用按钮、不伪造进度；
 * 完成后展示 created/skipped/errors 与资产库真实计数；同名冲突跳过有说明。
 */

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportResult } from '@/types/api';

/** 完成后四个真实计数：新增 / 合并 / 跳过 / 失败 */
function ResultStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border bg-background px-2 py-2.5 text-center">
      <p className={`text-18 font-bold leading-none tabular-nums ${tone ?? 'text-foreground'}`}>
        {value}
      </p>
      <p className="mt-1.5 text-12 text-muted-foreground">{label}</p>
    </div>
  );
}

export function CollectScreen({
  attempted,
  pending,
  error,
  result,
  libraryCount,
  onCollect,
  onRetry,
  onNext,
  onSkip,
}: {
  /** 本次将写入的条目数（来自扫描，已排除二进制默认不选的部分在向导语义里=全部非二进制） */
  attempted: number;
  pending: boolean;
  error: string | null;
  result: ImportResult | null;
  /** 收纳完成后的资产库真实计数 */
  libraryCount: number | null;
  onCollect: () => void;
  onRetry: () => void;
  onNext: () => void;
  onSkip: () => void;
}): JSX.Element {
  return (
    <section data-testid="onboarding-collect" className="max-w-[640px]">
      <h2 className="text-24 font-bold tracking-tight">收进资产库</h2>
      <p className="mt-2 text-14 text-muted-foreground">
        资产库是唯一真相源，工具只是消费端。
      </p>

      <div className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
        <h3 className="text-16 font-semibold">收纳进度</h3>
        <p className="mt-1 text-12 text-muted-foreground">
          从已安装工具读取，写入本机资产库
        </p>

        {result === null ? (
          <>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[30px] font-extrabold leading-none tracking-tight tabular-nums">
                  {attempted}
                </span>
                <span className="text-12 text-muted-foreground">项待写入</span>
              </div>
              <span className="text-12 text-muted-foreground/80">二进制文件默认跳过</span>
            </div>

            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="presentation"
              aria-hidden="true"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  pending ? 'w-full animate-pulse bg-primary/30' : 'w-0 bg-primary'
                }`}
              />
            </div>

            <div className="mt-2 flex justify-between text-12 text-muted-foreground tabular-nums">
              <span>
                {pending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    正在写入资产库…
                  </span>
                ) : error !== null ? (
                  '写入中断'
                ) : (
                  '准备就绪'
                )}
              </span>
              <span>
                {pending ? '—' : `0 / ${attempted}`}
              </span>
            </div>

            {error !== null && (
              <p
                className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-13 text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>写入失败：{error}</span>
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                className="h-10 rounded-lg px-5 text-14 font-semibold"
                onClick={error !== null ? onRetry : onCollect}
                disabled={pending || attempted === 0}
                data-testid="onboarding-collect-confirm"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    正在写入资产库…
                  </>
                ) : error !== null ? (
                  '重试收纳'
                ) : (
                  '全部收进资产库'
                )}
              </Button>
              {pending ? (
                <span className="text-12 text-muted-foreground">写入完成前请不要关闭页面</span>
              ) : (
                <span className="text-12 text-muted-foreground/80">
                  原文件不动，任何一步都可撤销
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex justify-between text-12 text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已完成
              </span>
              <span>
                {attempted} / {attempted}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="presentation"
              aria-hidden="true"
            >
              <div className="h-full w-full rounded-full bg-primary" />
            </div>

            <p
              className="mt-5 flex items-center gap-2 text-14 font-semibold text-foreground"
              data-testid="collect-done"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              已收藏 {result.created} 个资产
              {libraryCount !== null ? `，资产库现有 ${libraryCount} 个` : ''}
            </p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <ResultStat value={result.created} label="新增" tone="text-success" />
              <ResultStat value={result.merged} label="合并" />
              <ResultStat value={result.skipped} label="跳过" tone="text-muted-foreground" />
              <ResultStat
                value={result.errors}
                label="失败"
                tone={result.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}
              />
            </div>

            {result.skipped > 0 && (
              <p className="mt-3 text-12 leading-relaxed text-muted-foreground">
                跳过的条目与库内同名（未覆盖，工具侧原文件未动），可稍后在「收藏到我的库」逐条处理。
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed pt-5">
              <Button
                className="h-10 rounded-lg px-5 text-14 font-semibold"
                onClick={onNext}
                data-testid="onboarding-collect-next"
              >
                下一步：体检
              </Button>
              <button
                type="button"
                className="text-13 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
                onClick={onSkip}
              >
                跳过，直接进入资产库
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
