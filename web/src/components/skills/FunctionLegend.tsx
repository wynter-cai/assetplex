/**
 * 九职能图例（spec skill-function-color「图例可查」）
 *
 * 入口在技能页工具条，点开才展开——不常驻占高度；Esc 关闭并把焦点还给触发按钮。
 * 零新依赖：轻量浮层（绝对定位 + 外部点击关闭），不引入 popover 组件库。
 */

import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { FUNCTION_LABELS, FUNCTION_ORDER } from './skill-labels';
import { FunctionDot } from './FunctionDot';
import { useEscapeKey } from '@/lib/use-escape-key';
import type { SkillFunction } from '@/types/api';

export function FunctionLegend({
  counts,
}: {
  counts?: Partial<Record<SkillFunction, number>>;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(open, () => setOpen(false), { returnFocusRef: buttonRef });

  // 点击面板与按钮之外关闭（不抢焦点，避免打断用户后续操作）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div className="relative ml-auto">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="function-legend"
        className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
      >
        <Palette className="h-3 w-3" aria-hidden="true" />
        图例
      </button>
      {open && (
        <div
          ref={panelRef}
          id="function-legend"
          data-testid="function-legend"
          role="group"
          aria-label="职能色彩图例"
          className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover p-2 shadow-md"
        >
          <ul className="space-y-1">
            {FUNCTION_ORDER.map((fn) => (
              <li key={fn} className="flex items-center gap-1.5 text-xs">
                <FunctionDot fn={fn} />
                <span className="flex-1 truncate text-popover-foreground">{FUNCTION_LABELS[fn]}</span>
                <span className="text-muted-foreground">{counts?.[fn] ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
