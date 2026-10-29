/**
 * GitHub 技能全文预览弹窗（add-github-skill-source L3）
 *
 * 打开时才发 preview 请求（只读、零落盘）；正文超阈值后端截断并标注；附属清单标注二进制。
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: string;
  sha: string;
  skillPath: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function PreviewDialog({ open, onOpenChange, repo, sha, skillPath }: PreviewDialogProps): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ['github-preview', repo, sha, skillPath],
    queryFn: () => api.github.preview({ repo, sha, skillPath }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.name ?? '预览技能'}</DialogTitle>
        </DialogHeader>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {error !== null && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {data && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{data.description || '（无描述）'}</div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>SKILL.md 正文</span>
                {data.contentTruncated && <Badge variant="secondary">已截断显示</Badge>}
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {data.content}
              </pre>
            </div>
            {data.supportingFiles.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">附属文件（{data.supportingFiles.length}）</div>
                <ul className="space-y-1 text-xs">
                  {data.supportingFiles.map((f) => (
                    <li key={f.path} className="flex items-center justify-between gap-2">
                      <span className="truncate">{f.path}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatBytes(f.sizeBytes)}
                        {f.binary && <Badge variant="secondary" className="ml-2">二进制·收藏跳过</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
