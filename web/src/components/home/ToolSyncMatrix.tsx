/**
 * 首页工具与同步矩阵（refactor-home-action-panel T8）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * Requirement 4：工具名 + 真实状态 + 最近同步时间；漂移行显示「N 处」；
 * 未安装置灰不可点；已安装行深链 /connections?tool=<toolId>；无记录不冒充实时。
 */

import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatHomeTimestamp } from '@/lib/use-home-dashboard';
import type { HomeToolRow, HomeToolState } from '@/types/api';

const STATE_LABEL: Record<HomeToolState, string> = {
  synced: '已同步',
  drift: '有漂移',
  not_connected: '未连接',
  not_installed: '未安装',
  unknown: '状态暂不可用',
};

function stateVariant(state: HomeToolState): 'success' | 'warning' | 'outline' | 'secondary' {
  if (state === 'synced') return 'success';
  if (state === 'drift') return 'warning';
  if (state === 'not_connected') return 'outline';
  return 'secondary';
}

/** 最近同步：只认真实记录，没有记录不写「刚刚」 */
function syncText(tool: HomeToolRow): string {
  if (tool.state === 'not_installed') return '未安装，无法同步';
  if (tool.lastSyncedAt === null) return '尚无同步记录';
  return `最近同步：${formatHomeTimestamp(tool.lastSyncedAt)}`;
}

const ROW_CLASS = 'flex items-center justify-between gap-3 px-4 py-2.5';
const LINK_ROW_CLASS = `${ROW_CLASS} transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`;

function RowContent({ tool }: { tool: HomeToolRow }): JSX.Element {
  return (
    <>
      <div className="min-w-0">
        <p className="text-13 font-medium">{tool.toolName}</p>
        <p className="text-12 text-muted-foreground">{syncText(tool)}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        <Badge variant={stateVariant(tool.state)}>{STATE_LABEL[tool.state]}</Badge>
        {tool.state === 'drift' && tool.driftAssetCount !== null && (
          <span className="text-12 text-muted-foreground">{tool.driftAssetCount} 处</span>
        )}
      </span>
    </>
  );
}

export interface ToolSyncMatrixProps {
  /** 受支持工具全集（含未安装）；空数组 = 本机一个都没检测到 */
  tools: HomeToolRow[];
}

export function ToolSyncMatrix({ tools }: ToolSyncMatrixProps): JSX.Element {
  const hasFailedTool = tools.some((tool) => tool.state === 'unknown');

  return (
    <section aria-label="工具与同步" data-testid="tool-sync-matrix" className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-14 font-semibold">工具与同步</h2>
        {hasFailedTool && (
          <span className="text-12 text-muted-foreground">部分工具状态暂不可用</span>
        )}
      </header>

      {tools.length === 0 ? (
        <div className="space-y-2 px-4 pb-4">
          <p className="text-13 text-muted-foreground">未检测到已安装工具</p>
          <Link
            to="/connections"
            className="rounded text-12 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            去连接工具
          </Link>
        </div>
      ) : (
        <>
          <ul>
            {tools.map((tool) =>
              tool.state === 'not_installed' ? (
                <li key={tool.toolId} data-testid={`tool-row-${tool.toolId}`} className="border-t">
                  <div className={`${ROW_CLASS} opacity-50`} aria-disabled="true">
                    <RowContent tool={tool} />
                  </div>
                </li>
              ) : (
                <li key={tool.toolId} data-testid={`tool-row-${tool.toolId}`} className="border-t">
                  <Link
                    to={`/connections?tool=${encodeURIComponent(tool.toolId)}`}
                    className={LINK_ROW_CLASS}
                  >
                    <RowContent tool={tool} />
                  </Link>
                </li>
              ),
            )}
          </ul>
          <footer className="border-t px-4 py-2.5 text-right">
            <Link
              to="/connections"
              className="rounded text-12 text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              添加工具
            </Link>
          </footer>
        </>
      )}
    </section>
  );
}
