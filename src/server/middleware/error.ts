import type { Context, Next } from 'hono';
import { ZodError } from 'zod';

/**
 * 统一错误处理中间件
 * - ZodError → 400 校验失败
 * - 其他错误 → 500 内部错误
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof ZodError) {
      return c.json(
        {
          error: '请求参数校验失败',
          details: err.errors,
        },
        400,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
}
