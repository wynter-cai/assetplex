/**
 * GitHub 路由错误 → HTTP 响应映射（add-github-skill-source K1）
 *
 * 集中错误码约定（api-contract.ts）：400 非法源串/空 items/目标名非法/未配置 AI，
 * 404 仓库不可公开访问，422 GitHub 限额（附 retryAfterMinutes），500 网络层失败。
 * 任何映射都不产生磁盘写入，限额/网络信息如实透传不粉饰。
 */

import { GithubNotFoundError, GithubRateLimitError, GithubNetworkError } from '../../core/github-source.js';
import { GithubRefError } from '../../core/github-ref.js';
import { AiConfigIncompleteError } from '../../core/skill-ai-classification.js';

export interface GithubErrorResponse {
  status: 400 | 404 | 422 | 500;
  body: Record<string, unknown>;
}

export function toGithubErrorResponse(err: unknown): GithubErrorResponse {
  if (err instanceof GithubRefError) return { status: 400, body: { error: err.message } };
  if (err instanceof GithubNotFoundError) return { status: 404, body: { error: err.message } };
  if (err instanceof GithubRateLimitError) {
    return { status: 422, body: { error: err.message, retryAfterMinutes: err.retryAfterMinutes } };
  }
  if (err instanceof GithubNetworkError) return { status: 500, body: { error: err.message } };
  if (err instanceof AiConfigIncompleteError) return { status: 400, body: { error: err.message } };
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status; // AssetWriteError 携带 400/404
    if (status === 400 || status === 404) return { status, body: { error: err.message } };
    return { status: 500, body: { error: err.message } };
  }
  return { status: 500, body: { error: String(err) } };
}
