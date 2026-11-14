/**
 * 首跑向导的视觉映射（工具徽标 / 严重度标签）
 *
 * 颜色全部取自 index.css 的设计令牌：fn-* 只用作图形底色，不承载文字语义；
 * 类名写成完整字面量，避免 Tailwind JIT 漏扫动态拼接。
 */

import type { DiagnosisSeverity } from '@/types/api';

const TOOL_ACCENT_RULES: ReadonlyArray<{ match: RegExp; className: string }> = [
  { match: /trae/, className: 'bg-primary' },
  { match: /claude/, className: 'bg-fn-writing' },
  { match: /codex/, className: 'bg-foreground' },
  { match: /cursor/, className: 'bg-fn-data' },
  { match: /workbuddy/, className: 'bg-fn-browser' },
  { match: /windsurf|codeium/, className: 'bg-fn-ai' },
  { match: /qoder/, className: 'bg-fn-other' },
];

const TOOL_INITIALS: Record<string, string> = {
  'trae-cn': 'TR',
  trae: 'TR',
  'claude-code': 'CC',
  claude: 'CC',
  codex: 'CX',
  cursor: 'CU',
  workbuddy: 'WB',
  windsurf: 'WS',
  qoder: 'QD',
};

/** 工具 id → 徽标底色（未收录的工具落到中性色，不静默留白） */
export function toolAccentClass(toolId: string): string {
  const key = toolId.toLowerCase();
  const hit = TOOL_ACCENT_RULES.find((rule) => rule.match.test(key));
  return hit === undefined ? 'bg-fn-other' : hit.className;
}

/** 工具 id → 两字缩写；未知工具从显示名里取字母，保证徽标里始终有字 */
export function toolInitials(toolId: string, displayName: string): string {
  const known = TOOL_INITIALS[toolId.toLowerCase()];
  if (known !== undefined) return known;
  const latin = displayName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (latin.length >= 2) return latin.slice(0, 2);
  return displayName.trim().slice(0, 2);
}

const SEVERITY_META: Record<
  DiagnosisSeverity,
  { label: string; className: string; dotClassName: string }
> = {
  high: {
    label: '高',
    className: 'bg-destructive/10 text-destructive',
    dotClassName: 'bg-destructive',
  },
  medium: {
    label: '中',
    className: 'bg-warning-soft text-warning',
    dotClassName: 'bg-warning',
  },
  low: {
    label: '低',
    className: 'bg-muted text-muted-foreground',
    dotClassName: 'bg-muted-foreground/50',
  },
};

export function severityMeta(severity: DiagnosisSeverity): {
  label: string;
  className: string;
  dotClassName: string;
} {
  return SEVERITY_META[severity];
}

/** 工具徽标：纯装饰（文字由旁边的工具名承载），默认 32px 底座 */
export function ToolBadge({
  toolId,
  name,
  size = 'md',
}: {
  toolId: string;
  name: string;
  size?: 'sm' | 'md';
}): JSX.Element {
  const dimension =
    size === 'sm' ? 'h-5 w-5 rounded-md text-[9px]' : 'h-8 w-8 rounded-lg text-[11px]';
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-bold uppercase text-primary-foreground ${dimension} ${toolAccentClass(toolId)}`}
    >
      {toolInitials(toolId, name)}
    </span>
  );
}
