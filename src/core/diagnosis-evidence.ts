/**
 * 证据定位（add-diagnosis-rules T2）
 *
 * 证据 = 库内相对路径 + 行号 + ≤200 字原文片段；片段必须是原文子串（spec Scenario 3.3），
 * 因此这里只做「行切分 + 截断」，绝不改写、拼接或补全原文。
 * 另有轻量文档视图（frontmatter 字段与行号）供静态规则共用，避免各检查各写一套解析。
 */

import type { FindingEvidence } from './types.js';

/** 片段长度上限（spec 定义：≤200 字） */
export const SNIPPET_MAX_LENGTH = 200;

export interface FrontmatterView {
  /** 是否存在以 --- 开头的块 */
  present: boolean;
  /** 是否以 --- 闭合 */
  closed: boolean;
  /** 顶层 key → 去引号后的值 */
  fields: Record<string, string>;
  /** 顶层 key → 1-based 行号 */
  fieldLines: Record<string, number>;
}

export interface DocumentView {
  content: string;
  /** 按行切分（不含换行符），索引 0 对应第 1 行 */
  lines: string[];
  frontmatter: FrontmatterView;
  /** frontmatter 之后的正文 */
  body: string;
  /** 正文首行的 1-based 行号（无正文时为 lines.length） */
  bodyStartLine: number;
}

function stripQuotes(raw: string): string {
  const text = raw.trim();
  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseFrontmatter(lines: string[]): FrontmatterView {
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { present: false, closed: false, fields: {}, fieldLines: {} };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  const limit = end === -1 ? lines.length : end;
  const fields: Record<string, string> = {};
  const fieldLines: Record<string, number> = {};
  for (let i = 1; i < limit; i += 1) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
    if (match !== null) {
      fields[match[1]] = stripQuotes(match[2]);
      fieldLines[match[1]] = i + 1;
    }
  }
  return { present: true, closed: end !== -1, fields, fieldLines };
}

/** 只读文档视图：行、frontmatter 字段与行号、正文起点 */
export function readDocument(content: string): DocumentView {
  const lines = content.split(/\r?\n/);
  // 末尾空行不影响任何行号，去掉后行数更贴近用户感知（避免阈值类规则差一行）
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const frontmatter = parseFrontmatter(lines);
  let bodyStartIndex = 0;
  if (frontmatter.present) {
    const end = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
    bodyStartIndex = end === -1 ? lines.length : end + 1;
  }
  const body = lines.slice(bodyStartIndex).join('\n');
  return { content, lines, frontmatter, body, bodyStartLine: bodyStartIndex + 1 };
}

/** 片段：去首尾空白后截断到 200 字（截断后仍是原文子串） */
export function clipSnippet(text: string): string {
  return text.trim().slice(0, SNIPPET_MAX_LENGTH);
}

/** 构造一条证据；line 为 1-based 行号 */
export function evidenceAt(hubRelativePath: string, lines: string[], line: number): FindingEvidence {
  const raw = lines[line - 1] ?? '';
  return { hubRelativePath, line, snippet: clipSnippet(raw) };
}

/** 在行数组中找第一个匹配行（1-based）；无匹配返回 null。startLine 为 1-based 起始行 */
export function lineOfMatch(lines: string[], pattern: RegExp, startLine = 1): number | null {
  const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  for (let i = Math.max(startLine - 1, 0); i < lines.length; i += 1) {
    if (probe.test(lines[i])) return i + 1;
  }
  return null;
}

/** 正文行数（不含 frontmatter） */
export function bodyLineCount(doc: DocumentView): number {
  if (doc.body === '') return 0;
  return doc.lines.length - doc.bodyStartLine + 1;
}

/** 粗略 token 估算：中文每字 1 token，其余非空白字符每 4 个 1 token */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const other = text.replace(/[\u4e00-\u9fa5]/g, '').replace(/\s/g, '').length;
  return cjk + Math.ceil(other / 4);
}
