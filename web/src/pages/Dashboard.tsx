import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, FileText, Activity, Heart } from 'lucide-react';

export default function Dashboard() {
  const { data: toolsData } = useQuery({ queryKey: ['tools'], queryFn: api.getTools });
  const { data: health } = useQuery({ queryKey: ['hub-health'], queryFn: api.getHubHealth });
  const { data: history } = useQuery({ queryKey: ['sync-history'], queryFn: api.getSyncHistory });

  const installedCount = toolsData?.tools.filter((t) => t.installed).length ?? 0;
  const totalTools = toolsData?.tools.length ?? 0;
  const totalFiles = health?.totalFiles ?? 0;
  const lastSync = history?.history[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">总览</h1>
        <p className="text-muted-foreground mt-1">AssetPlex Hub 状态一览</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已安装工具</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {installedCount} / {totalTools}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hub 文件数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFiles}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">最近同步</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastSync ? new Date(lastSync.timestamp).toLocaleString('zh-CN') : '从未'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hub 健康度</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {health?.hubExists ? (
              <Badge variant="success">正常</Badge>
            ) : (
              <Badge variant="destructive">未初始化</Badge>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              {health?.hubTomlExists ? 'hub.toml 存在' : 'hub.toml 缺失'}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">工具状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {toolsData?.tools.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between">
                <span className="text-sm font-mono">{tool.name}</span>
                <Badge variant={tool.installed ? 'success' : 'secondary'}>
                  {tool.installed ? '已安装' : '未安装'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">各类别文件数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {health &&
              Object.entries(health.fileCountByCategory).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-sm font-mono">{cat}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
