/**
 * 文本相似度（重复治理 K1）
 *
 * 零模型调用：ASCII 单词 + 中文二元组 token 集合 Jaccard；名称用编辑距离比率。
 */

export function tokenize(text: string): Set<string> {
  const lower = text.toLowerCase();
  const tokens = new Set<string>();
  for (const match of lower.matchAll(/[a-z0-9]+/g)) tokens.add(match[0]);
  for (const match of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = match[0];
    if (run.length === 1) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function contentSimilarity(a: string, b: string): number {
  return jaccard(tokenize(a), tokenize(b));
}

/** 名称相似度：Levenshtein 距离比率（对中文/英文/编号后缀都稳定） */
export function nameSimilarity(a: string, b: string): number {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === '' || right === '') return 0;
  if (left === right) return 1;
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let last = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const temp = prev[j] ?? 0;
      prev[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + 1,
        last + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      last = temp;
    }
  }
  const distance = prev[right.length] ?? 0;
  return 1 - distance / Math.max(left.length, right.length);
}
