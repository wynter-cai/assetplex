/**
 * FixFlow 子视图（add-asset-doctor F4，从 FixFlow.tsx 拆出以守 300 行上限）
 *
 * 纯展示组件：select（问题勾选）/ draft（草案编辑）/ confirm（一屏确认）/ result（分发结果）。
 * 状态与 API 调用全部在 FixFlow.tsx 状态机，本文件不持有业务状态。
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { DiagnosisReport, DoctorApplyResponse, FixDraftResponse, SwapToolCandidate } from '@/types/api';

export type FixFlowIssueEntry = { issue: DiagnosisReport['issues'][number]; index: number };

const ACTION_LABEL: Record<'written' | 'skipped' | 'failed', string> = {
  written: '已写入并校验',
  skipped: '已跳过',
  failed: '分发失败',
};

export function SelectView(props: {
  issues: FixFlowIssueEntry[];
  checked: number[];
  onToggle: (index: number) => void;
  onGenerate: () => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">选定待修复问题</p>
      <ul className="space-y-1.5">
        {props.issues.map(({ issue, index }) => (
          <li key={index}>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={props.checked.includes(index)}
                onChange={() => props.onToggle(index)}
              />
              <span>
                <span className="font-medium">{issue.finding}</span>
                <span className="block text-muted-foreground">{issue.suggestion}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button size="sm" className="h-8 text-xs" onClick={props.onGenerate} disabled={props.disabled}>
        生成修复草案
      </Button>
    </div>
  );
}

export function DraftView(props: {
  draft: FixDraftResponse;
  draftText: string;
  onTextChange: (value: string) => void;
  onBackToSelect: () => void;
  onRegenerate: () => void;
  /** 仅在草案视图提供；确认视图下不再显示「应用并分发」按钮 */
  onConfirm?: () => void;
}): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium">修复草案（可编辑后再应用）</p>
        {props.draft.cached && <Badge variant="secondary">来自缓存</Badge>}
        {props.draft.model !== '' && <span className="text-xs text-muted-foreground">{props.draft.model}</span>}
      </div>
      <Textarea
        value={props.draftText}
        onChange={(e) => props.onTextChange(e.target.value)}
        rows={10}
        className="font-mono text-xs"
        aria-label="修复草案"
      />
      {props.draft.changeNotes.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {props.draft.changeNotes.map((noteEntry, idx) => (
            <li key={idx}>{noteEntry.note}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs" onClick={() => props.onBackToSelect()}>
          返回重选
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={props.onRegenerate}>
          重新生成
        </Button>
        {props.onConfirm !== undefined && (
          <Button size="sm" className="h-8 text-xs" onClick={props.onConfirm} disabled={props.draftText === ''}>
            应用并分发
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConfirmView(props: {
  originalPath: string;
  toolCandidates: SwapToolCandidate[];
  toolNames: string[];
  onToggleTool: (name: string) => void;
  onSubmit: () => void;
}): JSX.Element {
  const distribute = props.toolNames.length > 0;
  return (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs text-muted-foreground">
        旧版本将存入备份区（保留最近 3 份），应用后可「撤销本次修复」恢复。
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium mb-1">当前库内版本（只读对照）</p>
          <OriginalPeek path={props.originalPath} />
        </div>
        <div>
          <p className="text-xs font-medium mb-1">分发目标工具（默认全部已安装）</p>
          {props.toolCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">未检测到已安装且支持该类别的工具——将只改库不分发。</p>
          ) : (
            <ul className="space-y-1">
              {props.toolCandidates.map((tool) => (
                <li key={tool.name}>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={props.toolNames.includes(tool.name)}
                      onChange={() => props.onToggleTool(tool.name)}
                    />
                    {tool.displayName}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Button size="sm" className="h-8 text-xs" onClick={props.onSubmit}>
        {distribute ? '确认应用并分发' : '确认应用（只改库）'}
      </Button>
    </div>
  );
}

export function ResultView(props: {
  apply: DoctorApplyResponse;
  toolCandidates: SwapToolCandidate[];
  onUndo: () => void;
  onRollback: (swapId: string) => void;
}): JSX.Element {
  const displayName = (tool: string): string =>
    props.toolCandidates.find((t) => t.name === tool)?.displayName ?? tool;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">已写入资产库（旧版已备份）</p>
      {props.apply.dispatch.length > 0 && (
        <ul className="space-y-1.5">
          {props.apply.dispatch.map((item, idx) => (
            <li key={idx} className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant={item.action === 'written' ? 'success' : item.action === 'failed' ? 'destructive' : 'secondary'}>
                {displayName(item.tool)}
              </Badge>
              <span>{ACTION_LABEL[item.action]}</span>
              {item.reason !== undefined && <span className="text-destructive">{item.reason}</span>}
              {item.action === 'written' && item.swapId !== undefined && (
                <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => props.onRollback(item.swapId ?? '')}>
                  回滚分发
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={props.onUndo}>
        撤销本次修复
      </Button>
    </div>
  );
}

function OriginalPeek({ path }: { path: string }): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .readFile(path)
      .then((file) => {
        if (alive) setContent(file.content);
      })
      .catch(() => {
        if (alive) setContent('（无法读取原始正文）');
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (content === null) return <p className="text-xs text-muted-foreground">读取原始正文中…</p>;
  return (
    <pre className="max-h-40 overflow-auto rounded bg-muted/30 p-2 text-xs whitespace-pre-wrap">{content}</pre>
  );
}
