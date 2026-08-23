import { useState, useEffect } from 'react';
import { X, Save, Eye, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getCategoryConfig } from '@/config/asset-categories';
import type { Asset } from '@/types/api';

interface AssetEditorProps {
  asset?: (Asset & { content?: string }) | null;
  category?: string;
  mode: 'view' | 'edit' | 'create';
  onClose: () => void;
  onSave: (data: { name: string; category: string; content: string }) => Promise<void>;
  onSwitchToEdit?: () => void;
}

export function AssetEditor({
  asset,
  category,
  mode,
  onClose,
  onSave,
  onSwitchToEdit,
}: AssetEditorProps): JSX.Element {
  const isReadOnly = mode === 'view';
  const [name, setName] = useState(asset?.name ?? '');
  const [content, setContent] = useState(asset?.content ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(asset?.name ?? '');
    setContent(asset?.content ?? '');
  }, [asset]);

  const cat = getCategoryConfig(asset?.category ?? category ?? 'skill');

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category: asset?.category ?? category ?? 'skill',
        content,
      });
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'create' ? '新建资产' : isReadOnly ? '查看资产' : '编辑资产';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <Card className="flex-shrink-0 rounded-none border-0 border-b">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {cat && <cat.icon className="h-4 w-4" />}
              {title}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-0 space-y-2">
          {mode === 'create' ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="资产名称（如 react-expert）"
              className="h-8 text-sm"
            />
          ) : (
            <div className="text-sm font-medium">{asset?.name}</div>
          )}
          {isReadOnly && asset && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>最后修改：{new Date(asset.lastModifiedAt).toLocaleString('zh-CN')}</span>
              <span>·</span>
              <span>路径：{asset.hubPath}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden">
        {isReadOnly ? (
          <div className="h-full overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed bg-muted p-4 rounded-md">{content}</pre>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此输入 Markdown 内容..."
            className="w-full h-full resize-none p-4 font-mono text-sm leading-relaxed bg-transparent outline-none"
          />
        )}
      </div>

      <div className="border-t p-3 flex items-center justify-end gap-2 flex-shrink-0">
        {isReadOnly ? (
          <Button size="sm" onClick={onSwitchToEdit}>
            <Edit3 className="h-3.5 w-3.5 mr-1.5" />
            编辑
          </Button>
        ) : (
          <>
            {asset && (
              <Button variant="ghost" size="sm" onClick={onSwitchToEdit}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                查看
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
