/**
 * 重复治理：资产元数据装配（add-asset-governance K2）
 *
 * 把「类别 + 路径 + 正文 + 修改时间」转成 groupDuplicates 需要的结构化输入。
 * 纯函数：frontmatter 只取顶层 name/description，不做完整 YAML 解析。
 */

import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeContent, type DuplicateAssetInput } from './duplicates.js';
import type { DoctorAssetKind } from './types.js';

export interface DuplicateSourceAsset {
  kind: DoctorAssetKind;
  hubRelativePath: string;
  content: string;
  lastModified: string;
  sourceTool?: string;
}

interface FrontmatterView {
  name?: string;
  description?: string;
}

function parseTopLevelFields(content: string): FrontmatterView {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const fields: FrontmatterView = {};
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') break;
    const match = /^(name|description)\s*:\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    const value = (match[2] ?? '').trim().replace(/^["']|["']$/g, '');
    if (key === 'name') fields.name = value;
    if (key === 'description') fields.description = value;
  }
  return fields;
}

/** 显示名回退：技能取包目录名，其余取文件名去扩展名 */
export function fallbackAssetName(hubRelativePath: string): string {
  const fileName = basename(hubRelativePath);
  if (fileName === 'SKILL.md') {
    const dir = basename(dirname(hubRelativePath));
    if (dir !== '' && dir !== 'skills') return dir;
  }
  return fileName.replace(/\.md$/i, '');
}

export function contentHashOf(content: string): string {
  return createHash('sha256').update(normalizeContent(content)).digest('hex');
}

export function toDuplicateAssetInput(source: DuplicateSourceAsset): DuplicateAssetInput {
  const frontmatter = parseTopLevelFields(source.content);
  return {
    kind: source.kind,
    hubRelativePath: source.hubRelativePath,
    name: frontmatter.name !== undefined && frontmatter.name !== '' ? frontmatter.name : fallbackAssetName(source.hubRelativePath),
    description: frontmatter.description ?? '',
    content: source.content,
    lastModified: source.lastModified,
    ...(source.sourceTool === undefined ? {} : { sourceTool: source.sourceTool }),
  };
}

/** 按请求的类别过滤（缺省全部类别），并映射为分组输入 */
export function buildDuplicateAssets(
  sources: DuplicateSourceAsset[],
  categories?: DoctorAssetKind[],
): DuplicateAssetInput[] {
  const allowed = categories === undefined ? null : new Set(categories);
  return sources
    .filter((source) => allowed === null || allowed.has(source.kind))
    .map(toDuplicateAssetInput);
}
