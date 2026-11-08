/**
 * 同步引导块（add-asset-governance J4）
 *
 * sync 在 AGENTS.md / CLAUDE.md 中维护一段带固定起止标记的引导语：
 * 开启时原地新增/更新，关闭时移除且不改动文件其他内容。
 *
 * spec: specs/mcp-entry.spec.md Scenario 6
 */

export const GUIDANCE_START = '<!-- assetplex:guidance:start -->';
export const GUIDANCE_END = '<!-- assetplex:guidance:end -->';

const GUIDANCE_BLOCK = [
  GUIDANCE_START,
  '## AssetPlex 引导（由 assetplex sync 维护，勿手改）',
  '',
  '开工前先调用 MCP 工具 `assetplex_identity_get` 获取当前身份与硬约束；',
  '需要更多上下文时调用 `assetplex_assets_list` / `assetplex_asset_get`。',
  GUIDANCE_END,
].join('\n');

/** 去掉已存在的引导块（含块前多余的一个空行），其余内容原样保留 */
function removeBlock(content: string): string {
  const start = content.indexOf(GUIDANCE_START);
  if (start === -1) return content;
  const endIdx = content.indexOf(GUIDANCE_END, start);
  if (endIdx === -1) return content;
  const end = endIdx + GUIDANCE_END.length;
  const before = content.slice(0, start).replace(/\n+$/, '\n');
  const after = content.slice(end).replace(/^\n+/, '');
  const joined = `${before}${after}`;
  return joined.trim() === '' ? '' : joined;
}

/**
 * 开启：无块则追加到末尾；有块则原地替换（保持位置）。
 * 关闭：移除块，正文其余内容不变。
 */
export function upsertGuidanceBlock(content: string, enabled: boolean): string {
  if (!enabled) return removeBlock(content);

  const start = content.indexOf(GUIDANCE_START);
  const endIdx = start === -1 ? -1 : content.indexOf(GUIDANCE_END, start);
  if (start !== -1 && endIdx !== -1) {
    const end = endIdx + GUIDANCE_END.length;
    return `${content.slice(0, start)}${GUIDANCE_BLOCK}${content.slice(end)}`;
  }

  const base = content.replace(/\n+$/, '');
  return base === '' ? `${GUIDANCE_BLOCK}\n` : `${base}\n\n${GUIDANCE_BLOCK}\n`;
}

/** 供测试与 sync 判定块是否存在 */
export function hasGuidanceBlock(content: string): boolean {
  const start = content.indexOf(GUIDANCE_START);
  return start !== -1 && content.indexOf(GUIDANCE_END, start) !== -1;
}
