import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

export default function Skills() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['files', 'skills'],
    queryFn: () => api.listFiles('skills'),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const createMutation = useMutation({
    mutationFn: () => {
      const path = `skills/${newName}/SKILL.md`;
      const content = `# ${newName}\n\n${newDesc}\n`;
      return api.createFile(path, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', 'skills'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => api.deleteFile(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files', 'skills'] }),
  });

  const files = data?.files ?? [];
  const skills = files.reduce<Record<string, typeof files>>((acc, f) => {
    const parts = f.relativePath.split('/');
    const skillName = parts.length > 1 ? parts[1] : parts[0];
    (acc[skillName] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">技能管理</h1>
          <p className="text-muted-foreground mt-1">管理本地技能库</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          新建技能
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新建技能</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="name">技能名</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="如：pdf-converter"
              />
            </div>
            <div>
              <Label htmlFor="desc">简介</Label>
              <Input
                id="desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="一句话描述"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!newName}>
                创建
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(skills).map(([name, files]) => (
          <Card key={name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-mono">{name}</CardTitle>
                <Badge variant="outline">{files.length} 文件</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {files.map((f) => (
                <div key={f.relativePath} className="flex items-center justify-between">
                  <span className="text-xs font-mono truncate">
                    {f.relativePath.split('/').slice(2).join('/') || 'SKILL.md'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => deleteMutation.mutate(f.relativePath)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
