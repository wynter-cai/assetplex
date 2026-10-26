/**
 * 分发索引消费层
 *
 * spec: asset-distribution-truth（资产的分发状态只来自 GET /api/distributions）
 * 关联: fix-trust-and-consistency tasks I2
 *
 * `/api/assets` 的 `distributions` 已是历史包袱（恒为空数组），界面若继续读它，
 * 就是对每一项资产谎称「未分发」。这里把索引按资产 id 取用，并透出降级信息。
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { AssetDistributionInfo, ProjectToolInfo } from '@/types/api';

/** 服务端索引缓存 30s，前端同频，避免两边数字打架 */
const STALE_TIME_MS = 30 * 1000;

const QUERY_KEY = ['distributions'];

export interface DistributionsView {
  /** key = 资产在 Hub 中的相对路径（= Asset.id） */
  index: Record<string, AssetDistributionInfo[]>;
  /** true = 至少一个工具判定失败，界面须提示「部分工具状态暂不可用」 */
  partial: boolean;
  failedTools: string[];
  /** 项目级工具（不吃单资产状态，只报已接入项目数） */
  projectTools: ProjectToolInfo[];
  generatedAt?: string;
  isFetching: boolean;
  isError: boolean;
  /** 跳过服务端缓存重算索引 */
  refresh: () => Promise<void>;
}

export function useDistributions(): DistributionsView {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.getDistributions(),
    staleTime: STALE_TIME_MS,
  });

  const refresh = useCallback(async (): Promise<void> => {
    await queryClient.fetchQuery({
      queryKey: QUERY_KEY,
      queryFn: () => api.getDistributions(true),
      staleTime: 0,
    });
  }, [queryClient]);

  return {
    index: query.data?.index ?? {},
    partial: query.data?.partial ?? false,
    failedTools: query.data?.failedTools ?? [],
    projectTools: query.data?.projectTools ?? [],
    generatedAt: query.data?.generatedAt,
    isFetching: query.isFetching,
    isError: query.isError,
    refresh,
  };
}

/** 取某资产的分发条目；索引里没有该资产时返回空数组（不谎称未分发，也不报错） */
export function distributionsFor(
  view: Pick<DistributionsView, 'index'>,
  assetId: string,
): AssetDistributionInfo[] {
  return view.index[assetId] ?? [];
}
