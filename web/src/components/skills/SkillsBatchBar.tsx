/**
 * 技能批量操作条：全选/清空 + AI 分类 + 收藏到我的库 + 批量职能应用
 */

import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FUNCTION_LABELS, FUNCTION_ORDER } from './skill-labels';
import type { SkillFunction } from '@/types/api';

interface SkillsBatchBarProps {
  checkedCount: number;
  /** 勾选中存在未入库技能时显示收藏入口 */
  showCurate: boolean;
  aiRunning: boolean;
  applying: boolean;
  curating: boolean;
  batchFunction: SkillFunction;
  onCheckAll: () => void;
  onClearChecked: () => void;
  onClassifyChecked: () => void;
  onCurate: () => void;
  onBatchFunctionChange: (f: SkillFunction) => void;
  onApply: () => void;
}

export function SkillsBatchBar({
  checkedCount,
  showCurate,
  aiRunning,
  applying,
  curating,
  batchFunction,
  onCheckAll,
  onClearChecked,
  onClassifyChecked,
  onCurate,
  onBatchFunctionChange,
  onApply,
}: SkillsBatchBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
      <span className="text-xs font-medium">已选 {checkedCount} 个技能</span>
      <button
        type="button"
        onClick={onCheckAll}
        className="text-xs text-muted-foreground underline"
        aria-label="全选当前筛选结果"
      >
        全选
      </button>
      <button
        type="button"
        onClick={onClearChecked}
        className="text-xs text-muted-foreground underline"
        aria-label="清空勾选"
      >
        清空
      </button>
      <div className="flex-1" />
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs"
        onClick={onClassifyChecked}
        disabled={aiRunning}
      >
        <Bot className="h-3.5 w-3.5 mr-1" />
        {aiRunning ? 'AI 分类中…' : 'AI 分类'}
      </Button>
      {showCurate && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={onCurate}
          disabled={curating}
        >
          {curating ? '收藏中…' : '收藏到我的库'}
        </Button>
      )}
      <select
        aria-label="批量设置职能分类"
        value={batchFunction}
        onChange={(e) => onBatchFunctionChange(e.target.value as SkillFunction)}
        className="h-8 rounded-md border bg-background px-2 text-xs cursor-pointer"
      >
        {FUNCTION_ORDER.map((f) => (
          <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>
        ))}
      </select>
      <Button size="sm" className="h-8 px-3 text-xs" onClick={onApply} disabled={applying}>
        {applying ? '应用中…' : '应用'}
      </Button>
    </div>
  );
}
