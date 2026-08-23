import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Save, FileText } from 'lucide-react';

export default function Identity() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['files', 'identity'],
    queryFn: () => api.listFiles('identity'),
  });

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (selectedFile) {
      api.readFile(selectedFile).then((res) => {
        setContent(res.content);
        setDirty(false);
      });
    }
  }, [selectedFile]);

  const saveMutation = useMutation({
    mutationFn: () => api.writeFile(selectedFile!, content),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['files', 'identity'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">身份管理</h1>
        <p className="text-muted-foreground mt-1">编辑 profile、技术栈、沟通风格等</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">文件列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data?.files.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无文件</div>
            ) : (
              data?.files.map((f) => (
                <button
                  key={f.relativePath}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${
                    selectedFile === f.relativePath ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedFile(f.relativePath)}
                >
                  <div className="font-mono truncate">{f.relativePath}</div>
                  <div className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {selectedFile ? (
                  <span className="font-mono flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {selectedFile}
                  </span>
                ) : (
                  '请选择文件'
                )}
              </CardTitle>
              {dirty && <Badge variant="warning">未保存</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedFile ? (
              <>
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                  className="min-h-[400px] font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{content.length} 字符</span>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!dirty || saveMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    保存
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">从左侧选择一个文件开始编辑</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
