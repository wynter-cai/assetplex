/**
 * 工具连接操作（fix-ui-trust-gaps T7）
 *
 * 启用开关 / 重新检测两个 mutation：
 * - 成功后 toast 确认并失效 tools / tool-detail / overview 三类查询
 * - 失败 toast 解释 + 同样失效查询，让 UI 回到服务端真实状态（开关回退）
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';

export interface ToolActions {
  toggle: ReturnType<typeof useToggleTool>;
  detect: ReturnType<typeof useDetectTool>;
}

function useToggleTool(toolName: string, displayName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.toggleTool(toolName, enabled),
    onSuccess: (_data, enabled) => {
      toast.success(`「${displayName}」同步已${enabled ? '开启' : '关闭'}`);
      void queryClient.invalidateQueries({ queryKey: ['tools'] });
      void queryClient.invalidateQueries({ queryKey: ['tool-detail', toolName] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: () => {
      toast.error('操作失败', {
        description: `无法更新「${displayName}」的同步开关，状态已恢复，请稍后重试。`,
      });
      // 失效后重新拉取，开关显示值回到服务端状态（视觉回退）
      void queryClient.invalidateQueries({ queryKey: ['tools'] });
      void queryClient.invalidateQueries({ queryKey: ['tool-detail', toolName] });
    },
  });
}

function useDetectTool(toolName: string, displayName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.detectTool(toolName),
    onSuccess: () => {
      toast.success(`已重新检测「${displayName}」`);
      void queryClient.invalidateQueries({ queryKey: ['tools'] });
      void queryClient.invalidateQueries({ queryKey: ['tool-detail', toolName] });
    },
    onError: () => {
      toast.error('检测失败', { description: `无法重新检测「${displayName}」，请稍后重试。` });
    },
  });
}

export function useToolActions(toolName: string, displayName: string): ToolActions {
  const toggle = useToggleTool(toolName, displayName);
  const detect = useDetectTool(toolName, displayName);
  return { toggle, detect };
}
