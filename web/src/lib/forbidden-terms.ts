/**
 * 用户可见文案禁用词单一来源（product-surface-hygiene / proposal D7 词表）
 *
 * 例外：后端字段值、API 路径、代码标识、注释不受约束——本模块只服务「界面展示层」的
 * 术语守卫。守卫测试扫描源码时剥离行首注释、豁免测试文件与本清单文件。
 */

/** 直接按子串判禁的词；「分发」同时覆盖「分发同步」「未分发」 */
export const FORBIDDEN_TERMS: ReadonlyArray<string> = [
  '保险箱',
  '沉淀',
  '分发',
  '投放',
  '入库',
];

/** CJK 基本区 + 扩展 A；本 Node/vitest target 不支持 \p{Han}，用码位区间代替 */
const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * 「Hub」仅当它被当作「库」的同义表达（与中文同句出现）时禁用；
 * 纯代码标识（hubTargetPath / HubProvider / myHub）前后有字母，不受限。
 */
export function isHubMisuse(line: string): boolean {
  if (!CJK.test(line)) return false;
  return /(?<![A-Za-z])Hub(?![A-Za-z])/.test(line);
}

/** 剥离行首注释（`//`、块注释起始 `/*`、JSDoc 续行 `*`、JSX 单行注释 `{/* … *\/}`）；命中即视为非用户可见文案 */
export function stripLeadingComment(line: string): string {
  const trimmed = line.trimStart();
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*') ||
    trimmed.startsWith('*')
  ) {
    return '';
  }
  return line;
}

export interface TermHit {
  /** 1 起始行号 */
  line: number;
  term: string;
  /** 命中行去空白后的内容 */
  text: string;
}

/** 扫描单份源码文本，返回剥离注释后仍出现在用户可见文案里的禁用词命中 */
export function findForbiddenInSource(text: string): TermHit[] {
  const hits: TermHit[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = stripLeadingComment(raw);
    if (line === '') return;
    for (const term of FORBIDDEN_TERMS) {
      if (line.includes(term)) hits.push({ line: index + 1, term, text: line.trim() });
    }
    if (isHubMisuse(line)) hits.push({ line: index + 1, term: 'Hub', text: line.trim() });
  });
  return hits;
}
