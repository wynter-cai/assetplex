/**
 * 连接页的工具名与状态点呈现
 *
 * 左侧列表与右侧详情共用同一份显示名映射与状态点，避免两处叫法不一致。
 */

/** 工具 id → 中文显示名（未收录的用接口/原始 id 兜底） */
export const TOOL_DISPLAY_NAME: Record<string, string> = {
  'trae-cn': 'TRAE 中国版',
  trae: 'TRAE',
  workbuddy: 'WorkBuddy',
  'claude-code': 'Claude Code',
  codex: 'OpenAI Codex',
  qoder: 'Qoder',
};

/** 用户输入（中文显示名或原始 id）→ 工具 id；未收录的中文名原样返回 */
export function toolIdFromDisplay(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed in TOOL_DISPLAY_NAME) return trimmed;
  const hit = Object.entries(TOOL_DISPLAY_NAME).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase());
  return hit ? hit[0] : trimmed;
}

/** 工具 id 列表 → 界面可读文本（顿号分隔中文名） */
export function toolDisplayList(ids: string[]): string {
  return ids.map((id) => TOOL_DISPLAY_NAME[id] ?? id).join('、');
}

/** 状态点：绿=已连接，灰=已安装未启用，浅灰=未安装 */
export function StatusDot({ installed, enabled }: { installed: boolean; enabled?: boolean }): JSX.Element {
  if (!installed) {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />;
  }
  if (enabled === false) {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-400" title="已安装但未启用" />;
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-success" title="已连接" />;
}
