/**
 * 质量中心页（refactor-governance-center T1，由原治理临时容器页平移）
 *
 * 本任务只做入口与命名迁移：内容仍是「体检与待办视图」——健康分卡 + 四维问题清单，
 * 点条目就地展开体检报告。只读复用 `/governance/health` 与 `/governance/issues`。
 * 体检报告聚类、跨类别批量、规则与忽略分别由 T3 / T5 / T7 落位。
 *
 * spec: 设计文档/changes/refactor-governance-center/specs/governance-center.spec.md Scenario 1.1
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { HomeHero } from '@/components/home/HomeHero';
import { DimensionIssues } from '@/components/governance/DimensionIssues';
import { api } from '@/lib/api';

export default function QualityCenter(): JSX.Element {
  const navigate = useNavigate();
  // 只读缓存口径：本页不做「重新体检」，避免与首页争抢重算时机
  const healthQuery = useQuery({
    queryKey: ['governance-health'],
    queryFn: () => api.getGovernanceHealth(false),
    retry: 1,
  });

  const dimensions = healthQuery.data?.dimensions ?? null;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">质量中心建设中</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          当前只提供体检与待办视图：健康分 + 四维问题清单，点条目可展开该资产的体检报告。
          筛选、批量整改等能力将在质量中心正式版提供。
        </p>
      </header>

      <HomeHero
        // 健康分接口能返回数据即说明 Hub 已初始化；零资产由 grade === 'empty' 分支单独呈现
        hubInitialized={true}
        health={healthQuery.data ?? null}
        healthLoading={healthQuery.isLoading}
        healthError={healthQuery.isError}
        onStartOnboarding={() => navigate('/onboarding')}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">四维问题清单</h2>
        {dimensions === null ? (
          <p className="text-sm text-muted-foreground">体检数据暂不可用，问题清单读取不到。</p>
        ) : (
          dimensions.map((dimension) => (
            <DimensionIssues key={dimension.id} dimension={dimension.id} label={dimension.label} />
          ))
        )}
      </section>
    </div>
  );
}
