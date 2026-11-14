/**
 * 首跑路由守卫（add-zero-config-onboarding T16）
 *
 * spec Requirement 1 / 8：
 * - 仅在 `/` 生效：autoEnter=true 时重定向到 /onboarding（深链不劫持）
 * - 状态读取失败（服务不可达）：正常渲染首页，不白屏、不写标记
 * - 老用户（autoEnter=false）：直接渲染 children
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReactNode } from 'react';

export function FirstRunGate({ children }: { children: ReactNode }): JSX.Element | null {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['onboarding-state'],
    queryFn: api.getOnboardingState,
    retry: 0,
  });

  useEffect(() => {
    if (data?.autoEnter) navigate('/onboarding', { replace: true });
  }, [data, navigate]);

  if (isLoading) return null;
  if (isError || !data) return <>{children}</>;
  if (data.autoEnter) return null; // 重定向进行中
  return <>{children}</>;
}
