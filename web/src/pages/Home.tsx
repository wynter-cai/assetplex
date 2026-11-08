import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { HomeHero } from '@/components/home/HomeHero';
import { HealthIssuesPanel } from '@/components/home/HealthIssuesPanel';
import { RemediationDialog } from '@/components/home/RemediationDialog';
import { AssetSnapshot } from '@/components/home/AssetSnapshot';
import { SuggestionRail } from '@/components/home/SuggestionRail';
import { ConnectionCard } from '@/components/home/ConnectionCard';
import { QuickActions } from '@/components/home/QuickActions';
import { RecentActivity } from '@/components/home/RecentActivity';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ASSET_CATEGORIES } from '@/config/asset-categories';
import type { HealthDimensionId } from '@/types/api';

/**
 * 首页 - 指挥中心
 *
 * 接入 GET /api/hub/overview 聚合数据。
 * 布局：
 *   ┌─ HomeHero ──────────────────────────────────┐
 *   ├─ AssetSnapshot ─────────────────────────────┤
 *   ├─ ConnectionCard ────────────────────────────┤
 *   ├─ QuickActions ─┬─ RecentActivity ───────────┤
 *   └────────────────┴────────────────────────────┘
 */
export default function Home(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openDimension, setOpenDimension] = useState<HealthDimensionId | null>(null);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [remediationOpen, setRemediationOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: api.getOverview,
    retry: 1,
  });

  // 真实健康分：默认只读缓存，点「重新体检」才 refresh=1 重算
  const healthQuery = useQuery({
    queryKey: ['governance-health'],
    queryFn: () => api.getGovernanceHealth(false),
    retry: 1,
  });

  const handleRefreshHealth = async (): Promise<void> => {
    setHealthRefreshing(true);
    try {
      const fresh = await api.getGovernanceHealth(true);
      queryClient.setQueryData(['governance-health'], fresh);
      queryClient.invalidateQueries({ queryKey: ['governance-issues'] });
    } catch {
      // 失败保持旧数据可见，卡片会提示「健康分暂不可用」仅在无数据时
      healthQuery.refetch().catch(() => undefined);
    } finally {
      setHealthRefreshing(false);
    }
  };

  const openDimensionLabel =
    healthQuery.data?.dimensions.find((d) => d.id === openDimension)?.label ?? '健康';

  // 加载状态：骨架屏
  if (isLoading) {
    return <HomeSkeleton />;
  }

  // 错误状态
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">无法连接到 AssetPlex 服务</h2>
        <p className="text-sm text-muted-foreground mb-4">
          请确认服务正在运行，然后重试。
        </p>
        <Button onClick={() => refetch()} variant="default" size="sm">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HomeHero
        hubInitialized={data.hubInitialized}
        health={healthQuery.data ?? null}
        healthLoading={healthQuery.isLoading}
        healthError={healthQuery.isError}
        healthRefreshing={healthRefreshing}
        onStartOnboarding={() => navigate('/import')}
        onRefreshHealth={() => void handleRefreshHealth()}
        onOpenIssues={(dimension) => setOpenDimension(dimension)}
        onConfigureAi={() => navigate('/skills')}
        onStartRemediation={() => setRemediationOpen(true)}
      />

      <SuggestionRail onOpenRemediation={() => setRemediationOpen(true)} />

      {remediationOpen && (
        <RemediationDialog
          onClose={() => setRemediationOpen(false)}
          onCompleted={() => void handleRefreshHealth()}
        />
      )}

      {openDimension !== null && (
        <HealthIssuesPanel
          dimension={openDimension}
          label={openDimensionLabel}
          onClose={() => setOpenDimension(null)}
        />
      )}

      {data.hubInitialized && (
        <>
          <AssetSnapshot assetStats={data.assetStats} />
          <ConnectionCard connections={data.connections} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <QuickActions
              hubInitialized={data.hubInitialized}
              onImport={() => navigate('/import')}
            />
            <div className="lg:col-span-2">
              <RecentActivity activities={data.recentActivities} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 首页加载骨架屏
 */
function HomeSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-12" />
        </div>
      </div>

      {/* Asset Snapshot */}
      <div className="rounded-lg border p-4">
        <Skeleton className="h-4 w-20 mb-4" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
          {ASSET_CATEGORIES.map((cat) => (
            <Skeleton key={cat.code} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Connections */}
      <div className="rounded-lg border p-4">
        <Skeleton className="h-4 w-20 mb-4" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <Skeleton className="h-4 w-16 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        </div>
        <div className="lg:col-span-2 rounded-lg border p-4">
          <Skeleton className="h-4 w-20 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
