/**
 * 智能体视图共享标签映射与工具排序（AgentsView / AgentDetail 共用）
 */

import type { AgentKind, AgentTool } from '@/types/api';

export const KIND_LABELS: Record<AgentKind, string> = {
  'custom-subagent': '自建子代理',
  expert: 'CodeBuddy 专家',
  'builtin-persona': '内置 Persona',
  'plugin-agent': '插件智能体',
};

/** hub = 保险箱（主本） */
export const TOOL_LABELS: Record<AgentTool, string> = {
  hub: '保险箱',
  trae: 'TRAE',
  codebuddy: 'CodeBuddy',
  claude: 'Claude Code',
  codex: 'Codex',
};

export const ALL_KINDS: AgentKind[] = ['custom-subagent', 'expert', 'builtin-persona', 'plugin-agent'];

/** hub（保险箱）为主本，排序最前 */
export const ALL_TOOLS: AgentTool[] = ['hub', 'trae', 'codebuddy', 'claude', 'codex'];

export function formatTime(iso: string | null): string {
  if (!iso) return '时间未知';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}
