/**
 * 技能分发影响清单对话框（refactor-skill-catalog T15 / spec R6）
 *
 * 流程：预览（零写入）→ 逐工具影响清单与默认保守勾选 → 冲突需显式勾选覆盖
 * → 确认前说明将写入哪些工具 → 执行并逐条报告，结果页可按工具回滚。
 * 无可用目标 / 工具状态未知 / 预览失败一律禁用确认并说明原因。
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { SkillDistributionResults } from './SkillDistributionResults';
import { SkillDistributionImpactTable, isSelectable } from './SkillDistributionImpactTable';
import type {
  SkillDistributionExecuteResponse,
  SkillDistributionIneligibleReason,
  SkillDistributionPreview,
  SkillDistributionToolImpact,
} from '@/types/api';

const INELIGIBLE_LABEL: Record<SkillDistributionIneligibleReason, string> = {
  'not-in-library': '未收藏，不可分发',
  'missing-file': '文件缺失，不可分发',
  'not-found': '技能已不存在',
};

/** 单次分发上限（spec R7.4 已批口径：最多 100 个） */
export const MAX_DISTRIBUTION_SELECTION = 100;

type View =
  | { kind: 'over-limit'; total: number }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: SkillDistributionPreview }
  | { kind: 'executing'; preview: SkillDistributionPreview }
  | { kind: 'done'; preview: SkillDistributionPreview; result: SkillDistributionExecuteResponse };

/** 默认勾选完全采用接口的 defaultSelected，只对可勾选工具生效 */
function buildSelection(tools: SkillDistributionToolImpact[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const tool of tools) next[tool.tool] = isSelectable(tool) && tool.defaultSelected;
  return next;
}

function selectedTools(
  tools: SkillDistributionToolImpact[],
  selection: Record<string, boolean>,
): SkillDistributionToolImpact[] {
  return tools.filter((tool) => isSelectable(tool) && selection[tool.tool] === true);
}

function blockReason(
  tools: SkillDistributionToolImpact[],
  selection: Record<string, boolean>,
): string | null {
  if (tools.filter(isSelectable).length === 0) {
    return '没有可用的分发目标：本机没有已安装且支持技能类别的工具';
  }
  if (selectedTools(tools, selection).length === 0) return '请至少勾选一个目标工具';
  return null;
}

export interface SkillDistributionDialogProps {
  /** 本次所选技能 id；父组件只在非空时挂载 */
  ids: string[];
  onClose: () => void;
  /** 执行完成或回滚成功后回调（父组件刷新分发状态） */
  onCompleted?: () => void;
}

