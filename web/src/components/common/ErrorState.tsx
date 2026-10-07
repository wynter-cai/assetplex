/**
 * 统一的列表/页面加载错误态（fix-ui-trust-gaps T5）
 *
 * spec: feedback-toast.spec.md「列表加载失败展示友好错误态」
 * 刻意不接收原始 error 对象：不向用户暴露异常字符串/堆栈，
 * 技术细节经 toast/日志通道处理，这里只给用户语言与重试出口。
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** 标题，默认"加载失败" */
  title?: string;
  /** 用户语言说明，默认引导检查本地服务 */
  description?: string;
  /** 重试回调；不提供时不渲染重试按钮 */
  onRetry?: () => void;
  /** 重试按钮文案，默认"重试" */
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = '加载失败',
  description = '请检查 AssetPlex 服务是否正在运行，然后重试。',
  onRetry,
  retryLabel = '重试',
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle className="mb-3 h-8 w-8 text-warning" aria-hidden="true" />
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <p className="mb-4 max-w-sm text-xs text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
