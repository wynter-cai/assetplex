/**
 * 治理临时容器页（refactor-home-action-panel T11）
 *
 * 一期只做「体检与待办视图」：健康分卡 + 四维问题清单，点条目就地展开体检报告。
 * 只读复用 `/governance/health` 与 `/governance/issues`，不新增诊断、筛选、批量、忽略、应用修复。
 * 治理中心（B12）落地时替换本页内容、URL 不变、不加第二套入口。
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/navigation.spec.md Requirement 7
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { HomeHero } from '@/components/home/HomeHero';
import { DimensionIssues } from '@/components/governance/DimensionIssues';
import { api } from '@/lib/api';

export default function Governance(): JSX.Element {
  const navigate = useNavigate();
  // 只读缓存口径：本页不做「重新体检」，避免与首页争抢重算时机（spec Requirement 7）
  const healthQuery = useQuery({
    queryKey: ['governance-health'],
    queryFn: () => api.getGovernanceHealth(false),
    retry: 1,
  });

  const dimensions = healthQuery.data?.dimensions ?? null;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">治理中心建设中</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          当前只提供体检与待办视图：健康分 + 四维问题清单，点条目可展开该资产的体检报告。
          筛选、批量整改等能力将在治理中心正式版提供。
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
