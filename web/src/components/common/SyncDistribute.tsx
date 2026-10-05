/**
 * 「同步分发」按钮 + 工具选择对话框（技能/智能体详情共用）
 *
 * 调用既有 POST /api/sync/run（支持 ?tool=a&tool=b 指定目标工具），
 * 完成后展示每个目标工具的成功/失败结果。
 * spec: add-skill-agent-write-management
 */

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { SyncResult } from '@/types/api';

const TOOL_DISPLAY_NAME: Record<string, string> = {
  'trae-cn': 'TRAE 中国版',
  trae: 'TRAE',
  workbuddy: 'WorkBuddy',
  'claude-code': 'Claude Code',
  codex: 'OpenAI Codex',
  qoder: 'Qoder',
};

function displayToolName(tool: string): string {
  return TOOL_DISPLAY_NAME[tool] ?? tool;
}

interface SyncDistributeProps {
  /** 同步完成后回调（父组件可用于刷新列表） */
  onSynced?: () => void;
}

/** 单个工具的同步结果行 */
function SyncResultRow({ result }: { result: SyncResult }): JSX.Element {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={result.success ? 'font-medium' : 'font-medium text-destructive'}>
        {`${displayToolName(result.tool)} ${result.success ? '成功' : '失败'}`}
      </span>
      {result.success && (
        <span className="text-muted-foreground">同步 {result.itemCount} 项</span>
      )}
      {result.errors.map((e, i) => (
        <span key={i} className="text-destructive">{e}</span>
      ))}
    </div>
  );
}

/** 工具选择对话框内容 */
function ToolPicker({
  onOpenChange,
  onSynced,
}: {
  onOpenChange: (open: boolean) => void;
  onSynced?: () => void;
}): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data } = useQuery({ queryKey: ['tools'], queryFn: api.getTools });
  const tools = data?.tools ?? [];

  const runMutation = useMutation({
    mutationFn: () =>
      api.runSync(selected.size > 0 ? Array.from(selected) : undefined, false),
    onSuccess: () => {
      onSynced?.();
    },
  });

  const toggle = (name: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const results = runMutation.data?.results ?? [];

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>同步分发</DialogTitle>
        <DialogDescription>选择要把当前资产分发到的目标工具</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        {tools.map((t) => (
          <label
            key={t.name}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              aria-label={`选择同步目标 ${t.name}`}
              checked={selected.has(t.name)}
              onChange={() => toggle(t.name)}
              disabled={!t.installed}
              className="h-3.5 w-3.5 accent-primary cursor-pointer"
            />
            <span className={t.installed ? '' : 'text-muted-foreground line-through'}>
              {displayToolName(t.name)}
            </span>
            {!t.installed && <span className="text-xs text-muted-foreground">未安装</span>}
          </label>
        ))}
        {tools.length === 0 && (
          <p className="text-xs text-muted-foreground">未发现可用工具</p>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5 rounded-md border p-2.5">
          <h3 className="text-xs font-medium">同步结果</h3>
          {results.map((r) => (
            <SyncResultRow key={r.tool} result={r} />
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
        <Button
          size="sm"
          onClick={() => runMutation.mutate()}
          disabled={selected.size === 0 || runMutation.isPending}
        >
          {runMutation.isPending ? '同步中…' : '开始同步'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** 同步分发入口按钮（含工具选择对话框） */
export function SyncDistribute({ onSynced }: SyncDistributeProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 text-xs"
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-3.5 w-3.5 mr-1" />
        同步分发
      </Button>
      {open && <ToolPicker onOpenChange={setOpen} onSynced={onSynced} />}
    </Dialog>
  );
}
