/**
 * 质量中心首页：全局体检报告（refactor-governance-center T3）
 *
 * 只回答「整体怎么样、先改哪一类」：四维分数 + 按影响面排序的问题聚类。
 * 聚类展开只给资产库深链，不内嵌诊断面板、不提供任何修复动作。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Requirement 2 / 7
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClusterList } from '@/components/quality/ClusterList';
import { HomeHero } from '@/components/home/HomeHero';
import { api } from '@/lib/api';

export default function QualityCenter(): JSX.Element {
  // 只读聚合：打开页面不触发任何诊断或模型调用
  const overviewQuery = useQuery({
    queryKey: ['quality-overview'],
    queryFn: () => api.getQualityOverview(false),
  });

  const overview = overviewQuery.data ?? null;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">体检报告</h1>
        <p className="text-sm text-muted-foreground">
          质量中心 · 全库问题按类型聚类，先看整体、再决定先改哪一类。具体修改在资产详情完成。
        </p>
        {overview !== null && (
          <p className="text-xs text-muted-foreground" data-testid="pending-total">
            待处理 {overview.pendingTotal} 项（与首页同源）
          </p>
        )}
      </header>

      {overviewQuery.isLoading && (
        <p className="text-sm text-muted-foreground">体检报告读取中…</p>
      )}

      {overviewQuery.isError && overview === null && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <h2 className="text-base font-semibold">体检报告读取失败</h2>
                <p className="text-sm text-muted-foreground">
                  这次没算出来，资产仍安全存储；请稍后重试。
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {overview !== null && overview.health.totalAssets === 0 && (
        <Card data-testid="quality-empty-assets">
          <CardContent className="space-y-3 p-8 text-center">
            <Boxes className="mx-auto h-10 w-10 text-primary" />
            <h2 className="text-xl font-semibold">先把资产收进库再体检</h2>
            <p className="text-sm text-muted-foreground">
              库里还没有资产，暂时没有可体检的内容。先导入或创建资产，再回来看全局报告。
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild>
                <Link to="/vault">去资产库</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/onboarding">去新手引导</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {overview !== null && overview.health.totalAssets > 0 && (
        <>
          <HomeHero
            hubInitialized={true}
            health={overview.health}
            healthLoading={false}
            healthError={false}
            showDimensionMeta
          />
          <ClusterList
            clusters={overview.clusters}
            coverage={overview.coverage}
            lastCheckedAt={overview.generatedAt}
          />
        </>
      )}
    </div>
  );
}
