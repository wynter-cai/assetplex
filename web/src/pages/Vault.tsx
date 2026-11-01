import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useEscapeKey } from '@/lib/use-escape-key';
import { pickCategory, useAssetCategories } from '@/lib/use-asset-categories';
import { toast } from '@/lib/toast-store';
import { categoryOptionsFor } from '@/lib/asset-filter';
import { distributionsFor, useDistributions } from '@/lib/use-distributions';
import { PageHeader } from '@/components/layout/PageHeader';
import { AssetListPanel } from '@/components/vault/AssetListPanel';
import { AssetEditor } from '@/components/vault/AssetEditor';
import { DistributionDialog } from '@/components/vault/DistributionDialog';
import { AgentsView } from '@/components/agents/AgentsView';
import { SkillsView } from '@/components/skills/SkillsView';
import { CriteriaView } from '@/components/criteria/CriteriaView';
import type { Asset, FrontendCategory } from '@/types/api';

type ViewMode = 'list' | 'view' | 'edit' | 'create';

/** 接口错误统一取文案：api 抛 Error，未知值兜底为字符串 */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function Vault(): JSX.Element {
  const params = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedCategory = params.category ?? null;
  // 当前类别的 label / description / external 一律以接口清单为准，查不到再回退 fallback（tasks I1）
  const { categories, source, isFetching, isError } = useAssetCategories();
  const currentCategory = selectedCategory ? pickCategory(categories, selectedCategory) : undefined;
  const isExternalCategory = currentCategory?.external === true;
  // URL 里是 fallback 与接口都认不出的类别时，先等接口清单落地再决定视图：
  // 贸然按「内部类别」发一次 /api/assets，会给 external 供数类别多发一次无谓请求。
  // 接口已失败则不再等（拿不到清单已成定局），按内部类别走正常加载/报错路径
  const categoryPending =
    !!selectedCategory && !currentCategory && !isError && (source === 'fallback' || isFetching);
  // 分发状态真值：页级拉一次索引，逐卡下发条目（spec asset-distribution-truth，tasks I2）
  const distributionsIndex = useDistributions();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [distributeAsset, setDistributeAsset] = useState<Asset | null>(null);

  // 获取资产列表（外部类别由专用视图自行取数）
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assets', selectedCategory, search],
    enabled: !isExternalCategory && !categoryPending,
    queryFn: () =>
      api.listAssets({
        category: selectedCategory ?? undefined,
        search: search || undefined,
      }),
  });

  // 获取资产详情
  const { data: assetDetail } = useQuery({
    queryKey: ['asset', selectedAsset?.id],
    queryFn: () => (selectedAsset ? api.getAsset(selectedAsset.id) : null),
    enabled: !!selectedAsset && viewMode !== 'create',
  });

  // 创建资产
  const createMutation = useMutation({
    mutationFn: (body: { name: string; category: string; content: string }) =>
      api.createAsset(body as { name: string; category: FrontendCategory; content: string }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setViewMode('list');
    },
    // 失败必须说清原因（重名/名称非法）：静默停住会让人误以为已保存（memory-visible Scenario 4）
    onError: (err: unknown) => {
      toast.error('新建失败', { description: errorText(err) });
    },
  });

  // 更新资产
  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.updateAsset(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset', selectedAsset?.id] });
      setViewMode('list');
    },
    onError: (err: unknown) => {
      toast.error('保存失败', { description: errorText(err) });
    },
  });

  const handleSave = async (saveData: { name: string; category: string; content: string }): Promise<void> => {
    try {
      if (viewMode === 'create') {
        await createMutation.mutateAsync(saveData);
      } else if (selectedAsset) {
        await updateMutation.mutateAsync({ id: selectedAsset.id, content: saveData.content });
      }
    } catch {
      // 提示已由 mutation onError 的 toast 给出；这里吞掉避免冒成未处理的 rejection 并保住面板
    }
  };

  /** 点击卡片切换详情：再点同一张卡片收起右侧面板 */
  const handleView = (asset: Asset): void => {
    if (selectedAsset?.id === asset.id && viewMode !== 'list') {
      setViewMode('list');
      setSelectedAsset(null);
    } else {
      setSelectedAsset(asset);
      setViewMode('view');
    }
  };

  const handleSearchChange = (value: string): void => {
    setSearch(value);
    if (value) {
      setSearchParams({ q: value });
    } else {
      setSearchParams({});
    }
  };

  // 类别筛选选项 = 当前列表里真正出现的类别，label 取声明源（tasks I3）
  const categoryOptions = useMemo(
    () => categoryOptionsFor(data?.items ?? [], categories),
    [data, categories],
  );
  // 查询被禁用（等清单落地 / 外部类别）时 data 还是空的，不能据此报「库是空的」
  const listLoading = isLoading || categoryPending || (!data && !error);

  const showDetail = viewMode !== 'list';

  // Esc 关闭详情/编辑面板（输入框内不触发，见 use-escape-key）
  useEscapeKey(showDetail, () => {
    setViewMode('list');
    setSelectedAsset(null);
  });

  return (
    <div className="flex h-full min-w-0">
      {/* 类别导航单轨化（spec refactor-design-system navigation-consolidation）：
          Vault 内类别栏已撤，切换类别唯一途径是全局侧栏，当前类别由页头 H1 标识 */}

      {/* 右侧内容区；外部类别页（技能/智能体/裁决准则）用 self-start：高度随内容自然增长，
          不锁 h-full —— 锁高会把右侧详情面板的 sticky 可粘滞空间压成 0（详情会随列表滚出视口） */}
      {isExternalCategory ? (
        <div data-testid="external-view-host" className="flex min-w-0 flex-1 self-start">
          {selectedCategory === 'agent' && <AgentsView />}
          {selectedCategory === 'skill' && <SkillsView />}
          {selectedCategory === 'criteria' && <CriteriaView />}
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* 页头（spec refactor-design-system page-headers：类别名 H1 + 描述 + 主操作） */}
        <PageHeader
          title={selectedCategory
            ? currentCategory?.label ?? '全部资产'
            : '全部资产'}
          subtitle={selectedCategory
            ? currentCategory?.description
            : '统一管理你的身份、技能、规则与 MCP 配置'}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                收藏
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedAsset(null);
                  setViewMode('create');
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                新建
              </Button>
            </>
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* 筛选、分页、空态与失败态集中在列表区（spec asset-center-consistency Scenario 6/8，tasks I3） */}
        <AssetListPanel
          assets={data?.items ?? []}
          categoryOptions={categoryOptions}
          lockedCategory={selectedCategory}
          lockedCategoryLabel={currentCategory?.label}
          search={search}
          distributions={distributionsIndex}
          isLoading={listLoading}
          error={error}
          onRetry={() => {
            void refetch();
          }}
          onSearchChange={handleSearchChange}
          selectedAssetId={selectedAsset?.id ?? null}
          detailOpen={showDetail}
          onView={handleView}
          onEdit={(asset) => {
            setSelectedAsset(asset);
            setViewMode('edit');
          }}
          onDistribute={(asset) => setDistributeAsset(asset)}
          onCollect={() => navigate('/import')}
        />
        </div>
        </div>

        {/* 详情/编辑面板：<1024px 全屏 overlay，≥1024px 主从侧栏（spec navigation-consolidation） */}
        {showDetail && (
          <div
            data-testid="detail-overlay"
            className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-y-auto bg-background p-4 lg:static lg:inset-auto lg:z-auto lg:max-w-xl lg:flex-1 lg:overflow-visible lg:rounded-lg lg:border lg:bg-card lg:p-0"
          >
            <AssetEditor
              asset={assetDetail ?? selectedAsset}
              category={selectedCategory ?? 'skill'}
              mode={viewMode === 'create' ? 'create' : viewMode}
              onClose={() => {
                setViewMode('list');
                setSelectedAsset(null);
              }}
              onSave={handleSave}
              onSwitchToEdit={() => setViewMode(viewMode === 'view' ? 'edit' : 'view')}
            />
          </div>
        )}
        </div>
      </div>
      )}

      {/* 分发管理对话框 */}
      <DistributionDialog
        asset={distributeAsset}
        distributions={distributionsFor(distributionsIndex, distributeAsset?.id ?? '')}
        open={!!distributeAsset}
        onOpenChange={(open) => !open && setDistributeAsset(null)}
      />
    </div>
  );
}
