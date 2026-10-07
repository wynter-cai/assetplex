import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FolderGit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ErrorState } from '@/components/common/ErrorState';

/** AI-Coding 项目可视化页（顶级菜单 /projects） */
export default function Projects(): JSX.Element {
  const [existingOnly, setExistingOnly] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projects', existingOnly, search],
    queryFn: () => api.listProjects({ existingOnly, search: search || undefined }),
  });

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <PageHeader
        title="项目"
        subtitle={
          <>
            你用 AI 跑过的项目（数据源：TRAE）
            {data && (
              <span className="ml-2">
                共 {data.total} 个，目录仍存在 {data.existingCount} 个
              </span>
            )}
          </>
        }
      />

      {/* 工具栏 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目名或路径..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch checked={existingOnly} onCheckedChange={setExistingOnly} />
          仅看存在的项目
        </label>
      </div>

      {error && (
        <ErrorState
          title="项目列表加载失败"
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && data && (
        data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">暂无 TRAE 项目记录</h3>
            <p className="text-sm text-muted-foreground">
              用 TRAE 打开过的项目会自动出现在这里
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
