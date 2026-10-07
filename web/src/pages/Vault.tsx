import { useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Download, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ASSET_CATEGORIES } from '@/config/asset-categories';
import { api } from '@/lib/api';
import { useEscapeKey } from '@/lib/use-escape-key';
import { PageHeader } from '@/components/layout/PageHeader';
import { AssetCard } from '@/components/vault/AssetCard';
import { AssetEditor } from '@/components/vault/AssetEditor';
import { DistributionDialog } from '@/components/vault/DistributionDialog';
import { AgentsView } from '@/components/agents/AgentsView';
import { SkillsView } from '@/components/skills/SkillsView';
import { getCategoryConfig } from '@/config/asset-categories';
import type { Asset, FrontendCategory } from '@/types/api';

type ViewMode = 'list' | 'view' | 'edit' | 'create';

export default function Vault(): JSX.Element {
  const params = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedCategory = params.category ?? null;
  const isExternalCategory = getCategoryConfig(selectedCategory ?? '')?.external === true;
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [distributeAsset, setDistributeAsset] = useState<Asset | null>(null);

  // 获取资产列表（外部类别由专用视图自行取数）
  const { data, isLoading, error } = useQuery({
    queryKey: ['assets', selectedCategory, search],
    enabled: !isExternalCategory,
    queryFn: () =>
      api.listAssets({
        category: (selectedCategory as FrontendCategory | null) ?? undefined,
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
  });

  // 更新资产
  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.updateAsset(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['asset', selectedAsset?.id] });
      setViewMode('list');
    },
  });

  const handleSave = async (saveData: { name: string; category: string; content: string }): Promise<void> => {
    if (viewMode === 'create') {
      await createMutation.mutateAsync(saveData);
    } else if (selectedAsset) {
      await updateMutation.mutateAsync({ id: selectedAsset.id, content: saveData.content });
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

  const emptyState = useMemo(() => {
    if (isLoading || !data) return null;
    if (data.total > 0) return null;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="h-12 w-12 text-muted-foreground mb-4" />
        {search ? (
          <>
            <h3 className="text-lg font-medium mb-1">未找到匹配的资产</h3>
            <p className="text-sm text-muted-foreground mb-4">试试其他关键词</p>
            <Button variant="outline" size="sm" onClick={() => handleSearchChange('')}>
              清除搜索
            </Button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium mb-1">
              {selectedCategory
                ? `还没有${ASSET_CATEGORIES.find((c) => c.code === selectedCategory)?.label ?? ''}资产`
                : '资产库为空'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedCategory
                ? '从已安装的工具导入，或手动创建一个'
                : '扫描已安装的工具，开始导入你的 AI 资产'}
            </p>
            <Button size="sm" onClick={() => navigate('/import')}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              立即导入
            </Button>
          </>
        )}
      </div>
    );
  }, [isLoading, data, search, selectedCategory, navigate]);

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

      {/* 右侧内容区 */}
      {isExternalCategory ? (
        <div className="flex min-w-0 flex-1">
          {selectedCategory === 'agent' && <AgentsView />}
          {selectedCategory === 'skill' && <SkillsView />}
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* 页头（spec refactor-design-system page-headers：类别名 H1 + 描述 + 主操作） */}
        <PageHeader
          title={selectedCategory
            ? ASSET_CATEGORIES.find((c) => c.code === selectedCategory)?.label ?? '全部资产'
            : '全部资产'}
          subtitle={selectedCategory
            ? ASSET_CATEGORIES.find((c) => c.code === selectedCategory)?.description
            : '统一管理你的身份、技能、规则与 MCP 配置'}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                导入
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
        {/* 工具栏 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索资产..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* 错误 */}
        {error && (
          <Card className="p-6 text-center text-destructive">
            加载失败: {error instanceof Error ? error.message : String(error)}
          </Card>
        )}

        {/* 加载中 */}
        {isLoading && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-md" />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {emptyState}

        {/* 资产卡片列表 */}
        {!isLoading && data && data.total > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-2">共 {data.total} 项资产</p>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(270px,100%),1fr))]">
              {data.items.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  active={selectedAsset?.id === asset.id && viewMode !== 'list'}
                  onView={handleView}
                  onEdit={(a) => {
                    setSelectedAsset(a);
                    setViewMode('edit');
                  }}
                  onDistribute={(a) => setDistributeAsset(a)}
                />
              ))}
            </div>
          </>
        )}
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
        open={!!distributeAsset}
        onOpenChange={(open) => !open && setDistributeAsset(null)}
      />
    </div>
  );
}
