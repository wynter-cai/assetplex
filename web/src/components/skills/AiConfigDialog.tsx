/**
 * AI 分类配置对话框：OpenAI 兼容 baseUrl / apiKey / model
 *
 * spec add-skill-ai-classification：
 * - 读取时 apiKey 不回传明文（已配置则 placeholder 提示留空保留原值）
 * - 保存校验失败提示后端错误并保持打开；成功后回调 onSaved（续跑触发意图）
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';

export function AiConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): JSX.Element {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .getAiClassifyConfig()
      .then((config) => {
        setBaseUrl(config.baseUrl);
        setModel(config.model);
        setHasApiKey(config.hasApiKey);
        setApiKey('');
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '读取 AI 分类配置失败');
      })
      .finally(() => setLoading(false));
  }, [open]);

  const submit = (): void => {
    if (saving) return;
    setSaving(true);
    api
      .saveAiClassifyConfig({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
      })
      .then(() => {
        onOpenChange(false);
        onSaved();
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : '保存 AI 分类配置失败');
      })
      .finally(() => setSaving(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 分类配置</DialogTitle>
          <DialogDescription>
            OpenAI 兼容接口（baseUrl / apiKey / model），Lite 级别小模型即可
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-xs text-muted-foreground">加载中…</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <span className="text-xs font-medium">Base URL</span>
              <Input
                aria-label="AI 分类 Base URL"
                placeholder="https://api.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium">API Key</span>
              <Input
                aria-label="AI 分类 API Key"
                type="password"
                placeholder={hasApiKey ? '已配置，留空保留原值' : 'sk-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium">模型</span>
              <Input
                aria-label="AI 分类模型"
                placeholder="lite-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={submit} disabled={loading || saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
