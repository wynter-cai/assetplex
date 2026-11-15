/**
 * 资产详情深链（refactor-asset-pipeline T4/T5）
 *
 * `?asset=<库内相对路径>` 是详情是否打开的唯一真源：
 * - 打开/关闭详情改地址一律 replace，不往历史里塞中间态；
 * - 深链未命中要等列表落地再判定，判定后落回类别列表并提示；
 * - 单资产自动展开只发生一次且不写地址——那是进页面顺手展示，不是用户的选择。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Asset } from '@/types/api';

export type VaultViewMode = 'list' | 'view' | 'edit' | 'create';

type SetSearchParams = (next: URLSearchParams, options?: { replace?: boolean }) => void;

export interface UseAssetDeepLinkOptions {
  /** 当前列表已取回的资产（深链按 id / hubPath 在列表里定位） */
  assets: Asset[];
  /** 列表已落地（请求成功）：此前不判定命中，避免把「还没加载」误报成「不存在」 */
  listReady: boolean;
  /** URL 锁定的类别，变化时清空本次停留的展开状态 */
  category: string | null;
  searchParams: URLSearchParams;
  setSearchParams: SetSearchParams;
  /** 深链路径在列表里查无此项（只报一次） */
  onAssetMissing: (path: string) => void;
  /** 单资产自动展开的总开关（搜索态下不抢开） */
  autoExpandEnabled: boolean;
}

export interface AssetDeepLink {
  viewMode: VaultViewMode;
  selectedAsset: Asset | null;
  detailOpen: boolean;
  openView: (asset: Asset) => void;
  openEdit: (asset: Asset) => void;
  toggleView: (asset: Asset) => void;
  toggleEdit: () => void;
  openCreate: () => void;
  closeDetail: () => void;
}

/** 深链解析与展开状态所需的上下文（普通对象，不是 hook 依赖） */
interface DeepLinkContext {
  assets: Asset[];
  assetParam: string | null;
  linkedAsset: Asset | null;
  listReady: boolean;
  autoExpandEnabled: boolean;
  mode: VaultViewMode;
  category: string | null;
  writeAssetParam: (asset: Asset | null) => void;
  onAssetMissing: (path: string) => void;
  autoExpanded: MutableRefObject<boolean>;
  missingHandled: MutableRefObject<string | null>;
  setAutoAsset: (asset: Asset | null) => void;
  setMode: (mode: VaultViewMode) => void;
}

/** 地址参数 → 列表里的资产（id 与 hubPath 同值，两种写法都认） */
function useLinkedAsset(assets: Asset[], assetParam: string | null): Asset | null {
  return useMemo(() => {
    if (!assetParam) return null;
    return assets.find((asset) => asset.id === assetParam || asset.hubPath === assetParam) ?? null;
  }, [assetParam, assets]);
}

/** 深链的三种落地：命中记一次「已展开」、未命中落列表、单资产自动展开一次 */
function useDeepLinkResolution(ctx: DeepLinkContext): void {
  const {
    assetParam, linkedAsset, listReady, autoExpandEnabled, assets, category, mode,
    autoExpanded, missingHandled, onAssetMissing, writeAssetParam, setAutoAsset, setMode,
  } = ctx;
  const categoryRef = useRef(category);

  // 命中即视为本次停留已展开过：用户关闭后不再被单资产自动展开抢回
  useEffect(() => {
    if (linkedAsset !== null) autoExpanded.current = true;
  }, [linkedAsset, autoExpanded]);

  // 未命中：等列表落地后只提示一次，并落回类别列表（去掉 asset 参数）
  useEffect(() => {
    if (!listReady || !assetParam || linkedAsset !== null) return;
    if (missingHandled.current === assetParam) return;
    missingHandled.current = assetParam;
    autoExpanded.current = true;
    setAutoAsset(null);
    setMode('list');
    onAssetMissing(assetParam);
    writeAssetParam(null);
  }, [assetParam, linkedAsset, listReady, onAssetMissing, autoExpanded, missingHandled, writeAssetParam, setAutoAsset, setMode]);

  // 单资产自动展开：仅一次，且不写地址
  useEffect(() => {
    if (autoExpanded.current || !listReady || !autoExpandEnabled) return;
    if (assets.length !== 1 || assetParam !== null || mode === 'create') return;
    autoExpanded.current = true;
    setAutoAsset(assets[0]);
  }, [assets, listReady, autoExpandEnabled, assetParam, mode, autoExpanded, setAutoAsset]);

  // 切换类别：详情与本次停留的展开记忆一并作废
  useEffect(() => {
    if (categoryRef.current === category) return;
    categoryRef.current = category;
    autoExpanded.current = false;
    missingHandled.current = null;
    setAutoAsset(null);
    setMode('list');
  }, [category, autoExpanded, missingHandled, setAutoAsset, setMode]);
}

