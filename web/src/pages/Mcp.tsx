import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Server, Save } from 'lucide-react';

export default function Mcp() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['files', 'mcp'],
    queryFn: () => api.listFiles('mcp'),
  });

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [parsed, setParsed] = useState<{ servers: string[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFile) {
      api.readFile(selectedFile).then((res) => {
        setContent(res.content);
        setDirty(false);
        parseJson(res.content);
      });
    }
  }, [selectedFile]);

  function parseJson(text: string) {
    try {
      const obj = JSON.parse(text);
      const servers = obj.mcpServers ? Object.keys(obj.mcpServers) : [];
      setParsed({ servers });
      setParseError(null);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : 'JSON 解析失败');
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => api.writeFile(selectedFile!, content),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['files', 'mcp'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">MCP 服务器</h1>
        <p className="text-muted-foreground mt-1">编辑 MCP 配置 JSON</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">配置文件</CardTitle>
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
            <CardTitle className="text-base">
              {selectedFile ? (
                <span className="font-mono flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {selectedFile}
                </span>
              ) : (
                '请选择文件'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedFile ? (
              <>
                {parsed && (
                  <div className="flex flex-wrap gap-1">
                    {parsed.servers.map((s) => (
                      <Badge key={s} variant="secondary" className="font-mono">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                {parseError && (
                  <div className="text-xs text-destructive">JSON 错误：{parseError}</div>
                )}
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                    parseJson(e.target.value);
                  }}
                  className="min-h-[400px] font-mono text-sm"
                />
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  保存
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">从左侧选择一个文件</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
