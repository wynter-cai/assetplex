/**
 * LLM 输出 JSON 提取共享工具（add-asset-doctor D1：仲裁/医生同构复用，不各抄一份）
 *
 * 原为 arbitration.ts 私有函数，医生诊断解析同样需要——抽到 core 基座。
 */

/** 从含杂文输出中提取最外层 JSON 对象文本（首个 { 到末个 }，容忍嵌套与前后缀/fenced 块） */
export function extractJsonObjectText(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}
