import { Badge } from '@/components/ui/badge';
import { User, Sparkles, BookOpen, Server, Settings, File, AlertTriangle } from 'lucide-react';
import type { DiscoveredItem } from '@/types/api';

const categoryIcons: Record<string, typeof File> = {
  identity: User,
  skill: Sparkles,
  rule: BookOpen,
  mcp: Server,
  preference: Settings,
};

const categoryLabels: Record<string, string> = {
  identity: '身份',
  skill: '技能',
  rule: '规则',
  mcp: 'MCP',
  preference: '偏好',
};

interface Props {
  item: DiscoveredItem;
  selected: boolean;
  onToggle: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileItem({ item, selected, onToggle }: Props) {
  const Icon = categoryIcons[item.category] ?? File;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 rounded-md transition-colors"
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 rounded accent-primary shrink-0"
      />
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.hubTargetPath}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {categoryLabels[item.category] ?? item.category}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatSize(item.size)} · {item.tool}
        </div>
      </div>
      {item.conflict === 'differs' && (
        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs shrink-0">
          <AlertTriangle className="h-3 w-3 mr-1" />
          冲突
        </Badge>
      )}
      {item.conflict === 'exists' && (
        <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs shrink-0">
          已存在
        </Badge>
      )}
      {item.conflict === 'none' && (
        <Badge variant="outline" className="text-green-600 border-green-300 text-xs shrink-0">
          新文件
        </Badge>
      )}
    </div>
  );
}