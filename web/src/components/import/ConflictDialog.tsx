import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Merge, FileDown, Forward, ChevronDown, Eye } from 'lucide-react';
import { DiffView } from './DiffView';
import { ArbitrationPanel, isArbitrableCategory } from './ArbitrationPanel';
import type { ConflictStrategy } from '@/types/api';

interface SourceInfo {
  tool: string;
  sourcePath: string;
  size: number;
}

interface Props {
  hubTargetPath: string;
  sources: SourceInfo[];
  existingSize?: number;
  category: string;
  strategy: ConflictStrategy;
  /** 采纳仲裁草案（strategy==='merge' 且已携带草案）时 true，策略提示区展示标注 */
  hasAdoptedDraft?: boolean;
  /** 是否二进制（refine-skill-cards-wizard T16）：图片没有逐行合并语义，只给覆盖/跳过 */
  binary?: boolean;
  onChange: (s: ConflictStrategy, draft?: string) => void;
}

const TOOL_DISPLAY: Record<string, string> = {
  'trae-cn': 'TRAE',
  'workbuddy': 'WorkBuddy',
  'claude-code': 'Claude Code',
  'codex': 'Codex',
  'qoder': 'Qoder',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface StrategyOption {
  value: ConflictStrategy;
  label: string;
  icon: typeof Merge;
  title: string;
}

const options: StrategyOption[] = [
  {
    value: 'merge',
    label: '智能合并',
    icon: Merge,
    title: '智能合并：保留库内内容，将工具中新增/不同的部分合并进来（身份文件字段级更新，规则/MCP自动去重）',
  },
  {
    value: 'overwrite',
    label: '覆盖',
    icon: FileDown,
    title: '覆盖：用工具中的文件完全替换库内现有内容',
  },
  {
    value: 'skip',
    label: '跳过',
    icon: Forward,
    title: '跳过：保留库内现有内容，不收藏此文件',
  },
];

function getStrategyHint(
  strategy: ConflictStrategy,
  category: string,
  multiSource: boolean,
  binary: boolean,
): string {
  if (binary) {
    return strategy === 'overwrite'
      ? '二进制文件无法逐行合并，将用工具中的文件整体替换'
      : '二进制文件无法逐行合并，保留库内现有文件';
  }
  if (category === 'identity' && strategy === 'merge') {
    return '将按字段合并：同名字段用新值更新，新字段追加，保留独有字段';
  }
  if (multiSource && strategy === 'merge') {
    return '将依次合并所有来源的内容，自动去重，标注来源';
  }
  switch (strategy) {
    case 'merge':
      return '保留库内内容，追加新内容，自动标注来源';
    case 'overwrite':
      return '将完全替换为工具中的文件内容';
    case 'skip':
      return '保留库内现有内容，不做任何更改';
  }
}

export function ConflictDialog({
  hubTargetPath,
  sources,
  existingSize,
  category,
  strategy,
  hasAdoptedDraft,
  binary = false,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeSourceIdx, setActiveSourceIdx] = useState(0);

  // 二进制只给两种策略：没有「智能合并」，也不提供差异视图与 AI 仲裁
  const availableOptions = binary ? options.filter((o) => o.value !== 'merge') : options;
  const selectedOption = availableOptions.find((o) => o.value === strategy) ?? availableOptions[0];
  const multiSource = sources.length > 1;
  const activeSource = sources[activeSourceIdx] ?? sources[0];

  return (
    <div
      data-testid="conflict-card"
      data-binary={binary ? 'true' : 'false'}
      className="border border-warning/30 bg-warning-soft rounded-md overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{hubTargetPath}</span>
            {multiSource && (
              <Badge variant="secondary" className="text-xs h-5 px-1 bg-warning-soft text-warning">
                {sources.length} 个来源
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap gap-y-0.5">
            <span>Hub: <span className="text-foreground/70">{existingSize ? formatSize(existingSize) : 'N/A'}</span></span>
            <span className="text-warning">→</span>
            {sources.length === 1 ? (
              <span>
                {TOOL_DISPLAY[sources[0].tool] ?? sources[0].tool}:{' '}
                <span className="text-foreground/70">{formatSize(sources[0].size)}</span>
              </span>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {sources.map((s, i) => (
                  <span key={`${s.tool}:${s.sourcePath}`} className="inline-flex items-center gap-0.5">
                    {TOOL_DISPLAY[s.tool] ?? s.tool}
                    <span className="text-foreground/70">({formatSize(s.size)})</span>
                    {i < sources.length - 1 && <span className="text-warning/60 mx-0.5">·</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 查看差异按钮（二进制没有可对比的文本行） */}
        {!binary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-7 px-2 text-xs text-warning hover:bg-warning-soft shrink-0"
          >
            {expanded ? (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                收起差异
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 mr-1" />
                查看差异
              </>
            )}
          </Button>
        )}

        {/* 策略选择 */}
        <div className="flex gap-1 shrink-0">
          {availableOptions.map((opt) => {
            const Icon = opt.icon;
            const isActive = strategy === opt.value;
            return (
              <Button
                key={opt.value}
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => onChange(opt.value)}
                className="h-7 text-xs"
                title={opt.title}
              >
                <Icon className="h-3 w-3 mr-1" />
                {opt.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* 当前策略说明 */}
      <div className="px-4 pb-2 -mt-1">
        <div className="text-xs text-warning flex items-center gap-1">
          <span className="font-medium">{selectedOption.label}：</span>
          <span className="text-muted-foreground">{getStrategyHint(strategy, category, multiSource, binary)}</span>
          {strategy === 'merge' && hasAdoptedDraft === true && (
            <span className="text-info">（将以已采纳的仲裁草案为准）</span>
          )}
        </div>
      </div>

      {/* Diff 展开区 */}
      {!binary && expanded && (
        <div className="px-4 pb-3">
          {multiSource && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {sources.map((s, i) => (
                <Button
                  key={`${s.tool}:${s.sourcePath}`}
                  size="sm"
                  variant={i === activeSourceIdx ? 'default' : 'outline'}
                  onClick={() => setActiveSourceIdx(i)}
                  className="h-6 text-xs px-2"
                >
                  {TOOL_DISPLAY[s.tool] ?? s.tool}
                </Button>
              ))}
            </div>
          )}
          {activeSource && (
            <DiffView sourcePath={activeSource.sourcePath} hubTargetPath={hubTargetPath} />
          )}
          {activeSource && isArbitrableCategory(category) && (
            <ArbitrationPanel
              category={category}
              leftPath={activeSource.sourcePath}
              rightPath={hubTargetPath}
              leftLabel={TOOL_DISPLAY[activeSource.tool] ?? activeSource.tool}
              onAdopt={(s, draft) => onChange(s, draft)}
            />
          )}
        </div>
      )}
    </div>
  );
}
