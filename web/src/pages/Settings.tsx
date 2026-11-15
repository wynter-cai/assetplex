import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { PageHeader } from '@/components/layout/PageHeader';
import { Save } from 'lucide-react';
import { WorkspaceSettingsCard } from '@/components/settings/WorkspaceSettingsCard';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { APP_VERSION } from '@/lib/app-version';
import { STRATEGY_OPTIONS } from '@/lib/sync-strategy-labels';
import { toolDisplayList, toolIdFromDisplay } from '@/components/connections/tool-display';
import { AUTO_RECHECK_KEY } from '@/components/doctor/DiagnosisPanel';

/** 修复后自动复检：默认开，'0' 为关（与详情摘要栏共用一个键） */
function readAutoRecheck(): boolean {
  try {
    return window.localStorage.getItem(AUTO_RECHECK_KEY) !== '0';
  } catch {
    return true;
  }
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['hub-config'], queryFn: api.getHubConfig });
  const [draft, setDraft] = useState<HubConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autoRecheck, setAutoRecheck] = useState<boolean>(readAutoRecheck);

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
      toast.success('配置已保存');
    },
    onError: (err: unknown) => {
      toast.error('配置保存失败', { description: errorMessage(err) });
    },
  });

  if (!draft) return <div>加载中...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        subtitle="管理工作区与全局配置"
        actions={dirty ? <Badge variant="warning">未保存</Badge> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">核心配置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="app-version">版本</Label>
            <Input id="app-version" value={APP_VERSION} readOnly className="bg-muted/50" />
          </div>
          <div>
            <Label htmlFor="sync-strategy">默认同步策略</Label>
            <select
              id="sync-strategy"
              value={draft.hub.defaultSyncStrategy}
              onChange={(e) => {
                draft.hub.defaultSyncStrategy = e.target.value;
                setDraft({ ...draft });
                setDirty(true);
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {STRATEGY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
            <Label htmlFor="learn-sources">学习来源</Label>
            <Input
              id="learn-sources"
              value={toolDisplayList(draft.identity.learnSources)}
              onChange={(e) => {
                draft.identity.learnSources = e.target.value
                  .split(/[,，、]/)
                  .map(toolIdFromDisplay)
                  .filter(Boolean);
                setDraft({ ...draft });
                setDirty(true);
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              可填工具显示名（如 TRAE 中国版、Claude Code），多个用逗号或顿号分隔
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">资产体检</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Label htmlFor="auto-recheck">修复后自动复检</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              保存修复后立刻再诊断一次，确认问题是否真的消失；语义结论已缓存时不会调用模型。
            </p>
          </div>
          <Switch
            id="auto-recheck"
            checked={autoRecheck}
            onCheckedChange={(value) => {
              setAutoRecheck(value);
              try {
                window.localStorage.setItem(AUTO_RECHECK_KEY, value ? '1' : '0');
              } catch {
                // 隐私模式等写不进去：本次会话内仍然按新值生效
              }
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">首次使用引导</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            重新走一遍「盘点 → 收纳 → 体检 → 分发」，任何一步都可跳过。
          </p>
          <Button
            variant="outline"
            onClick={() => navigate('/onboarding')}
            data-testid="settings-rerun-onboarding"
          >
            重新运行首次引导
          </Button>
        </CardContent>
      </Card>

      <WorkspaceSettingsCard />

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          保存配置
        </Button>
      </div>
    </div>
  );
}
