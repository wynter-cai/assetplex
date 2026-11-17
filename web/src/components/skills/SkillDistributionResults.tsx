/**
 * 技能分发结果页（refactor-skill-catalog T15 / spec R6.3-R6.4）
 *
 * 逐「技能 × 工具」显示写入/跳过/失败，汇总在顶部；
 * 每个写入的工具提供回滚按钮，调用既有回滚接口（POST /api/remediations/rollback）。
 */

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import type { SkillDistributionExecuteResponse, SkillDistributionToolImpact } from '@/types/api';

const ACTION_LABEL: Record<'written' | 'skipped' | 'failed', string> = {
  written: '已写入',
  skipped: '已跳过',
  failed: '失败',
};

interface RollbackState {
  status: 'running' | 'done' | 'error';
  message: string;
}

export interface SkillDistributionResultsProps {
  result: SkillDistributionExecuteResponse;
  tools: SkillDistributionToolImpact[];
  /** 回滚成功后刷新分发状态 */
  onAfterRollback: () => void;
}

export function SkillDistributionResults(props: SkillDistributionResultsProps): JSX.Element {
  const [states, setStates] = useState<Record<string, RollbackState>>({});
  const displayName = (tool: string): string =>
    props.tools.find((item) => item.tool === tool)?.displayName ?? tool;

  const rollback = (tool: string, swapId: string): void => {
    setStates((prev) => ({ ...prev, [tool]: { status: 'running', message: '回滚中…' } }));
    api
      .rollbackRemediation(swapId)
      .then((res) => {
        if (res.success) {
          setStates((prev) => ({
            ...prev,
            [tool]: { status: 'done', message: `已恢复 ${res.restored} 个、移除 ${res.removed} 个文件` },
          }));
          props.onAfterRollback();
        } else {
          setStates((prev) => ({
            ...prev,
            [tool]: { status: 'error', message: res.error ?? '回滚失败' },
          }));
        }
      })
      .catch((err: unknown) => {
        setStates((prev) => ({ ...prev, [tool]: { status: 'error', message: errorMessage(err) } }));
      });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        已写入 {props.result.counts.written} · 跳过 {props.result.counts.skipped} · 失败{' '}
        {props.result.counts.failed}
      </p>

      <div className="max-h-56 overflow-auto rounded border divide-y">
        {props.result.results.map((item) => (
          <div
            key={`${item.skillId}-${item.tool}`}
            className="flex flex-wrap items-center gap-x-2 px-2 py-1 text-xs"
          >
            <span>{item.skillName}</span>
            <span className="text-muted-foreground">→ {displayName(item.tool)}</span>
            <span className={item.action === 'failed' ? 'text-destructive' : ''}>
              {ACTION_LABEL[item.action]}
            </span>
            {item.reason !== undefined && (
              <span className="text-muted-foreground">{item.reason}</span>
            )}
          </div>
        ))}
      </div>

      {props.result.rollback.length > 0 && (
        <div className="rounded border bg-muted/30 p-2 text-xs">
          <p className="mb-1 font-medium">回滚本次分发</p>
          <ul className="space-y-1">
            {props.result.rollback.map((entry) => {
              const state = states[entry.tool];
              return (
                <li key={entry.tool} className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={state?.status === 'running'}
                    onClick={() => rollback(entry.tool, entry.swapId)}
                  >
                    {state?.status === 'running' ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    回滚 {displayName(entry.tool)}
                  </Button>
                  {state !== undefined && state.status !== 'running' && (
                    <span className={state.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                      {state.message}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