interface DetailActionsParams {
  selectedAsset: Asset | null;
  viewMode: VaultViewMode;
  searchParams: URLSearchParams;
  writeAssetParam: (asset: Asset | null) => void;
  autoExpanded: MutableRefObject<boolean>;
  setAutoAsset: (asset: Asset | null) => void;
  setMode: (mode: VaultViewMode) => void;
}

/** 详情的开、关与查看⇄编辑切换（用户动作；自动展开不走这里） */
function useDetailActions(p: DetailActionsParams): Omit<AssetDeepLink, 'viewMode' | 'selectedAsset' | 'detailOpen'> {
  const { selectedAsset, viewMode, searchParams, writeAssetParam, autoExpanded, setAutoAsset, setMode } = p;

  const openWith = useCallback(
    (asset: Asset, nextMode: VaultViewMode): void => {
      autoExpanded.current = true;
      setAutoAsset(null);
      setMode(nextMode);
      writeAssetParam(asset);
    },
    [autoExpanded, setAutoAsset, setMode, writeAssetParam],
  );

  const openView = useCallback((asset: Asset): void => openWith(asset, 'list'), [openWith]);
  const openEdit = useCallback((asset: Asset): void => openWith(asset, 'edit'), [openWith]);

  const closeDetail = useCallback((): void => {
    setAutoAsset(null);
    setMode('list');
    if (searchParams.get('asset') !== null) writeAssetParam(null);
  }, [searchParams, setAutoAsset, setMode, writeAssetParam]);

  const toggleView = useCallback(
    (asset: Asset): void => {
      if (viewMode !== 'list' && selectedAsset !== null && selectedAsset.id === asset.id) {
        closeDetail();
        return;
      }
      openView(asset);
    },
    [viewMode, selectedAsset, closeDetail, openView],
  );

  /** 查看 ⇄ 编辑：自动展开的详情在用户主动进编辑时补写地址 */
  const toggleEdit = useCallback((): void => {
    if (selectedAsset === null) return;
    if (viewMode === 'edit') {
      setMode('list');
      return;
    }
    setMode('edit');
    writeAssetParam(selectedAsset);
  }, [selectedAsset, viewMode, setMode, writeAssetParam]);

  const openCreate = useCallback((): void => {
    setAutoAsset(null);
    setMode('create');
    if (searchParams.get('asset') !== null) writeAssetParam(null);
  }, [searchParams, setAutoAsset, setMode, writeAssetParam]);

  return { openView, openEdit, toggleView, toggleEdit, openCreate, closeDetail };
}

export function useAssetDeepLink(options: UseAssetDeepLinkOptions): AssetDeepLink {
  const { assets, listReady, category, searchParams, setSearchParams, onAssetMissing, autoExpandEnabled } =
    options;
  const assetParam = searchParams.get('asset');
  // mode 只记用户显式切到编辑/新建；「看详情」由地址参数派生
  const [mode, setMode] = useState<VaultViewMode>('list');
  const [autoAsset, setAutoAsset] = useState<Asset | null>(null);
  // 本次停留是否已自动展开 / 已处理过未命中：两者都只发生一次
  const autoExpanded = useRef(false);
  const missingHandled = useRef<string | null>(null);
  const linkedAsset = useLinkedAsset(assets, assetParam);

  const selectedAsset = mode === 'create' ? null : linkedAsset ?? autoAsset;
  const viewMode: VaultViewMode =
    mode === 'create' ? 'create' : selectedAsset === null ? 'list' : mode === 'edit' ? 'edit' : 'view';

  const writeAssetParam = useCallback(
    (asset: Asset | null): void => {
      const next = new URLSearchParams(searchParams);
      if (asset === null) next.delete('asset');
      else next.set('asset', asset.id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useDeepLinkResolution({
    assets, assetParam, linkedAsset, listReady, autoExpandEnabled, mode, category,
    writeAssetParam, onAssetMissing, autoExpanded, missingHandled, setAutoAsset, setMode,
  });

  const actions = useDetailActions({
    selectedAsset, viewMode, searchParams, writeAssetParam, autoExpanded, setAutoAsset, setMode,
  });

  return {
    viewMode,
    selectedAsset,
    detailOpen: selectedAsset !== null || viewMode === 'create',
    ...actions,
  };
}
