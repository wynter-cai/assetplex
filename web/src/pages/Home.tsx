/**
 * 首页 - 行动面板（refactor-home-action-panel T10）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * 结构：状态条 → 今日待办 →（宽屏两栏）工具与同步矩阵 → 最近变化。
 * 旧资产快照 / 快捷动作 / 建议条 / 旧连接卡已下线（组件文件保留，其他页面引用不受影响）。
 * 空态互不混淆：库为空、全部健康、待办不可用各自诚实呈现，不填 0、不伪造健康。
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, CheckCircle2, RefreshCw } from 'lucide-react';
import { StatusBar } from '@/components/home/StatusBar';
import { TodayQueue } from '@/components/home/TodayQueue';
import { ToolSyncMatrix } from '@/components/home/ToolSyncMatrix';
import { RecentChanges } from '@/components/home/RecentChanges';
import { OnboardingResumeCard } from '@/components/home/OnboardingResumeCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHomeDashboard, formatHomeTimestamp } from '@/lib/use-home-dashboard';

export default function Home(): JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading, isError, isRefreshing, refreshError, retry, refresh } = useHomeDashboard();

  if (isLoading) return <HomeSkeleton />;
  if (isError || data === undefined) return <ServiceUnavailable onRetry={retry} />;

  const emptyLibrary = !data.hubInitialized;
  const issuesUnavailable = !data.issues.available;
  const allHealthy = !emptyLibrary && data.issues.available && (data.issues.total ?? 0) === 0;

  return (
    <div className="space-y-4">
      <OnboardingResumeCard />

      {refreshError !== null && (
        <p
          role="status"
          data-testid="home-refresh-error"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-12 text-destructive"
        >
          重新体检失败，仍显示上一次结果：{refreshError}
        </p>
      )}

      <StatusBar
        status={data.status}
        pendingCount={emptyLibrary ? null : data.issues.total}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="min-w-0">
          {emptyLibrary ? (
            <EmptyLibraryPanel
              onImport={() => navigate('/import')}
              onStartOnboarding={() => navigate('/onboarding')}
            />
          ) : issuesUnavailable ? (
            <IssuesUnavailable onRetry={retry} />
          ) : allHealthy ? (
            <AllHealthyPanel
              computedAt={data.healthComputedAt}
              isRefreshing={isRefreshing}
              onRefresh={refresh}
            />
          ) : (
            <TodayQueue issues={data.issues} />
          )}
        </div>
        <aside className="min-w-0">
          <ToolSyncMatrix tools={data.tools} />
        </aside>
      </div>

      {!emptyLibrary && <RecentChanges activities={data.recentActivity} />}
    </div>
  );
}

/** 库为空态：两个出口，不显示待办队列与 0 分（Scenario 3.2） */
function EmptyLibraryPanel({
  onImport,
  onStartOnboarding,
}: {
  onImport: () => void;
  onStartOnboarding: () => void;
}): JSX.Element {
  return (
    <section
      aria-label="库为空"
      data-testid="home-empty-library"
      className="rounded-xl border bg-card p-8 text-center"
    >
      <Boxes className="mx-auto h-9 w-9 text-primary" />
      <h2 className="mt-3 text-18 font-semibold">库里还没有可评估的资产</h2>
      <p className="mt-1 text-13 text-muted-foreground">
        先把散落在各工具里的身份、技能、规则收进库，首页才知道该提醒你什么。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onImport}>从已安装工具收藏第一批资产</Button>
        <Button variant="outline" onClick={onStartOnboarding}>
          运行首次引导
        </Button>
      </div>
    </section>
  );
}

/** 全部健康态：显示体检时间 + 显式重算，打开页面不自动重算（Scenario 3.1） */
function AllHealthyPanel({
  computedAt,
  isRefreshing,
  onRefresh,
}: {
  computedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <section
      aria-label="今日待办"
      data-testid="home-all-healthy"
      className="rounded-xl border bg-card p-6"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h2 className="text-14 font-semibold">全部健康</h2>
          <p className="text-12 text-muted-foreground">
            {computedAt === null
              ? '还没有体检记录，运行一次体检确认现状。'
              : `最近一次体检：${formatHomeTimestamp(computedAt)}`}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh} disabled={isRefreshing}>
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? '体检中…' : '重新体检'}
      </Button>
    </section>
  );
}

/** 待办不可用态：显示原因与重试，不得显示「全部健康」（Scenario 3.3） */
function IssuesUnavailable({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <section
      aria-label="今日待办"
      data-testid="home-issues-unavailable"
      className="rounded-xl border bg-card p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <h2 className="text-14 font-semibold">待办暂不可用</h2>
          <p className="text-12 text-muted-foreground">
            资产快照读取失败，这次算不出待办；资产文件本身不受影响。
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        重试
      </Button>
    </section>
  );
}

/** 接口整体失败：给出连接提示与重试，不白屏（Scenario 7.2） */
function ServiceUnavailable({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
      <h2 className="mb-2 text-18 font-semibold">无法连接到 AssetPlex 服务</h2>
      <p className="mb-4 text-13 text-muted-foreground">请确认服务正在运行，然后重试。</p>
      <Button onClick={onRetry} size="sm">
        <RefreshCw className="mr-1.5 h-4 w-4" />
        重试
      </Button>
    </div>
  );
}

/** 首次加载骨架：四块各自占位，不显示未经返回的 0 或示例待办（Scenario 7.1） */
function HomeSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex flex-wrap gap-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-md" />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Skeleton className="h-4 w-20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 rounded-md" />
        ))}
      </div>
    </div>
  );
}
