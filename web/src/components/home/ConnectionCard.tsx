import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, MinusCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConnectionInfo } from '@/types/api';

interface ConnectionCardProps {
  connections: ConnectionInfo[];
}

const STATUS_CONFIG = {
  synced: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950/30',
    label: '已同步',
  },
  pending: {
    icon: AlertCircle,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    label: '待同步',
  },
  not_connected: {
    icon: MinusCircle,
    color: 'text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/30',
    label: '未连接',
  },
  not_installed: {
    icon: XCircle,
    color: 'text-slate-300 dark:text-slate-600',
    bg: 'bg-slate-50/50 dark:bg-slate-900/20',
    label: '未安装',
  },
} as const;

export function ConnectionCard({ connections }: ConnectionCardProps): JSX.Element {
  const navigate = useNavigate();

  if (connections.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">连接状态</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">尚未检测到已安装的 AI 工具</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            连接状态
          </CardTitle>
          <button
            type="button"
            onClick={() => navigate('/connections')}
            className="text-xs text-primary hover:underline"
          >
            管理连接
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {connections.map((conn) => {
            const config = STATUS_CONFIG[conn.status];
            const Icon = config.icon;
            return (
              <button
                key={conn.toolId}
                type="button"
                onClick={() => navigate(`/connections?tool=${conn.toolId}`)}
                className={`flex items-center gap-2.5 rounded-md border p-3 text-left hover:border-primary/30 transition-colors ${config.bg}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{conn.toolName}</div>
                  <div className="text-xs text-muted-foreground">
                    {config.label}
                    {conn.status === 'synced' && conn.assetCount > 0 && ` · ${conn.assetCount} 项资产`}
                    {conn.status === 'pending' && conn.pendingCount > 0 && ` · ${conn.pendingCount} 项更新`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
