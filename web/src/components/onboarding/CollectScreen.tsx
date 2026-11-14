/**
 * 收纳屏（s3）：调用既有 execute-import，展示真实计数（add-zero-config-onboarding T13）
 *
 * spec Requirement 4：pending 期间禁用按钮、不伪造进度；
 * 完成后展示 created/skipped/errors 与资产库真实计数；同名冲突跳过有说明。
 */

import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportResult } from '@/types/api';

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
    <section data-testid="onboarding-collect" className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">收进资产库</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">资产库是唯一真相源，工具只是消费端。</p>

      <div className="mt-5 rounded-lg border p-5">
        {result === null ? (
          <>
            <p className="text-sm">
              {error !== null
                ? <span className="text-destructive">写入失败：{error}</span>
                : `将从已盘点条目中写入 ${attempted} 个资产（二进制文件默认跳过，可在导入向导逐条处理）`}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Button
                onClick={error !== null ? onRetry : onCollect}
                disabled={pending || attempted === 0}
                data-testid="onboarding-collect-confirm"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    正在写入资产库…
                  </>
                ) : (
                  error !== null ? '重试收纳' : '全部收进资产库'
                )}
              </Button>
              {pending && (
                <span className="text-xs text-muted-foreground">写入完成前请不要关闭页面</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium" data-testid="collect-done">
              <CheckCircle2 className="h-4 w-4 text-success" />
              已收藏 {result.created} 个资产{libraryCount !== null ? `，资产库现有 ${libraryCount} 个` : ''}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <div className="rounded border px-2 py-2">
                <p className="text-lg font-semibold text-success">{result.created}</p>
                <p className="text-xs text-muted-foreground">新增</p>
              </div>
              <div className="rounded border px-2 py-2">
                <p className="text-lg font-semibold">{result.merged}</p>
                <p className="text-xs text-muted-foreground">合并</p>
              </div>
              <div className="rounded border px-2 py-2">
                <p className="text-lg font-semibold text-muted-foreground">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">跳过</p>
              </div>
              <div className="rounded border px-2 py-2">
                <p className={`text-lg font-semibold ${result.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {result.errors}
                </p>
                <p className="text-xs text-muted-foreground">失败</p>
              </div>
            </div>
            {result.skipped > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                跳过的条目与库内同名（未覆盖，工具侧原文件未动），可稍后在「收藏到我的库」逐条处理。
              </p>
            )}
            <div className="mt-4 flex items-center gap-4">
              <Button onClick={onNext} data-testid="onboarding-collect-next">
                下一步：体检
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
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
