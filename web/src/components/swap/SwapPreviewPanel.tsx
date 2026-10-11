/**
 * 切换预览面板（enable-tool-hot-swap T8）
 *
 * 六类分组概览：支持/跳过标注、冲突徽标、differs 项覆盖开关(默认关)。
 * 执行按钮由父级控制状态，本组件只负责展示与决策回传。
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SwapCategoryGroup, SwapPreview, SwapPreviewItem } from '@/types/api';
import { CONFLICT_LABELS, STRATEGY_LABELS, SWAP_CATEGORY_LABELS } from './swap-labels';

interface SwapPreviewPanelProps {
  preview: SwapPreview;
  /** hubRelativePath → 用户是否勾选覆盖 */
  overwriteMap: Record<string, boolean>;
  onToggleOverwrite: (hubRelativePath: string, checked: boolean) => void;
  onExecute: () => void;
  executing: boolean;
}

/** 单类分组内的条目行 */
function PreviewRow({
  item,
  overwriteMap,
  onToggleOverwrite,
}: {
  item: SwapPreviewItem;
  overwriteMap: Record<string, boolean>;
  onToggleOverwrite: (hubRelativePath: string, checked: boolean) => void;
}): JSX.Element {
  return (
    <li className="flex items-center gap-2 rounded border bg-background px-3 py-2 text-xs">
      <span className="flex-1 truncate font-mono" title={item.hubRelativePath}>
        {item.hubRelativePath}
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="text-muted-foreground" title={item.targetPath}>
          {item.targetPath.split(/[\\/]/).slice(-2).join('/')}
        </span>
      </span>
      <Badge variant="outline">{STRATEGY_LABELS[item.strategy] ?? item.strategy}</Badge>
      {item.conflict === 'differs' ? (
        <label className="flex cursor-pointer items-center gap-1.5 text-amber-600">
          <input
            type="checkbox"
            checked={overwriteMap[item.hubRelativePath] ?? false}
            onChange={(e) => onToggleOverwrite(item.hubRelativePath, e.target.checked)}
            aria-label={`覆盖 ${item.hubRelativePath}`}
          />
          覆盖
        </label>
      ) : (
        <span className={item.conflict === 'exists' ? 'text-muted-foreground' : 'text-emerald-600'}>
          {CONFLICT_LABELS[item.conflict]}
        </span>
      )}
    </li>
  );
}

/** 单个类别分组卡片 */
function GroupCard({
  group,
  overwriteMap,
  onToggleOverwrite,
}: {
  group: SwapCategoryGroup;
  overwriteMap: Record<string, boolean>;
  onToggleOverwrite: (hubRelativePath: string, checked: boolean) => void;
}): JSX.Element {
  return (
    <section className="rounded-lg border bg-card p-3 space-y-2">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{SWAP_CATEGORY_LABELS[group.category]}</h3>
        {!group.support.supported && (
          <Badge variant="secondary">已跳过</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          新增 {group.counts.new} · 待覆盖 {group.counts.willOverwrite} · 一致 {group.counts.unchanged} · 跳过 {group.counts.skipped}
        </span>
      </header>
      {!group.support.supported ? (
        <p className="text-xs text-muted-foreground">{group.support.reason}（库内 {group.counts.skipped} 项）</p>
      ) : group.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">库内暂无此类资产</p>
      ) : (
        <ul className="space-y-1.5">
          {group.items.map((item) => (
            <PreviewRow
              key={item.hubRelativePath}
              item={item}
              overwriteMap={overwriteMap}
              onToggleOverwrite={onToggleOverwrite}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function SwapPreviewPanel({
  preview,
  overwriteMap,
  onToggleOverwrite,
  onExecute,
  executing,
}: SwapPreviewPanelProps): JSX.Element {
  const differsCount = preview.groups
    .flatMap((g) => g.items)
    .filter((i) => i.conflict === 'differs').length;

  return (
    <div className="space-y-3">
      {!preview.toolInstalled && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          目标工具未安装，无法执行切换
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {preview.groups.map((group) => (
          <GroupCard
            key={group.category}
            group={group}
            overwriteMap={overwriteMap}
            onToggleOverwrite={onToggleOverwrite}
          />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onExecute} disabled={executing || !preview.toolInstalled}>
          {executing ? '切换执行中…' : '执行切换'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {differsCount > 0
            ? `有 ${differsCount} 项与目标内容不同，默认不覆盖，请逐项确认`
            : '无需要确认的覆盖项'}
        </span>
      </div>
    </div>
  );
}
