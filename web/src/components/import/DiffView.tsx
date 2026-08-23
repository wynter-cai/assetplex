import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

interface Props {
  sourcePath: string;
  hubTargetPath: string;
}

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'modified-old' | 'modified-new';
  leftNum?: number;
  rightNum?: number;
  leftText: string;
  rightText: string;
}

function computeDiff(sourceLines: string[], hubLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < sourceLines.length || j < hubLines.length) {
    const srcLine = i < sourceLines.length ? sourceLines[i] : undefined;
    const hubLine = j < hubLines.length ? hubLines[j] : undefined;

    if (srcLine === undefined) {
      result.push({
        type: 'removed',
        rightNum: j + 1,
        leftText: '',
        rightText: hubLine!,
      });
      j++;
    } else if (hubLine === undefined) {
      result.push({
        type: 'added',
        leftNum: i + 1,
        leftText: srcLine,
        rightText: '',
      });
      i++;
    } else if (srcLine === hubLine) {
      result.push({
        type: 'same',
        leftNum: i + 1,
        rightNum: j + 1,
        leftText: srcLine,
        rightText: hubLine,
      });
      i++;
      j++;
    } else {
      const lookAhead = 3;
      let found = false;
      for (let k = 1; k <= lookAhead && i + k < sourceLines.length; k++) {
        if (sourceLines[i + k] === hubLine) {
          for (let a = 0; a < k; a++) {
            result.push({
              type: 'added',
              leftNum: i + a + 1,
              leftText: sourceLines[i + a],
              rightText: '',
            });
          }
          i += k;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let k = 1; k <= lookAhead && j + k < hubLines.length; k++) {
          if (srcLine === hubLines[j + k]) {
            for (let a = 0; a < k; a++) {
              result.push({
                type: 'removed',
                rightNum: j + a + 1,
                leftText: '',
                rightText: hubLines[j + a],
              });
            }
            j += k;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        result.push({
          type: 'modified-old',
          leftNum: i + 1,
          rightNum: j + 1,
          leftText: srcLine,
          rightText: hubLine,
        });
        i++;
        j++;
      }
    }
  }

  return result;
}

function rowClass(type: DiffLine['type'], side: 'left' | 'right'): string {
  const isLeft = side === 'left';
  switch (type) {
    case 'added':
      return isLeft ? 'bg-green-100 dark:bg-green-900/30' : 'bg-transparent';
    case 'removed':
      return isLeft ? 'bg-transparent' : 'bg-red-100 dark:bg-red-900/30';
    case 'modified-old':
    case 'modified-new':
      return 'bg-amber-100 dark:bg-amber-900/30';
    default:
      return '';
  }
}

function indicatorClass(type: DiffLine['type'], side: 'left' | 'right'): string {
  const isLeft = side === 'left';
  switch (type) {
    case 'added':
      return isLeft ? 'text-green-600 dark:text-green-400 font-bold' : 'text-transparent';
    case 'removed':
      return isLeft ? 'text-transparent' : 'text-red-600 dark:text-red-400 font-bold';
    case 'modified-old':
    case 'modified-new':
      return 'text-amber-600 dark:text-amber-400 font-bold';
    default:
      return 'text-transparent';
  }
}

function lineNumClass(type: DiffLine['type']): string {
  switch (type) {
    case 'added':
      return 'text-green-700/60 dark:text-green-400/50';
    case 'removed':
      return 'text-red-700/60 dark:text-red-400/50';
    case 'modified-old':
    case 'modified-new':
      return 'text-amber-700/60 dark:text-amber-400/50';
    default:
      return 'text-muted-foreground/40';
  }
}

export function DiffView({ sourcePath, hubTargetPath }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['diff', sourcePath, hubTargetPath],
    queryFn: () => api.getDiff(sourcePath, hubTargetPath),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载差异内容...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 py-2 text-sm">
        <AlertCircle className="h-4 w-4" />
        加载失败: {(error as Error).message}
      </div>
    );
  }

  if (!data) return null;

  const sourceLines = data.sourceContent.split('\n');
  const hubLines = data.hubContent ? data.hubContent.split('\n') : [];
  const diffLines = computeDiff(sourceLines, hubLines);

  if (diffLines.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">无内容</div>;
  }

  const allSame = diffLines.every((l) => l.type === 'same');
  if (allSame && hubLines.length > 0) {
    return (
      <div className="text-sm text-muted-foreground py-2 flex items-center gap-2">
        <span className="text-green-600">✓</span>
        内容完全相同，无需合并
      </div>
    );
  }

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;
  const modifiedCount = diffLines.filter(
    (l) => l.type === 'modified-old' || l.type === 'modified-new',
  ).length;

  return (
    <div className="border rounded-md overflow-hidden text-xs font-mono select-text">
      {/* 统计栏 */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 border-b text-xs">
        {addedCount > 0 && <span className="text-green-600 dark:text-green-400">+{addedCount} 新增</span>}
        {removedCount > 0 && <span className="text-red-600 dark:text-red-400">-{removedCount} 删除</span>}
        {modifiedCount > 0 && <span className="text-amber-600 dark:text-amber-400">~{modifiedCount} 修改</span>}
        {addedCount === 0 && removedCount === 0 && modifiedCount === 0 && (
          <span className="text-muted-foreground">无差异</span>
        )}
      </div>
      {/* 表头 */}
      <div className="flex bg-muted">
        <div className="flex-1 px-3 py-1.5 text-blue-600 dark:text-blue-400 font-medium border-r flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          工具文件（新内容）
        </div>
        <div className="flex-1 px-3 py-1.5 text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Hub 文件（当前内容）
        </div>
      </div>
      {/* 行内容 */}
      <div className="max-h-72 overflow-y-auto">
        {diffLines.map((line, idx) => (
          <div key={idx} className="flex leading-5">
            {/* 左侧：工具文件 */}
            <div className={`flex-1 flex min-w-0 ${rowClass(line.type, 'left')}`}>
              <span className={`w-10 shrink-0 text-right pr-1.5 select-none text-[10px] ${lineNumClass(line.type)}`}>
                {line.leftNum ?? ''}
              </span>
              <span className={`w-5 shrink-0 text-center select-none ${indicatorClass(line.type, 'left')}`}>
                {line.type === 'added' && line.leftText ? '+' : line.type === 'modified-old' ? '~' : line.type === 'modified-new' ? '~' : ' '}
              </span>
              <span className="whitespace-pre overflow-x-auto pr-2">{line.leftText || '\u00A0'}</span>
            </div>
            {/* 右侧：Hub 文件 */}
            <div className={`flex-1 flex min-w-0 border-l ${rowClass(line.type, 'right')}`}>
              <span className={`w-10 shrink-0 text-right pr-1.5 select-none text-[10px] ${lineNumClass(line.type)}`}>
                {line.rightNum ?? ''}
              </span>
              <span className={`w-5 shrink-0 text-center select-none ${indicatorClass(line.type, 'right')}`}>
                {line.type === 'removed' && line.rightText ? '-' : line.type === 'modified-old' ? '~' : line.type === 'modified-new' ? '~' : ' '}
              </span>
              <span className="whitespace-pre overflow-x-auto pr-2">{line.rightText || '\u00A0'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}