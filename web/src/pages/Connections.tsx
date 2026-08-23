import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, HardDrive, AlertCircle, CheckCircle2, Download, Folder, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { ASSET_CATEGORIES, getCategoryConfig } from '@/config/asset-categories';

const TOOL_DISPLAY_NAME: Record<string, string> = {
  'trae-cn': 'TRAE 中国版',
  'trae': 'TRAE',
  'workbuddy': 'WorkBuddy',
  'claude-code': 'Claude Code',
  'codex': 'OpenAI Codex',
  'qoder': 'Qoder',
};

/** 状态点 */
function StatusDot({ installed, enabled }: { installed: boolean; enabled?: boolean }): JSX.Element {
  if (!installed) {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />;
  }
  if (enabled === false) {
    return <span className="inline-block h-2 w-2 rounded-full bg-slate-400" title="已安装但未启用" />;
  }
  return <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="已连接" />;
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 工具详情面板 */
function ToolDetailPanel({ toolName }: { toolName: string }): JSX.Element {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['tool-detail', toolName],
    queryFn: () => api.getToolDetail(toolName),
  });
  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.listAssets(),
  });

  if (isLoading || !detail) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const tool = detail.tool;
  const discovered = detail.discovered ?? { identities: [], rules: [], skills: [], mcps: [] };
  const unimportedByCategory = {
    identity: discovered.identities,
    skill: discovered.skills,
    rule: discovered.rules,
    mcp: discovered.mcps,
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* 头部信息 */}
      <div className="border-b p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <StatusDot installed={tool.installed} enabled={tool.enabled} />
              {TOOL_DISPLAY_NAME[tool.name] ?? tool.name}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{tool.configDir}</p>
          </div>
          <Badge variant={tool.installed ? (tool.enabled ? 'default' : 'secondary') : 'outline'}>
            {tool.installed ? (tool.enabled ? '已连接' : '已安装·未启用') : '未安装'}
          </Badge>
        </div>
        {tool.version && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Box className="h-3 w-3" />
            版本 {tool.version}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Switch checked={tool.enabled ?? false} disabled={!tool.installed} />
          <span className="text-sm">启用同步</span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            重新检测
          </Button>
        </div>
      </div>

      {/* 资产分发概览 */}
      <div className="p-4 border-b">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          已同步资产
        </h3>
        {!tool.installed ? (
          <p className="text-sm text-muted-foreground">工具未安装，无法同步</p>
        ) : assetsData && assetsData.total > 0 ? (
          <div className="space-y-2">
            {ASSET_CATEGORIES.map((cat) => {
              // Phase 1: 这里简单统计 Hub 中此类别的资产数量，分发状态待实现
              const count = assetsData.items.filter((a) => a.category === cat.code).length;
              const Icon = cat.icon;
              if (count === 0) return null;
              return (
                <div key={cat.code} className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{cat.label}</span>
                  <Badge variant="secondary" className="ml-auto">{count}</Badge>
                </div>
              );
            })}
            {ASSET_CATEGORIES.every((c) => assetsData.items.filter((a) => a.category === c.code).length === 0) && (
              <p className="text-sm text-muted-foreground">Hub 中尚无资产可同步</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无同步数据</p>
        )}
      </div>

      {/* 未入库文件 */}
      {tool.installed && (
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            可导入资产
          </h3>
          {(['identity', 'skill', 'rule', 'mcp'] as const).map((catCode) => {
            const files = unimportedByCategory[catCode] ?? [];
            if (files.length === 0) return null;
            const cat = getCategoryConfig(catCode);
            const Icon = cat?.icon ?? Folder;
            return (
              <div key={catCode} className="mb-3">
                <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  {cat?.label ?? catCode}（{files.length}）
                </div>
                <div className="space-y-1">
                  {files.slice(0, 5).map((f: { path: string; size: number }) => {
                    const fileName = f.path.split(/[/\\]/).pop();
                    return (
                      <div key={f.path} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                        <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 font-mono">{fileName}</span>
                        <span className="text-muted-foreground shrink-0">{formatSize(f.size)}</span>
                      </div>
                    );
                  })}
                  {files.length > 5 && (
                    <div className="text-xs text-muted-foreground pl-5">还有 {files.length - 5} 个文件...</div>
                  )}
                </div>
              </div>
            );
          })}
          {(discovered.identities.length + discovered.rules.length + discovered.skills.length + discovered.mcps.length) === 0 && (
            <p className="text-sm text-muted-foreground">暂无可导入的新文件</p>
          )}
          {(discovered.identities.length + discovered.rules.length + discovered.skills.length + discovered.mcps.length) > 0 && (
            <Button size="sm" className="w-full mt-2" asChild>
              <a href="/import">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                导入到 Hub
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Connections(): JSX.Element {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: api.getTools,
  });

  const tools = data?.tools ?? [];
  const currentTool = selectedTool
    ? tools.find((t) => t.name === selectedTool) ?? tools[0]
    : tools[0];

  return (
    <div className="flex h-full -mx-4 -mt-4">
      {/* 左侧工具列表 */}
      <div className="w-56 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">已连接工具</h2>
          <p className="text-xs text-muted-foreground mt-0.5">管理 AI 工具连接与同步</p>
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
                  onClick={() => setSelectedTool(tool.name)}
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
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {tool.version.split('.')[0]}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="p-3 border-t">
          <Button variant="outline" size="sm" className="w-full text-xs" disabled={isLoading}>
            <HardDrive className="h-3 w-3 mr-1.5" />
            扫描新工具
          </Button>
        </div>
      </div>

      {/* 右侧详情 */}
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
  );
}
