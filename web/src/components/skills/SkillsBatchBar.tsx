/**
 * 技能批量操作条：全选/清空 + AI 分类 + 收藏到我的库 + 批量职能应用
 * refactor-skill-catalog T10：新增「诊断选中 N 个」「分发选中 N 个」入口；
 * 勾选全部未入库时两个入口禁用并提示先收藏（spec R7.2）；有已入库项时
 * 未入库项不在此层剔除——为什么不能诊断/分发由预估与影响清单逐条说明。
 */

import { Bot, Stethoscope, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FUNCTION_LABELS, FUNCTION_ORDER } from './skill-labels';
import type { SkillFunction } from '@/types/api';

interface SkillsBatchBarProps {
  checkedCount: number;
  /** 勾选中已收藏到我的库的数量：为 0 时诊断/分发不可用（R7.2） */
  inLibraryCheckedCount: number;
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
  /** 本次所选诊断（未入库项由预估解释） */
  onDiagnoseChecked: () => void;
  /** 本次所选分发（未入库项由影响清单解释） */
  onDistributeChecked: () => void;
}

export function SkillsBatchBar({
  checkedCount,
  inLibraryCheckedCount,
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
  onDiagnoseChecked,
  onDistributeChecked,
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
      {inLibraryCheckedCount === 0 && (
        <span className="text-xs text-muted-foreground" data-testid="curate-first-hint">
          先收藏到我的库，才能诊断或分发
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs"
        onClick={onDiagnoseChecked}
        disabled={inLibraryCheckedCount === 0}
      >
        <Stethoscope className="h-3.5 w-3.5 mr-1" />
        诊断选中 {checkedCount} 个
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs"
        onClick={onDistributeChecked}
        disabled={inLibraryCheckedCount === 0}
      >
        <Upload className="h-3.5 w-3.5 mr-1" />
        分发选中 {checkedCount} 个
      </Button>
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
