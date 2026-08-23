import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, FileText } from 'lucide-react';
import type { ToolInventory } from '@/types/api';

interface Props {
  tool: ToolInventory;
  selected: boolean;
  onToggle: () => void;
}

export function ToolCard({ tool, selected, onToggle }: Props) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-primary/50 ${
        selected ? 'border-primary bg-primary/5' : ''
      }`}
      onClick={onToggle}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded accent-primary"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{tool.displayName}</span>
            {tool.installed ? (
              <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                已安装
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                <XCircle className="h-3 w-3 mr-1" />
                未安装
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            {tool.items.length} 个文件
          </div>
        </div>
      </CardContent>
    </Card>
  );
}