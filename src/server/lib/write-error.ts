/**
 * 写管理错误 → HTTP 响应映射
 *
 * AssetWriteError（status: 400 | 404）映射为对应状态码；
 * 其余错误一律 500，避免内部细节泄漏到客户端契约之外。
 */

export interface WriteErrorResponse {
  status: 400 | 404 | 500;
  message: string;
}

export function toWriteErrorResponse(err: unknown): WriteErrorResponse {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    if (status === 400 || status === 404) {
      return { status, message: err.message };
    }
  }
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
