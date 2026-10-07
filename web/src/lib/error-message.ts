/**
 * 从未知捕获值中提取用户可读的错误消息（fix-ui-trust-gaps T8）
 *
 * 替代各处 `err instanceof Error ? err.message : 'xxx失败'` 重复片段。
 * 拿不到消息时返回调用方提供的兜底文案，不向用户暴露 [object Object]。
 */
export function errorMessage(err: unknown, fallback = '操作失败，请稍后重试'): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  if (typeof err === 'string' && err.trim().length > 0) return err;
  return fallback;
}
