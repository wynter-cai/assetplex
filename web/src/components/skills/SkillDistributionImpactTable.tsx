/**
 * 技能分发影响清单表格（refactor-skill-catalog T15 / spec R6.1）
 *
 * 每个工具一行：是否已安装/支持、文件数、冲突数、跳过原因、示例目标路径；
 * 状态未知的工具不可勾选，冲突文件需在该工具被选中后显式勾选覆盖。
 */

import type { SkillDistributionToolImpact } from '@/types/api';

/** 可勾选：已安装、支持技能类别且状态已知 */
export function isSelectable(tool: SkillDistributionToolImpact): boolean {
  return tool.installed && tool.supported && tool.statusUnknown !== true;
}

function rowSkipReason(tool: SkillDistributionToolImpact): string | null {
  if (tool.statusUnknown === true) return '状态暂不可用';
  return tool.skipReason ?? null;
}

export interface SkillDistributionImpactTableProps {
  tools: SkillDistributionToolImpact[];
  selection: Record<string, boolean>;
  overwrite: Record<string, boolean>;
  disabled: boolean;
  onToggleTool: (tool: string, checked: boolean) => void;
  onToggleOverwrite: (tool: string, checked: boolean) => void;
}

export function SkillDistributionImpactTable(props: SkillDistributionImpactTableProps): JSX.Element {
  return (
    <div className="max-h-72 overflow-auto rounded border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted/60">
          <tr>
            <th className="px-2 py-1.5 font-medium">目标工具</th>
            <th className="px-2 py-1.5 font-medium">文件数</th>
            <th className="px-2 py-1.5 font-medium">冲突</th>
            <th className="px-2 py-1.5 font-medium">跳过原因</th>
            <th className="px-2 py-1.5 font-medium">示例目标路径</th>
          </tr>
        </thead>
        <tbody>
          {props.tools.map((tool) => {
            const selectable = isSelectable(tool);
            const checked = selectable && props.selection[tool.tool] === true;
            return (
              <tr key={tool.tool} className={`border-t ${selectable ? '' : 'opacity-60'}`}>
                <td className="px-2 py-1.5">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      aria-label={`分发到 ${tool.displayName}`}
                      checked={checked}
                      disabled={!selectable || props.disabled}
                      onChange={(e) => props.onToggleTool(tool.tool, e.target.checked)}
                    />
                    <span>{tool.displayName}</span>
                  </label>
                  {tool.statusUnknown === true && (
                    <span className="ml-1 text-[11px] text-muted-foreground">状态暂不可用</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  共 {tool.files.total}（新增 {tool.files.created} / 覆盖 {tool.files.overwritten} / 不变{' '}
                  {tool.files.unchanged}）
                </td>
                <td className="px-2 py-1.5">
                  <span>{tool.files.conflicts}</span>
                  {tool.files.conflicts > 0 && checked && (
                    <label className="mt-0.5 flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        aria-label={`覆盖 ${tool.displayName} 的冲突文件`}
                        checked={props.overwrite[tool.tool] === true}
                        disabled={props.disabled}
                        onChange={(e) => props.onToggleOverwrite(tool.tool, e.target.checked)}
                      />
                      覆盖
                    </label>
                  )}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{rowSkipReason(tool) ?? '—'}</td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {tool.sampleTargets.length > 0 ? tool.sampleTargets.join('、') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
