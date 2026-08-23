import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RefreshCw } from 'lucide-react';

export default function Tools() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['tools'], queryFn: api.getTools });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled?: boolean }) =>
      api.toggleTool(name, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });

  const detectMutation = useMutation({
    mutationFn: api.detectTool,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tools'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">工具管理</h1>
        <p className="text-muted-foreground mt-1">检测与配置 5 个 AI 编码工具</p>
      </div>

      {isLoading ? (
        <div>加载中...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.tools.map((tool) => (
            <Card key={tool.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-mono">{tool.name}</CardTitle>
                  <Badge variant={tool.installed ? 'success' : 'secondary'}>
                    {tool.installed ? '已安装' : '未安装'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground break-all">{tool.configDir}</div>
                {tool.version && (
                  <div className="text-xs">
                    版本：<span className="font-mono">{tool.version}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm">启用同步</span>
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={() =>
                      toggleMutation.mutate({ name: tool.name, enabled: !tool.enabled })
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => detectMutation.mutate(tool.name)}
                  disabled={detectMutation.isPending}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  重新检测
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
