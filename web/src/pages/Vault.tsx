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
import { AssetCard } from '@/components/vault/AssetCard';
import { AssetEditor } from '@/components/vault/AssetEditor';
import { DistributionDialog } from '@/components/vault/DistributionDialog';
import type { Asset, FrontendCategory } from '@/types/api';

type ViewMode = 'list' | 'view' | 'edit' | 'create';

export default function Vault(): JSX.Element {
  const params = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedCategory = (params.category as FrontendCategory) ?? null;
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [distributeAsset, setDistributeAsset] = useState<Asset | null>(null);

  // 获取资产列表
  const { data, isLoading, error } = useQuery({
    queryKey: ['assets', selectedCategory, search],
    queryFn: () => api.listAssets({ category: selectedCategory ?? undefined, search: search || undefined }),
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

  const handleCategoryClick = (code: string): void => {
    setSearch('');
    setViewMode('list');
    setSelectedAsset(null);
    navigate(`/vault/${code}`);
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

  return (
    <div className="flex h-full">
      {/* 左侧类别导航 */}
      <div className="w-48 shrink-0 border-r pr-3 py-2 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setViewMode('list');
            setSelectedAsset(null);
            navigate('/vault');
          }}
          className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
            !selectedCategory ? 'bg-accent font-medium' : 'hover:bg-accent/50 text-muted-foreground'
          }`}
        >
          <Package className="h-4 w-4" />
          全部资产
          {!selectedCategory && data && <span className="ml-auto text-xs text-muted-foreground">{data.total}</span>}
        </button>
        {ASSET_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.code;
          return (
            <button
              key={cat.code}
              type="button"
              onClick={() => handleCategoryClick(cat.code)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                isActive ? 'bg-accent font-medium' : 'hover:bg-accent/50 text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
              {isActive && data && <span className="ml-auto text-xs text-muted-foreground">{data.total}</span>}
            </button>
          );
        })}
      </div>

      {/* 右侧内容区 */}
      <div className="flex min-w-0 flex-1 gap-4 pl-4">
        <div className={`flex min-w-0 flex-1 flex-col ${showDetail ? 'hidden lg:flex' : 'flex'}`}>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* 工具栏 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索资产..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
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
        </div>

        {/* 错误 */}
        {error && (
          <Card className="p-6 text-center text-red-500">
            加载失败: {error instanceof Error ? error.message : String(error)}
          </Card>
        )}

        {/* 加载中 */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {data.items.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onView={(a) => {
                    setSelectedAsset(a);
                    setViewMode('view');
                  }}
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

        {/* 详情/编辑面板 */}
        {showDetail && (
          <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card lg:max-w-xl">
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

      {/* 分发管理对话框 */}
      <DistributionDialog
        asset={distributeAsset}
        open={!!distributeAsset}
        onOpenChange={(open) => !open && setDistributeAsset(null)}
      />
    </div>
  );
}
