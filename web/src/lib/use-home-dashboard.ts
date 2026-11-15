/**
 * 首页行动面板数据层（refactor-home-action-panel）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * 聚合查询走 GET /api/home/dashboard，queryKey 固定 ['home-dashboard']，
 * 侧栏徽标等其他消费者读同一份缓存（T12）。
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { DoctorAssetKind, HomeDashboardResponse, HomeFixTargetPath } from '@/types/api';

/** 首页聚合缓存的唯一 key（侧栏徽标也读它） */
export const HOME_DASHBOARD_QUERY_KEY = ['home-dashboard'] as const;

/** 时间显示：拿不到就不渲染冒充分数（「刚刚」只属于真实同步记录） */
export function formatHomeTimestamp(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 待办行「在资产库中打开」：带上资产路径走深链（refactor-asset-pipeline T6），
 * 未建类别页的 kind 回退 /vault（spec Scenario 2.4）。
 */
export function homeFixTargetPath(kind: DoctorAssetKind, hubPath?: string): HomeFixTargetPath {
  const base = ((): string => {
    switch (kind) {
      case 'identity':
        return '/vault/identity';
      case 'skill':
        return '/vault/skill';
      case 'rule':
        return '/vault/rule';
      case 'agent':
        return '/vault/agent';
      case 'memory':
        return '/vault/memory';
      default:
        return '/vault';
    }
  })() as HomeFixTargetPath;
  if (hubPath === undefined || hubPath === '' || base === '/vault') return base;
  return `${base}?asset=${encodeURIComponent(hubPath)}` as HomeFixTargetPath;
}

export interface HomeDashboardView {
  data: HomeDashboardResponse | undefined;
  /** 首次加载（无任何缓存数据） */
  isLoading: boolean;
  isError: boolean;
  /** 「重新体检」进行中 */
  isRefreshing: boolean;
  /** 上次「重新体检」失败提示；失败保留旧数据可见 */
  refreshError: string | null;
  /** 普通重试（不带 refresh，不触发重算） */
  retry: () => void;
  /** 显式重算：refresh=1，四个数字与待办一起更新 */
  refresh: () => void;
}

export function useHomeDashboard(): HomeDashboardView {
  const queryClient = useQueryClient();
  const [isRefreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: HOME_DASHBOARD_QUERY_KEY,
    queryFn: () => api.getHomeDashboard(),
  });

  const retry = useCallback((): void => {
    void query.refetch();
  }, [query]);

  const refresh = useCallback((): void => {
    setRefreshing(true);
    setRefreshError(null);
    void api
      .getHomeDashboard({ refresh: true })
      .then((fresh) => {
        queryClient.setQueryData(HOME_DASHBOARD_QUERY_KEY, fresh);
      })
      .catch((err: unknown) => {
        // 刷新失败保留旧数据，只提示失败（spec Scenario 7.4）
        setRefreshError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setRefreshing(false));
  }, [queryClient]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefreshing,
    refreshError,
    retry,
    refresh,
  };
}