export function SkillDistributionDialog(props: SkillDistributionDialogProps): JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [execError, setExecError] = useState<string | null>(null);
  /** 关闭后焦点归还给打开前的元素（Radix 在部分环境不回收） */
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(
    () => () => {
      const target = returnFocusRef.current;
      if (target !== null && target.isConnected) target.focus();
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    setExecError(null);
    if (props.ids.length > MAX_DISTRIBUTION_SELECTION) {
      setView({ kind: 'over-limit', total: props.ids.length });
      return () => {
        alive = false;
      };
    }
    setView({ kind: 'loading' });
    api
      .previewSkillDistribution(props.ids)
      .then((preview) => {
        if (!alive) return;
        setSelection(buildSelection(preview.tools));
        setOverwrite({});
        setView({ kind: 'ready', preview });
      })
      .catch((err: unknown) => {
        if (alive) setView({ kind: 'error', message: errorMessage(err) });
      });
    return () => {
      alive = false;
    };
  }, [props.ids, attempt]);

  const preview = 'preview' in view ? view.preview : null;
  const tools = preview?.tools ?? [];
  const chosen = selectedTools(tools, selection);
  const block = preview === null ? null : blockReason(tools, selection);
  const unknownCount = tools.filter((tool) => tool.statusUnknown === true).length;

  const run = (target: SkillDistributionPreview): void => {
    const targets = selectedTools(target.tools, selection).map((tool) => ({
      tool: tool.tool,
      overwriteConflicts: overwrite[tool.tool] === true,
    }));
    setExecError(null);
    setView({ kind: 'executing', preview: target });
    api
      .executeSkillDistribution({ token: target.token, targets })
      .then((result) => {
        setView({ kind: 'done', preview: target, result });
        if (result.distributionIndexRefreshed) props.onCompleted?.();
      })
      .catch((err: unknown) => {
        setExecError(errorMessage(err));
        setView({ kind: 'ready', preview: target });
      });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" />
            分发选中 {props.ids.length} 个技能
          </DialogTitle>
          <DialogDescription>先核对影响清单，确认后才写入；库内技能内容不会改变。</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {view.kind === 'over-limit' && (
            <p className="text-xs text-destructive">
              一次最多 {MAX_DISTRIBUTION_SELECTION} 个，请分批（当前选择 {view.total} 个）；已选集合保留，取消部分后可继续。
            </p>
          )}

          {view.kind === 'loading' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在生成影响清单…
            </p>
          )}

          {view.kind === 'error' && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              无法生成影响清单，暂不能分发：{view.message}
            </p>
          )}

          {preview !== null && (
            <>
              <SkillDistributionImpactTable
                tools={tools}
                selection={selection}
                overwrite={overwrite}
                disabled={view.kind === 'executing'}
                onToggleTool={(tool, checked) => setSelection((prev) => ({ ...prev, [tool]: checked }))}
                onToggleOverwrite={(tool, checked) => setOverwrite((prev) => ({ ...prev, [tool]: checked }))}
              />

              {preview.ineligible.length > 0 && (
                <div className="rounded border bg-muted/30 p-2 text-xs">
                  <p className="mb-1 font-medium">不可分发 {preview.ineligible.length} 项</p>
                  <ul className="space-y-0.5">
                    {preview.ineligible.map((item) => (
                      <li key={item.id} className="flex gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">{INELIGIBLE_LABEL[item.reason]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                清单合计 {preview.totals.files} 个文件（新增 {preview.totals.created} / 覆盖{' '}
                {preview.totals.overwritten} / 冲突 {preview.totals.conflicts}）。
              </p>

              {unknownCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  部分工具状态未知（{unknownCount} 个），本次不会分发到这些工具。
                </p>
              )}

              {chosen.length > 0 && (
                <div className="space-y-1 text-xs">
                  <p>
                    将写入 {chosen.length} 个工具：{chosen.map((tool) => tool.displayName).join('、')}，共{' '}
                    {chosen.reduce((sum, tool) => sum + tool.files.total, 0)} 个文件。
                  </p>
                  <p className="text-muted-foreground">覆盖前会自动备份，可在结果页按工具回滚本次分发。</p>
                  {chosen
                    .filter((tool) => tool.files.conflicts > 0 && overwrite[tool.tool] !== true)
                    .map((tool) => (
                      <p key={tool.tool} className="text-muted-foreground">
                        {tool.displayName} 有 {tool.files.conflicts} 个冲突文件，默认跳过；勾选「覆盖」后才会写入。
                      </p>
                    ))}
                </div>
              )}

              {block !== null && view.kind === 'ready' && <p className="text-xs text-destructive">{block}</p>}
              {execError !== null && <p className="text-xs text-destructive">分发未完成：{execError}</p>}

              {view.kind === 'executing' && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在写入所选工具…
                </p>
              )}

              {view.kind === 'done' && (
                <SkillDistributionResults
                  result={view.result}
                  tools={tools}
                  onAfterRollback={() => props.onCompleted?.()}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            {view.kind === 'done' ? '关闭' : '取消'}
          </Button>
          {view.kind === 'error' && (
            <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>重试预览</Button>
          )}
          {(view.kind === 'ready' || view.kind === 'executing') && preview !== null && (
            <Button
              size="sm"
              disabled={block !== null || view.kind === 'executing'}
              onClick={() => run(view.preview)}
            >
              {view.kind === 'executing' ? '分发中…' : '确认分发'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
