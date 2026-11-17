/**
 * 静态规则 · 阈值组（add-diagnosis-rules T2）
 *
 * 长度、密度、段落数等可数信号。阈值取调研给出的官方硬线，
 * 阈值类命中置信度降为 medium（spec 定义：静态命中默认 high，阈值类可为 medium）。
 */

import { bodyLineCount, estimateTokens, type DocumentView } from './diagnosis-evidence.js';
import type { CheckHit, StaticCheck } from './diagnosis-static.js';

interface Paragraph {
  startLine: number;
  text: string;
}

/** 按空行切段，保留每段起始行号（1-based） */
function paragraphsOf(doc: DocumentView): Paragraph[] {
  const result: Paragraph[] = [];
  let startIndex = -1;
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length > 0 && startIndex >= 0) {
      result.push({ startLine: startIndex + 1, text: buffer.join('\n') });
    }
    buffer = [];
    startIndex = -1;
  };
  for (let i = doc.bodyStartLine - 1; i < doc.lines.length; i += 1) {
    const line = doc.lines[i];
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (buffer.length === 0) startIndex = i;
    buffer.push(line.trim());
  }
  flush();
  return result;
}

/** 重复段落（≥2 行、≥20 字、出现 2 次以上）的起始行号 */
function duplicateParagraphLines(doc: DocumentView): number[] {
  const seen = new Map<string, Paragraph>();
  const lines = new Set<number>();
  for (const paragraph of paragraphsOf(doc)) {
    if (paragraph.text.length < 20) continue;
    const first = seen.get(paragraph.text);
    if (first === undefined) {
      seen.set(paragraph.text, paragraph);
      continue;
    }
    lines.add(first.startLine);
    lines.add(paragraph.startLine);
  }
  return [...lines].sort((a, b) => a - b);
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 词数估算：中文按字、其余按空白切词 */
function wordCount(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latin = text.replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter((w) => w !== '').length;
  return cjk + latin;
}

const ID_08: StaticCheck = {
  ruleId: 'ID-08',
  confidence: 'medium',
  run(ctx) {
    const lines = bodyLineCount(ctx.doc);
    const tokens = estimateTokens(ctx.doc.body);
    if (lines > 120 || tokens > 1500) {
      return [{ line: lines > 120 ? ctx.doc.bodyStartLine + 120 : null, detail: `人设正文 ${lines} 行 / 约 ${tokens} tokens：超出常驻预算` }];
    }
    const duplicates = duplicateParagraphLines(ctx.doc);
    if (duplicates.length >= 2) {
      return [{ line: duplicates[0], detail: `存在 ${duplicates.length} 处重复段落：并列职责导致自我稀释` }];
    }
    return [];
  },
};

const RU_01: StaticCheck = {
  ruleId: 'RU-01',
  confidence: 'medium',
  run(ctx) {
    const lines = bodyLineCount(ctx.doc);
    const tokens = estimateTokens(ctx.doc.content);
    const bytes = byteLength(ctx.doc.content);
    const overLine = lines > 200;
    if (!overLine && tokens <= 3000 && bytes <= 32 * 1024) return [];
    const reasons: string[] = [];
    if (overLine) reasons.push(`${lines} 行`);
    if (tokens > 3000) reasons.push(`约 ${tokens} tokens`);
    if (bytes > 32 * 1024) reasons.push(`${bytes} 字节`);
    return [{ line: overLine ? ctx.doc.bodyStartLine + 200 : null, detail: `规则文件超出预算（${reasons.join('、')}）` }];
  },
};

const RU_02: StaticCheck = {
  ruleId: 'RU-02',
  confidence: 'medium',
  run(ctx) {
    const hits: CheckHit[] = [];
    const lines = bodyLineCount(ctx.doc);
    if (lines > 200 && !/^##\s/m.test(ctx.doc.body)) {
      hits.push({ line: 1, detail: `正文 ${lines} 行却没有任何二级标题：无法按主题定位` });
    }
    const longParagraph = paragraphsOf(ctx.doc).find((p) => p.text.split('\n').length > 15);
    if (longParagraph !== undefined) {
      hits.push({ line: longParagraph.startLine, detail: '单段超过 15 行：应拆成同类规则的分组清单' });
    }
    return hits;
  },
};

const SK_08: StaticCheck = {
  ruleId: 'SK-08',
  confidence: 'medium',
  run(ctx) {
    const lines = bodyLineCount(ctx.doc);
    const words = wordCount(ctx.doc.body);
    const hasReference = /references\/|参考文件|see also/i.test(ctx.doc.body);
    if ((lines > 500 || words > 3000) && !hasReference) {
      return [{ line: ctx.doc.bodyStartLine, detail: `正文 ${lines} 行 / 约 ${words} 词，且没有拆到 references` }];
    }
    // 需要 m 标志：`^` 必须匹配行首，否则有二级标题的短技能会被误报（baseline 实测）
    if (lines < 50 && !/^\d+\.\s|^##\s|示例|example/im.test(ctx.doc.body)) {
      return [{ line: ctx.doc.bodyStartLine, detail: `正文仅 ${lines} 行，且无流程、无引用、无示例` }];
    }
    return [];
  },
};

const CMD_06: StaticCheck = {
  ruleId: 'CMD-06',
  confidence: 'medium',
  run(ctx) {
    const lines = bodyLineCount(ctx.doc);
    if (lines <= 500) return [];
    if (/references\/|参考文件/.test(ctx.doc.body)) return [];
    return [{ line: ctx.doc.bodyStartLine, detail: `命令正文 ${lines} 行且没有参考文件拆分` }];
  },
};

const MEM_03: StaticCheck = {
  ruleId: 'MEM-03',
  confidence: 'medium',
  run(ctx) {
    const depth = ctx.hubRelativePath.split('/').filter((part) => part !== '').length;
    const lines = bodyLineCount(ctx.doc);
    if (depth > 2 || lines <= 200) return [];
    return [{ line: ctx.doc.bodyStartLine, detail: `根记忆文件 ${lines} 行未拆分：应下沉到路径规则` }];
  },
};

const AGT_02: StaticCheck = {
  ruleId: 'AGT-02',
  confidence: 'medium',
  run(ctx) {
    const desc = ctx.doc.frontmatter.fields['description'];
    if (desc === undefined || desc.trim() === '') return [];
    const sentences = desc.split(/[。.!！?？]/).filter((s) => s.trim() !== '').length;
    if (sentences <= 3) return [];
    return [
      {
        line: ctx.doc.frontmatter.fieldLines['description'] ?? null,
        detail: `description ${sentences} 句：常驻上下文预算被描述吃掉`,
      },
    ];
  },
};

/** 阈值组全部检查（对应规则集里 7 条 static 规则） */
export const THRESHOLD_CHECKS: StaticCheck[] = [ID_08, RU_01, RU_02, SK_08, CMD_06, MEM_03, AGT_02];
