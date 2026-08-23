import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { HubConfig } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';

export default function Settings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['hub-config'], queryFn: api.getHubConfig });
  const [draft, setDraft] = useState<HubConfig | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !draft) {
      // 深拷贝以免直接修改 query 数据
      setDraft(JSON.parse(JSON.stringify(data)));
    }
  }, [data, draft]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveHubConfig(draft!),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['hub-config'] });
    },
  });

  if (!draft) return <div>加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hub 设置</h1>
          <p className="text-muted-foreground mt-1">编辑 hub.toml 配置</p>
        </div>
        {dirty && <Badge variant="warning">未保存</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hub 主配置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>版本</Label>
            <Input value={draft.hub.version} readOnly className="bg-muted/50" />
          </div>
          <div>
            <Label>默认同步策略</Label>
            <Input
              value={draft.hub.defaultSyncStrategy}
              onChange={(e) => {
                draft.hub.defaultSyncStrategy = e.target.value;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>备份目录</Label>
            <Input
              value={draft.hub.backupDir}
              onChange={(e) => {
                draft.hub.backupDir = e.target.value;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>备份保留数</Label>
            <Input
              type="number"
              value={draft.hub.backupKeepCount}
              onChange={(e) => {
                draft.hub.backupKeepCount = parseInt(e.target.value, 10) || 0;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="autowatch">自动监听</Label>
            <Switch
              id="autowatch"
              checked={draft.hub.autoWatch}
              onCheckedChange={(v) => {
                draft.hub.autoWatch = v;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">身份学习</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="autolearn">自动学习</Label>
            <Switch
              id="autolearn"
              checked={draft.identity.profileAutoLearn}
              onCheckedChange={(v) => {
                draft.identity.profileAutoLearn = v;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>学习间隔（小时）</Label>
            <Input
              type="number"
              value={draft.identity.learnIntervalHours}
              onChange={(e) => {
                draft.identity.learnIntervalHours = parseInt(e.target.value, 10) || 0;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>最大事实数</Label>
            <Input
              type="number"
              value={draft.identity.learnMaxFacts}
              onChange={(e) => {
                draft.identity.learnMaxFacts = parseInt(e.target.value, 10) || 0;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>学习来源</Label>
            <Input
              value={draft.identity.learnSources.join(', ')}
              onChange={(e) => {
                draft.identity.learnSources = e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">技能市场</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="mkt">启用</Label>
            <Switch
              id="mkt"
              checked={draft.marketplace.enabled}
              onCheckedChange={(v) => {
                draft.marketplace.enabled = v;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div>
            <Label>缓存 TTL（小时）</Label>
            <Input
              type="number"
              value={draft.marketplace.cacheTtlHours}
              onChange={(e) => {
                draft.marketplace.cacheTtlHours = parseInt(e.target.value, 10) || 0;
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
          </div>
          <div className="md:col-span-2">
            <Label>市场源</Label>
            <Textarea
              value={draft.marketplace.sources.join('\n')}
              onChange={(e) => {
                draft.marketplace.sources = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                setDraft({ ...draft });
                setDirty(true);
              }}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          保存配置
        </Button>
      </div>
    </div>
  );
}
