/**
 * 裁决准则元资产（criterion）纯逻辑
 *
 * 每条准则 = Hub/criteria/<slug>.md：frontmatter 承载 name/description/
 * priority/enabled/appliesTo/source，正文即进 prompt 的准则内容。
 * 解析宽容：无 frontmatter 或字段非法一律回退默认，准则文件永不"解析失败"
 * （用户资产不容静默丢失）；序列化写回后可无损往返解析。
 *
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/criteria-meta-asset.spec.md
 */

import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { listHubFiles, readHubFile } from './hub-files.js';

/** 准则适用的资产类别闭集（'all' 为通配） */
export const CRITERION_APPLIES_TO = [
  'all',
  'identity',
  'skill',
  'rule',
  'mcp',
  'command',
  'agent',
  'memory',
] as const;

export type CriterionAppliesTo = (typeof CRITERION_APPLIES_TO)[number];

/** 准则资产（frontmatter 解析后 + 正文 + 定位） */
export interface CriterionAsset {
  /** 文件名去 .md，全库唯一 */
  slug: string;
  /** 相对 Hub 根，恒为 criteria/<slug>.md */
  relativePath: string;
  name: string;
  description: string;
  /** 越小越优先；非法回退 100 */
  priority: number;
  /** 仅 frontmatter 显式 false 才关闭 */
  enabled: boolean;
  appliesTo: CriterionAppliesTo[];
  source?: string;
  /** frontmatter 之后的正文（进 prompt 的内容） */
  body: string;
}

const DEFAULT_PRIORITY = 100;

/** 剥单侧成对引号 */
function unquote(value: string): string {
  const m = /^"([^"]*)"|'([^']*)'$/.exec(value);
  return m ? (m[1] ?? m[2] ?? value) : value;
}

/** 解析 frontmatter 键值块（每行 key: value，首个冒号切分，值内冒号安全） */
function parseFrontmatterFields(fmText: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of fmText.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = unquote(line.slice(idx + 1).trim());
    if (key) fields.set(key, value);
  }
  return fields;
}

function parsePriority(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PRIORITY;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PRIORITY;
}

function parseAppliesTo(raw: string | undefined): CriterionAppliesTo[] {
  if (!raw) return ['all'];
  const tokens = raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is CriterionAppliesTo =>
      (CRITERION_APPLIES_TO as readonly string[]).includes(t),
    );
  return tokens.length > 0 ? tokens : ['all'];
}

/**
 * 解析准则文件全文。无 frontmatter 时整篇为 body，字段回退默认——永不抛错。
 * @param relativePath 相对 Hub 根路径，如 criteria/progressive.md
 */
export function parseCriterionFile(relativePath: string, content: string): CriterionAsset {
  const slug = basename(relativePath).replace(/\.md$/, '');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);

  let fields = new Map<string, string>();
  let body = content;
  if (fm) {
    fields = parseFrontmatterFields(fm[1]);
    body = content.slice(fm[0].length);
  }

  const source = fields.get('source');
  return {
    slug,
    relativePath,
    name: fields.get('name') || slug,
    description: fields.get('description') ?? '',
    priority: parsePriority(fields.get('priority')),
    enabled: fields.get('enabled') !== 'false',
    appliesTo: parseAppliesTo(fields.get('appliesTo')),
    ...(source !== undefined ? { source } : {}),
    body,
  };
}

/** 序列化为准则文件全文（frontmatter + 正文），供 parseCriterionFile 往返 */
export function serializeCriterionFile(asset: CriterionAsset): string {
  const lines = [
    '---',
    `name: ${asset.name}`,
    `description: ${asset.description}`,
    `priority: ${asset.priority}`,
    `enabled: ${asset.enabled}`,
    `appliesTo: [${asset.appliesTo.join(', ')}]`,
  ];
  if (asset.source) lines.push(`source: ${asset.source}`);
  lines.push('---', asset.body);
  return lines.join('\n');
}

/** 读取库内全部准则：按 priority 升序、同优先级按 slug 字典序（Scenario 5 排序契约） */
export function listCriteria(): CriterionAsset[] {
  return listHubFiles('criteria')
    .filter((f) => !f.isDirectory && f.relativePath.endsWith('.md'))
    .map((f) => {
      const file = readHubFile(f.relativePath);
      return parseCriterionFile(f.relativePath, file?.content ?? '');
    })
    .sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug));
}

/**
 * 准则集哈希：slug+body 规范化后 sha256。
 * 供仲裁/诊断缓存 key 使用——内容或准则集任一变即自然失效（与入参顺序无关）。
 */
export function hashCriteria(criteria: CriterionAsset[]): string {
  const canonical = [...criteria]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((c) => `${c.slug}\u0000${c.body}`)
    .join('\u0001');
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/** 进 prompt 的准则总字符预算（proposal D5） */
export const CRITERIA_PROMPT_BUDGET = 4000;

export interface CriteriaPromptBlock {
  /** 拼好的准则区文本（无可用准则时为空串） */
  block: string;
  /** 实际进 prompt 的准则 slug（按取入顺序） */
  used: string[];
  /** 因预算被舍去的条数（>0 时前端披露，Scenario 5）；停用准则不计入 */
  skipped: number;
}

/**
 * 组装准则 prompt 区块：先按 appliesTo 匹配目标类别（'all' 通配），
 * 再按 priority→slug 升序整条取入直到预算耗尽；单条超预算整条舍去（不截半，
 * 避免断句误导模型）。
 */
export function assembleCriteriaPromptBlock(
  criteria: CriterionAsset[],
  targetCategory: CriterionAppliesTo,
  budget: number = CRITERIA_PROMPT_BUDGET,
): CriteriaPromptBlock {
  const eligible = criteria
    .filter(
      (c) =>
        c.enabled &&
        (c.appliesTo.includes('all') || c.appliesTo.includes(targetCategory)),
    )
    .sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug));

  const parts: string[] = [];
  const used: string[] = [];
  let size = 0;
  for (const c of eligible) {
    const entry = `### ${c.name}\n${c.body}`;
    const need = parts.length === 0 ? entry.length : entry.length + 2;
    if (size + need > budget) break;
    parts.push(entry);
    used.push(c.slug);
    size += need;
  }
  return { block: parts.join('\n\n'), used, skipped: eligible.length - used.length };
}
