import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusDot, TOOL_DISPLAY_NAME } from '@/components/connections/tool-display';
import ToolDetailPanel from '@/components/connections/ToolDetailPanel';

export default function Connections(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTool = searchParams.get('tool');
  const toolsQuery = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
  });
  const { isLoading, refetch, isFetching } = toolsQuery;

  const tools = toolsQuery.data?.tools ?? [];
  // ?tool=<name> 深链；名字无效（已卸载/拼错）时回退第一个
  const currentTool = selectedTool
    ? tools.find((t) => t.name === selectedTool) ?? tools[0]
    : tools[0];

  const selectTool = (name: string): void => {
    setSearchParams({ tool: name }, { replace: true });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 页头（spec refactor-design-system page-headers；出血清理在 T7） */}
      <PageHeader title="连接" subtitle="管理各 AI 工具的连接与同步状态" />
      <div className="flex min-h-0 flex-1">
        {/* 左侧工具列表（随视口自适应宽度，不写死单一像素宽） */}
        <div className="w-44 shrink-0 border-r bg-muted/20 flex flex-col sm:w-52 lg:w-56">
          <div className="p-3 border-b">
            <h2 className="text-sm font-semibold">已连接工具</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-md" />
                ))}
              </div>
            ) : (
              tools.map((tool) => {
                const isActive = currentTool?.name === tool.name;
                return (
                  <button
                    key={tool.name}
                    type="button"
                    onClick={() => selectTool(tool.name)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-accent' : 'hover:bg-accent/40'
                    }`}
                  >
                    <StatusDot installed={tool.installed} enabled={tool.enabled} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {TOOL_DISPLAY_NAME[tool.name] ?? tool.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {tool.installed ? (tool.enabled ? '已连接' : '未启用') : '未安装'}
                      </div>
                    </div>
                    {tool.installed && tool.version && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        {tool.version.split('.')[0]}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="p-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={isLoading || isFetching}
              onClick={() => void refetch()}
            >
              <HardDrive className={`h-3 w-3 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? '扫描中…' : '重新扫描'}
            </Button>
          </div>
        </div>

        {/* 右侧详情（三口径与可收藏列表见 ToolDetailPanel） */}
        <div className="flex-1 min-w-0 flex flex-col">
          {currentTool ? (
            <ToolDetailPanel toolName={currentTool.name} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              选择一个工具查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
