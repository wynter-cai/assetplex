/**
 * 忽略清单（add-diagnosis-rules T5）
 *
 * 误报控制：用户可忽略单条 finding。忽略只影响展示与计分，不删除规则、不改资产；
 * 记录按 `ruleId + 库内路径 + 内容哈希` 绑定，内容一变即自动失效并重新提示（Scenario 4.2）。
 * 清单只写本机（Node 存储在 ~/.assetplex/diagnosis-ignores.json），永不上传。
 *
 * spec: 设计文档/changes/add-diagnosis-rules/specs/diagnosis-rules.spec.md Requirement 4
 */

import { hashDoctorContent } from './doctor-cache.js';
import type { IgnoredFinding, RuleFinding } from './types.js';

/** 清单存储抽象（Node 实现见 server/lib/node-ai-classify-store.ts） */
export interface DiagnosisIgnoreStore {
  load(): unknown;
  save(items: IgnoredFinding[]): void;
}

/** 内容指纹（与诊断缓存同一套 sha256 口径，避免两套哈希互相不认） */
export function hashIgnoredContent(content: string): string {
  return hashDoctorContent(content);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function ignoreKey(ruleId: string, hubRelativePath: string): string {
  return `${ruleId}\u0000${hubRelativePath}`;
}

/** 容错读取：结构不完整的条目丢弃；同规则同路径只保留最后一条 */
export function sanitizeIgnoredFindings(raw: unknown): IgnoredFinding[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, IgnoredFinding>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (
      !isNonEmptyString(entry['ruleId']) ||
      !isNonEmptyString(entry['hubRelativePath']) ||
      !isNonEmptyString(entry['contentHash']) ||
      !isNonEmptyString(entry['ignoredAt'])
    ) {
      continue;
    }
    map.set(ignoreKey(entry['ruleId'], entry['hubRelativePath']), {
      ruleId: entry['ruleId'],
      hubRelativePath: entry['hubRelativePath'],
      contentHash: entry['contentHash'],
      ignoredAt: entry['ignoredAt'],
    });
  }
  return [...map.values()];
}

/**
 * 把忽略清单落到本轮 findings 上：只有「路径 + 规则 + 当前内容哈希」三方都一致的条目才生效。
 * 返回新数组，不修改入参（报告仍保留被忽略项，供「已忽略 N 条」入口使用）。
 */
export function applyIgnores(
  findings: RuleFinding[],
  context: { hubRelativePath: string; contentHash: string },
  items: IgnoredFinding[],
): RuleFinding[] {
  const activeRuleIds = new Set(
    items
      .filter(
        (item) => item.hubRelativePath === context.hubRelativePath && item.contentHash === context.contentHash,
      )
      .map((item) => item.ruleId),
  );
  if (activeRuleIds.size === 0) return findings;
  return findings.map((finding) =>
    activeRuleIds.has(finding.ruleId) ? { ...finding, ignored: true } : finding,
  );
}

/** 新增 / 覆盖一条忽略（同规则同路径只留一条，时间取最新） */
export function addIgnore(items: IgnoredFinding[], entry: IgnoredFinding): IgnoredFinding[] {
  const next = items.filter(
    (item) => !(item.ruleId === entry.ruleId && item.hubRelativePath === entry.hubRelativePath),
  );
  next.push(entry);
  return next;
}

/** 恢复：清单里没有对应条目时 restored=false（路由据此返回 404） */
export function removeIgnore(
  items: IgnoredFinding[],
  hubRelativePath: string,
  ruleId: string,
): { items: IgnoredFinding[]; restored: boolean } {
  const next = items.filter(
    (item) => !(item.ruleId === ruleId && item.hubRelativePath === hubRelativePath),
  );
  return { items: next, restored: next.length !== items.length };
}

type ReadAsset = (hubRelativePath: string) => string | null;

function currentHash(read: ReadAsset, hubRelativePath: string): string | null {
  const content = read(hubRelativePath);
  return content === null ? null : hashIgnoredContent(content);
}

/** 内容已变更或资产已删除 = 过期（下次诊断会重新提示） */
export function countExpiredIgnores(items: IgnoredFinding[], read: ReadAsset): number {
  return items.filter((item) => {
    const hash = currentHash(read, item.hubRelativePath);
    return hash === null || hash !== item.contentHash;
  }).length;
}

/** 仍然生效的忽略条数（治理概览的「已忽略 N 条」用） */
export function countActiveIgnores(items: IgnoredFinding[], read: ReadAsset): number {
  return items.filter((item) => currentHash(read, item.hubRelativePath) === item.contentHash).length;
}
