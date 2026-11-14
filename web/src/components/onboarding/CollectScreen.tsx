/**
 * 收纳屏（s3）：调用既有 execute-import，展示真实计数（add-zero-config-onboarding T13）
 *
 * spec Requirement 4：pending 期间禁用按钮、不伪造进度；
 * 完成后展示 created/skipped/errors 与资产库真实计数；同名冲突跳过有说明。
 * 视觉：左侧进度卡（大数字 + 进度轨 + 四格结果），右侧说明卡（会发生什么）。
 */

import { AlertCircle, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ONB_PRIMARY,
  ONB_SECONDARY,
  ONB_TITLE,
  OnbActions,
  OnbCard,
  OnbHeader,
  OnbScreen,
} from './ScreenFrame';
import type { ImportResult } from '@/types/api';

/** 收纳不会改变的事实：三条都在说明「可控」 */
const GUARANTEES = [
  { title: '原文件保持不动', detail: '只读取工具侧配置，不写入、不删除' },
  { title: '同名内容跳过', detail: '不覆盖资产库里已有的版本' },
  { title: '随时可撤销', detail: '本次写入的条目可逐条回退' },
];

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
    <div className="rounded-md border bg-muted/20 px-3 py-3 text-center">
      <p className={cn('text-20 font-semibold leading-none tabular-nums', tone ?? 'text-foreground')}>
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
  const done = result !== null;
  const failed = error !== null && !done;

  const statusChip = pending ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-12 font-medium text-primary">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      写入中
    </span>
  ) : done ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-12 font-medium text-success">
      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      已完成
    </span>
  ) : failed ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-12 font-medium text-destructive">
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      已中断
    </span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-12 font-medium text-muted-foreground">
      准备就绪
    </span>
  );

  const primary = done ? (
    <Button className={ONB_PRIMARY} onClick={onNext} data-testid="onboarding-collect-next">
      下一步：体检
    </Button>
  ) : (
    <Button
      className={ONB_PRIMARY}
      onClick={failed ? onRetry : onCollect}
      disabled={pending || attempted === 0}
      data-testid="onboarding-collect-confirm"
    >
      {pending ? (
        <>
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          正在写入资产库…
        </>
      ) : failed ? (
        '重试收纳'
      ) : (
        '全部收进资产库'
      )}
    </Button>
  );

  return (
    <OnbScreen testId="onboarding-collect">
      <OnbHeader
        eyebrow="第 3 步 · 收纳"
        title={<h2 className={ONB_TITLE}>收进资产库</h2>}
        description="把散落在各工具里的配置，收成一份可维护的源。"
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.32fr)_minmax(0,0.68fr)]">
        <OnbCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-14 font-semibold">写入进度</h3>
              <p className="mt-1 text-12 text-muted-foreground">从已安装工具读取，写入本机资产库</p>
            </div>
            {statusChip}
          </div>

          {!done ? (
            <>
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-[36px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                    {attempted}
                  </span>
                  <span className="text-13 text-muted-foreground">项待写入</span>
                </p>
                <span className="pb-1 text-12 text-muted-foreground">二进制文件默认跳过</span>
              </div>

              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                role="presentation"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    'h-full rounded-full bg-primary transition-[width] duration-300',
                    pending ? 'w-1/3 animate-pulse bg-primary/60' : 'w-0',
                  )}
                />
              </div>

              <div className="mt-2 flex justify-between text-12 text-muted-foreground tabular-nums">
                <span>
                  {pending ? '正在写入，请保持页面打开' : failed ? '写入中断' : '尚未开始'}
                </span>
                <span>{pending ? '—' : `0 / ${attempted}`}</span>
              </div>

              {failed && (
                <p
                  className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-13 text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>写入失败：{error}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="mt-5 flex justify-between text-12 text-muted-foreground tabular-nums">
                <span className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  已完成
                </span>
                <span>
                  {attempted} / {attempted}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                role="presentation"
                aria-hidden="true"
              >
                <div className="h-full w-full rounded-full bg-primary" />
              </div>

              <p
                className="mt-5 flex items-center gap-2 text-14 font-semibold text-foreground"
                data-testid="collect-done"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
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
            </>
          )}
        </OnbCard>

        <OnbCard muted className="p-5">
          <h3 className="text-14 font-semibold">会发生什么</h3>
          <ul className="mt-3.5 space-y-3.5">
            {GUARANTEES.map((item) => (
              <li key={item.title} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success-soft text-success"
                >
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="text-13 font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-12 leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-3.5 text-12 leading-relaxed text-muted-foreground">
            收纳是只读导入：工具侧配置目录不会被修改。
          </p>
        </OnbCard>
      </div>

      <OnbActions
        primary={primary}
        secondary={
          <button type="button" className={ONB_SECONDARY} onClick={onSkip}>
            跳过，直接进入资产库
          </button>
        }
        hint={
          pending
            ? '写入完成前请不要关闭页面'
            : done
              ? '原文件不动，任何一步都可撤销'
              : undefined
        }
      />
    </OnbScreen>
  );
}
