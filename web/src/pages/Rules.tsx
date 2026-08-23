import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Save, FileText } from 'lucide-react';

const SUBDIRS = ['always', 'by-glob', 'by-project'] as const;
type RuleSubdir = (typeof SUBDIRS)[number];

function RuleEditor({ subdir }: { subdir: RuleSubdir }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['files', 'rules', subdir],
    queryFn: () => api.listFiles('rules'),
  });

  const filtered = (data?.files ?? []).filter((f) =>
    f.relativePath.startsWith(`rules/${subdir}/`),
  );

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
      queryClient.invalidateQueries({ queryKey: ['files', 'rules'] });
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{subdir} 规则</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无文件</div>
          ) : (
            filtered.map((f) => (
              <button
                key={f.relativePath}
                className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${
                  selectedFile === f.relativePath ? 'bg-accent' : ''
                }`}
                onClick={() => setSelectedFile(f.relativePath)}
              >
                <div className="font-mono truncate">
                  {f.relativePath.split('/').slice(2).join('/')}
                </div>
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
                <FileText className="h-4 w-4" />
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
              <Textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setDirty(true);
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
  );
}

export default function Rules() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">规则管理</h1>
        <p className="text-muted-foreground mt-1">always / by-glob / by-project 三类规则</p>
      </div>

      <Tabs defaultValue="always">
        <TabsList>
          <TabsTrigger value="always">always</TabsTrigger>
          <TabsTrigger value="by-glob">by-glob</TabsTrigger>
          <TabsTrigger value="by-project">by-project</TabsTrigger>
        </TabsList>
        {SUBDIRS.map((sub) => (
          <TabsContent key={sub} value={sub}>
            <RuleEditor subdir={sub} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
