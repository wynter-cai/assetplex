import { Folder, FolderOpen, Terminal, Code2, GitBranch, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';
import type { ProjectInfo, ProjectOpenTarget } from '@/types/api';

const TOOL_LABELS: Record<string, string> = {
  trae: 'TRAE',
  claude: 'Claude Code',
  codebuddy: 'CodeBuddy',
  cursor: 'Cursor',
  'AGENTS.md': 'AGENTS.md',
};

function formatTime(iso: string | null): string {
  if (!iso) return '时间未知';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleDateString('zh-CN');
}

/** 单张项目卡：基础信息 + AI 标记 + 资产统计 + git + 快捷打开 */
export function ProjectCard({ project }: { project: ProjectInfo }): JSX.Element {
  const open = (target: ProjectOpenTarget): void => {
    api.openProject(project.id, target).catch((err: unknown) => {
      toast.error('打开失败', { description: errorMessage(err) });
    });
  };

  return (
    <Card className={cn('p-4 flex flex-col', !project.exists && 'opacity-60')}>
      <div className="flex items-start gap-3 mb-2">
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Folder className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-medium truncate">{project.name}</h3>
            {!project.exists && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                已不在原位置
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground break-all">{project.path}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">最近访问：{formatTime(project.lastAccessedAt)}</p>
        </div>
      </div>

      {/* AI 工具标记 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {project.tools.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">无明显 AI 标记</span>
        ) : (
          project.tools.map((m) => (
            <Badge key={`${m.tool}:${m.path}`} variant="outline" className="text-[10px] h-4 px-1">
              {TOOL_LABELS[m.tool] ?? m.tool} · {m.path}
            </Badge>
          ))
        )}
      </div>

      {/* 资产统计 */}
      <div className="flex flex-wrap gap-1.5 mb-2 text-[11px]">
        <Badge variant="secondary" className="h-5">规则 {project.assetStats.rules}</Badge>
        <Badge variant="secondary" className="h-5">技能 {project.assetStats.skills}</Badge>
        <Badge variant="secondary" className="h-5">文档 {project.assetStats.docs}</Badge>
      </div>

      {/* Git */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3">
        {project.git.isGitRepo ? (
          <>
            <GitBranch className="h-3 w-3" />
            <span>{project.git.branch ?? '未知分支'}</span>
            {project.git.hasUncommittedChanges && (
              <span className="text-warning">有未提交变更</span>
            )}
          </>
        ) : (
          <span>非 Git 仓库</span>
        )}
      </div>

      {/* 快捷打开 */}
      <div className="flex gap-1 mt-auto pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs flex-1"
          disabled={!project.exists}
          onClick={() => open('explorer')}
        >
          <FolderOpen className="h-3 w-3 mr-1" />
          文件管理器
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs flex-1"
          disabled={!project.exists}
          onClick={() => open('terminal')}
        >
          <Terminal className="h-3 w-3 mr-1" />
          终端
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs flex-1"
          disabled={!project.exists}
          onClick={() => open('ide')}
        >
          <Code2 className="h-3 w-3 mr-1" />
          IDE
        </Button>
      </div>
    </Card>
  );
}
